package terminal

import (
	"bytes"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func readUntil(t *testing.T, sub *Subscription, want string, within time.Duration) string {
	t.Helper()
	var got bytes.Buffer
	deadline := time.After(within)
	for {
		select {
		case chunk, ok := <-sub.C:
			if !ok {
				t.Fatalf("stream closed before %q; got %q", want, got.String())
			}
			got.Write(chunk)
			if strings.Contains(got.String(), want) {
				return got.String()
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %q; got %q", want, got.String())
		}
	}
}

func newTestManager() *Manager { return NewManager("/bin/sh", time.Minute) }

func TestSessionRunsCommandsAndKeepsColours(t *testing.T) {
	m := newTestManager()
	defer m.Close()
	s, err := m.Create(Options{Cols: 100, Rows: 30})
	if err != nil {
		t.Fatal(err)
	}
	_, sub := s.Attach()
	defer sub.Close()

	s.Write([]byte("printf '\\033[31mERR\\033[0m %s\\n' \"$TERM\"\n"))
	out := readUntil(t, sub, "xterm-256color", 5*time.Second)
	if !strings.Contains(out, "\x1b[31mERR") {
		t.Errorf("escape sequences were not passed through untouched: %q", out)
	}
}

func TestChildEnvHidesServerSettings(t *testing.T) {
	t.Setenv("NODEDESK_ADMIN_PASSWORD", "hunter2")
	for _, kv := range childEnv() {
		if strings.HasPrefix(kv, "NODEDESK_") {
			t.Fatalf("leaked %s", kv)
		}
	}
}

func TestNewSessionStartsInParentsDirectory(t *testing.T) {
	m := newTestManager()
	defer m.Close()
	dir := t.TempDir()
	a, err := m.Create(Options{Cwd: dir})
	if err != nil {
		t.Fatal(err)
	}
	_, sub := a.Attach()
	defer sub.Close()
	// The pty echoes what is typed, so the quotes keep the echo from matching the output.
	// Wait for the shell to be up so /proc/<pid>/cwd is the shell's, not the fork's.
	a.Write([]byte("echo re\"\"ady\n"))
	readUntil(t, sub, "ready", 5*time.Second)
	if got := a.Cwd(); got != dir {
		t.Fatalf("Cwd = %q, want %q", got, dir)
	}

	sub2 := t.TempDir()
	a.Write([]byte("cd " + sub2 + "\necho mo\"\"ved\n"))
	readUntil(t, sub, "moved", 5*time.Second)

	b, err := m.Create(Options{FromID: a.ID})
	if err != nil {
		t.Fatal(err)
	}
	if got := b.Cwd(); got != sub2 {
		t.Fatalf("new tab cwd = %q, want %q", got, sub2)
	}
}

func TestKillEndsShellAndForgetsSession(t *testing.T) {
	m := newTestManager()
	s, err := m.Create(Options{})
	if err != nil {
		t.Fatal(err)
	}
	pid := s.cmd.Process.Pid
	s.Kill()
	select {
	case <-s.Done():
	default:
		t.Fatal("Kill returned before the shell was gone")
	}
	if _, ok := m.Get(s.ID); ok {
		t.Error("session still registered after Kill")
	}
	if _, err := os.Stat("/proc/" + strconv.Itoa(pid)); err == nil {
		t.Error("process still exists after Kill")
	}
	if m.Count() != 0 {
		t.Errorf("Count = %d", m.Count())
	}
}

func TestKillStopsShellThatIgnoresHangup(t *testing.T) {
	m := newTestManager()
	defer m.Close()
	s, _ := m.Create(Options{})
	_, sub := s.Attach()
	s.Write([]byte("trap '' HUP; echo trap\"\"ped\n"))
	readUntil(t, sub, "trapped", 5*time.Second)
	start := time.Now()
	s.Kill()
	if time.Since(start) > 5*time.Second {
		t.Error("Kill took too long")
	}
}

func TestExitCodeAndReplayAfterExit(t *testing.T) {
	m := newTestManager()
	s, _ := m.Create(Options{})
	_, sub := s.Attach()
	s.Write([]byte("echo by\"\"e; exit 7\n"))
	readUntil(t, sub, "bye", 5*time.Second)
	select {
	case <-s.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("shell did not exit")
	}
	if s.ExitCode() != 7 {
		t.Errorf("exit code %d, want 7", s.ExitCode())
	}
	replay, late := s.Attach()
	if !strings.Contains(string(replay), "bye") {
		t.Errorf("replay lost the output: %q", replay)
	}
	if _, ok := <-late.C; ok {
		t.Error("stream of an exited session should be closed")
	}
}

func TestDetachedSessionIsReaped(t *testing.T) {
	m := NewManager("/bin/sh", 150*time.Millisecond)
	s, _ := m.Create(Options{})
	_, sub := s.Attach()
	sub.Close()
	select {
	case <-s.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("nobody attached but the shell was not reaped")
	}
}

func TestAttachedSessionSurvivesTTL(t *testing.T) {
	m := NewManager("/bin/sh", 150*time.Millisecond)
	defer m.Close()
	s, _ := m.Create(Options{})
	_, sub := s.Attach()
	defer sub.Close()
	time.Sleep(500 * time.Millisecond)
	select {
	case <-s.Done():
		t.Fatal("an attached session was reaped")
	default:
	}
}

func TestScrollbackIsBounded(t *testing.T) {
	s := &Session{}
	chunk := bytes.Repeat([]byte("line of output\n"), 1000)
	for i := 0; i < 40; i++ {
		s.appendScrollback(chunk)
	}
	if len(s.scrollback) > scrollbackMax {
		t.Errorf("scrollback grew to %d", len(s.scrollback))
	}
	if !bytes.HasPrefix(s.scrollback, []byte("line of output\n")) {
		t.Errorf("scrollback should start on a line boundary, starts %q", s.scrollback[:20])
	}
}

func TestSessionLimit(t *testing.T) {
	m := newTestManager()
	defer m.Close()
	for i := 0; i < maxSessions; i++ {
		if _, err := m.Create(Options{}); err != nil {
			t.Fatalf("session %d: %v", i, err)
		}
	}
	if _, err := m.Create(Options{}); err != ErrLimit {
		t.Errorf("want ErrLimit, got %v", err)
	}
}
