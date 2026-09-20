package files

import (
	"context"
	"errors"
	"io"
	"io/fs"
	"os"
	"path"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

const (
	MaxEditableBytes = 2 << 20
	maxCopyDepth     = 64
)

type Listing struct {
	Root     string  `json:"root"`
	Path     string  `json:"path"`
	ReadOnly bool    `json:"readOnly"`
	Entries  []Entry `json:"entries"`
}

func (m *Manager) List(rootID, p string) (*Listing, error) {
	rel, err := Clean(p)
	if err != nil {
		return nil, err
	}
	h, r, err := m.open(rootID)
	if err != nil {
		return nil, err
	}
	defer h.Close()
	if err := m.denied(r, rel); err != nil {
		return nil, err
	}
	f, err := h.Open(rel)
	if err != nil {
		return nil, pathErr(err)
	}
	defer f.Close()
	if st, err := f.Stat(); err != nil || !st.IsDir() {
		return nil, httpx.BadRequest("not a directory")
	}
	des, err := f.ReadDir(-1)
	if err != nil {
		return nil, pathErr(err)
	}
	out := &Listing{Root: r.ID, Path: api(rel), ReadOnly: r.ReadOnly, Entries: make([]Entry, 0, len(des))}
	for _, de := range des {
		name := de.Name()
		if rel == "." && name == trashDirName {
			continue
		}
		if m.denied(r, join(rel, name)) != nil {
			continue
		}
		fi, err := de.Info()
		if err != nil {
			continue // vanished between readdir and stat
		}
		e := newEntry(rel, name, fi)
		if e.Symlink {
			if target, err := h.Stat(join(rel, name)); err == nil {
				e.IsDir = target.IsDir()
				e.Size = target.Size()
				e.Kind = KindOf(name, e.IsDir)
				if !e.IsDir {
					e.Mime = mimeOf(name)
					e.Editable = e.Kind.Editable()
				} else {
					e.Size = 0
				}
			} else {
				e.Broken = true
				e.Kind = KindOther
			}
		}
		out.Entries = append(out.Entries, e)
	}
	sortEntries(out.Entries)
	countChildren(h, rel, out.Entries)
	return out, nil
}

// countChildren fills Entry.Items for folders. It costs one open per folder, so it is
// skipped for very large listings.
func countChildren(h *os.Root, dir string, es []Entry) {
	const maxFolders = 150
	folders := 0
	for _, e := range es {
		if e.IsDir {
			folders++
		}
	}
	if folders > maxFolders {
		return
	}
	for i := range es {
		if !es[i].IsDir || es[i].Broken {
			continue
		}
		d, err := h.Open(join(dir, es[i].Name))
		if err != nil {
			continue
		}
		if names, err := d.Readdirnames(-1); err == nil {
			n := len(names)
			es[i].Items = &n
		}
		d.Close()
	}
}

func (m *Manager) Stat(rootID, p string) (Entry, error) {
	rel, err := Clean(p)
	if err != nil {
		return Entry{}, err
	}
	h, r, err := m.open(rootID)
	if err != nil {
		return Entry{}, err
	}
	defer h.Close()
	if err := m.denied(r, rel); err != nil {
		return Entry{}, err
	}
	fi, err := h.Stat(rel)
	if err != nil {
		return Entry{}, pathErr(err)
	}
	name := path.Base(rel)
	if rel == "." {
		name = r.Name
	}
	return newEntry(path.Dir(rel), name, fi), nil
}

func (m *Manager) Mkdir(rootID, dir, name string) (Entry, error) {
	if err := ValidName(name); err != nil {
		return Entry{}, err
	}
	rel, err := Clean(dir)
	if err != nil {
		return Entry{}, err
	}
	h, r, err := m.openWritable(rootID)
	if err != nil {
		return Entry{}, err
	}
	defer h.Close()
	target := join(rel, name)
	if err := m.denied(r, target); err != nil {
		return Entry{}, err
	}
	if err := h.Mkdir(target, 0o755); err != nil {
		return Entry{}, pathErr(err)
	}
	fi, err := h.Stat(target)
	if err != nil {
		return Entry{}, pathErr(err)
	}
	return newEntry(rel, name, fi), nil
}

func (m *Manager) Rename(rootID, p, newName string) (Entry, error) {
	if err := ValidName(newName); err != nil {
		return Entry{}, err
	}
	rel, err := Clean(p)
	if err != nil {
		return Entry{}, err
	}
	if rel == "." {
		return Entry{}, httpx.BadRequest("cannot rename a root")
	}
	h, r, err := m.openWritable(rootID)
	if err != nil {
		return Entry{}, err
	}
	defer h.Close()
	dest := join(path.Dir(rel), newName)
	if err := errors.Join(m.denied(r, rel), m.denied(r, dest)); err != nil {
		return Entry{}, httpx.Forbidden("that location is protected")
	}
	if dest == rel {
		return Entry{}, httpx.BadRequest("the name did not change")
	}
	if _, err := h.Lstat(dest); err == nil {
		return Entry{}, httpx.Conflict("%q already exists", newName)
	}
	if err := h.Rename(rel, dest); err != nil {
		return Entry{}, pathErr(err)
	}
	fi, err := h.Lstat(dest)
	if err != nil {
		return Entry{}, pathErr(err)
	}
	return newEntry(path.Dir(rel), newName, fi), nil
}

// Move relocates items into dst. Name clashes keep both files ("name (2).ext").
func (m *Manager) Move(ctx context.Context, items []Ref, dst Ref) ([]Ref, error) {
	return m.transfer(ctx, items, dst, true)
}

func (m *Manager) Copy(ctx context.Context, items []Ref, dst Ref) ([]Ref, error) {
	return m.transfer(ctx, items, dst, false)
}

func (m *Manager) transfer(ctx context.Context, items []Ref, dst Ref, move bool) ([]Ref, error) {
	if len(items) == 0 {
		return nil, httpx.BadRequest("nothing selected")
	}
	dstDir, err := Clean(dst.Path)
	if err != nil {
		return nil, err
	}
	dh, dr, err := m.openWritable(dst.Root)
	if err != nil {
		return nil, err
	}
	defer dh.Close()
	if err := m.denied(dr, dstDir); err != nil {
		return nil, err
	}
	if st, err := dh.Stat(dstDir); err != nil || !st.IsDir() {
		return nil, httpx.BadRequest("destination is not a directory")
	}

	handles := map[string]*os.Root{dst.Root: dh}
	defer func() {
		for id, h := range handles {
			if id != dst.Root {
				h.Close()
			}
		}
	}()

	out := make([]Ref, 0, len(items))
	for _, it := range items {
		rel, err := Clean(it.Path)
		if err != nil {
			return out, err
		}
		if rel == "." {
			return out, httpx.BadRequest("cannot move or copy a root")
		}
		sh, ok := handles[it.Root]
		var sr Root
		if !ok {
			if move {
				sh, sr, err = m.openWritable(it.Root)
			} else {
				sh, sr, err = m.open(it.Root)
			}
			if err != nil {
				return out, err
			}
			handles[it.Root] = sh
		} else if sr, err = m.root(it.Root); err != nil {
			return out, err
		}
		if err := m.denied(sr, rel); err != nil {
			return out, err
		}
		sameRoot := it.Root == dst.Root
		if sameRoot && (dstDir == rel || strings.HasPrefix(dstDir+"/", rel+"/")) {
			return out, httpx.BadRequest("cannot place a folder inside itself")
		}
		if sameRoot && move && path.Dir(rel) == dstDir {
			out = append(out, Ref{Root: dst.Root, Path: api(rel)})
			continue
		}
		fi, err := sh.Lstat(rel)
		if err != nil {
			return out, pathErr(err)
		}
		name := uniqueName(dh, dstDir, path.Base(rel), fi.IsDir())
		dest := join(dstDir, name)

		switch {
		case move && sameRoot:
			err = dh.Rename(rel, dest)
			if errors.Is(err, syscall.EXDEV) { // root spans several mounts
				err = copyTree(ctx, sh, rel, dh, dest, 0)
				if err == nil {
					err = sh.RemoveAll(rel)
				}
			}
		default:
			err = copyTree(ctx, sh, rel, dh, dest, 0)
			if err == nil && move {
				err = sh.RemoveAll(rel)
			}
		}
		if err != nil {
			return out, pathErr(err)
		}
		out = append(out, Ref{Root: dst.Root, Path: api(dest)})
	}
	return out, nil
}

// uniqueName returns name, or "name (2).ext" style variants until it is free.
func uniqueName(h *os.Root, dir, name string, isDir bool) string {
	if _, err := h.Lstat(join(dir, name)); err != nil {
		return name
	}
	base, ext := name, ""
	if !isDir {
		if e := path.Ext(name); e != "" && e != name {
			base, ext = strings.TrimSuffix(name, e), e
		}
	}
	for i := 2; ; i++ {
		cand := base + " (" + itoa(i) + ")" + ext
		if _, err := h.Lstat(join(dir, cand)); err != nil {
			return cand
		}
	}
}

// copyTree copies a file or directory tree between roots. Symlinks are skipped:
// recreating them could point outside the destination root.
func copyTree(ctx context.Context, src *os.Root, sRel string, dst *os.Root, dRel string, depth int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if depth > maxCopyDepth {
		return httpx.BadRequest("directory tree is too deep")
	}
	fi, err := src.Lstat(sRel)
	if err != nil {
		return err
	}
	switch {
	case fi.Mode()&fs.ModeSymlink != 0:
		return nil
	case fi.IsDir():
		if err := dst.Mkdir(dRel, 0o755); err != nil {
			return err
		}
		d, err := src.Open(sRel)
		if err != nil {
			return err
		}
		des, err := d.ReadDir(-1)
		d.Close()
		if err != nil {
			return err
		}
		for _, de := range des {
			if depth == 0 && de.Name() == trashDirName {
				continue
			}
			if err := copyTree(ctx, src, join(sRel, de.Name()), dst, join(dRel, de.Name()), depth+1); err != nil {
				return err
			}
		}
		return dst.Chmod(dRel, fi.Mode().Perm())
	case fi.Mode().IsRegular():
		in, err := src.Open(sRel)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := dst.OpenFile(dRel, os.O_WRONLY|os.O_CREATE|os.O_EXCL, fi.Mode().Perm())
		if err != nil {
			return err
		}
		if _, err := io.Copy(out, &ctxReader{ctx, in}); err != nil {
			out.Close()
			dst.Remove(dRel)
			return err
		}
		if err := out.Close(); err != nil {
			return err
		}
		return dst.Chtimes(dRel, time.Now(), fi.ModTime())
	}
	return nil // sockets, devices…
}

type ctxReader struct {
	ctx context.Context
	r   io.Reader
}

func (c *ctxReader) Read(p []byte) (int, error) {
	if err := c.ctx.Err(); err != nil {
		return 0, err
	}
	return c.r.Read(p)
}

// Delete moves items to the per-root trash, or removes them for good when permanent is set.
func (m *Manager) Delete(items []Ref, permanent bool) error {
	if len(items) == 0 {
		return httpx.BadRequest("nothing selected")
	}
	for _, it := range items {
		rel, err := Clean(it.Path)
		if err != nil {
			return err
		}
		if rel == "." {
			return httpx.BadRequest("cannot delete a root")
		}
		h, r, err := m.openWritable(it.Root)
		if err != nil {
			return err
		}
		err = func() error {
			defer h.Close()
			if err := m.denied(r, rel); err != nil {
				return err
			}
			if _, err := h.Lstat(rel); err != nil {
				return pathErr(err)
			}
			if permanent {
				return pathErr(h.RemoveAll(rel))
			}
			return m.moveToTrash(h, rel)
		}()
		if err != nil {
			return err
		}
	}
	return nil
}

type Text struct {
	Content string `json:"content"`
	Size    int64  `json:"size"`
	ModTime int64  `json:"modTime"`
}

func (m *Manager) ReadText(rootID, p string) (Text, error) {
	rel, err := Clean(p)
	if err != nil {
		return Text{}, err
	}
	h, r, err := m.open(rootID)
	if err != nil {
		return Text{}, err
	}
	defer h.Close()
	if err := m.denied(r, rel); err != nil {
		return Text{}, err
	}
	f, err := h.Open(rel)
	if err != nil {
		return Text{}, pathErr(err)
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		return Text{}, pathErr(err)
	}
	if !fi.Mode().IsRegular() {
		return Text{}, httpx.BadRequest("not a regular file")
	}
	if fi.Size() > MaxEditableBytes {
		return Text{}, httpx.Err(413, "too_large", "file is larger than %d MB", MaxEditableBytes>>20)
	}
	b, err := io.ReadAll(io.LimitReader(f, MaxEditableBytes+1))
	if err != nil {
		return Text{}, pathErr(err)
	}
	if !utf8.Valid(b) || strings.IndexByte(string(b[:min(len(b), 8192)]), 0) >= 0 {
		return Text{}, httpx.Err(415, "not_text", "file is not UTF-8 text")
	}
	return Text{Content: string(b), Size: fi.Size(), ModTime: fi.ModTime().UnixMilli()}, nil
}

// WriteText replaces the file content. expectedMod (unix ms, 0 = skip) guards against
// overwriting changes made elsewhere since the file was loaded.
func (m *Manager) WriteText(rootID, p, content string, expectedMod int64) (Text, error) {
	rel, err := Clean(p)
	if err != nil {
		return Text{}, err
	}
	if len(content) > MaxEditableBytes {
		return Text{}, httpx.Err(413, "too_large", "content is larger than %d MB", MaxEditableBytes>>20)
	}
	h, r, err := m.openWritable(rootID)
	if err != nil {
		return Text{}, err
	}
	defer h.Close()
	if err := m.denied(r, rel); err != nil {
		return Text{}, err
	}
	fi, err := h.Stat(rel)
	if err != nil {
		return Text{}, pathErr(err)
	}
	if !fi.Mode().IsRegular() {
		return Text{}, httpx.BadRequest("not a regular file")
	}
	if expectedMod != 0 && fi.ModTime().UnixMilli() != expectedMod {
		return Text{}, httpx.Conflict("the file changed on disk since you opened it")
	}
	// Write to a sibling temp file and rename: a crash never leaves a half-written file.
	tmp := join(path.Dir(rel), "."+path.Base(rel)+".nodedesk-tmp")
	f, err := h.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, fi.Mode().Perm())
	if err != nil {
		return Text{}, pathErr(err)
	}
	if _, err := io.WriteString(f, content); err != nil {
		f.Close()
		h.Remove(tmp)
		return Text{}, pathErr(err)
	}
	if err := f.Close(); err != nil {
		h.Remove(tmp)
		return Text{}, pathErr(err)
	}
	if err := h.Rename(tmp, rel); err != nil {
		h.Remove(tmp)
		return Text{}, pathErr(err)
	}
	nfi, err := h.Stat(rel)
	if err != nil {
		return Text{}, pathErr(err)
	}
	return Text{Size: nfi.Size(), ModTime: nfi.ModTime().UnixMilli()}, nil
}

