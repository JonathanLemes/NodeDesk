// Package terminal runs interactive shells on pseudo-terminals for the Terminal app.
//
// A session is one shell process. It outlives a dropped connection (a phone locking its screen,
// a page reload) for a short grace period so the client can re-attach and get the recent output
// back, but it never outlives an explicit Kill and is reaped when nobody is attached.
package terminal

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
)

const (
	scrollbackMax = 256 << 10 // bytes replayed to a client that re-attaches
	maxSessions   = 32
	subBuffer     = 512 // chunks a slow client may lag behind before it is dropped
	defaultCols   = 80
	defaultRows   = 24
)

var (
	ErrLimit    = errors.New("too many terminal sessions")
	ErrNotFound = errors.New("terminal session not found")
)

// Options describe a new session.
type Options struct {
	Cols, Rows uint16
	Cwd        string // empty = the user's home directory
	FromID     string // start in the working directory of this session (new tab)
}

type Manager struct {
	shell     string
	detachTTL time.Duration

	mu       sync.Mutex
	sessions map[string]*Session
	closed   bool
}

// NewManager builds a manager. An empty shell means $SHELL, then /bin/bash, then /bin/sh.
func NewManager(shell string, detachTTL time.Duration) *Manager {
	if detachTTL <= 0 {
		detachTTL = 5 * time.Minute
	}
	return &Manager{shell: resolveShell(shell), detachTTL: detachTTL, sessions: map[string]*Session{}}
}

func resolveShell(want string) string {
	for _, c := range []string{want, os.Getenv("SHELL"), "/bin/bash", "/bin/sh"} {
		if c == "" {
			continue
		}
		if p, err := exec.LookPath(c); err == nil {
			return p
		}
	}
	return "/bin/sh"
}

func (m *Manager) Shell() string { return m.shell }

func (m *Manager) Create(o Options) (*Session, error) {
	cwd := o.Cwd
	if o.FromID != "" {
		if from, ok := m.Get(o.FromID); ok {
			cwd = from.Cwd()
		}
	}
	cwd = usableDir(cwd)

	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return nil, ErrNotFound
	}
	if len(m.sessions) >= maxSessions {
		m.mu.Unlock()
		return nil, ErrLimit
	}
	m.mu.Unlock()

	cmd := exec.Command(m.shell, shellArgs(m.shell)...)
	cmd.Dir = cwd
	cmd.Env = childEnv()

	size := &pty.Winsize{Cols: orDefault(o.Cols, defaultCols), Rows: orDefault(o.Rows, defaultRows)}
	ptmx, err := pty.StartWithSize(cmd, size) // also makes the shell a session leader (setsid)
	if err != nil {
		return nil, fmt.Errorf("start shell: %w", err)
	}

	s := &Session{
		ID:   newID(),
		mgr:  m,
		cmd:  cmd,
		ptmx: ptmx,
		subs: map[*Subscription]struct{}{},
		done: make(chan struct{}),
	}
	m.mu.Lock()
	m.sessions[s.ID] = s
	m.mu.Unlock()

	s.mu.Lock()
	s.armReaper(m.detachTTL) // a session nobody ever attaches to must not linger
	s.mu.Unlock()
	go s.pump()
	return s, nil
}

func (m *Manager) Get(id string) (*Session, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[id]
	return s, ok
}

// Kill ends a session and every process left in it. Unknown ids are not an error.
func (m *Manager) Kill(id string) {
	if s, ok := m.Get(id); ok {
		s.Kill()
	}
}

func (m *Manager) Count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sessions)
}

// Close kills every session (server shutdown).
func (m *Manager) Close() {
	m.mu.Lock()
	m.closed = true
	all := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		all = append(all, s)
	}
	m.mu.Unlock()
	for _, s := range all {
		s.Kill()
	}
}

func (m *Manager) forget(id string) {
	m.mu.Lock()
	delete(m.sessions, id)
	m.mu.Unlock()
}

// Session is one shell on one PTY.
type Session struct {
	ID string

	mgr  *Manager
	cmd  *exec.Cmd
	ptmx *os.File
	done chan struct{}

	mu         sync.Mutex
	scrollback []byte
	subs       map[*Subscription]struct{}
	reaper     *time.Timer
	exitCode   int
	killing    bool
	ended      bool // the shell has exited; no new subscribers
}

// Subscription receives the live output of a session.
type Subscription struct {
	// C carries output chunks. It is closed when the session ends or the subscriber lags too far behind.
	C chan []byte
	s *Session
}

// Attach returns what the shell printed recently plus a stream of everything after it.
func (s *Session) Attach() ([]byte, *Subscription) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sub := &Subscription{C: make(chan []byte, subBuffer), s: s}
	replay := append([]byte(nil), s.scrollback...)
	if s.ended {
		close(sub.C)
		return replay, sub
	}
	s.subs[sub] = struct{}{}
	s.disarmReaper()
	return replay, sub
}

func (sub *Subscription) Close() {
	s := sub.s
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.subs[sub]; !ok {
		return
	}
	delete(s.subs, sub)
	close(sub.C)
	if len(s.subs) == 0 {
		s.armReaper(s.mgr.detachTTL)
	}
}

