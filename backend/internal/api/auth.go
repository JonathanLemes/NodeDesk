package api

import (
	"net"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/JonathanLemes/nodedesk/backend/internal/auth"
	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

func (s *Server) authRoutes(r chi.Router) {
	r.Get("/status", s.authStatus)
	r.Post("/login", httpx.Handler(s.login))
	r.Post("/setup", httpx.Handler(s.setup))
	r.Post("/logout", s.logout)
	r.With(s.requireAuth).Post("/password", httpx.Handler(s.changePassword))
}

func (s *Server) authStatus(w http.ResponseWriter, r *http.Request) {
	authed := s.Config.AuthDisabled
	if c, err := r.Cookie(auth.CookieName); err == nil && s.Auth.Validate(c.Value) {
		authed = true
	}
	writeJSON(w, map[string]any{
		"authenticated": authed,
		"setupRequired": !s.Config.AuthDisabled && s.Auth.SetupRequired(),
		"authDisabled":  s.Config.AuthDisabled,
		"user":          auth.AdminUser,
		"version":       s.Version,
	})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if in.Username == "" {
		in.Username = auth.AdminUser
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	token, err := s.Auth.Login(in.Username, in.Password, r.UserAgent(), ip)
	if err != nil {
		s.Audit.Warn("auth", "failed sign-in from "+ip)
		return err
	}
	s.setCookie(w, r, token, 14*24*time.Hour)
	s.Audit.Info("auth", "signed in from "+ip)
	writeJSON(w, map[string]any{"authenticated": true})
	return nil
}

func (s *Server) setup(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := s.Auth.Setup(in.Token, in.Password); err != nil {
		return err
	}
	s.Audit.Info("auth", "admin account created")
	writeJSON(w, map[string]any{"ok": true})
	return nil
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(auth.CookieName); err == nil {
		s.Auth.Logout(c.Value)
	}
	s.setCookie(w, r, "", -time.Hour)
	httpx.NoContent(w)
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Current string `json:"current"`
		Next    string `json:"next"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := s.Auth.ChangePassword(in.Current, in.Next); err != nil {
		return err
	}
	s.setCookie(w, r, "", -time.Hour) // all sessions were revoked
	s.Audit.Info("auth", "password changed")
	httpx.NoContent(w)
	return nil
}

func (s *Server) setCookie(w http.ResponseWriter, r *http.Request, token string, ttl time.Duration) {
	secure := s.Config.SecureCookies || r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
	c := &http.Cookie{
		Name: auth.CookieName, Value: token, Path: "/", HttpOnly: true, Secure: secure,
		SameSite: http.SameSiteLaxMode,
	}
	if ttl > 0 {
		c.MaxAge = int(ttl.Seconds())
	} else {
		c.MaxAge = -1
	}
	http.SetCookie(w, c)
}
