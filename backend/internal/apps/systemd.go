package apps

import (
	"context"
	"sync"
	"time"

	"github.com/coreos/go-systemd/v22/dbus"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

// systemd talks to systemd over D-Bus (no `systemctl` subprocess).
// Unit names reaching this type were validated when the app was saved.
type systemd struct {
	mu   sync.Mutex
	conn *dbus.Conn
}

func (s *systemd) connect(ctx context.Context) (*dbus.Conn, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conn != nil && s.conn.Connected() {
		return s.conn, nil
	}
	conn, err := dbus.NewSystemConnectionContext(ctx)
	if err != nil {
		return nil, err
	}
	s.conn = conn
	return conn, nil
}

func (s *systemd) close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conn != nil {
		s.conn.Close()
		s.conn = nil
	}
}

// states maps unit -> "running" | "stopped" | "failed" (missing units are omitted).
func (s *systemd) states(ctx context.Context, units []string) map[string]string {
	out := map[string]string{}
	if len(units) == 0 {
		return out
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	conn, err := s.connect(ctx)
	if err != nil {
		return out
	}
	list, err := conn.ListUnitsByNamesContext(ctx, units)
	if err != nil {
		return out
	}
	for _, u := range list {
		if u.LoadState == "not-found" {
			continue
		}
		switch u.ActiveState {
		case "active", "reloading":
			out[u.Name] = "running"
		case "failed":
			out[u.Name] = "failed"
		default:
			out[u.Name] = "stopped"
		}
	}
	return out
}

func (s *systemd) do(ctx context.Context, unit string, action string) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	conn, err := s.connect(ctx)
	if err != nil {
		return httpx.Unavailable("systemd: %v", err)
	}
	done := make(chan string, 1)
	switch action {
	case "start":
		_, err = conn.StartUnitContext(ctx, unit, "replace", done)
	case "stop":
		_, err = conn.StopUnitContext(ctx, unit, "replace", done)
	case "restart":
		_, err = conn.RestartUnitContext(ctx, unit, "replace", done)
	default:
		return httpx.BadRequest("unknown action")
	}
	if err != nil {
		return httpx.Err(502, "systemd_error", "systemd: %v", err)
	}
	select {
	case res := <-done:
		if res != "done" {
			return httpx.Err(502, "systemd_error", "systemd job %s for %s", res, unit)
		}
	case <-ctx.Done():
		return httpx.Err(504, "timeout", "systemd job timed out")
	}
	return nil
}
