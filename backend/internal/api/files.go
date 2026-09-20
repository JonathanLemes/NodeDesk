package api

import (
	"mime"
	"net/http"
	"path"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/JonathanLemes/nodedesk/backend/internal/files"
	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

func (s *Server) fileRoutes(r chi.Router) {
	r.Get("/roots", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		roots, err := s.Files.Roots()
		if err != nil {
			return err
		}
		writeJSON(w, roots)
		return nil
	}))
	r.Post("/roots", httpx.Handler(s.addRoot))
	r.Patch("/roots/{id}", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			Name     string `json:"name"`
			ReadOnly bool   `json:"readOnly"`
		}
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
		if err := s.Files.UpdateRoot(chi.URLParam(r, "id"), in.Name, in.ReadOnly); err != nil {
			return err
		}
		httpx.NoContent(w)
		return nil
	}))
	r.Delete("/roots/{id}", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		if err := s.Files.RemoveRoot(chi.URLParam(r, "id")); err != nil {
			return err
		}
		s.Audit.Info("files", "removed root "+chi.URLParam(r, "id"))
		httpx.NoContent(w)
		return nil
	}))

	r.Get("/list", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		l, err := s.Files.List(q(r, "root"), q(r, "path"))
		if err != nil {
			return err
		}
		writeJSON(w, l)
		return nil
	}))
	r.Get("/stat", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		e, err := s.Files.Stat(q(r, "root"), q(r, "path"))
		if err != nil {
			return err
		}
		writeJSON(w, e)
		return nil
	}))
	r.Get("/info", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		i, err := s.Files.Info(r.Context(), q(r, "root"), q(r, "path"), q(r, "size") == "1")
		if err != nil {
			return err
		}
		writeJSON(w, i)
		return nil
	}))
	r.Get("/search", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		res, err := s.Files.Search(r.Context(), q(r, "root"), q(r, "path"), q(r, "q"))
		if err != nil {
			return err
		}
		writeJSON(w, res)
		return nil
	}))

	r.Post("/mkdir", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		in, err := decodeNamed(r)
		if err != nil {
			return err
		}
		e, err := s.Files.Mkdir(in.Root, in.Path, in.Name)
		if err != nil {
			return err
		}
		writeJSON(w, e, http.StatusCreated)
		return nil
	}))
	r.Post("/create", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		in, err := decodeNamed(r)
		if err != nil {
			return err
		}
		e, err := s.Files.CreateFile(in.Root, in.Path, in.Name)
		if err != nil {
			return err
		}
		writeJSON(w, e, http.StatusCreated)
		return nil
	}))
	r.Post("/rename", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		in, err := decodeNamed(r)
		if err != nil {
			return err
		}
		e, err := s.Files.Rename(in.Root, in.Path, in.Name)
		if err != nil {
			return err
		}
		s.Audit.Info("files", "renamed "+in.Path+" to "+in.Name)
		writeJSON(w, e)
		return nil
	}))
	r.Post("/move", httpx.Handler(s.transfer(true)))
	r.Post("/copy", httpx.Handler(s.transfer(false)))
	r.Post("/delete", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			Items     []files.Ref `json:"items"`
			Permanent bool        `json:"permanent"`
		}
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
		if err := s.Files.Delete(in.Items, in.Permanent); err != nil {
			return err
		}
		verb := "trashed"
		if in.Permanent {
			verb = "permanently deleted"
		}
		s.Audit.Info("files", verb+" "+itoa(len(in.Items))+" item(s), first: "+in.Items[0].Path)
		httpx.NoContent(w)
		return nil
	}))

	r.Post("/upload", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		e, err := s.Files.Upload(r.Context(), q(r, "root"), q(r, "path"), q(r, "name"), r.Body)
		if err != nil {
			return err
		}
		writeJSON(w, e, http.StatusCreated)
		return nil
	}))
	r.Get("/download", httpx.Handler(s.download))
	r.Get("/raw", httpx.Handler(s.raw))
	r.Get("/text", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		t, err := s.Files.ReadText(q(r, "root"), q(r, "path"))
		if err != nil {
			return err
		}
		writeJSON(w, t)
		return nil
	}))
	r.Put("/text", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		r.Body = http.MaxBytesReader(w, r.Body, files.MaxEditableBytes+4096)
		var in struct {
			Root    string `json:"root"`
			Path    string `json:"path"`
			Content string `json:"content"`
			ModTime int64  `json:"modTime"`
		}
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
		t, err := s.Files.WriteText(in.Root, in.Path, in.Content, in.ModTime)
		if err != nil {
			return err
		}
		s.Audit.Info("files", "edited "+in.Path)
		writeJSON(w, t)
		return nil
	}))

	r.Get("/trash", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		items, err := s.Files.Trash()
		if err != nil {
			return err
		}
		writeJSON(w, items)
		return nil
	}))
	r.Post("/trash/restore", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var in struct{ Root, ID string }
		if err := decodeLoose(r, &in); err != nil {
			return err
		}
		ref, err := s.Files.RestoreTrash(in.Root, in.ID)
		if err != nil {
			return err
		}
		writeJSON(w, ref)
		return nil
	}))
	r.Post("/trash/purge", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		var in struct{ Root, ID string }
		if err := decodeLoose(r, &in); err != nil {
			return err
		}
		if in.Root == "" { // empty every root
			roots, err := s.Files.Roots()
			if err != nil {
				return err
			}
			for _, root := range roots {
				if !root.ReadOnly && root.Available {
					if err := s.Files.PurgeTrash(root.ID, ""); err != nil {
						return err
					}
				}
			}
		} else if err := s.Files.PurgeTrash(in.Root, in.ID); err != nil {
			return err
		}
		s.Audit.Info("files", "emptied trash")
		httpx.NoContent(w)
		return nil
	}))
}

