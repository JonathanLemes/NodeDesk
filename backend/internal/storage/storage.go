// Package storage reports disks, partitions and mounts, and runs on-demand,
// cached directory-size analysis. Nothing here scans continuously.
package storage

import (
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/disk"
)

type Partition struct {
	Name       string  `json:"name"` // sda1
	Size       uint64  `json:"size"`
	FSType     string  `json:"fsType,omitempty"`
	Label      string  `json:"label,omitempty"`
	Mountpoint string  `json:"mountpoint,omitempty"`
	Used       uint64  `json:"used"`
	Free       uint64  `json:"free"`
	Percent    float64 `json:"percent"`
	Mounted    bool    `json:"mounted"`
	ReadOnly   bool    `json:"readOnly,omitempty"`
}

type Disk struct {
	Name       string      `json:"name"` // sda
	Model      string      `json:"model,omitempty"`
	Size       uint64      `json:"size"`
	Kind       string      `json:"kind"` // nvme | ssd | hdd | usb | virtual
	Removable  bool        `json:"removable,omitempty"`
	Temp       *float64    `json:"temp,omitempty"`
	Partitions []Partition `json:"partitions"`
}

// Mount is a flattened, widget-friendly view of a mounted filesystem.
type Mount struct {
	Name       string   `json:"name"` // label, or mountpoint
	Mountpoint string   `json:"mountpoint"`
	Device     string   `json:"device"`
	Disk       string   `json:"disk,omitempty"`
	FSType     string   `json:"fsType"`
	Total      uint64   `json:"total"`
	Used       uint64   `json:"used"`
	Free       uint64   `json:"free"`
	Percent    float64  `json:"percent"`
	Kind       string   `json:"kind,omitempty"`
	Temp       *float64 `json:"temp,omitempty"`
	ReadOnly   bool     `json:"readOnly,omitempty"`
}

type Overview struct {
	Disks  []Disk  `json:"disks"`
	Mounts []Mount `json:"mounts"`
}

type Service struct {
	mu     sync.Mutex
	cached *Overview
	at     time.Time

	Analyzer *Analyzer
	smart    smartCache
}

func New() *Service {
	s := &Service{}
	s.Analyzer = newAnalyzer(s.IsMountpoint)
	return s
}

const overviewTTL = 5 * time.Second

// Overview returns disks and mounts; results are cached for a few seconds
// (statfs on a sleeping/remote mount can be slow).
func (s *Service) Overview() Overview {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cached != nil && time.Since(s.at) < overviewTTL {
		return *s.cached
	}
	o := s.build()
	s.cached, s.at = &o, time.Now()
	return o
}

func (s *Service) IsMountpoint(p string) bool {
	for _, m := range s.Overview().Mounts {
		if m.Mountpoint == p {
			return true
		}
	}
	return false
}

func (s *Service) build() Overview {
	temps := diskTemps()
	disks := map[string]*Disk{}
	var order []string
	for _, name := range listBlock() {
		d := readDisk(name)
		if d == nil {
			continue
		}
		d.Temp = temps[name]
		d.Partitions = []Partition{}
		disks[name] = d
		order = append(order, name)
	}

	parts, _ := disk.Partitions(false)
	type mnt struct {
		p    disk.PartitionStat
		dev  string // resolved kernel name (sda1, dm-0…)
		used *disk.UsageStat
	}
	best := map[string]mnt{} // device -> shortest mountpoint (dedupes bind mounts)
	for _, p := range parts {
		if skipMount(p) {
			continue
		}
		dev := kernelName(p.Device)
		if cur, ok := best[p.Device]; ok && len(cur.p.Mountpoint) <= len(p.Mountpoint) {
			continue
		}
		best[p.Device] = mnt{p: p, dev: dev}
	}

	out := Overview{Mounts: []Mount{}}
	mounted := map[string]bool{} // kernel partition names that are mounted
	for _, m := range best {
		u, err := disk.Usage(m.p.Mountpoint)
		if err != nil || u.Total == 0 {
			continue
		}
		parent := parentDisk(m.dev)
		label := udevProps(m.dev)["ID_FS_LABEL"]
		name := label
		if name == "" {
			name = friendlyMount(m.p.Mountpoint)
		}
		mount := Mount{
			Name: name, Mountpoint: m.p.Mountpoint, Device: m.p.Device, Disk: parent,
			FSType: m.p.Fstype, Total: u.Total, Used: u.Used, Free: u.Free,
			Percent: percent(u.Used, u.Total), ReadOnly: contains(m.p.Opts, "ro"),
		}
		if d := disks[parent]; d != nil {
			mount.Kind, mount.Temp = d.Kind, d.Temp
		}
		out.Mounts = append(out.Mounts, mount)
		mounted[m.dev] = true

		if d := disks[parent]; d != nil {
			d.Partitions = append(d.Partitions, Partition{
				Name: m.dev, Size: u.Total, FSType: m.p.Fstype, Label: label, Mountpoint: m.p.Mountpoint,
				Used: u.Used, Free: u.Free, Percent: mount.Percent, Mounted: true, ReadOnly: mount.ReadOnly,
			})
		}
	}
	sort.Slice(out.Mounts, func(i, j int) bool { return out.Mounts[i].Mountpoint < out.Mounts[j].Mountpoint })

	// Unmounted partitions (size + filesystem from sysfs/udev, no root needed).
	for _, name := range order {
		d := disks[name]
		for _, pn := range listPartitions(name) {
			if mounted[pn] {
				continue
			}
			props := udevProps(pn)
			size := readUint(filepath.Join("/sys/class/block", pn, "size")) * 512
			d.Partitions = append(d.Partitions, Partition{Name: pn, Size: size, FSType: props["ID_FS_TYPE"], Label: props["ID_FS_LABEL"]})
		}
		sort.Slice(d.Partitions, func(i, j int) bool { return d.Partitions[i].Name < d.Partitions[j].Name })
		out.Disks = append(out.Disks, *d)
	}
	if out.Disks == nil {
		out.Disks = []Disk{}
	}
	return out
}

var pseudoFS = map[string]bool{
	"tmpfs": true, "devtmpfs": true, "squashfs": true, "overlay": true, "proc": true, "sysfs": true,
	"cgroup": true, "cgroup2": true, "devpts": true, "efivarfs": true, "fuse.gvfsd-fuse": true,
	"fuse.portal": true, "ramfs": true, "autofs": true, "binfmt_misc": true, "fusectl": true,
}

func skipMount(p disk.PartitionStat) bool {
	if pseudoFS[p.Fstype] {
		return true
	}
	mp := p.Mountpoint
	for _, prefix := range []string{"/var/lib/docker/", "/run/", "/snap/", "/sys/", "/proc/", "/dev/", "/boot/efi"} {
		if strings.HasPrefix(mp, prefix) {
			return true
		}
	}
	return !strings.HasPrefix(p.Device, "/dev/")
}

func friendlyMount(mp string) string {
	if mp == "/" {
		return "System"
	}
	return filepath.Base(mp)
}

func percent(used, total uint64) float64 {
	if total == 0 {
		return 0
	}
	return float64(used) / float64(total) * 100
}

func contains(l []string, v string) bool {
	for _, s := range l {
		if s == v {
			return true
		}
	}
	return false
}

func readUint(path string) uint64 {
	b, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	v, _ := strconv.ParseUint(strings.TrimSpace(string(b)), 10, 64)
	return v
}