// CreateFile makes an empty file (used by "New file").
func (m *Manager) CreateFile(rootID, dir, name string) (Entry, error) {
	if err := ValidName(name); err != nil {
		return Entry{}, err
	}
	rel, err := Clean(dir)
	if err != nil {
		return Entry{}, err
	}
	h, r, err := m.openWritable(rootID)
	if err != nil {
		return Entry{}, err
	}
	defer h.Close()
	target := join(rel, name)
	if err := m.denied(r, target); err != nil {
		return Entry{}, err
	}
	f, err := h.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return Entry{}, pathErr(err)
	}
	f.Close()
	fi, err := h.Stat(target)
	if err != nil {
		return Entry{}, pathErr(err)
	}
	return newEntry(rel, name, fi), nil
}

// Open returns a regular file for streaming (download / inline preview).
func (m *Manager) Open(rootID, p string) (*os.File, fs.FileInfo, error) {
	rel, err := Clean(p)
	if err != nil {
		return nil, nil, err
	}
	h, r, err := m.open(rootID)
	if err != nil {
		return nil, nil, err
	}
	defer h.Close() // the returned *os.File stays valid after the root handle closes
	if err := m.denied(r, rel); err != nil {
		return nil, nil, err
	}
	f, err := h.Open(rel)
	if err != nil {
		return nil, nil, pathErr(err)
	}
	fi, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, nil, pathErr(err)
	}
	if !fi.Mode().IsRegular() {
		f.Close()
		return nil, nil, httpx.BadRequest("not a regular file")
	}
	return f, fi, nil
}

