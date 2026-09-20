package apps

import "testing"

func TestNormalizeValidation(t *testing.T) {
	ok := App{Name: "Jellyfin", Type: "docker", Containers: []string{"jellyfin"}, URL: "http://{host}:8096", Icon: "lucide:tv"}
	if err := ok.normalize(); err != nil {
		t.Fatalf("valid app rejected: %v", err)
	}
	bad := map[string]App{
		"no name":         {Type: "url", URL: "http://x"},
		"bad type":        {Name: "x", Type: "shell"},
		"js url":          {Name: "x", Type: "url", URL: "javascript:alert(1)"},
		"docker w/o ctr":  {Name: "x", Type: "docker"},
		"flag-like ctr":   {Name: "x", Type: "docker", Containers: []string{"--privileged"}},
		"bad unit":        {Name: "x", Type: "systemd", SystemdUnits: []string{"ssh; reboot"}},
		"unit w/o suffix": {Name: "x", Type: "systemd", SystemdUnits: []string{"ssh"}},
		"file icon":       {Name: "x", Type: "url", URL: "http://x", Icon: "file:///etc/passwd"},
		"url app w/o url": {Name: "x", Type: "url"},
		"too many ctrs":   {Name: "x", Type: "docker", Containers: make([]string, 30)},
	}
	for name, a := range bad {
		if err := a.normalize(); err == nil {
			t.Errorf("%s: expected validation error", name)
		}
	}
}

func TestResolveStatus(t *testing.T) {
	app := App{Containers: []string{"a", "b"}, SystemdUnits: []string{"x.service"}}
	cases := []struct {
		containers, units map[string]string
		want              string
	}{
		{map[string]string{"a": "running", "b": "running"}, map[string]string{"x.service": "running"}, "running"},
		{map[string]string{"a": "running", "b": "exited"}, map[string]string{"x.service": "running"}, "partial"},
		{map[string]string{"a": "exited", "b": "exited"}, map[string]string{"x.service": "failed"}, "failed"},
		{map[string]string{}, map[string]string{}, "stopped"},
	}
	for i, c := range cases {
		if got := resolve(app, c.containers, c.units).Status; got != c.want {
			t.Errorf("case %d: got %s, want %s", i, got, c.want)
		}
	}
	if got := resolve(App{}, nil, nil).Status; got != "unknown" {
		t.Errorf("empty app status = %s", got)
	}
}
