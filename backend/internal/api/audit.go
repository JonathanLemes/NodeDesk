package api

import "net/http"

func (s *Server) listAudit(w http.ResponseWriter, r *http.Request) {
	ev, err := s.Audit.Recent(100)
	if err != nil {
		writeJSON(w, map[string]string{"error": "internal error"}, http.StatusInternalServerError)
		return
	}
	writeJSON(w, ev)
}
