package api

import (
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/JonathanLemes/nodedesk/backend/internal/auth"
	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

func requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		// Streams and polling endpoints would drown the log at info level.
		if strings.HasSuffix(r.URL.Path, "/stream") || r.URL.Path == "/api/events" {
			return
		}
		slog.Debug("http", "method", r.Method, "path", r.URL.Path, "status", ww.Status(), "ms", time.Since(start).Milliseconds())
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			// App shell only. /api/files/raw sets its own, stricter policy.
			h.Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob: http: https:; "+
				"style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' blob:; "+
				"connect-src 'self'; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
		}
		next.ServeHTTP(w, r)
	})
}

func noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// sameOrigin blocks cross-site state-changing requests (CSRF). Browsers always send
// Origin on cross-origin POST/PUT/PATCH/DELETE.
func (s *Server) sameOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
		default:
			if origin := r.Header.Get("Origin"); origin != "" {
				u, err := url.Parse(origin)
				if err != nil || u.Host != r.Host {
					httpx.Fail(w, r, httpx.Forbidden("cross-origin request blocked"))
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.Config.AuthDisabled {
			next.ServeHTTP(w, r)
			return
		}
		c, err := r.Cookie(auth.CookieName)
		if err != nil || !s.Auth.Validate(c.Value) {
			httpx.JSON(w, http.StatusUnauthorized, map[string]string{"code": "unauthorized", "error": "sign in required"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any, status ...int) {
	code := http.StatusOK
	if len(status) > 0 {
		code = status[0]
	}
	httpx.JSON(w, code, v)
}
