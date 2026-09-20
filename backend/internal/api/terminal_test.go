package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/JonathanLemes/nodedesk/backend/internal/config"
	"github.com/JonathanLemes/nodedesk/backend/internal/terminal"
)

func terminalServer(t *testing.T) (*httptest.Server, *terminal.Manager, *terminal.Session) {
	t.Helper()
	mgr := terminal.NewManager("/bin/sh", time.Minute)
	t.Cleanup(mgr.Close)
	srv := New(Deps{Config: &config.Config{AuthDisabled: true}, Terminal: mgr})
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	sess, err := mgr.Create(terminal.Options{})
	if err != nil {
		t.Fatal(err)
	}
	return ts, mgr, sess
}

func wsURL(ts *httptest.Server, id string) string {
	return "ws" + strings.TrimPrefix(ts.URL, "http") + "/api/terminal/sessions/" + id + "/ws"
}

func TestTerminalSocketRoundTrip(t *testing.T) {
	ts, _, sess := terminalServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	c, _, err := websocket.Dial(ctx, wsURL(ts, sess.ID), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	if err := c.Write(ctx, websocket.MessageBinary, []byte("echo ro\"\"und-trip\n")); err != nil {
		t.Fatal(err)
	}
	var got strings.Builder
	for !strings.Contains(got.String(), "round-trip") {
		_, data, err := c.Read(ctx)
		if err != nil {
			t.Fatalf("read: %v (got %q)", err, got.String())
		}
		got.Write(data)
	}
}

// A page on another site must not be able to open a shell with the admin's cookie.
func TestTerminalSocketRejectsCrossOrigin(t *testing.T) {
	ts, _, sess := terminalServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, resp, err := websocket.Dial(ctx, wsURL(ts, sess.ID), &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"https://evil.example"}},
	})
	if err == nil {
		t.Fatal("cross-origin WebSocket was accepted")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Errorf("want 403, got %v", resp)
	}
}

func TestTerminalDisabled(t *testing.T) {
	srv := New(Deps{Config: &config.Config{AuthDisabled: true}})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	res, err := http.Post(ts.URL+"/api/terminal/sessions", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Errorf("status %d, want 403 when the terminal is disabled", res.StatusCode)
	}
}
