package api

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

func (s *Server) storageRoutes(r chi.Router) {
	r.Get("/", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, s.Storage.Overview()) })
	r.Get("/smart/{disk}", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		v, err := s.Storage.SMART(r.Context(), chi.URLParam(r, "disk"))
		if err != nil {
			return err
		}
		writeJSON(w, v)
		return nil
	}))
	r.Post("/analyze", httpx.Handler(s.startAnalysis))
	r.Get("/analyze/{id}", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		a, err := s.Storage.Analyzer.Get(chi.URLParam(r, "id"))
		if err != nil {
			return err
		}
		writeJSON(w, a)
		return nil
	}))
	r.Delete("/analyze/{id}", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		if err := s.Storage.Analyzer.Cancel(chi.URLParam(r, "id")); err != nil {
			return err
		}
		httpx.NoContent(w)
		return nil
	}))
}

// startAnalysis only accepts folders on a mounted disk (as reported by the storage
// overview) or inside an authorised file root; virtual filesystems are out of reach.
func (s *Server) startAnalysis(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Path  string `json:"path"`
		Force bool   `json:"force"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if !filepath.IsAbs(in.Path) || strings.ContainsRune(in.Path, 0) {
		return httpx.BadRequest("path must be absolute")
	}
	dir := filepath.Clean(in.Path)
	real, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return httpx.BadRequest("cannot access that path")
	}
	dir = real
	allowed := false
	for _, m := range s.Storage.Overview().Mounts {
		mp := strings.TrimRight(m.Mountpoint, "/")
		if real == m.Mountpoint || strings.HasPrefix(real, mp+"/") {
			allowed = true
			break
		}
	}
	if !allowed {
		roots, err := s.Files.Roots()
		if err != nil {
			return err
		}
		for _, root := range roots {
			rr, err := filepath.EvalSymlinks(root.Path)
			if err == nil && (real == rr || strings.HasPrefix(real, strings.TrimRight(rr, "/")+"/")) {
				allowed = true
				break
			}
		}
	}
	if !allowed {
		return httpx.Forbidden("only mount points and authorised folders can be analysed")
	}
	a, err := s.Storage.Analyzer.Start(dir, in.Force)
	if err != nil {
		return err
	}
	writeJSON(w, a, http.StatusAccepted)
	return nil
}
