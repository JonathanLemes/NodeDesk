// Package api wires the HTTP layer: routing, middleware and one handler file per domain.
package api

import (
	"io/fs"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/JonathanLemes/nodedesk/backend/internal/apps"
	"github.com/JonathanLemes/nodedesk/backend/internal/audit"
	"github.com/JonathanLemes/nodedesk/backend/internal/auth"
	"github.com/JonathanLemes/nodedesk/backend/internal/config"
	"github.com/JonathanLemes/nodedesk/backend/internal/docker"
	"github.com/JonathanLemes/nodedesk/backend/internal/files"
	"github.com/JonathanLemes/nodedesk/backend/internal/settings"
	"github.com/JonathanLemes/nodedesk/backend/internal/storage"
	"github.com/JonathanLemes/nodedesk/backend/internal/system"
	"github.com/JonathanLemes/nodedesk/backend/internal/widgets"
)

// Deps are the services the API exposes.
type Deps struct {
	Config   *config.Config
	Auth     *auth.Service
	Audit    *audit.Log
	Settings *settings.Store
	System   *system.Collector
	Docker   *docker.Service
	Apps     *apps.Service
	Widgets  *widgets.Store
	Files    *files.Manager
	Storage  *storage.Service
	Web      fs.FS // built frontend (may be empty in development)
	Version  string
}

type Server struct {
	Deps
	events *eventHub
}

func New(d Deps) *Server {
	return &Server{Deps: d, events: newEventHub(d.Docker)}
}

func (s *Server) Close() { s.events.close() }

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.RealIP, chimw.Recoverer, requestLog, securityHeaders)
	r.Use(chimw.Compress(5, "text/html", "text/css", "application/javascript", "text/javascript", "application/json", "image/svg+xml", "application/manifest+json"))

	r.Route("/api", func(r chi.Router) {
		r.Use(noStore, s.sameOrigin)

		// Public.
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, map[string]any{"status": "ok", "version": s.Version, "time": time.Now().Unix()})
		})
		r.Route("/auth", s.authRoutes)

		// Everything else needs a session.
		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)
			r.Route("/system", s.systemRoutes)
			r.Route("/metrics", s.metricsRoutes)
			r.Get("/events", s.streamEvents)
			r.Route("/settings", s.settingsRoutes)
			r.Route("/widgets", s.widgetRoutes)
			r.Route("/apps", s.appRoutes)
			r.Route("/docker", s.dockerRoutes)
			r.Route("/files", s.fileRoutes)
			r.Route("/storage", s.storageRoutes)
			r.Get("/audit", s.listAudit)
		})
		r.NotFound(func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, map[string]string{"error": "not found", "code": "not_found"}, http.StatusNotFound)
		})
	})

	r.Handle("/*", s.spa())
	return r
}