func q(r *http.Request, key string) string { return r.URL.Query().Get(key) }

type namedReq struct {
	Root string `json:"root"`
	Path string `json:"path"`
	Name string `json:"name"`
}

func decodeNamed(r *http.Request) (namedReq, error) {
	var in namedReq
	return in, httpx.Decode(r, &in)
}

// decodeLoose decodes JSON with case-insensitive field names (used for tiny bodies).
func decodeLoose(r *http.Request, dst any) error { return httpx.Decode(r, dst) }

func (s *Server) addRoot(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Name     string `json:"name"`
		Path     string `json:"path"`
		ReadOnly bool   `json:"readOnly"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	root, err := s.Files.AddRoot(in.Name, in.Path, in.ReadOnly)
	if err != nil {
		return err
	}
	s.Audit.Info("files", "authorised root "+root.Path)
	writeJSON(w, root, http.StatusCreated)
	return nil
}

func (s *Server) transfer(move bool) func(http.ResponseWriter, *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		var in struct {
			Items []files.Ref `json:"items"`
			To    files.Ref   `json:"to"`
		}
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
		var (
			out []files.Ref
			err error
		)
		if move {
			out, err = s.Files.Move(r.Context(), in.Items, in.To)
		} else {
			out, err = s.Files.Copy(r.Context(), in.Items, in.To)
		}
		if err != nil {
			return err
		}
		verb := "copied"
		if move {
			verb = "moved"
		}
		s.Audit.Info("files", verb+" "+itoa(len(in.Items))+" item(s) to "+in.To.Path)
		writeJSON(w, map[string]any{"items": out})
		return nil
	}
}

func attachment(name string) string {
	return mime.FormatMediaType("attachment", map[string]string{"filename": name})
}

// download serves one file as an attachment, or a zip for folders / multiple items.
func (s *Server) download(w http.ResponseWriter, r *http.Request) error {
	root, paths := q(r, "root"), r.URL.Query()["path"]
	if len(paths) == 0 {
		return httpx.BadRequest("path is required")
	}
	if len(paths) == 1 {
		e, err := s.Files.Stat(root, paths[0])
		if err != nil {
			return err
		}
		if !e.IsDir {
			f, fi, err := s.Files.Open(root, paths[0])
			if err != nil {
				return err
			}
			defer f.Close()
			w.Header().Set("Content-Disposition", attachment(e.Name))
			w.Header().Set("Content-Type", "application/octet-stream")
			http.ServeContent(w, r, e.Name, fi.ModTime(), f)
			return nil
		}
	}
	name := "download"
	if len(paths) == 1 {
		name = path.Base(paths[0])
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", attachment(name+".zip"))
	// Headers are already sent once streaming starts; errors past that point just truncate.
	return s.Files.WriteZip(r.Context(), w, root, paths)
}

// raw serves a file inline for previews. Content is untrusted, so it is served with
// a restrictive CSP (sandbox) and HTML is downgraded to plain text: a file in the
// managed tree must never be able to run script on NodeDesk's origin.
func (s *Server) raw(w http.ResponseWriter, r *http.Request) error {
	f, fi, err := s.Files.Open(q(r, "root"), q(r, "path"))
	if err != nil {
		return err
	}
	defer f.Close()
	name := fi.Name()
	ct := mime.TypeByExtension(strings.ToLower(path.Ext(name)))
	switch files.KindOf(name, false) {
	case files.KindPDF:
		ct = "application/pdf"
	case files.KindImage, files.KindVideo, files.KindAudio:
		if ct == "" {
			ct = "application/octet-stream"
		}
	default:
		ct = "text/plain; charset=utf-8"
	}
	h := w.Header()
	h.Set("Content-Type", ct)
	h.Set("X-Content-Type-Options", "nosniff")
	if ct != "application/pdf" { // the sandbox directive breaks Chromium's PDF viewer
		h.Set("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'")
	}
	h.Set("Cache-Control", "private, max-age=60")
	http.ServeContent(w, r, name, fi.ModTime(), f)
	return nil
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var b []byte
	for ; i > 0; i /= 10 {
		b = append([]byte{byte('0' + i%10)}, b...)
	}
	return string(b)
}
