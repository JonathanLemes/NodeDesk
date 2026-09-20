package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

func (s *Server) systemRoutes(r chi.Router) {
	r.Get("/info", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, s.System.Info()) })
}

func (s *Server) metricsRoutes(r chi.Router) {
	r.Get("/history", func(w http.ResponseWriter, r *http.Request) {
		h := s.System.History()
		if n, err := strconv.Atoi(r.URL.Query().Get("last")); err == nil && n > 0 && n < len(h) {
			h = h[len(h)-n:]
		}
		writeJSON(w, h)
	})
	r.Get("/stream", s.streamMetrics)
}

// streamMetrics pushes one sample per second over SSE. Sampling only runs while
// somebody is connected.
func (s *Server) streamMetrics(w http.ResponseWriter, r *http.Request) {
	sse, err := httpx.NewSSE(w)
	if err != nil {
		httpx.Fail(w, r, err)
		return
	}
	ch, cancel := s.System.Subscribe()
	defer cancel()
	ping := time.NewTicker(20 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case smp := <-ch:
			if sse.Event("sample", smp) != nil {
				return
			}
		case <-ping.C:
			if sse.Comment("ping") != nil {
				return
			}
		}
	}
}
