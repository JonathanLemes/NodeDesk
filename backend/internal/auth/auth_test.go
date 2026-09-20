package auth

import (
	"path/filepath"
	"testing"

	"github.com/JonathanLemes/nodedesk/backend/internal/database"
)

func newService(t *testing.T) *Service {
	t.Helper()
	db, err := database.Open(filepath.Join(t.TempDir(), "d"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return New(db)
}

func TestLoginSessionLifecycle(t *testing.T) {
	s := newService(t)
	if !s.SetupRequired() {
		t.Fatal("fresh instance must require setup")
	}
	s.Bootstrap("correct horse battery")
	if s.SetupRequired() {
		t.Fatal("admin should exist after seeding")
	}
	if _, err := s.Login(AdminUser, "wrong", "ua", "1.1.1.1"); err == nil {
		t.Fatal("wrong password accepted")
	}
	tok, err := s.Login(AdminUser, "correct horse battery", "ua", "1.1.1.1")
	if err != nil || tok == "" {
		t.Fatalf("login failed: %v", err)
	}
	if !s.Validate(tok) || s.Validate("bogus") || s.Validate("") {
		t.Fatal("session validation wrong")
	}
	s.Logout(tok)
	if s.Validate(tok) {
		t.Fatal("session survived logout")
	}
}

func TestLoginRateLimit(t *testing.T) {
	s := newService(t)
	s.Bootstrap("correct horse battery")
	for i := 0; i < maxAttempts; i++ {
		s.Login(AdminUser, "nope", "ua", "9.9.9.9")
	}
	// Even the right password is refused while locked out.
	if _, err := s.Login(AdminUser, "correct horse battery", "ua", "9.9.9.9"); err == nil {
		t.Fatal("lockout not enforced")
	}
	// Other clients are unaffected.
	if _, err := s.Login(AdminUser, "correct horse battery", "ua", "8.8.8.8"); err != nil {
		t.Fatalf("other IP wrongly locked: %v", err)
	}
}

func TestPasswordRules(t *testing.T) {
	s := newService(t)
	s.Bootstrap("short") // too short: must not create the admin
	if !s.SetupRequired() {
		t.Fatal("weak password accepted")
	}
	s.Bootstrap("long enough password")
	tok, _ := s.Login(AdminUser, "long enough password", "", "1.2.3.4")
	if err := s.ChangePassword("wrong", "another long password"); err == nil {
		t.Fatal("password changed without proving the old one")
	}
	if err := s.ChangePassword("long enough password", "another long password"); err != nil {
		t.Fatal(err)
	}
	if s.Validate(tok) {
		t.Fatal("changing the password must revoke sessions")
	}
}
