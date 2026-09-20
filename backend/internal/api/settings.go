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
	"profile.name":      stringMax(40),
	"language":          oneOf("auto", "en", "pt"),
	"mobile.layout":     validHomeLayout,
	"files.favorites":   validFavorites,
	"shortcuts":         validShortcuts,
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

func stringMax(n int) func(json.RawMessage) bool {
	return func(raw json.RawMessage) bool {
		var v string
		return json.Unmarshal(raw, &v) == nil && len(v) <= n
	}
}

// Favourite folders shown in the Files sidebar: [{root, path}, ...].
func validFavorites(raw json.RawMessage) bool {
	var v []struct {
		Root string `json:"root"`
		Path string `json:"path"`
	}
	if json.Unmarshal(raw, &v) != nil || len(v) > 50 {
		return false
	}
	for _, f := range v {
		if f.Root == "" || len(f.Root) > 40 || len(f.Path) > 1024 {
			return false
		}
	}
	return true
}

// Phone home-screen arrangement: {order: [cellKey...], hidden: [cellKey...]}.
func validHomeLayout(raw json.RawMessage) bool {
	var v struct {
		Order  []string `json:"order"`
		Hidden []string `json:"hidden"`
	}
	if json.Unmarshal(raw, &v) != nil || len(v.Order) > 300 || len(v.Hidden) > 300 {
		return false
	}
	for _, k := range append(v.Order, v.Hidden...) {
		if k == "" || len(k) > 80 {
			return false
		}
	}
	return true
}

// Keyboard shortcut overrides: {shortcutId: ["Mod+K", ...]}. An empty list unbinds the shortcut.
func validShortcuts(raw json.RawMessage) bool {
	var v map[string][]string
	if json.Unmarshal(raw, &v) != nil || len(v) > 200 {
		return false
	}
	for id, keys := range v {
		if id == "" || len(id) > 60 || len(keys) > 4 {
			return false
		}
		for _, k := range keys {
			if k == "" || len(k) > 40 {
				return false
			}
		}
	}
	return true
}
