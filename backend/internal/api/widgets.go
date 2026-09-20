package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
	"github.com/JonathanLemes/nodedesk/backend/internal/widgets"
)

func (s *Server) widgetRoutes(r chi.Router) {
	r.Get("/", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		l, err := s.Widgets.Get()
		if err != nil {
			return err
		}
		writeJSON(w, l)
		return nil
	}))
	r.Put("/", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			Widgets []widgets.Widget `json:"widgets"`
		}
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
		if err := s.Widgets.Replace(in.Widgets); err != nil {
			return err
		}
		httpx.NoContent(w)
		return nil
	}))
}
