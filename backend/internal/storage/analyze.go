package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

const (
	maxDepth     = 3
	cacheTTL     = 30 * time.Minute
	jobTimeout   = 15 * time.Minute
	maxJobs      = 2
	throttleEach = 2000 // entries between short sleeps, keeps the scan gentle
	topChildren  = 40
	topLargest   = 25
)

// Analysis is a "what is using my space" report for one directory.
type Analysis struct {
	ID         string  `json:"id"`
	Path       string  `json:"path"`
	Status     string  `json:"status"` // running | done | failed | cancelled
	Error      string  `json:"error,omitempty"`
	Started    int64   `json:"started"`
	Finished   int64   `json:"finished,omitempty"`
	Scanned    int64   `json:"scanned"` // entries visited so far
	Bytes      int64   `json:"bytes"`
	Skipped    int64   `json:"skipped"` // unreadable entries
	Children   []Usage `json:"children"`
	Largest    []Usage `json:"largest"`
	FromCache  bool    `json:"fromCache,omitempty"`
	cancel     context.CancelFunc
	finishedAt time.Time
}

type Usage struct {
	Path  string `json:"path"`
	Name  string `json:"name"`
	Size  int64  `json:"size"`
	IsDir bool   `json:"isDir"`
}

type Analyzer struct {
	mu     sync.Mutex
	jobs   map[string]*Analysis
	byPath map[string]string // path -> job id (latest)
}

func newAnalyzer(isMount func(string) bool) *Analyzer {
	return &Analyzer{jobs: map[string]*Analysis{}, byPath: map[string]string{}}
}

// Start begins (or reuses a fresh cached) analysis of dir. The caller must have
// validated that dir is allowed. force skips the cache.
func (a *Analyzer) Start(dir string, force bool) (Analysis, error) {
	dir = filepath.Clean(dir)
	a.mu.Lock()
	defer a.mu.Unlock()
	a.gc()

	if id, ok := a.byPath[dir]; ok {
		if j := a.jobs[id]; j != nil {
			if j.Status == "running" {
				return j.snapshot(false), nil
			}
			if !force && j.Status == "done" && time.Since(j.finishedAt) < cacheTTL {
				return j.snapshot(true), nil
			}
		}
	}
	running := 0
	for _, j := range a.jobs {
		if j.Status == "running" {
			running++
		}
	}
	if running >= maxJobs {
		return Analysis{}, httpx.Conflict("too many analyses running, try again shortly")
	}

	b := make([]byte, 6)
	rand.Read(b)
	ctx, cancel := context.WithTimeout(context.Background(), jobTimeout)
	j := &Analysis{ID: hex.EncodeToString(b), Path: dir, Status: "running", Started: time.Now().UnixMilli(),
		Children: []Usage{}, Largest: []Usage{}, cancel: cancel}
	a.jobs[j.ID] = j
	a.byPath[dir] = j.ID
	go a.run(ctx, j)
	return j.snapshot(false), nil
}

func (a *Analyzer) Get(id string) (Analysis, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	j := a.jobs[id]
	if j == nil {
		return Analysis{}, httpx.NotFound("analysis not found")
	}
	return j.snapshot(false), nil
}

func (a *Analyzer) Cancel(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	j := a.jobs[id]
	if j == nil {
		return httpx.NotFound("analysis not found")
	}
	if j.Status == "running" {
		j.cancel()
	}
	return nil
}

func (j *Analysis) snapshot(cached bool) Analysis {
	c := *j
	c.cancel = nil
	c.FromCache = cached
	c.Children = append([]Usage(nil), j.Children...)
	c.Largest = append([]Usage(nil), j.Largest...)
	return c
}

// gc drops old finished jobs (called with a.mu held).
func (a *Analyzer) gc() {
	for id, j := range a.jobs {
		if j.Status != "running" && time.Since(j.finishedAt) > 2*cacheTTL {
			delete(a.jobs, id)
			if a.byPath[j.Path] == id {
				delete(a.byPath, j.Path)
			}
		}
	}
}

func (a *Analyzer) run(ctx context.Context, j *Analysis) {
	defer j.cancel()
	root := j.Path
	sizes := map[string]int64{} // dirs up to maxDepth, cumulative
	isDir := map[string]bool{}
	var rootDev uint64
	if st, err := statDev(root); err == nil {
		rootDev = st
	}

	var scanned, bytes, skipped int64
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			skipped++
			if d != nil && d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		scanned++
		if scanned%throttleEach == 0 {
			a.progress(j, scanned, bytes, skipped)
			time.Sleep(2 * time.Millisecond)
		}
		if p == root {
			return nil
		}
		fi, err := d.Info()
		if err != nil {
			skipped++
			return nil
		}
		st, _ := fi.Sys().(*syscall.Stat_t)
		if d.IsDir() {
			if st != nil && uint64(st.Dev) != rootDev {
				return fs.SkipDir // do not cross into other filesystems
			}
			if depth(root, p) <= maxDepth {
				isDir[p] = true
				sizes[p] += 0
			}
			return nil
		}
		if !d.Type().IsRegular() {
			return nil
		}
		var n int64 = fi.Size()
		if st != nil {
			n = st.Blocks * 512 // real disk usage, like du
		}
		bytes += n
		// Attribute the file to each ancestor directory within maxDepth.
		for dir := filepath.Dir(p); ; dir = filepath.Dir(dir) {
			if dir != root && depth(root, dir) <= maxDepth {
				sizes[dir] += n
			}
			if dir == root || dir == "/" || dir == "." {
				break
			}
		}
		if filepath.Dir(p) == root {
			sizes[p] += n
			isDir[p] = false
		}
		return nil
	})

	a.mu.Lock()
	defer a.mu.Unlock()
	j.Scanned, j.Bytes, j.Skipped = scanned, bytes, skipped
	j.Finished = time.Now().UnixMilli()
	j.finishedAt = time.Now()
	switch {
	case err == context.Canceled:
		j.Status = "cancelled"
	case err != nil:
		j.Status, j.Error = "failed", err.Error()
	default:
		j.Status = "done"
	}
	var children, deeper []Usage
	for p, s := range sizes {
		u := Usage{Path: p, Name: filepath.Base(p), Size: s, IsDir: isDir[p]}
		if depth(root, p) == 1 {
			children = append(children, u)
		} else if isDir[p] {
			deeper = append(deeper, u)
		}
	}
	bySize := func(l []Usage) {
		sort.Slice(l, func(i, k int) bool { return l[i].Size > l[k].Size })
	}
	bySize(children)
	bySize(deeper)
	if len(children) > topChildren {
		children = children[:topChildren]
	}
	if len(deeper) > topLargest {
		deeper = deeper[:topLargest]
	}
	if children != nil {
		j.Children = children
	}
	if deeper != nil {
		j.Largest = deeper
	}
}

func (a *Analyzer) progress(j *Analysis, scanned, bytes, skipped int64) {
	a.mu.Lock()
	j.Scanned, j.Bytes, j.Skipped = scanned, bytes, skipped
	a.mu.Unlock()
}

func depth(root, p string) int {
	rel := strings.TrimPrefix(strings.TrimPrefix(p, root), "/")
	if rel == "" {
		return 0
	}
	return strings.Count(rel, "/") + 1
}

func statDev(p string) (uint64, error) {
	var st syscall.Stat_t
	if err := syscall.Stat(p, &st); err != nil {
		return 0, err
	}
	return uint64(st.Dev), nil
}
