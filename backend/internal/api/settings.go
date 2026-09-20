package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

// Only known keys with validated values can be stored.
var settingValidators = map[string]func(json.RawMessage) bool{
	"theme":             oneOf("system", "light", "dark"),
	"wallpaper":         validWallpaper,
	"dock.size":         intRange(40, 96),
	"dock.magnify":      isBool,
	"clock24h":          isBool,
	"desktop.watermark": isBool,
}

func (s *Server) settingsRoutes(r chi.Router) {
	r.Get("/", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		all, err := s.Settings.All()
		if err != nil {
			return err
		}
		writeJSON(w, all)
		return nil
	}))
	r.Put("/", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var in map[string]json.RawMessage
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
		for k, v := range in {
			validate, ok := settingValidators[k]
			if !ok || !validate(v) {
				return httpx.BadRequest("invalid setting %q", k)
			}
		}
		for k, v := range in {
			if err := s.Settings.Set(k, v); err != nil {
				return err
			}
		}
		httpx.NoContent(w)
		return nil
	}))
}

func oneOf(opts ...string) func(json.RawMessage) bool {
	return func(raw json.RawMessage) bool {
		var v string
		if json.Unmarshal(raw, &v) != nil {
			return false
		}
		for _, o := range opts {
			if v == o {
				return true
			}
		}
		return false
	}
}

func intRange(lo, hi int) func(json.RawMessage) bool {
	return func(raw json.RawMessage) bool {
		var v int
		return json.Unmarshal(raw, &v) == nil && v >= lo && v <= hi
	}
}

func isBool(raw json.RawMessage) bool {
	var v bool
	return json.Unmarshal(raw, &v) == nil
}

// A wallpaper is a built-in id, a file served by the file manager, or an http(s) URL.
func validWallpaper(raw json.RawMessage) bool {
	var v string
	if json.Unmarshal(raw, &v) != nil || len(v) > 600 {
		return false
	}
	if strings.HasPrefix(v, "builtin:") || strings.HasPrefix(v, "file:") {
		return true
	}
	u, err := url.Parse(v)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}
