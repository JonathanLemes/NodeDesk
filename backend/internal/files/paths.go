package files

import (
	"errors"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

// trashDirName lives at the top of each root and is never listed or addressable.
const trashDirName = ".nodedesk-trash"

// Clean turns a client-supplied path into a slash-separated path relative to the root
// ("." for the root itself). It rejects NUL bytes and any attempt to touch the trash dir.
func Clean(p string) (string, error) {
	if strings.ContainsRune(p, 0) {
		return "", httpx.BadRequest("invalid path")
	}
	p = path.Clean("/" + strings.ReplaceAll(p, "\\", "/"))
	p = strings.TrimPrefix(p, "/")
	if p == "" {
		return ".", nil
	}
	for _, part := range strings.Split(p, "/") {
		if part == trashDirName {
			return "", httpx.Forbidden("that location is reserved")
		}
	}
	return p, nil
}

// ValidName checks a single file name (no separators, no dot names).
func ValidName(name string) error {
	if name == "" || name == "." || name == ".." || len(name) > 255 ||
		strings.ContainsAny(name, "/\\\x00") || name == trashDirName {
		return httpx.BadRequest("invalid name %q", name)
	}
	return nil
}

// join returns the child path of dir.
func join(dir, name string) string {
	if dir == "." {
		return name
	}
	return dir + "/" + name
}

// api returns the client-facing form of a cleaned relative path.
func api(rel string) string {
	if rel == "." {
		return "/"
	}
	return "/" + rel
}

func (m *Manager) denied(r Root, rel string) error {
	if len(m.protected) == 0 {
		return nil
	}
	abs := filepath.Join(r.Path, filepath.FromSlash(rel))
	for _, p := range m.protected {
		if within(abs, p) {
			return httpx.Forbidden("that location is protected")
		}
	}
	return nil
}

// pathErr maps filesystem errors to API errors without leaking absolute host paths.
func pathErr(err error) error {
	var he *httpx.Error
	if errors.As(err, &he) {
		return err
	}
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return httpx.NotFound("not found")
	case errors.Is(err, fs.ErrExist):
		return httpx.Conflict("already exists")
	case errors.Is(err, fs.ErrPermission):
		return httpx.Forbidden("permission denied")
	case errors.Is(err, syscall.ENOSPC):
		return httpx.Err(507, "no_space", "no space left on device")
	case errors.Is(err, syscall.ENOTEMPTY):
		return httpx.Conflict("directory is not empty")
	}
	// os.Root reports escape attempts with this message.
	if strings.Contains(err.Error(), "path escapes from parent") {
		return httpx.Forbidden("path escapes the authorised root")
	}
	var pe *fs.PathError
	if errors.As(err, &pe) {
		return httpx.BadRequest("%s: %s", pe.Op, pe.Err)
	}
	return err
}

func isDirEntry(fi os.FileInfo) bool { return fi.IsDir() }
