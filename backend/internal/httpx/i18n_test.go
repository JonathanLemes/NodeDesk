package httpx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestErrorsFollowAcceptLanguage(t *testing.T) {
	err := Conflict("%q already exists", "a.txt")
	cases := map[string]string{
		"":                        `"a.txt" already exists`,
		"en-US,en;q=0.9":          `"a.txt" already exists`,
		"pt-BR,pt;q=0.9,en;q=0.8": `"a.txt" já existe`,
		"fr, pt;q=0.5":            `"a.txt" já existe`,
	}
	for header, want := range cases {
		r := httptest.NewRequest("GET", "/", nil)
		if header != "" {
			r.Header.Set("Accept-Language", header)
		}
		w := httptest.NewRecorder()
		Fail(w, r, err)
		var body struct{ Error string }
		json.Unmarshal(w.Body.Bytes(), &body)
		if w.Code != http.StatusConflict || body.Error != want {
			t.Errorf("Accept-Language %q: got %d %q, want %q", header, w.Code, body.Error, want)
		}
	}
}

func TestUnknownFormatsFallBackToEnglish(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("Accept-Language", "pt-BR")
	w := httptest.NewRecorder()
	Fail(w, r, BadRequest("some brand new message %d", 3))
	if !strings.Contains(w.Body.String(), "some brand new message 3") {
		t.Fatalf("no English fallback: %s", w.Body.String())
	}
}
