package system

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// amdProvider reads amdgpu sysfs files; no library required.
type amdProvider struct {
	cards []amdCard
}

type amdCard struct {
	dir  string
	name string
}

func newAMD() GPUProvider {
	matches, _ := filepath.Glob("/sys/class/drm/card[0-9]*/device")
	p := &amdProvider{}
	for _, dir := range matches {
		if readTrim(filepath.Join(dir, "vendor")) != "0x1002" {
			continue
		}
		if _, err := os.Stat(filepath.Join(dir, "gpu_busy_percent")); err != nil {
			continue
		}
		name := readTrim(filepath.Join(dir, "product_name"))
		if name == "" {
			name = "AMD GPU"
		}
		p.cards = append(p.cards, amdCard{dir: dir, name: name})
	}
	if len(p.cards) == 0 {
		return nil
	}
	return p
}

func (p *amdProvider) Sample() []GPU {
	out := make([]GPU, 0, len(p.cards))
	for i, c := range p.cards {
		g := GPU{Index: i, Vendor: "amd", Name: c.name}
		g.Util = readFloat(filepath.Join(c.dir, "gpu_busy_percent"))
		g.MemUsed = uint64(readFloat(filepath.Join(c.dir, "mem_info_vram_used")))
		g.MemTotal = uint64(readFloat(filepath.Join(c.dir, "mem_info_vram_total")))
		if t, err := filepath.Glob(filepath.Join(c.dir, "hwmon", "hwmon*", "temp1_input")); err == nil && len(t) > 0 {
			v := readFloat(t[0]) / 1000
			g.Temp = &v
		}
		out = append(out, g)
	}
	return out
}

func (p *amdProvider) Close() {}

func readTrim(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func readFloat(path string) float64 {
	v, _ := strconv.ParseFloat(readTrim(path), 64)
	return v
}
