//go:build cgo

package system

import (
	"log/slog"

	"github.com/NVIDIA/go-nvml/pkg/nvml"
)

// nvmlProvider talks to the NVIDIA driver through NVML. The library is loaded
// with dlopen at runtime, so hosts without an NVIDIA driver simply get nil.
type nvmlProvider struct {
	devices []nvml.Device
	names   []string
}

func newNVML() GPUProvider {
	if ret := nvml.Init(); ret != nvml.SUCCESS {
		slog.Debug("NVML unavailable", "reason", nvml.ErrorString(ret))
		return nil
	}
	count, ret := nvml.DeviceGetCount()
	if ret != nvml.SUCCESS || count == 0 {
		nvml.Shutdown()
		return nil
	}
	p := &nvmlProvider{}
	for i := 0; i < count; i++ {
		dev, ret := nvml.DeviceGetHandleByIndex(i)
		if ret != nvml.SUCCESS {
			continue
		}
		name, _ := dev.GetName()
		p.devices = append(p.devices, dev)
		p.names = append(p.names, name)
	}
	if len(p.devices) == 0 {
		nvml.Shutdown()
		return nil
	}
	return p
}

func (p *nvmlProvider) Sample() []GPU {
	out := make([]GPU, 0, len(p.devices))
	for i, dev := range p.devices {
		g := GPU{Index: i, Vendor: "nvidia", Name: p.names[i]}
		if u, ret := dev.GetUtilizationRates(); ret == nvml.SUCCESS {
			g.Util = float64(u.Gpu)
		}
		if m, ret := dev.GetMemoryInfo(); ret == nvml.SUCCESS {
			g.MemUsed, g.MemTotal = m.Used, m.Total
		}
		if t, ret := dev.GetTemperature(nvml.TEMPERATURE_GPU); ret == nvml.SUCCESS {
			v := float64(t)
			g.Temp = &v
		}
		if pw, ret := dev.GetPowerUsage(); ret == nvml.SUCCESS {
			v := float64(pw) / 1000
			g.Power = &v
		}
		out = append(out, g)
	}
	return out
}

func (p *nvmlProvider) Close() { nvml.Shutdown() }
