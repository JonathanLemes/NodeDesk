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

// startAnalysis only accepts mountpoints reported by the storage overview or folders
// inside an authorised file root, so it cannot be used to probe arbitrary host paths.
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
	allowed := s.Storage.IsMountpoint(dir)
	if !allowed {
		roots, err := s.Files.Roots()
		if err != nil {
			return err
		}
		real, rerr := filepath.EvalSymlinks(dir)
		for _, root := range roots {
			rr, err := filepath.EvalSymlinks(root.Path)
			if rerr == nil && err == nil && (real == rr || strings.HasPrefix(real, strings.TrimRight(rr, "/")+"/")) {
				allowed = true
				dir = real
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
