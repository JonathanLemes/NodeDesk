package files

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

// Trash layout, per root (so moving to trash is a cheap rename on the same filesystem):
//
//	<root>/.nodedesk-trash/<id>.json   metadata
//	<root>/.nodedesk-trash/<id>/<name> the trashed item

type trashMeta struct {
	Name         string `json:"name"`
	OriginalPath string `json:"originalPath"`
	DeletedAt    int64  `json:"deletedAt"`
	IsDir        bool   `json:"isDir"`
	Size         int64  `json:"size"`
}

type TrashItem struct {
	trashMeta
	ID       string `json:"id"`
	Root     string `json:"root"`
	RootName string `json:"rootName"`
	Kind     Kind   `json:"kind"`
}

func (m *Manager) moveToTrash(h *os.Root, rel string) error {
	fi, err := h.Lstat(rel)
	if err != nil {
		return pathErr(err)
	}
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return err
	}
	id := hex.EncodeToString(b)
	dir := trashDirName + "/" + id
	if err := h.MkdirAll(dir, 0o700); err != nil {
		return pathErr(err)
	}
	name := path.Base(rel)
	meta, _ := json.Marshal(trashMeta{Name: name, OriginalPath: api(rel), DeletedAt: time.Now().UnixMilli(), IsDir: fi.IsDir(), Size: fi.Size()})
	if err := h.WriteFile(trashDirName+"/"+id+".json", meta, 0o600); err != nil {
		return pathErr(err)
	}
	err = h.Rename(rel, dir+"/"+name)
	if errors.Is(err, syscall.EXDEV) {
		if err = copyTree(context.Background(), h, rel, h, dir+"/"+name, 0); err == nil {
			err = h.RemoveAll(rel)
		}
	}
	if err != nil {
		h.RemoveAll(dir)
		h.Remove(trashDirName + "/" + id + ".json")
		return pathErr(err)
	}
	return nil
}

func validTrashID(id string) bool {
	if len(id) != 16 {
		return false
	}
	_, err := hex.DecodeString(id)
	return err == nil
}

// Trash lists trashed items across every available root, newest first.
func (m *Manager) Trash() ([]TrashItem, error) {
	roots, err := m.Roots()
	if err != nil {
		return nil, err
	}
	out := []TrashItem{}
	for _, r := range roots {
		if !r.Available {
			continue
		}
		h, err := os.OpenRoot(r.Path)
		if err != nil {
			continue
		}
		d, err := h.Open(trashDirName)
		if err != nil {
			h.Close()
			continue
		}
		des, _ := d.ReadDir(-1)
		d.Close()
		for _, de := range des {
			id, ok := strings.CutSuffix(de.Name(), ".json")
			if !ok || !validTrashID(id) {
				continue
			}
			raw, err := h.ReadFile(trashDirName + "/" + de.Name())
			if err != nil {
				continue
			}
			var meta trashMeta
			if json.Unmarshal(raw, &meta) != nil {
				continue
			}
			out = append(out, TrashItem{trashMeta: meta, ID: id, Root: r.ID, RootName: r.Name, Kind: KindOf(meta.Name, meta.IsDir)})
		}
		h.Close()
	}
	sort.Slice(out, func(i, j int) bool { return out[i].DeletedAt > out[j].DeletedAt })
	return out, nil
}

// RestoreTrash puts an item back where it came from (or next to it with a free name).
func (m *Manager) RestoreTrash(rootID, id string) (Ref, error) {
	if !validTrashID(id) {
		return Ref{}, httpx.BadRequest("invalid trash id")
	}
	h, _, err := m.openWritable(rootID)
	if err != nil {
		return Ref{}, err
	}
	defer h.Close()
	raw, err := h.ReadFile(trashDirName + "/" + id + ".json")
	if err != nil {
		return Ref{}, pathErr(err)
	}
	var meta trashMeta
	if err := json.Unmarshal(raw, &meta); err != nil {
		return Ref{}, err
	}
	orig, err := Clean(meta.OriginalPath)
	if err != nil {
		return Ref{}, err
	}
	dir := path.Dir(orig)
	if err := h.MkdirAll(dir, 0o755); err != nil {
		return Ref{}, pathErr(err)
	}
	name := uniqueName(h, dir, path.Base(orig), meta.IsDir)
	dest := join(dir, name)
	src := trashDirName + "/" + id + "/" + meta.Name
	err = h.Rename(src, dest)
	if errors.Is(err, syscall.EXDEV) {
		if err = copyTree(context.Background(), h, src, h, dest, 0); err == nil {
			err = h.RemoveAll(src)
		}
	}
	if err != nil {
		return Ref{}, pathErr(err)
	}
	h.RemoveAll(trashDirName + "/" + id)
	h.Remove(trashDirName + "/" + id + ".json")
	return Ref{Root: rootID, Path: api(dest)}, nil
}

// PurgeTrash permanently deletes one item, or everything in the root when id is empty.
func (m *Manager) PurgeTrash(rootID, id string) error {
	h, _, err := m.openWritable(rootID)
	if err != nil {
		return err
	}
	defer h.Close()
	if id == "" {
		return pathErr(h.RemoveAll(trashDirName))
	}
	if !validTrashID(id) {
		return httpx.BadRequest("invalid trash id")
	}
	if err := h.RemoveAll(trashDirName + "/" + id); err != nil {
		return pathErr(err)
	}
	if err := h.Remove(trashDirName + "/" + id + ".json"); err != nil && !errors.Is(err, os.ErrNotExist) {
		return pathErr(err)
	}
	return nil
}
