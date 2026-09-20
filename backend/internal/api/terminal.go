package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
	"github.com/JonathanLemes/nodedesk/backend/internal/terminal"
)

// The terminal is a shell running as the server's user, so it is the one place where the API
// accepts what is effectively a command. Everything here sits behind the session cookie, state
// changes are same-origin checked, and the WebSocket verifies Origin itself (GET is not covered
// by the CSRF middleware). Sessions are opened, and closed, on the audit log.

const (
	wsPingEvery = 25 * time.Second
	wsInputMax  = 1 << 20 // one paste
)

func (s *Server) terminalRoutes(r chi.Router) {
	r.Get("/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"enabled": s.Terminal != nil, "shell": s.shellName()})
	})
	r.Group(func(r chi.Router) {
		r.Use(s.terminalEnabled)
		r.Post("/sessions", httpx.Handler(s.terminalCreate))
		r.Get("/sessions/{id}", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
			sess, err := s.terminalSession(r)
			if err != nil {
				return err
			}
			writeJSON(w, map[string]any{"id": sess.ID, "cwd": sess.Cwd()})
			return nil
		}))
		r.Delete("/sessions/{id}", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
			if sess, ok := s.Terminal.Get(chi.URLParam(r, "id")); ok {
				sess.Kill()
				s.Audit.Info("terminal", "closed terminal session "+sess.ID)
			}
			httpx.NoContent(w)
			return nil
		}))
		r.Get("/sessions/{id}/ws", s.terminalSocket)
	})
}

func (s *Server) shellName() string {
	if s.Terminal == nil {
		return ""
	}
	return s.Terminal.Shell()
}

func (s *Server) terminalEnabled(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.Terminal == nil {
			httpx.Fail(w, r, httpx.Forbidden("the terminal is disabled on this server"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) terminalSession(r *http.Request) (*terminal.Session, error) {
	sess, ok := s.Terminal.Get(chi.URLParam(r, "id"))
	if !ok {
		return nil, httpx.NotFound("terminal session not found")
	}
	return sess, nil
}

func (s *Server) terminalCreate(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Cols uint16 `json:"cols"`
		Rows uint16 `json:"rows"`
		Cwd  string `json:"cwd"`
		// From starts the shell in that session's current directory (a new tab).
		From string `json:"from"`
	}
	if r.ContentLength != 0 {
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
	}
	sess, err := s.Terminal.Create(terminal.Options{Cols: in.Cols, Rows: in.Rows, Cwd: in.Cwd, FromID: in.From})
	if err != nil {
		if errors.Is(err, terminal.ErrLimit) {
			return httpx.Err(http.StatusTooManyRequests, "too_many", "too many terminal sessions")
		}
		return err
	}
	s.Audit.Info("terminal", "opened terminal session "+sess.ID)
	writeJSON(w, map[string]any{"id": sess.ID, "cwd": sess.Cwd(), "shell": s.Terminal.Shell()}, http.StatusCreated)
	return nil
}

type termControl struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
	Code *int   `json:"code,omitempty"`
}

// terminalSocket bridges one WebSocket to a session: binary frames are raw terminal bytes in
// both directions; text frames are JSON control messages ({"type":"resize",cols,rows} from the
// client, {"type":"exit","code":n} from the server).
func (s *Server) terminalSocket(w http.ResponseWriter, r *http.Request) {
	sess, err := s.terminalSession(r)
	if err != nil {
		httpx.Fail(w, r, err)
		return
	}
	// Accept rejects a cross-origin Origin header by default.
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		slog.Debug("terminal websocket rejected", "err", err)
		return
	}
	defer conn.CloseNow()
	conn.SetReadLimit(wsInputMax)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	replay, sub := sess.Attach()
	defer sub.Close()

	// Browser -> shell.
	go func() {
		defer cancel()
		for {
			typ, data, err := conn.Read(ctx)
			if err != nil {
				return
			}
			if typ == websocket.MessageBinary {
				if sess.Write(data) != nil {
					return
				}
				continue
			}
			var c termControl
			if json.Unmarshal(data, &c) == nil && c.Type == "resize" {
				_ = sess.Resize(c.Cols, c.Rows)
			}
		}
	}()

	if len(replay) > 0 {
		if conn.Write(ctx, websocket.MessageBinary, replay) != nil {
			return
		}
	}

	// Shell -> browser, plus keep-alive pings so dead connections (a locked phone) are noticed.
	tick := time.NewTicker(wsPingEvery)
	defer tick.Stop()
	for {
		select {
		case chunk, ok := <-sub.C:
			if !ok {
				select {
				case <-sess.Done():
					code := sess.ExitCode()
					msg, _ := json.Marshal(termControl{Type: "exit", Code: &code})
					_ = conn.Write(ctx, websocket.MessageText, msg)
					_ = conn.Close(websocket.StatusNormalClosure, "exited")
				default:
					// Dropped for lagging behind: the client re-attaches and gets a replay.
					_ = conn.Close(websocket.StatusTryAgainLater, "slow consumer")
				}
				return
			}
			if conn.Write(ctx, websocket.MessageBinary, chunk) != nil {
				return
			}
		case <-tick.C:
			pctx, pcancel := context.WithTimeout(ctx, 10*time.Second)
			err := conn.Ping(pctx)
			pcancel()
			if err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}
