// Package docker wraps the Docker Engine SDK with the small, typed surface NodeDesk needs.
// It never shells out to the docker CLI.
package docker

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	cerrdefs "github.com/containerd/errdefs"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/client"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

var idPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$`)

type Service struct {
	host string

	mu  sync.Mutex
	cli *client.Client

	statsMu   sync.Mutex
	statsPrev map[string]cpuSample
	statsAt   time.Time
	statsLast map[string]Stats
}

func New(host string) *Service {
	return &Service{host: host, statsPrev: map[string]cpuSample{}}
}

func (s *Service) client() (*client.Client, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cli != nil {
		return s.cli, nil
	}
	opts := []client.Opt{client.FromEnv, client.WithAPIVersionNegotiation()}
	if s.host != "" {
		opts = append(opts, client.WithHost(s.host))
	}
	cli, err := client.New(opts...)
	if err != nil {
		return nil, err
	}
	s.cli = cli
	return cli, nil
}

func (s *Service) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cli != nil {
		s.cli.Close()
		s.cli = nil
	}
}

// Status reports whether the Docker daemon is reachable.
type Status struct {
	Available     bool   `json:"available"`
	Version       string `json:"version,omitempty"`
	Error         string `json:"error,omitempty"`
	Running       int    `json:"running"`
	Total         int    `json:"total"`
	Images        int    `json:"images"`
	ContainerName string `json:"-"`
}

func (s *Service) Status(ctx context.Context) Status {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	cli, err := s.client()
	if err != nil {
		return Status{Error: err.Error()}
	}
	info, err := cli.Info(ctx, client.InfoOptions{})
	if err != nil {
		return Status{Error: friendly(err)}
	}
	return Status{
		Available: true,
		Version:   info.Info.ServerVersion,
		Running:   info.Info.ContainersRunning,
		Total:     info.Info.Containers,
		Images:    info.Info.Images,
	}
}

type Port struct {
	IP      string `json:"ip,omitempty"`
	Private uint16 `json:"private"`
	Public  uint16 `json:"public,omitempty"`
	Type    string `json:"type"`
}

type Mount struct {
	Type        string `json:"type"`
	Name        string `json:"name,omitempty"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	RW          bool   `json:"rw"`
}

type Container struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Image   string  `json:"image"`
	State   string  `json:"state"`
	Status  string  `json:"status"`
	Health  string  `json:"health,omitempty"`
	Created int64   `json:"created"`
	Project string  `json:"project,omitempty"` // compose project
	Ports   []Port  `json:"ports"`
	Mounts  []Mount `json:"mounts"`
	// Labels that opt a container into NodeDesk (nodedesk.name / nodedesk.icon / nodedesk.url).
	Meta map[string]string `json:"meta,omitempty"`
}

func (c Container) Running() bool { return c.State == "running" }

func (s *Service) List(ctx context.Context) ([]Container, error) {
	cli, err := s.client()
	if err != nil {
		return nil, httpx.Unavailable("docker: %s", friendly(err))
	}
	res, err := cli.ContainerList(ctx, client.ContainerListOptions{All: true})
	if err != nil {
		return nil, httpx.Unavailable("docker: %s", friendly(err))
	}
	out := make([]Container, 0, len(res.Items))
	for _, c := range res.Items {
		out = append(out, toContainer(c))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func toContainer(c container.Summary) Container {
	name := ""
	if len(c.Names) > 0 {
		name = strings.TrimPrefix(c.Names[0], "/")
	}
	out := Container{
		ID: c.ID, Name: name, Image: c.Image, State: string(c.State), Status: c.Status,
		Created: c.Created, Project: c.Labels["com.docker.compose.project"],
		Ports: []Port{}, Mounts: []Mount{},
	}
	if c.Health != nil && c.Health.Status != container.NoHealthcheck {
		out.Health = string(c.Health.Status)
	}
	seen := map[string]bool{}
	for _, p := range c.Ports {
		ip := ""
		if p.IP.IsValid() {
			ip = p.IP.String()
		}
		port := Port{IP: ip, Private: p.PrivatePort, Public: p.PublicPort, Type: p.Type}
		// Docker reports IPv4 and IPv6 bindings separately; show each mapping once.
		key := fmt.Sprintf("%d/%d/%s", port.Private, port.Public, port.Type)
		if seen[key] {
			continue
		}
		seen[key] = true
		out.Ports = append(out.Ports, port)
	}
	sort.Slice(out.Ports, func(i, j int) bool { return out.Ports[i].Private < out.Ports[j].Private })
	for _, m := range c.Mounts {
		out.Mounts = append(out.Mounts, Mount{Type: string(m.Type), Name: m.Name, Source: m.Source, Destination: m.Destination, RW: m.RW})
	}
	for k, v := range c.Labels {
		if strings.HasPrefix(k, "nodedesk.") {
			if out.Meta == nil {
				out.Meta = map[string]string{}
			}
			out.Meta[strings.TrimPrefix(k, "nodedesk.")] = v
		}
	}
	return out
}

// Action is one of the typed lifecycle operations exposed by the API.
type Action string

const (
	Start   Action = "start"
	Stop    Action = "stop"
	Restart Action = "restart"
)

func ValidID(id string) bool { return idPattern.MatchString(id) }

func (s *Service) Do(ctx context.Context, id string, a Action) error {
	if !ValidID(id) {
		return httpx.BadRequest("invalid container id")
	}
	cli, err := s.client()
	if err != nil {
		return httpx.Unavailable("docker: %s", friendly(err))
	}
	switch a {
	case Start:
		_, err = cli.ContainerStart(ctx, id, client.ContainerStartOptions{})
	case Stop:
		_, err = cli.ContainerStop(ctx, id, client.ContainerStopOptions{})
	case Restart:
		_, err = cli.ContainerRestart(ctx, id, client.ContainerRestartOptions{})
	default:
		return httpx.BadRequest("unknown action")
	}
	return wrap(err)
}

// Image is a trimmed image summary.
type Image struct {
	ID         string   `json:"id"`
	Tags       []string `json:"tags"`
	Size       int64    `json:"size"`
	Created    int64    `json:"created"`
	Containers int64    `json:"containers"`
}

func (s *Service) Images(ctx context.Context) ([]Image, error) {
	cli, err := s.client()
	if err != nil {
		return nil, httpx.Unavailable("docker: %s", friendly(err))
	}
	res, err := cli.ImageList(ctx, client.ImageListOptions{})
	if err != nil {
		return nil, wrap(err)
	}
	out := make([]Image, 0, len(res.Items))
	for _, im := range res.Items {
		id := strings.TrimPrefix(im.ID, "sha256:")
		if len(id) > 12 {
			id = id[:12]
		}
		out = append(out, Image{ID: id, Tags: nonNil(im.RepoTags), Size: im.Size, Created: im.Created, Containers: im.Containers})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Created > out[j].Created })
	return out, nil
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func wrap(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.Canceled) {
		return err
	}
	var he *httpx.Error
	if errors.As(err, &he) {
		return err
	}
	if cerrdefs.IsNotFound(err) {
		return httpx.NotFound("container not found")
	}
	return httpx.Err(502, "docker_error", "docker: %s", friendly(err))
}

func friendly(err error) string {
	msg := err.Error()
	if strings.Contains(msg, "permission denied") {
		return "permission denied on the Docker socket (add the NodeDesk user to the docker group)"
	}
	if strings.Contains(msg, "Cannot connect") || strings.Contains(msg, "no such file") || strings.Contains(msg, "connection refused") {
		return "cannot connect to the Docker daemon"
	}
	return msg
}
