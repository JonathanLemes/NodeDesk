package shares

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/JonathanLemes/nodedesk/backend/internal/database"
)

type fakeResolver struct{ base string }

func (f fakeResolver) HostDir(root, p string) (string, bool, error) {
	return filepath.Join(f.base, filepath.FromSlash(p)), root == "ro", nil
}
func (f fakeResolver) ContainsProtected(dir string) bool { return dir == f.base }

func TestAddRemoveWritesConfig(t *testing.T) {
	tmp := t.TempDir()
	db, err := database.Open(filepath.Join(tmp, "data"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	conf := filepath.Join(tmp, "nodedesk.conf")
	os.WriteFile(conf, nil, 0o644)
	os.MkdirAll(filepath.Join(tmp, "Media"), 0o755)
	s := New(db, conf, fakeResolver{tmp})

	if _, err := s.Add("Media", "home", "/Media"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Add("media", "home", "/"); err == nil {
		t.Fatal("duplicate name (case-insensitive) accepted")
	}
	if _, err := s.Add("Other", "home", "/Media"); err == nil {
		t.Fatal("same folder shared twice")
	}
	if _, err := s.Add("Home", "home", "/"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Add("Backup", "ro", "/"+"Media"); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(conf)
	got := string(b)
	for _, want := range []string{"[Media]\n   path = " + filepath.Join(tmp, "Media"), "guest ok = yes", "[Backup]\n   path = " + filepath.Join(tmp, "Media") + "\n   browseable = yes\n   read only = yes", "veto files = /.nodedesk-trash/nodedesk*.db*/"} {
		if !strings.Contains(got, want) {
			t.Fatalf("config missing %q:\n%s", want, got)
		}
	}
	if err := s.Remove("MEDIA"); err != nil {
		t.Fatal(err)
	}
	b, _ = os.ReadFile(conf)
	if strings.Contains(string(b), "[Media]") {
		t.Fatalf("removed share still in config:\n%s", b)
	}
}

func TestValidation(t *testing.T) {
	for _, bad := range []string{"", "global", "IPC$", "a]b", "x\ny", "a/b", "a;b", strings.Repeat("a", 81), " lead"} {
		if validName(bad) == nil {
			t.Errorf("name %q accepted", bad)
		}
	}
	for _, ok := range []string{"Media", "Fotos 2026", "Música", "my-share_1.0"} {
		if err := validName(ok); err != nil {
			t.Errorf("name %q rejected: %v", ok, err)
		}
	}
	for _, bad := range []string{"/home/a%Ub", "/home/x\n[evil]", "/home/a ", "/home/ a/b"} {
		if validHostPath(bad) == nil {
			t.Errorf("path %q accepted", bad)
		}
	}
}
