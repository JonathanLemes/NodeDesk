package files

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/JonathanLemes/nodedesk/backend/internal/database"
)

// newTestManager returns a manager with one authorised root ("t") and the root's path.
func newTestManager(t *testing.T, readOnly bool) (*Manager, string) {
	t.Helper()
	db, err := database.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	root := t.TempDir()
	m := NewManager(db, filepath.Join(t.TempDir(), "protected"))
	if _, err := m.AddRoot("t", root, readOnly); err != nil {
		t.Fatal(err)
	}
	return m, root
}

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestCleanRejectsReservedAndNormalises(t *testing.T) {
	cases := map[string]string{"": ".", "/": ".", "/a/../b": "b", "../../etc/passwd": "etc/passwd", "a//b/": "a/b"}
	for in, want := range cases {
		got, err := Clean(in)
		if err != nil || got != want {
			t.Errorf("Clean(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"/.nodedesk-trash", "/x/.nodedesk-trash/y", "a\x00b"} {
		if _, err := Clean(bad); err == nil {
			t.Errorf("Clean(%q) should fail", bad)
		}
	}
}

func TestSymlinkCannotEscapeRoot(t *testing.T) {
	m, root := newTestManager(t, false)
	outside := t.TempDir()
	write(t, filepath.Join(outside, "secret.txt"), "top secret")
	if err := os.Symlink(outside, filepath.Join(root, "link")); err != nil {
		t.Fatal(err)
	}
	if _, err := m.ReadText("t", "/link/secret.txt"); err == nil {
		t.Fatal("read through an escaping symlink must fail")
	}
	if _, err := m.List("t", "/link"); err == nil {
		t.Fatal("listing through an escaping symlink must fail")
	}
	if _, err := m.Upload(context.Background(), "t", "/link", "x.txt", strings.NewReader("x")); err == nil {
		t.Fatal("upload through an escaping symlink must fail")
	}
	if _, err := os.Stat(filepath.Join(outside, "x.txt")); err == nil {
		t.Fatal("file was written outside the root")
	}
	// The link itself is listed but flagged as unusable.
	l, err := m.List("t", "/")
	if err != nil {
		t.Fatal(err)
	}
	if len(l.Entries) != 1 || !l.Entries[0].Symlink || !l.Entries[0].Broken {
		t.Fatalf("expected one broken symlink entry, got %+v", l.Entries)
	}
}

func TestTraversalIsConfinedToRoot(t *testing.T) {
	m, root := newTestManager(t, false)
	write(t, filepath.Join(filepath.Dir(root), "outside.txt"), "nope")
	if _, err := m.ReadText("t", "../outside.txt"); err == nil {
		t.Fatal("../ must not reach outside the root")
	}
	if _, err := m.ReadText("t", "/../../../etc/hostname"); err == nil {
		t.Fatal("absolute traversal must not reach the host")
	}
}

func TestReadOnlyRootBlocksMutations(t *testing.T) {
	m, root := newTestManager(t, true)
	write(t, filepath.Join(root, "a.txt"), "a")
	if _, err := m.Mkdir("t", "/", "d"); err == nil {
		t.Error("mkdir on a read-only root must fail")
	}
	if err := m.Delete([]Ref{{Root: "t", Path: "/a.txt"}}, false); err == nil {
		t.Error("delete on a read-only root must fail")
	}
	if _, err := m.ReadText("t", "/a.txt"); err != nil {
		t.Errorf("reading must still work: %v", err)
	}
}

func TestProtectedDirectoryIsHidden(t *testing.T) {
	db, _ := database.Open(filepath.Join(t.TempDir(), "data"))
	defer db.Close()
	root := t.TempDir()
	data := filepath.Join(root, "nodedesk-data")
	write(t, filepath.Join(data, "nodedesk.db"), "sqlite")
	write(t, filepath.Join(root, "ok.txt"), "ok")
	m := NewManager(db, data)

	// A root that contains the data dir is allowed, but the data dir is invisible and denied.
	if _, err := m.AddRoot("all", root, false); err != nil {
		t.Fatal(err)
	}
	l, err := m.List("all", "/")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range l.Entries {
		if e.Name == "nodedesk-data" {
			t.Fatal("data dir is listed")
		}
	}
	if _, err := m.ReadText("all", "/nodedesk-data/nodedesk.db"); err == nil {
		t.Fatal("database readable through a parent root")
	}
	if _, err := m.List("all", "/nodedesk-data"); err == nil {
		t.Fatal("data dir listable through a parent root")
	}
	// A root inside the data dir is refused.
	if _, err := m.AddRoot("inside", data, false); err == nil {
		t.Fatal("a root inside the data dir must be rejected")
	}
}

func TestMoveCopyKeepBothOnConflict(t *testing.T) {
	m, root := newTestManager(t, false)
	write(t, filepath.Join(root, "a.txt"), "A")
	write(t, filepath.Join(root, "dir", "a.txt"), "existing")
	ctx := context.Background()

	out, err := m.Copy(ctx, []Ref{{Root: "t", Path: "/a.txt"}}, Ref{Root: "t", Path: "/dir"})
	if err != nil || out[0].Path != "/dir/a (2).txt" {
		t.Fatalf("copy = %v, %v; want /dir/a (2).txt", out, err)
	}
	if b, _ := os.ReadFile(filepath.Join(root, "dir", "a.txt")); string(b) != "existing" {
		t.Fatal("existing file was overwritten")
	}
	if _, err := m.Move(ctx, []Ref{{Root: "t", Path: "/a.txt"}}, Ref{Root: "t", Path: "/dir"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "a.txt")); !os.IsNotExist(err) {
		t.Fatal("move must remove the source")
	}
}

func TestCannotMoveFolderIntoItself(t *testing.T) {
	m, root := newTestManager(t, false)
	write(t, filepath.Join(root, "a", "b", "f.txt"), "x")
	if _, err := m.Move(context.Background(), []Ref{{Root: "t", Path: "/a"}}, Ref{Root: "t", Path: "/a/b"}); err == nil {
		t.Fatal("moving a folder into its own subtree must fail")
	}
}

func TestTrashAndRestore(t *testing.T) {
	m, root := newTestManager(t, false)
	write(t, filepath.Join(root, "docs", "n.txt"), "note")
	if err := m.Delete([]Ref{{Root: "t", Path: "/docs/n.txt"}}, false); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "docs", "n.txt")); !os.IsNotExist(err) {
		t.Fatal("file should have left its folder")
	}
	items, err := m.Trash()
	if err != nil || len(items) != 1 || items[0].OriginalPath != "/docs/n.txt" {
		t.Fatalf("trash = %+v, %v", items, err)
	}
	// The trash folder is never visible through the API.
	if l, _ := m.List("t", "/"); len(l.Entries) != 1 || l.Entries[0].Name != "docs" {
		t.Fatalf("trash dir leaked into listing: %+v", l.Entries)
	}
	ref, err := m.RestoreTrash("t", items[0].ID)
	if err != nil || ref.Path != "/docs/n.txt" {
		t.Fatalf("restore = %v, %v", ref, err)
	}
	if b, _ := os.ReadFile(filepath.Join(root, "docs", "n.txt")); string(b) != "note" {
		t.Fatal("content lost on restore")
	}
}

