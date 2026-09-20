package api

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/JonathanLemes/nodedesk/backend/internal/docker"
	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

// eventHub fans out server-side change notifications ("something changed, refetch")
// to browsers. The Docker event watcher only runs while a browser is connected.
type eventHub struct {
	docker *docker.Service

	mu     sync.Mutex
	subs   map[chan string]struct{}
	cancel context.CancelFunc
}

func newEventHub(d *docker.Service) *eventHub {
	return &eventHub{docker: d, subs: map[chan string]struct{}{}}
}

func (h *eventHub) subscribe() (<-chan string, func()) {
	ch := make(chan string, 8)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	if len(h.subs) == 1 {
		ctx, cancel := context.WithCancel(context.Background())
		h.cancel = cancel
		go h.docker.Watch(ctx, func() { h.publish("docker") })
	}
	h.mu.Unlock()
	return ch, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		delete(h.subs, ch)
		if len(h.subs) == 0 && h.cancel != nil {
			h.cancel()
			h.cancel = nil
		}
	}
}

func (h *eventHub) publish(topic string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- topic:
		default:
		}
	}
}

func (h *eventHub) close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.cancel != nil {
		h.cancel()
	}
}

func (s *Server) streamEvents(w http.ResponseWriter, r *http.Request) {
	sse, err := httpx.NewSSE(w)
	if err != nil {
		httpx.Fail(w, r, err)
		return
	}
	ch, cancel := s.events.subscribe()
	defer cancel()
	ping := time.NewTicker(20 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case topic := <-ch:
			if sse.Event("change", map[string]string{"topic": topic}) != nil {
				return
			}
		case <-ping.C:
			if sse.Comment("ping") != nil {
				return
			}
		}
	}
}
