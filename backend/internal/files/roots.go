// Package files implements the file manager backend.
//
// Every operation is scoped to an authorised root (a directory the admin explicitly
// allowed). Paths are resolved with os.Root, which refuses ".." and symlinks that
// escape the root at the syscall level, so validation does not rely on string checks alone.
package files

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

type Root struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Path     string `json:"path"`
	ReadOnly bool   `json:"readOnly"`
	Order    int    `json:"order"`
	// Available is false when the directory currently cannot be opened (unmounted disk…).
	Available bool `json:"available"`
}

var rootIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)

type Manager struct {
	db *sql.DB
	// protected are absolute paths that can never be read or modified through the API
	// (e.g. NodeDesk's own data directory).
	protected []string
}

func NewManager(db *sql.DB, protected ...string) *Manager {
	m := &Manager{db: db}
	for _, p := range protected {
		if abs, err := filepath.Abs(p); err == nil {
			m.protected = append(m.protected, abs)
			if real, err := filepath.EvalSymlinks(abs); err == nil && real != abs {
				m.protected = append(m.protected, real)
			}
		}
	}
	return m
}

func (m *Manager) Roots() ([]Root, error) {
	rows, err := m.db.Query(`SELECT id, name, path, read_only, sort_order FROM file_roots ORDER BY sort_order, name COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Root{}
	for rows.Next() {
		var r Root
		var ro int
		if err := rows.Scan(&r.ID, &r.Name, &r.Path, &ro, &r.Order); err != nil {
			return nil, err
		}
		r.ReadOnly = ro == 1
		if st, err := os.Stat(r.Path); err == nil && st.IsDir() {
			r.Available = true
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (m *Manager) root(id string) (Root, error) {
	var r Root
	var ro int
	err := m.db.QueryRow(`SELECT id, name, path, read_only, sort_order FROM file_roots WHERE id = ?`, id).
		Scan(&r.ID, &r.Name, &r.Path, &ro, &r.Order)
	if errors.Is(err, sql.ErrNoRows) {
		return r, httpx.NotFound("unknown root %q", id)
	}
	r.ReadOnly = ro == 1
	return r, err
}

// AddRoot authorises a directory. The path must be absolute and an existing directory.
func (m *Manager) AddRoot(name, path string, readOnly bool) (Root, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 40 {
		return Root{}, httpx.BadRequest("name is required (max 40 characters)")
	}
	if !filepath.IsAbs(path) {
		return Root{}, httpx.BadRequest("path must be absolute")
	}
	path = filepath.Clean(path)
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		return Root{}, httpx.BadRequest("cannot access %s", path)
	}
	if st, err := os.Stat(real); err != nil || !st.IsDir() {
		return Root{}, httpx.BadRequest("%s is not a directory", path)
	}
	// A root that contains the data dir is fine (the data dir is hidden and denied
	// inside it); a root *inside* the data dir would expose the database itself.
	for _, p := range m.protected {
		if within(real, p) {
			return Root{}, httpx.BadRequest("that directory is part of NodeDesk's own data and cannot be exposed")
		}
	}
	var n int
	m.db.QueryRow(`SELECT COUNT(*) FROM file_roots WHERE path = ?`, path).Scan(&n)
	if n > 0 {
		return Root{}, httpx.Conflict("that directory is already authorised")
	}
	id := m.uniqueRootID(name)
	var order int
	m.db.QueryRow(`SELECT COALESCE(MAX(sort_order), 0) + 1 FROM file_roots`).Scan(&order)
	if _, err := m.db.Exec(`INSERT INTO file_roots(id, name, path, read_only, sort_order) VALUES (?,?,?,?,?)`,
		id, name, path, b2i(readOnly), order); err != nil {
		return Root{}, err
	}
	return Root{ID: id, Name: name, Path: path, ReadOnly: readOnly, Order: order, Available: true}, nil
}

func (m *Manager) UpdateRoot(id, name string, readOnly bool) error {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 40 {
		return httpx.BadRequest("name is required (max 40 characters)")
	}
	res, err := m.db.Exec(`UPDATE file_roots SET name = ?, read_only = ? WHERE id = ?`, name, b2i(readOnly), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.NotFound("unknown root")
	}
	return nil
}

func (m *Manager) RemoveRoot(id string) error {
	res, err := m.db.Exec(`DELETE FROM file_roots WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.NotFound("unknown root")
	}
	return nil
}

// Seed inserts default roots when none exist yet. Errors are non-fatal: a missing
// seed directory should not stop the server.
func (m *Manager) Seed(roots map[string]string) []error {
	var n int
	m.db.QueryRow(`SELECT COUNT(*) FROM file_roots`).Scan(&n)
	if n > 0 {
		return nil
	}
	var errs []error
	for name, path := range roots {
		if _, err := m.AddRoot(name, path, false); err != nil {
			errs = append(errs, err)
		}
	}
	return errs
}

func (m *Manager) uniqueRootID(name string) string {
	base := strings.Trim(regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(strings.ToLower(name), "-"), "-")
	if base == "" || !rootIDPattern.MatchString(base) {
		base = "root"
	}
	id := base
	for i := 2; ; i++ {
		var n int
		m.db.QueryRow(`SELECT COUNT(*) FROM file_roots WHERE id = ?`, id).Scan(&n)
		if n == 0 {
			return id
		}
		id = base + "-" + itoa(i)
	}
}

// open returns a traversal-safe handle for the root. Callers must Close it.
// Roots are opened per request (not cached) so a disk mounted after startup is picked up.
func (m *Manager) open(id string) (*os.Root, Root, error) {
	r, err := m.root(id)
	if err != nil {
		return nil, r, err
	}
	h, err := os.OpenRoot(r.Path)
	if err != nil {
		return nil, r, httpx.Unavailable("root %q is not available: %v", r.Name, pathErr(err))
	}
	return h, r, nil
}

func (m *Manager) openWritable(id string) (*os.Root, Root, error) {
	h, r, err := m.open(id)
	if err != nil {
		return nil, r, err
	}
	if r.ReadOnly {
		h.Close()
		return nil, r, httpx.Forbidden("root %q is read-only", r.Name)
	}
	return h, r, nil
}

func within(path, dir string) bool {
	rel, err := filepath.Rel(dir, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

func itoa(i int) string {
	const digits = "0123456789"
	if i == 0 {
		return "0"
	}
	var b []byte
	for ; i > 0; i /= 10 {
		b = append([]byte{digits[i%10]}, b...)
	}
	return string(b)
}
