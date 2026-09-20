package docker

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/client"
)

// Stats is the basic per-container resource usage shown in the Docker window.
type Stats struct {
	CPU      float64 `json:"cpu"`      // percent of one core, like `docker stats`
	MemUsed  uint64  `json:"memUsed"`  // bytes, excluding page cache
	MemLimit uint64  `json:"memLimit"` // bytes
}

type cpuSample struct {
	total, system uint64
}

const (
	statsTTL         = 2 * time.Second
	statsConcurrency = 6
)

// AllStats returns one-shot stats for every running container. Results are cached
// briefly so several open windows do not multiply the work. CPU% uses the previous
// call as baseline; a container seen for the first time costs one extra second.
func (s *Service) AllStats(ctx context.Context, running []Container) map[string]Stats {
	s.statsMu.Lock()
	defer s.statsMu.Unlock()
	if s.statsLast != nil && time.Since(s.statsAt) < statsTTL {
		return s.statsLast
	}
	cli, err := s.client()
	if err != nil {
		return map[string]Stats{}
	}

	var (
		wg  sync.WaitGroup
		mu  sync.Mutex
		sem = make(chan struct{}, statsConcurrency)
		out = make(map[string]Stats, len(running))
		cur = make(map[string]cpuSample, len(running))
	)
	for _, c := range running {
		if !c.Running() {
			continue
		}
		prev, hasPrev := s.statsPrev[c.ID]
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()
			res, err := cli.ContainerStats(cctx, c.ID, client.ContainerStatsOptions{IncludePreviousSample: !hasPrev})
			if err != nil {
				return
			}
			defer res.Body.Close()
			var st container.StatsResponse
			if json.NewDecoder(res.Body).Decode(&st) != nil {
				return
			}
			now := cpuSample{total: st.CPUStats.CPUUsage.TotalUsage, system: st.CPUStats.SystemUsage}
			base := prev
			if !hasPrev {
				base = cpuSample{total: st.PreCPUStats.CPUUsage.TotalUsage, system: st.PreCPUStats.SystemUsage}
			}
			cores := float64(st.CPUStats.OnlineCPUs)
			if cores == 0 {
				cores = float64(len(st.CPUStats.CPUUsage.PercpuUsage))
			}
			var pct float64
			if dSys := float64(now.system) - float64(base.system); dSys > 0 && now.total >= base.total {
				pct = (float64(now.total-base.total) / dSys) * cores * 100
			}
			mem := st.MemoryStats.Usage
			if cache := st.MemoryStats.Stats["inactive_file"]; cache > 0 && cache < mem {
				mem -= cache
			}
			mu.Lock()
			out[c.ID] = Stats{CPU: pct, MemUsed: mem, MemLimit: st.MemoryStats.Limit}
			cur[c.ID] = now
			mu.Unlock()
		}()
	}
	wg.Wait()
	s.statsPrev = cur
	s.statsLast, s.statsAt = out, time.Now()
	return out
}
