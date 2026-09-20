package apps

import (
	"context"
	"fmt"
	"strings"

	"github.com/JonathanLemes/nodedesk/backend/internal/docker"
	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

// Service combines the app store with live status from Docker and systemd.
type Service struct {
	Store   *Store
	docker  *docker.Service
	systemd systemd
}

func NewService(store *Store, d *docker.Service) *Service {
	return &Service{Store: store, docker: d}
}

func (s *Service) Close() { s.systemd.close() }

// View is an App plus its live state.
type View struct {
	App
	// Status is running, stopped, partial (some parts running), failed or unknown.
	Status  string `json:"status"`
	Running int    `json:"running"`
	Total   int    `json:"total"`
}

func (s *Service) List(ctx context.Context) ([]View, error) {
	apps, err := s.Store.List()
	if err != nil {
		return nil, err
	}
	containers := s.containerIndex(ctx, apps)
	units := s.unitStates(ctx, apps)

	out := make([]View, 0, len(apps))
	for _, a := range apps {
		out = append(out, resolve(a, containers, units))
	}
	return out, nil
}

func (s *Service) containerIndex(ctx context.Context, apps []App) map[string]string {
	need := false
	for _, a := range apps {
		if len(a.Containers) > 0 {
			need = true
			break
		}
	}
	idx := map[string]string{}
	if !need {
		return idx
	}
	list, err := s.docker.List(ctx)
	if err != nil {
		return idx
	}
	for _, c := range list {
		idx[c.Name] = c.State
	}
	return idx
}

func (s *Service) unitStates(ctx context.Context, apps []App) map[string]string {
	var all []string
	for _, a := range apps {
		all = append(all, a.SystemdUnits...)
	}
	return s.systemd.states(ctx, all)
}

func resolve(a App, containers, units map[string]string) View {
	v := View{App: a}
	running := 0
	failed := false
	for _, c := range a.Containers {
		v.Total++
		if containers[c] == "running" {
			running++
		}
	}
	for _, u := range a.SystemdUnits {
		v.Total++
		switch units[u] {
		case "running":
			running++
		case "failed":
			failed = true
		}
	}
	v.Running = running
	switch {
	case v.Total == 0:
		v.Status = "unknown"
	case running == v.Total:
		v.Status = "running"
	case running > 0:
		v.Status = "partial"
	case failed:
		v.Status = "failed"
	default:
		v.Status = "stopped"
	}
	return v
}

// Do applies a lifecycle action to every container and unit of the app.
func (s *Service) Do(ctx context.Context, id string, action docker.Action) error {
	a, err := s.Store.Get(id)
	if err != nil {
		return err
	}
	if len(a.Containers) == 0 && len(a.SystemdUnits) == 0 {
		return httpx.BadRequest("this app has nothing to %s", action)
	}
	var errs []string
	for _, c := range a.Containers {
		if err := s.docker.Do(ctx, c, action); err != nil {
			errs = append(errs, err.Error())
		}
	}
	for _, u := range a.SystemdUnits {
		if err := s.systemd.do(ctx, u, string(action)); err != nil {
			errs = append(errs, err.Error())
		}
	}
	if len(errs) > 0 {
		return httpx.Err(502, "action_failed", "%s", strings.Join(errs, "; "))
	}
	return nil
}

// Candidate is a running/stopped container that is not part of any app yet.
type Candidate struct {
	Name     string `json:"name"`
	Image    string `json:"image"`
	State    string `json:"state"`
	URL      string `json:"url"`
	Icon     string `json:"icon,omitempty"`
	Category string `json:"category,omitempty"`
	Project  string `json:"project,omitempty"`
}

// Discover lists Docker containers not attached to any app. Labels
// nodedesk.name/icon/url/category on a container are honoured.
func (s *Service) Discover(ctx context.Context) ([]Candidate, error) {
	apps, err := s.Store.List()
	if err != nil {
		return nil, err
	}
	taken := map[string]bool{}
	for _, a := range apps {
		for _, c := range a.Containers {
			taken[c] = true
		}
	}
	list, err := s.docker.List(ctx)
	if err != nil {
		return nil, err
	}
	out := []Candidate{}
	for _, c := range list {
		if taken[c.Name] {
			continue
		}
		cand := Candidate{Name: c.Name, Image: c.Image, State: c.State, Project: c.Project,
			Icon: c.Meta["icon"], Category: c.Meta["category"], URL: c.Meta["url"]}
		if cand.URL == "" {
			cand.URL = guessURL(c)
		}
		out = append(out, cand)
	}
	return out, nil
}

func guessURL(c docker.Container) string {
	for _, p := range c.Ports {
		if p.Public != 0 && p.Type == "tcp" {
			scheme := "http"
			if p.Private == 443 || p.Private == 8443 || p.Public == 443 {
				scheme = "https"
			}
			return fmt.Sprintf("%s://{host}:%d", scheme, p.Public)
		}
	}
	return ""
}
