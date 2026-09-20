package docker

import (
	"bufio"
	"context"
	"io"
	"strconv"

	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/client"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

// StreamLogs calls emit for every log line (stdout and stderr merged, with
// timestamps). With follow=false it returns after the tail was delivered.
func (s *Service) StreamLogs(ctx context.Context, id string, tail int, follow bool, emit func(line string) error) error {
	if !ValidID(id) {
		return httpx.BadRequest("invalid container id")
	}
	cli, err := s.client()
	if err != nil {
		return httpx.Unavailable("docker: %s", friendly(err))
	}
	insp, err := cli.ContainerInspect(ctx, id, client.ContainerInspectOptions{})
	if err != nil {
		return wrap(err)
	}
	tty := insp.Container.Config != nil && insp.Container.Config.Tty

	rc, err := cli.ContainerLogs(ctx, id, client.ContainerLogsOptions{
		ShowStdout: true, ShowStderr: true, Timestamps: true, Follow: follow, Tail: strconv.Itoa(tail),
	})
	if err != nil {
		return wrap(err)
	}
	defer rc.Close()

	var src io.Reader = rc
	if !tty {
		pr, pw := io.Pipe()
		go func() {
			_, err := stdcopy.StdCopy(pw, pw, rc)
			pw.CloseWithError(err)
		}()
		defer pr.Close()
		src = pr
	}

	sc := bufio.NewScanner(src)
	sc.Buffer(make([]byte, 64*1024), 1<<20)
	for sc.Scan() {
		if err := emit(sc.Text()); err != nil {
			return err
		}
	}
	if err := sc.Err(); err != nil && ctx.Err() == nil {
		return err
	}
	return nil
}
