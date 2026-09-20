package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/JonathanLemes/nodedesk/backend/internal/apps"
	"github.com/JonathanLemes/nodedesk/backend/internal/docker"
	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

func (s *Server) appRoutes(r chi.Router) {
	r.Get("/", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		list, err := s.Apps.List(r.Context())
		if err != nil {
			return err
		}
		writeJSON(w, list)
		return nil
	}))
	r.Post("/", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var in apps.App
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
		a, err := s.Apps.Store.Create(in)
		if err != nil {
			return err
		}
		s.Audit.Info("apps", "added app "+a.Name)
		writeJSON(w, a, http.StatusCreated)
		return nil
	}))
	r.Get("/discover", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		list, err := s.Apps.Discover(r.Context())
		if err != nil {
			return err
		}
		writeJSON(w, list)
		return nil
	}))
	r.Put("/order", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			IDs []string `json:"ids"`
		}
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
		if err := s.Apps.Store.Reorder(in.IDs); err != nil {
			return err
		}
		httpx.NoContent(w)
		return nil
	}))
	r.Put("/{id}/position", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			X int `json:"x"`
			Y int `json:"y"`
		}
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
		if err := s.Apps.Store.SetDesktopPosition(chi.URLParam(r, "id"), in.X, in.Y); err != nil {
			return err
		}
		httpx.NoContent(w)
		return nil
	}))
	r.Put("/{id}", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var in apps.App
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
		a, err := s.Apps.Store.Update(chi.URLParam(r, "id"), in)
		if err != nil {
			return err
		}
		writeJSON(w, a)
		return nil
	}))
	r.Delete("/{id}", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		if err := s.Apps.Store.Delete(chi.URLParam(r, "id")); err != nil {
			return err
		}
		s.Audit.Info("apps", "removed app "+chi.URLParam(r, "id"))
		httpx.NoContent(w)
		return nil
	}))
	for _, action := range []docker.Action{docker.Start, docker.Stop, docker.Restart} {
		r.Post("/{id}/"+string(action), httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
			id := chi.URLParam(r, "id")
			if err := s.Apps.Do(r.Context(), id, action); err != nil {
				return err
			}
			s.Audit.Info("apps", string(action)+" app "+id)
			httpx.NoContent(w)
			return nil
		}))
	}
}
