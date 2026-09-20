// Package apps implements NodeDesk's own App abstraction: something that shows up as a
// desktop application (a Docker container, a systemd service, an external URL…).
package apps

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"unicode"

	"github.com/JonathanLemes/nodedesk/backend/internal/docker"
	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

var (
	Types       = []string{"docker", "systemd", "url", "manual"}
	unitPattern = regexp.MustCompile(`^[a-zA-Z0-9:_.@\\-]{1,200}\.(service|timer|socket|target|mount|path)$`)
	iconPattern = regexp.MustCompile(`^lucide:[a-z0-9-]{1,40}$`)
)

type App struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Icon         string   `json:"icon"` // "", "lucide:<name>" or an http(s) URL
	Type         string   `json:"type"`
	URL          string   `json:"url"` // may contain {host}, replaced by the browser's hostname
	Containers   []string `json:"containers"`
	SystemdUnits []string `json:"systemdUnits"`
	Favorite     bool     `json:"favorite"`
	Category     string   `json:"category"`
	Order        int      `json:"order"`
}

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

const cols = `id, name, icon, type, url, containers, systemd_units, favorite, category, sort_order`

func scan(sc interface{ Scan(...any) error }) (App, error) {
	var a App
	var containers, units string
	var fav int
	if err := sc.Scan(&a.ID, &a.Name, &a.Icon, &a.Type, &a.URL, &containers, &units, &fav, &a.Category, &a.Order); err != nil {
		return a, err
	}
	a.Favorite = fav == 1
	if json.Unmarshal([]byte(containers), &a.Containers) != nil || a.Containers == nil {
		a.Containers = []string{}
	}
	if json.Unmarshal([]byte(units), &a.SystemdUnits) != nil || a.SystemdUnits == nil {
		a.SystemdUnits = []string{}
	}
	return a, nil
}

func (s *Store) List() ([]App, error) {
	rows, err := s.db.Query(`SELECT ` + cols + ` FROM apps ORDER BY sort_order, name COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []App{}
	for rows.Next() {
		a, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) Get(id string) (App, error) {
	a, err := scan(s.db.QueryRow(`SELECT `+cols+` FROM apps WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return a, httpx.NotFound("app not found")
	}
	return a, err
}

func (s *Store) Create(a App) (App, error) {
	if err := a.normalize(); err != nil {
		return a, err
	}
	a.ID = s.uniqueID(a.Name)
	var next int
	s.db.QueryRow(`SELECT COALESCE(MAX(sort_order), 0) + 1 FROM apps`).Scan(&next)
	a.Order = next
	_, err := s.db.Exec(`INSERT INTO apps(`+cols+`) VALUES (?,?,?,?,?,?,?,?,?,?)`,
		a.ID, a.Name, a.Icon, a.Type, a.URL, mustJSON(a.Containers), mustJSON(a.SystemdUnits), b2i(a.Favorite), a.Category, a.Order)
	return a, err
}

func (s *Store) Update(id string, a App) (App, error) {
	cur, err := s.Get(id)
	if err != nil {
		return a, err
	}
	a.ID, a.Order = cur.ID, cur.Order
	if err := a.normalize(); err != nil {
		return a, err
	}
	_, err = s.db.Exec(`UPDATE apps SET name=?, icon=?, type=?, url=?, containers=?, systemd_units=?, favorite=?, category=? WHERE id=?`,
		a.Name, a.Icon, a.Type, a.URL, mustJSON(a.Containers), mustJSON(a.SystemdUnits), b2i(a.Favorite), a.Category, id)
	return a, err
}

func (s *Store) Delete(id string) error {
	res, err := s.db.Exec(`DELETE FROM apps WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.NotFound("app not found")
	}
	return nil
}

// Reorder persists the given order (ids not listed keep their relative position after).
func (s *Store) Reorder(ids []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, id := range ids {
		if _, err := tx.Exec(`UPDATE apps SET sort_order = ? WHERE id = ?`, i+1, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (a *App) normalize() error {
	a.Name = strings.TrimSpace(a.Name)
	a.Category = strings.TrimSpace(a.Category)
	a.URL = strings.TrimSpace(a.URL)
	a.Icon = strings.TrimSpace(a.Icon)
	if a.Name == "" || len(a.Name) > 60 {
		return httpx.BadRequest("name is required (max 60 characters)")
	}
	if len(a.Category) > 40 {
		return httpx.BadRequest("category is too long")
	}
	if !contains(Types, a.Type) {
		return httpx.BadRequest("type must be one of %s", strings.Join(Types, ", "))
	}
	if a.URL != "" {
		u, err := url.Parse(strings.ReplaceAll(a.URL, "{host}", "host"))
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return httpx.BadRequest("url must be a valid http(s) address")
		}
	}
	if a.Icon != "" && !iconPattern.MatchString(a.Icon) {
		u, err := url.Parse(a.Icon)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return httpx.BadRequest("icon must be empty, lucide:<name> or an http(s) URL")
		}
	}
	if a.Containers == nil {
		a.Containers = []string{}
	}
	if a.SystemdUnits == nil {
		a.SystemdUnits = []string{}
	}
	if len(a.Containers) > 20 || len(a.SystemdUnits) > 20 {
		return httpx.BadRequest("too many containers or units")
	}
	for _, c := range a.Containers {
		if !docker.ValidID(c) {
			return httpx.BadRequest("invalid container name %q", c)
		}
	}
	for _, u := range a.SystemdUnits {
		if !unitPattern.MatchString(u) {
			return httpx.BadRequest("invalid systemd unit %q", u)
		}
	}
	switch a.Type {
	case "docker":
		if len(a.Containers) == 0 {
			return httpx.BadRequest("docker apps need at least one container")
		}
	case "systemd":
		if len(a.SystemdUnits) == 0 {
			return httpx.BadRequest("systemd apps need at least one unit")
		}
	case "url":
		if a.URL == "" {
			return httpx.BadRequest("url apps need a url")
		}
	}
	return nil
}

func (s *Store) uniqueID(name string) string {
	base := slug(name)
	id := base
	for i := 2; ; i++ {
		var n int
		s.db.QueryRow(`SELECT COUNT(*) FROM apps WHERE id = ?`, id).Scan(&n)
		if n == 0 {
			return id
		}
		id = base + "-" + string(rune('0'+i%10))
		if i > 9 {
			b := make([]byte, 3)
			rand.Read(b)
			id = base + "-" + hex.EncodeToString(b)
		}
	}
}

func slug(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		switch {
		case r < unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)):
			b.WriteRune(r)
			dash = false
		case !dash && b.Len() > 0:
			b.WriteByte('-')
			dash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "app"
	}
	return out
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

func contains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}
