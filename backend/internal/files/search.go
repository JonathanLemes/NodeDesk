package files

import (
	"context"
	"io"
	"io/fs"
	"os"
	"path"
	"strings"
	"time"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

const (
	searchLimit   = 200
	searchVisited = 300_000
	searchTimeout = 8 * time.Second
	sizeVisited   = 500_000
	sizeTimeout   = 10 * time.Second
)

type SearchResult struct {
	Entries   []Entry `json:"entries"`
	Truncated bool    `json:"truncated"`
}

// Search finds entries under dir whose name contains q (case-insensitive).
// It is bounded in results, visited entries and time; it never follows symlinks.
func (m *Manager) Search(ctx context.Context, rootID, dir, q string) (SearchResult, error) {
	q = strings.ToLower(strings.TrimSpace(q))
	if len(q) < 1 {
		return SearchResult{Entries: []Entry{}}, nil
	}
	rel, err := Clean(dir)
	if err != nil {
		return SearchResult{}, err
	}
	h, r, err := m.open(rootID)
	if err != nil {
		return SearchResult{}, err
	}
	defer h.Close()
	if err := m.denied(r, rel); err != nil {
		return SearchResult{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, searchTimeout)
	defer cancel()

	res := SearchResult{Entries: []Entry{}}
	visited := 0
	errStop := fs.SkipAll
	err = fs.WalkDir(h.FS(), rel, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			if d != nil && d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if ctx.Err() != nil {
			res.Truncated = true
			return errStop
		}
		if d.Name() == trashDirName || m.denied(r, p) != nil {
			return fs.SkipDir
		}
		if visited++; visited > searchVisited {
			res.Truncated = true
			return errStop
		}
		if p == rel || !strings.Contains(strings.ToLower(d.Name()), q) {
			return nil
		}
		fi, err := d.Info()
		if err != nil {
			return nil
		}
		res.Entries = append(res.Entries, newEntry(path.Dir(p), d.Name(), fi))
		if len(res.Entries) >= searchLimit {
			res.Truncated = true
			return errStop
		}
		return nil
	})
	if err != nil && err != fs.SkipAll {
		return res, pathErr(err)
	}
	return res, nil
}

type Info struct {
	Entry
	Location string `json:"location"` // absolute host path
	Owner    string `json:"owner"`
	Group    string `json:"group"`
	Items    int    `json:"items,omitempty"`
	// TotalSize is only set for directories when requested (it walks the tree).
	TotalSize *int64 `json:"totalSize,omitempty"`
	Partial   bool   `json:"partial,omitempty"`
}

func (m *Manager) Info(ctx context.Context, rootID, p string, withSize bool) (Info, error) {
	rel, err := Clean(p)
	if err != nil {
		return Info{}, err
	}
	h, r, err := m.open(rootID)
	if err != nil {
		return Info{}, err
	}
	defer h.Close()
	if err := m.denied(r, rel); err != nil {
		return Info{}, err
	}
	fi, err := h.Lstat(rel)
	if err != nil {
		return Info{}, pathErr(err)
	}
	name := path.Base(rel)
	if rel == "." {
		name = r.Name
	}
	info := Info{Entry: newEntry(path.Dir(rel), name, fi), Location: joinHost(r.Path, rel)}
	info.Owner, info.Group = owner(fi)
	if fi.IsDir() {
		if d, err := h.Open(rel); err == nil {
			if names, err := d.Readdirnames(-1); err == nil {
				info.Items = len(names)
				if rel == "." {
					for _, n := range names {
						if n == trashDirName {
							info.Items--
						}
					}
				}
			}
			d.Close()
		}
		if withSize {
			total, partial := dirSize(ctx, h, rel)
			info.TotalSize, info.Partial = &total, partial
		}
	}
	return info, nil
}

func joinHost(root, rel string) string {
	if rel == "." {
		return root
	}
	return strings.TrimRight(root, "/") + "/" + rel
}

// dirSize sums regular-file sizes under rel, bounded by time and entries.
func dirSize(ctx context.Context, h *os.Root, rel string) (total int64, partial bool) {
	ctx, cancel := context.WithTimeout(ctx, sizeTimeout)
	defer cancel()
	visited := 0
	fs.WalkDir(h.FS(), rel, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if ctx.Err() != nil || visited > sizeVisited {
			partial = true
			return fs.SkipAll
		}
		visited++
		if d.Name() == trashDirName && rel == "." {
			return fs.SkipDir
		}
		if d.Type().IsRegular() {
			if fi, err := d.Info(); err == nil {
				total += fi.Size()
			}
		}
		return nil
	})
	return
}

var _ = io.EOF
var _ = httpx.BadRequest
