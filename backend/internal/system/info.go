package system

import (
	"net"
	"os"
	"runtime"
	"strings"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
)

type Info struct {
	Hostname string   `json:"hostname"`
	OS       string   `json:"os"`
	Kernel   string   `json:"kernel"`
	Arch     string   `json:"arch"`
	Uptime   uint64   `json:"uptime"`
	CPUModel string   `json:"cpuModel"`
	Cores    int      `json:"cores"`
	MemTotal uint64   `json:"memTotal"`
	IPs      []string `json:"ips"`
	GPUs     []string `json:"gpus"`
}

func (c *Collector) Info() Info {
	i := Info{Arch: runtime.GOARCH, Cores: runtime.NumCPU(), IPs: []string{}, GPUs: []string{}}
	i.Hostname, _ = os.Hostname()
	if h, err := host.Info(); err == nil {
		i.OS = strings.TrimSpace(h.Platform + " " + h.PlatformVersion)
		i.Kernel = h.KernelVersion
		i.Uptime = h.Uptime
	}
	if cs, err := cpu.Info(); err == nil && len(cs) > 0 {
		i.CPUModel = cs[0].ModelName
	}
	if m, err := mem.VirtualMemory(); err == nil {
		i.MemTotal = m.Total
	}
	i.IPs = localIPs()
	for _, g := range c.gpus {
		for _, s := range g.Sample() {
			i.GPUs = append(i.GPUs, s.Name)
		}
	}
	return i
}

// localIPs lists private-range IPv4 addresses (LAN/tailnet), skipping container bridges.
func localIPs() []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return []string{}
	}
	out := []string{}
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 || !physicalNIC(ifc.Name) {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			if ipn, ok := a.(*net.IPNet); ok && ipn.IP.To4() != nil {
				out = append(out, ipn.IP.String())
			}
		}
	}
	return out
}
