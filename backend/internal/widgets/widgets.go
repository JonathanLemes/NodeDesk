// Package widgets persists the desktop widget layout. The backend knows nothing about
// individual widget types: the registry lives in the frontend, so third parties can add
// widgets without touching the core.
package widgets

import (
	"database/sql"
	"encoding/json"
	"regexp"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
	"github.com/JonathanLemes/nodedesk/backend/internal/settings"
)

const (
	initializedKey = "widgets.initialized"
	maxWidgets     = 50
	maxSettings    = 16 << 10
)

var idPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$`)

type Widget struct {
	InstanceID string          `json:"instanceId"`
	WidgetID   string          `json:"widgetId"`
	X          int             `json:"x"`
	Y          int             `json:"y"`
	W          int             `json:"w"`
	H          int             `json:"h"`
	Z          int             `json:"z"`
	Settings   json.RawMessage `json:"settings"`
}

type Layout struct {
	// Initialized is false until the user (or the frontend defaults) saved a layout once,
	// letting the UI seed a sensible default arrangement.
	Initialized bool     `json:"initialized"`
	Widgets     []Widget `json:"widgets"`
}

type Store struct {
	db       *sql.DB
	settings *settings.Store
}

func NewStore(db *sql.DB, s *settings.Store) *Store { return &Store{db: db, settings: s} }

func (s *Store) Get() (Layout, error) {
	var init bool
	if _, err := s.settings.Get(initializedKey, &init); err != nil {
		return Layout{}, err
	}
	rows, err := s.db.Query(`SELECT instance_id, widget_id, x, y, w, h, z, settings FROM widgets ORDER BY z, instance_id`)
	if err != nil {
		return Layout{}, err
	}
	defer rows.Close()
	l := Layout{Initialized: init, Widgets: []Widget{}}
	for rows.Next() {
		var w Widget
		var st string
		if err := rows.Scan(&w.InstanceID, &w.WidgetID, &w.X, &w.Y, &w.W, &w.H, &w.Z, &st); err != nil {
			return l, err
		}
		w.Settings = json.RawMessage(st)
		l.Widgets = append(l.Widgets, w)
	}
	return l, rows.Err()
}

// Replace stores the whole layout atomically.
func (s *Store) Replace(ws []Widget) error {
	if len(ws) > maxWidgets {
		return httpx.BadRequest("too many widgets")
	}
	seen := map[string]bool{}
	for i := range ws {
		w := &ws[i]
		if !idPattern.MatchString(w.InstanceID) || !idPattern.MatchString(w.WidgetID) {
			return httpx.BadRequest("invalid widget id")
		}
		if seen[w.InstanceID] {
			return httpx.BadRequest("duplicate widget instance %q", w.InstanceID)
		}
		seen[w.InstanceID] = true
		if w.W < 40 || w.H < 40 || w.W > 4000 || w.H > 4000 || w.X < -4000 || w.X > 20000 || w.Y < -4000 || w.Y > 20000 {
			return httpx.BadRequest("widget %q has invalid geometry", w.InstanceID)
		}
		if len(w.Settings) == 0 {
			w.Settings = json.RawMessage("{}")
		}
		if len(w.Settings) > maxSettings || !json.Valid(w.Settings) {
			return httpx.BadRequest("widget %q has invalid settings", w.InstanceID)
		}
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM widgets`); err != nil {
		return err
	}
	for _, w := range ws {
		if _, err := tx.Exec(`INSERT INTO widgets(instance_id, widget_id, x, y, w, h, z, settings) VALUES (?,?,?,?,?,?,?,?)`,
			w.InstanceID, w.WidgetID, w.X, w.Y, w.W, w.H, w.Z, string(w.Settings)); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return s.settings.Set(initializedKey, true)
}
