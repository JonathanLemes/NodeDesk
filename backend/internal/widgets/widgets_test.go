package widgets

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/JonathanLemes/nodedesk/backend/internal/database"
	"github.com/JonathanLemes/nodedesk/backend/internal/settings"
)

func TestLayoutRoundTripAndValidation(t *testing.T) {
	db, err := database.Open(filepath.Join(t.TempDir(), "d"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := NewStore(db, settings.New(db))

	l, _ := s.Get()
	if l.Initialized || len(l.Widgets) != 0 {
		t.Fatalf("fresh layout = %+v", l)
	}
	in := []Widget{{InstanceID: "system-1", WidgetID: "system", X: 32, Y: 60, W: 348, H: 200, Settings: json.RawMessage(`{"a":1}`)}}
	if err := s.Replace(in); err != nil {
		t.Fatal(err)
	}
	l, _ = s.Get()
	if !l.Initialized || len(l.Widgets) != 1 || string(l.Widgets[0].Settings) != `{"a":1}` {
		t.Fatalf("layout = %+v", l)
	}

	for name, w := range map[string]Widget{
		"bad id":   {InstanceID: "../x", WidgetID: "system", W: 100, H: 100},
		"tiny":     {InstanceID: "a", WidgetID: "b", W: 5, H: 5},
		"huge":     {InstanceID: "a", WidgetID: "b", W: 100000, H: 100},
		"bad json": {InstanceID: "a", WidgetID: "b", W: 100, H: 100, Settings: json.RawMessage(`{`)},
	} {
		if err := s.Replace([]Widget{w}); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
	// A rejected save must not have wiped the stored layout.
	if l, _ := s.Get(); len(l.Widgets) != 1 {
		t.Fatal("failed replace altered the layout")
	}
}