func TestWriteTextDetectsConflicts(t *testing.T) {
	m, root := newTestManager(t, false)
	write(t, filepath.Join(root, "c.yml"), "v1")
	txt, err := m.ReadText("t", "/c.yml")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.WriteText("t", "/c.yml", "v2", txt.ModTime); err != nil {
		t.Fatal(err)
	}
	if _, err := m.WriteText("t", "/c.yml", "v3", txt.ModTime-1000); err == nil {
		t.Fatal("stale modTime must be rejected")
	}
	if b, _ := os.ReadFile(filepath.Join(root, "c.yml")); string(b) != "v2" {
		t.Fatalf("content = %q", b)
	}
}

func TestUploadNeverOverwritesAndCreatesFolders(t *testing.T) {
	m, root := newTestManager(t, false)
	write(t, filepath.Join(root, "x.txt"), "old")
	e, err := m.Upload(context.Background(), "t", "/", "x.txt", strings.NewReader("new"))
	if err != nil || e.Name != "x (2).txt" {
		t.Fatalf("upload = %+v, %v", e, err)
	}
	if _, err := m.Upload(context.Background(), "t", "/", "a/b/c.txt", strings.NewReader("deep")); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Upload(context.Background(), "t", "/", "../evil.txt", strings.NewReader("x")); err == nil {
		t.Fatal("upload names with .. must be rejected")
	}
}