// Upload streams body into dir/name. name may contain sub-folders (folder uploads);
// missing folders are created. Existing files are never overwritten: a free name is picked.
func (m *Manager) Upload(ctx context.Context, rootID, dir, name string, body io.Reader) (Entry, error) {
	rel, err := Clean(dir)
	if err != nil {
		return Entry{}, err
	}
	parts := strings.Split(strings.Trim(strings.ReplaceAll(name, "\\", "/"), "/"), "/")
	for _, part := range parts {
		if err := ValidName(part); err != nil {
			return Entry{}, err
		}
	}
	h, r, err := m.openWritable(rootID)
	if err != nil {
		return Entry{}, err
	}
	defer h.Close()

	parent := rel
	if len(parts) > 1 {
		parent = join(rel, strings.Join(parts[:len(parts)-1], "/"))
		if err := m.denied(r, parent); err != nil {
			return Entry{}, err
		}
		if err := h.MkdirAll(parent, 0o755); err != nil {
			return Entry{}, pathErr(err)
		}
	}
	if err := m.denied(r, parent); err != nil {
		return Entry{}, err
	}
	final := uniqueName(h, parent, parts[len(parts)-1], false)
	target := join(parent, final)
	f, err := h.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return Entry{}, pathErr(err)
	}
	if _, err := io.Copy(f, &ctxReader{ctx, body}); err != nil {
		f.Close()
		h.Remove(target)
		return Entry{}, pathErr(err)
	}
	if err := f.Close(); err != nil {
		h.Remove(target)
		return Entry{}, pathErr(err)
	}
	fi, err := h.Stat(target)
	if err != nil {
		return Entry{}, pathErr(err)
	}
	return newEntry(parent, final, fi), nil
}
