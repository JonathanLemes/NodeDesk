package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

func (s *Server) shareRoutes(r chi.Router) {
	r.Get("/", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		st, err := s.Shares.Status()
		if err != nil {
			return err
		}
		writeJSON(w, st)
		return nil
	}))
	r.Post("/", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			Name string `json:"name"`
			Root string `json:"root"`
			Path string `json:"path"`
		}
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
		sh, err := s.Shares.Add(in.Name, in.Root, in.Path)
		if err != nil {
			return err
		}
		s.Audit.Info("shares", "shared "+in.Root+":"+sh.Path+" on the network as "+sh.Name)
		writeJSON(w, sh, http.StatusCreated)
		return nil
	}))
	r.Delete("/{name}", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		name := chi.URLParam(r, "name")
		if err := s.Shares.Remove(name); err != nil {
			return err
		}
		s.Audit.Info("shares", "stopped sharing "+name)
		httpx.NoContent(w)
		return nil
	}))
}
