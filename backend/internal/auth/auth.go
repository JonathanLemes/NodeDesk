// Package auth provides local, single-admin authentication with server-side sessions.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log/slog"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

const (
	CookieName     = "nodedesk_session"
	AdminUser      = "admin"
	sessionTTL     = 14 * 24 * time.Hour
	minPasswordLen = 8
	maxAttempts    = 5
	lockout        = time.Minute
)

type Service struct {
	db *sql.DB

	mu         sync.Mutex
	attempts   map[string]*attempt
	setupToken string
}

type attempt struct {
	fails int
	until time.Time
}

func New(db *sql.DB) *Service {
	return &Service{db: db, attempts: map[string]*attempt{}}
}

func (s *Service) HasUser() bool {
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	return n > 0
}

// Bootstrap prepares first-run: seeds the admin from the given password, or, when none is
// given and no user exists, generates a one-time setup token that must be presented to the
// setup endpoint (printed to the server log only).
func (s *Service) Bootstrap(initialPassword string) {
	if s.HasUser() {
		return
	}
	if initialPassword != "" {
		if err := s.createAdmin(initialPassword); err != nil {
			slog.Error("cannot seed admin from NODEDESK_ADMIN_PASSWORD", "err", err)
			return
		}
		slog.Info("admin account created from NODEDESK_ADMIN_PASSWORD", "user", AdminUser)
		return
	}
	b := make([]byte, 9)
	rand.Read(b)
	s.mu.Lock()
	s.setupToken = hex.EncodeToString(b)
	s.mu.Unlock()
	slog.Warn("first run: no admin account yet. Open NodeDesk and use this one-time setup code", "code", s.setupToken)
}

func (s *Service) SetupRequired() bool { return !s.HasUser() }

func (s *Service) Setup(token, password string) error {
	s.mu.Lock()
	expected := s.setupToken
	s.mu.Unlock()
	if expected == "" || subtle.ConstantTimeCompare([]byte(token), []byte(expected)) != 1 {
		return httpx.Forbidden("invalid setup code (see the server log)")
	}
	if s.HasUser() {
		return httpx.Conflict("already configured")
	}
	if err := s.createAdmin(password); err != nil {
		return err
	}
	s.mu.Lock()
	s.setupToken = ""
	s.mu.Unlock()
	return nil
}

func (s *Service) createAdmin(password string) error {
	if len(password) < minPasswordLen {
		return httpx.BadRequest("password must have at least %d characters", minPasswordLen)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO users(username, password_hash) VALUES (?, ?)`, AdminUser, string(hash))
	return err
}

func (s *Service) ChangePassword(current, next string) error {
	var id int64
	var hash string
	if err := s.db.QueryRow(`SELECT id, password_hash FROM users WHERE username = ?`, AdminUser).Scan(&id, &hash); err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(current)) != nil {
		return httpx.Forbidden("current password is incorrect")
	}
	if len(next) < minPasswordLen {
		return httpx.BadRequest("password must have at least %d characters", minPasswordLen)
	}
	nh, err := bcrypt.GenerateFromPassword([]byte(next), 12)
	if err != nil {
		return err
	}
	if _, err := s.db.Exec(`UPDATE users SET password_hash = ? WHERE id = ?`, string(nh), id); err != nil {
		return err
	}
	// Sign out everywhere else.
	_, err = s.db.Exec(`DELETE FROM sessions WHERE user_id = ?`, id)
	return err
}

// Login verifies credentials and returns a new session token (to be set as a cookie).
func (s *Service) Login(username, password, userAgent, ip string) (string, error) {
	if err := s.checkLock(ip); err != nil {
		return "", err
	}
	var id int64
	var hash string
	err := s.db.QueryRow(`SELECT id, password_hash FROM users WHERE username = ?`, username).Scan(&id, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		// Burn comparable time so unknown users are not distinguishable.
		bcrypt.CompareHashAndPassword([]byte("$2a$12$0000000000000000000000000000000000000000000000000000"), []byte(password))
		s.fail(ip)
		return "", httpx.Err(401, "invalid_credentials", "wrong password")
	}
	if err != nil {
		return "", err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		s.fail(ip)
		return "", httpx.Err(401, "invalid_credentials", "wrong password")
	}
	s.mu.Lock()
	delete(s.attempts, ip)
	s.mu.Unlock()

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	if len(userAgent) > 200 {
		userAgent = userAgent[:200]
	}
	_, err = s.db.Exec(`INSERT INTO sessions(token_hash, user_id, expires_at, user_agent, ip) VALUES (?,?,?,?,?)`,
		hashToken(token), id, time.Now().Add(sessionTTL).Unix(), userAgent, ip)
	if err != nil {
		return "", err
	}
	s.db.Exec(`DELETE FROM sessions WHERE expires_at < ?`, time.Now().Unix())
	return token, nil
}

// Validate reports whether token is a live session, sliding its expiry when past half-life.
func (s *Service) Validate(token string) bool {
	if token == "" {
		return false
	}
	var exp int64
	h := hashToken(token)
	if err := s.db.QueryRow(`SELECT expires_at FROM sessions WHERE token_hash = ?`, h).Scan(&exp); err != nil {
		return false
	}
	now := time.Now()
	if exp < now.Unix() {
		return false
	}
	if time.Unix(exp, 0).Sub(now) < sessionTTL/2 {
		s.db.Exec(`UPDATE sessions SET expires_at = ? WHERE token_hash = ?`, now.Add(sessionTTL).Unix(), h)
	}
	return true
}

func (s *Service) Logout(token string) {
	s.db.Exec(`DELETE FROM sessions WHERE token_hash = ?`, hashToken(token))
}

func (s *Service) checkLock(ip string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if a := s.attempts[ip]; a != nil && a.fails >= maxAttempts {
		if time.Now().Before(a.until) {
			return httpx.Err(429, "rate_limited", "too many attempts, wait a minute")
		}
		delete(s.attempts, ip)
	}
	return nil
}

func (s *Service) fail(ip string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a := s.attempts[ip]
	if a == nil {
		a = &attempt{}
		s.attempts[ip] = a
	}
	a.fails++
	a.until = time.Now().Add(lockout)
}

func hashToken(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}
