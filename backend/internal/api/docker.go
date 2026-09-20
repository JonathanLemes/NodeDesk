package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/JonathanLemes/nodedesk/backend/internal/docker"
	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

func (s *Server) dockerRoutes(r chi.Router) {
	r.Get("/status", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, s.Docker.Status(r.Context())) })
	r.Get("/containers", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		list, err := s.Docker.List(r.Context())
		if err != nil {
			return err
		}
		writeJSON(w, list)
		return nil
	}))
	r.Get("/stats", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		list, err := s.Docker.List(r.Context())
		if err != nil {
			return err
		}
		writeJSON(w, s.Docker.AllStats(r.Context(), list))
		return nil
	}))
	r.Get("/images", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		list, err := s.Docker.Images(r.Context())
		if err != nil {
			return err
		}
		writeJSON(w, list)
		return nil
	}))
	for _, action := range []docker.Action{docker.Start, docker.Stop, docker.Restart} {
		r.Post("/containers/{id}/"+string(action), httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
			id := chi.URLParam(r, "id")
			if err := s.Docker.Do(r.Context(), id, action); err != nil {
				return err
			}
			s.Audit.Info("docker", string(action)+" container "+id)
			httpx.NoContent(w)
			return nil
		}))
	}
	r.Get("/containers/{id}/logs", httpx.Handler(s.containerLogs))
	r.Get("/containers/{id}/logs/stream", s.containerLogStream)
}

func tailParam(r *http.Request) int {
	n, err := strconv.Atoi(r.URL.Query().Get("tail"))
	if err != nil || n < 1 {
		return 200
	}
	return min(n, 5000)
}

func (s *Server) containerLogs(w http.ResponseWriter, r *http.Request) error {
	lines := []string{}
	err := s.Docker.StreamLogs(r.Context(), chi.URLParam(r, "id"), tailParam(r), false, func(l string) error {
		lines = append(lines, l)
		return nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, map[string]any{"lines": lines})
	return nil
}

// containerLogStream follows a container's logs over SSE.
func (s *Server) containerLogStream(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !docker.ValidID(id) {
		httpx.Fail(w, r, httpx.BadRequest("invalid container id"))
		return
	}
	sse, err := httpx.NewSSE(w)
	if err != nil {
		return
	}
	go func() { // keep proxies from timing out quiet containers
		t := time.NewTicker(20 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case <-t.C:
				if sse.Comment("ping") != nil {
					return
				}
			}
		}
	}()
	err = s.Docker.StreamLogs(r.Context(), id, tailParam(r), true, func(l string) error {
		return sse.Event("line", l)
	})
	if err != nil && r.Context().Err() == nil {
		sse.Event("error", err.Error())
	}
}
