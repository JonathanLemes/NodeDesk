package api

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// spa serves the embedded frontend. Unknown non-asset paths fall back to index.html.
func (s *Server) spa() http.Handler {
	if s.Web == nil {
		return http.NotFoundHandler()
	}
	fileServer := http.FileServerFS(s.Web)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(s.Web, p); err != nil {
			if path.Ext(p) != "" {
				http.NotFound(w, r)
				return
			}
			r.URL.Path = "/"
			p = "index.html"
		}
		if strings.HasSuffix(p, ".webmanifest") {
			w.Header().Set("Content-Type", "application/manifest+json")
		}
		if strings.HasPrefix(p, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		fileServer.ServeHTTP(w, r)
	})
}
