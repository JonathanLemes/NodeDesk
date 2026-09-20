package files

import (
	"archive/zip"
	"context"
	"io"
	"io/fs"
	"path"
	"strings"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

// WriteZip streams the given items (files and folders of one root) as a zip archive.
func (m *Manager) WriteZip(ctx context.Context, w io.Writer, rootID string, paths []string) error {
	h, r, err := m.open(rootID)
	if err != nil {
		return err
	}
	defer h.Close()

	rels := make([]string, 0, len(paths))
	for _, p := range paths {
		rel, err := Clean(p)
		if err != nil {
			return err
		}
		if err := m.denied(r, rel); err != nil {
			return err
		}
		rels = append(rels, rel)
	}
	if len(rels) == 0 {
		return httpx.BadRequest("nothing selected")
	}

	zw := zip.NewWriter(w)
	defer zw.Close()
	fsys := h.FS()
	for _, rel := range rels {
		base := path.Dir(rel)
		err := fs.WalkDir(fsys, rel, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil // unreadable entries are skipped, not fatal for the archive
			}
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if d.Name() == trashDirName || m.denied(r, p) != nil {
				return fs.SkipDir
			}
			name := p
			if base != "." {
				name = strings.TrimPrefix(p, base+"/")
			}
			fi, err := d.Info()
			if err != nil {
				return nil
			}
			if d.IsDir() {
				hd, _ := zip.FileInfoHeader(fi)
				hd.Name = name + "/"
				_, err := zw.CreateHeader(hd)
				return err
			}
			if !d.Type().IsRegular() {
				return nil
			}
			hd, err := zip.FileInfoHeader(fi)
			if err != nil {
				return nil
			}
			hd.Name = name
			hd.Method = zip.Deflate
			switch KindOf(d.Name(), false) {
			case KindImage, KindVideo, KindAudio, KindArchive:
				hd.Method = zip.Store
			}
			zf, err := zw.CreateHeader(hd)
			if err != nil {
				return err
			}
			f, err := fsys.Open(p)
			if err != nil {
				return nil
			}
			defer f.Close()
			_, err = io.Copy(zf, &ctxReader{ctx, f})
			return err
		})
		if err != nil {
			return err
		}
	}
	return nil
}
