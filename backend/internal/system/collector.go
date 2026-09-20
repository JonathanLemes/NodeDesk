// Package system samples host metrics (CPU, RAM, GPU, network, disk I/O).
//
// Flow: collector -> ring buffer in RAM -> SSE. Nothing is written to SQLite.
// Sampling only runs while at least one browser is subscribed, so an idle
// NodeDesk costs no CPU.
package system

import (
	"context"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/sensors"
)

const (
	ringSize   = 300 // 5 minutes at 1 Hz
	tempPeriod = 5 * time.Second
)

// Whole physical disks only (partitions and dm/md/loop devices would double count).
var physicalDisk = regexp.MustCompile(`^(sd[a-z]+|hd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$`)

type Collector struct {
	gpus []GPUProvider

	mu     sync.Mutex
	ring   [ringSize]Sample
	head   int // next write index
	count  int
	subs   map[chan Sample]struct{}
	cancel context.CancelFunc

	// sampling state, touched only by the sampling goroutine (or under mu via SampleNow)
	prevT    time.Time
	prevNet  map[string]net.IOCountersStat
	prevDisk map[string]disk.IOCountersStat
	cpuTemp  *float64
	tempAt   time.Time
}

func NewCollector() *Collector {
	c := &Collector{subs: map[chan Sample]struct{}{}}
	if p := newNVML(); p != nil {
		c.gpus = append(c.gpus, p)
		slog.Info("GPU: NVIDIA NVML enabled")
	}
	if p := newAMD(); p != nil {
		c.gpus = append(c.gpus, p)
		slog.Info("GPU: amdgpu sysfs enabled")
	}
	if len(c.gpus) == 0 {
		slog.Info("GPU: none detected, GPU metrics disabled")
	}
	return c
}

func (c *Collector) Close() {
	c.mu.Lock()
	if c.cancel != nil {
		c.cancel()
	}
	c.mu.Unlock()
	for _, g := range c.gpus {
		g.Close()
	}
}

// Subscribe returns a channel of live samples and a function to stop.
// The first subscriber starts the sampling loop; the last one stops it.
func (c *Collector) Subscribe() (<-chan Sample, func()) {
	ch := make(chan Sample, 4)
	c.mu.Lock()
	c.subs[ch] = struct{}{}
	if len(c.subs) == 1 {
		ctx, cancel := context.WithCancel(context.Background())
		c.cancel = cancel
		go c.loop(ctx)
	}
	c.mu.Unlock()

	return ch, func() {
		c.mu.Lock()
		defer c.mu.Unlock()
		if _, ok := c.subs[ch]; !ok {
			return
		}
		delete(c.subs, ch)
		if len(c.subs) == 0 && c.cancel != nil {
			c.cancel()
			c.cancel = nil
		}
	}
}

// History returns buffered samples, oldest first.
func (c *Collector) History() []Sample {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]Sample, 0, c.count)
	start := (c.head - c.count + ringSize) % ringSize
	for i := 0; i < c.count; i++ {
		out = append(out, c.ring[(start+i)%ringSize])
	}
	return out
}

// Latest returns the newest buffered sample, if any.
func (c *Collector) Latest() (Sample, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.count == 0 {
		return Sample{}, false
	}
	return c.ring[(c.head-1+ringSize)%ringSize], true
}

func (c *Collector) loop(ctx context.Context) {
	// Prime counters so the first delta is meaningful.
	c.sample()
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s := c.sample()
			c.mu.Lock()
			c.ring[c.head] = s
			c.head = (c.head + 1) % ringSize
			if c.count < ringSize {
				c.count++
			}
			for ch := range c.subs {
				select {
				case ch <- s:
				default: // slow consumer: drop, it will catch up on the next tick
				}
			}
			c.mu.Unlock()
		}
	}
}

func (c *Collector) sample() Sample {
	now := time.Now()
	s := Sample{T: now.UnixMilli(), Cores: []float64{}, GPUs: []GPU{}}
	dt := now.Sub(c.prevT).Seconds()
	first := c.prevT.IsZero() || dt <= 0

	if v, err := cpu.Percent(0, false); err == nil && len(v) > 0 {
		s.CPU = v[0]
	}
	if v, err := cpu.Percent(0, true); err == nil {
		s.Cores = v
	}
	if a, err := load.Avg(); err == nil {
		s.Load = [3]float64{a.Load1, a.Load5, a.Load15}
	}
	if m, err := mem.VirtualMemory(); err == nil {
		s.Mem = Memory{Total: m.Total, Used: m.Total - m.Available, Percent: m.UsedPercent}
		if m.Total > 0 {
			s.Mem.Percent = float64(m.Total-m.Available) / float64(m.Total) * 100
		}
	}
	if m, err := mem.SwapMemory(); err == nil {
		s.Swap = Memory{Total: m.Total, Used: m.Used, Percent: m.UsedPercent}
	}
	for _, g := range c.gpus {
		s.GPUs = append(s.GPUs, g.Sample()...)
	}

	if now.Sub(c.tempAt) > tempPeriod {
		c.tempAt = now
		c.cpuTemp = readCPUTemp()
	}
	s.CPUTemp = c.cpuTemp

	if stats, err := net.IOCounters(true); err == nil {
		cur := map[string]net.IOCountersStat{}
		var rx, tx float64
		for _, st := range stats {
			if !physicalNIC(st.Name) {
				continue
			}
			cur[st.Name] = st
			if p, ok := c.prevNet[st.Name]; ok && !first {
				rx += float64(sub(st.BytesRecv, p.BytesRecv)) / dt
				tx += float64(sub(st.BytesSent, p.BytesSent)) / dt
			}
		}
		c.prevNet = cur
		s.Net = Throughput{Rx: rx, Tx: tx}
	}

	if stats, err := disk.IOCounters(); err == nil {
		cur := map[string]disk.IOCountersStat{}
		s.Devices = map[string]Throughput{}
		for name, st := range stats {
			if !physicalDisk.MatchString(name) {
				continue
			}
			cur[name] = st
			if p, ok := c.prevDisk[name]; ok && !first {
				t := Throughput{
					Rx: float64(sub(st.ReadBytes, p.ReadBytes)) / dt,
					Tx: float64(sub(st.WriteBytes, p.WriteBytes)) / dt,
				}
				s.Devices[name] = t
				s.Disk.Rx += t.Rx
				s.Disk.Tx += t.Tx
			}
		}
		c.prevDisk = cur
	}

	c.prevT = now
	return s
}

func sub(a, b uint64) uint64 {
	if a < b {
		return 0
	}
	return a - b
}

func physicalNIC(name string) bool {
	if name == "lo" {
		return false
	}
	for _, p := range []string{"docker", "br-", "veth", "virbr", "cni", "flannel", "cali"} {
		if strings.HasPrefix(name, p) {
			return false
		}
	}
	return true
}

func readCPUTemp() *float64 {
	temps, err := sensors.SensorsTemperatures()
	if err != nil && len(temps) == 0 {
		return nil
	}
	var best *float64
	for _, t := range temps {
		k := strings.ToLower(t.SensorKey)
		if strings.Contains(k, "k10temp") || strings.Contains(k, "coretemp") || strings.Contains(k, "cpu_thermal") || strings.Contains(k, "zenpower") {
			v := t.Temperature
			// Prefer the package/die reading over per-core ones.
			if strings.Contains(k, "tctl") || strings.Contains(k, "package") || strings.Contains(k, "tdie") || best == nil {
				best = &v
			}
		}
	}
	return best
}