func (s *Session) armReaper(d time.Duration) {
	s.disarmReaper()
	s.reaper = time.AfterFunc(d, func() {
		slog.Debug("terminal session reaped (nobody attached)", "id", s.ID)
		s.Kill()
	})
}

func (s *Session) disarmReaper() {
	if s.reaper != nil {
		s.reaper.Stop()
		s.reaper = nil
	}
}

// Done is closed once the shell has exited.
func (s *Session) Done() <-chan struct{} { return s.done }

// ExitCode is only meaningful after Done is closed.
func (s *Session) ExitCode() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.exitCode
}

// Write sends keyboard input to the shell.
func (s *Session) Write(p []byte) error {
	_, err := s.ptmx.Write(p)
	return err
}

func (s *Session) Resize(cols, rows uint16) error {
	if cols == 0 || rows == 0 {
		return nil
	}
	return pty.Setsize(s.ptmx, &pty.Winsize{Cols: cols, Rows: rows})
}

// Cwd is the shell's current working directory ("" when it cannot be read).
func (s *Session) Cwd() string {
	if s.cmd.Process == nil {
		return ""
	}
	dir, err := os.Readlink(fmt.Sprintf("/proc/%d/cwd", s.cmd.Process.Pid))
	if err != nil {
		return ""
	}
	return dir
}

// Kill hangs up the terminal (SIGHUP to the shell's process group, so `nohup`ed and `disown`ed
// jobs survive as on any terminal) and SIGKILLs the group if the shell ignores it. It returns
// once the shell is gone.
func (s *Session) Kill() {
	s.mu.Lock()
	first := !s.killing && !s.ended
	s.killing = true
	s.disarmReaper()
	s.mu.Unlock()

	if first && s.cmd.Process != nil {
		pid := s.cmd.Process.Pid
		_ = syscall.Kill(-pid, syscall.SIGHUP)
		select {
		case <-s.done:
		case <-time.After(1500 * time.Millisecond):
			_ = syscall.Kill(-pid, syscall.SIGKILL)
		}
	}
	<-s.done
}

// pump copies shell output to the scrollback and to every subscriber until the shell exits.
func (s *Session) pump() {
	buf := make([]byte, 32<<10)
	for {
		n, err := s.ptmx.Read(buf)
		if n > 0 {
			chunk := append([]byte(nil), buf[:n]...)
			s.mu.Lock()
			s.appendScrollback(chunk)
			for sub := range s.subs {
				select {
				case sub.C <- chunk:
				default: // lagging too far behind: drop it, the client re-attaches and replays
					delete(s.subs, sub)
					close(sub.C)
				}
			}
			s.mu.Unlock()
		}
		if err != nil {
			break
		}
	}

	code := 0
	if err := s.cmd.Wait(); err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			code = ee.ExitCode()
		} else {
			code = -1
		}
	}
	_ = s.ptmx.Close()

	s.mu.Lock()
	s.exitCode = code
	s.ended = true
	s.disarmReaper()
	for sub := range s.subs {
		delete(s.subs, sub)
		close(sub.C)
	}
	s.mu.Unlock()
	s.mgr.forget(s.ID)
	close(s.done)
}

func (s *Session) appendScrollback(chunk []byte) {
	s.scrollback = append(s.scrollback, chunk...)
	if over := len(s.scrollback) - scrollbackMax; over > 0 {
		cut := over
		// Start on a line boundary when one is close, so the replay does not open mid-sequence.
		if i := bytes.IndexByte(s.scrollback[cut:min(cut+1024, len(s.scrollback))], '\n'); i >= 0 {
			cut += i + 1
		}
		s.scrollback = append(s.scrollback[:0], s.scrollback[cut:]...)
	}
}

func shellArgs(shell string) []string {
	switch filepath.Base(shell) {
	case "bash", "zsh", "fish", "sh", "dash", "ksh":
		return []string{"-l"} // a login shell, like macOS Terminal: profile and PATH are loaded
	}
	return nil
}

// childEnv is the server's environment minus NodeDesk's own settings (they can hold secrets),
// with the variables a terminal emulator is expected to provide.
func childEnv() []string {
	drop := map[string]bool{"TERM": true, "COLORTERM": true, "TERM_PROGRAM": true}
	env := make([]string, 0, len(os.Environ())+4)
	for _, kv := range os.Environ() {
		k, _, _ := strings.Cut(kv, "=")
		if drop[k] || strings.HasPrefix(k, "NODEDESK_") || k == "INVOCATION_ID" || k == "JOURNAL_STREAM" {
			continue
		}
		env = append(env, kv)
	}
	return append(env, "TERM=xterm-256color", "COLORTERM=truecolor", "TERM_PROGRAM=NodeDesk")
}

func usableDir(dir string) string {
	if dir != "" && filepath.IsAbs(dir) {
		if st, err := os.Stat(dir); err == nil && st.IsDir() {
			return dir
		}
	}
	if home, err := os.UserHomeDir(); err == nil {
		return home
	}
	return "/"
}

func orDefault(v, def uint16) uint16 {
	if v == 0 {
		return def
	}
	return v
}

func newID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
