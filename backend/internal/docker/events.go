package docker

import (
	"context"
	"log/slog"
	"time"

	"github.com/moby/moby/client"
)

// Watch calls onChange (debounced) whenever a container is created, started,
// stopped, removed… It reconnects with backoff until ctx is cancelled.
func (s *Service) Watch(ctx context.Context, onChange func()) {
	backoff := time.Second
	for ctx.Err() == nil {
		cli, err := s.client()
		if err == nil {
			err = s.watchOnce(ctx, cli, onChange)
		}
		if ctx.Err() != nil {
			return
		}
		slog.Debug("docker events stream ended", "err", err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (s *Service) watchOnce(ctx context.Context, cli *client.Client, onChange func()) error {
	res := cli.Events(ctx, client.EventsListOptions{Filters: make(client.Filters).Add("type", "container")})
	var timer *time.Timer
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case err := <-res.Err:
			return err
		case msg := <-res.Messages:
			switch msg.Action {
			case "exec_create", "exec_start", "exec_die", "attach", "resize", "top", "copy":
				continue
			}
			if timer == nil {
				timer = time.AfterFunc(300*time.Millisecond, onChange)
			} else {
				timer.Reset(300 * time.Millisecond)
			}
		}
	}
}
