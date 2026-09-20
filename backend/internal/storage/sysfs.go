package storage

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var diskName = regexp.MustCompile(`^(sd[a-z]+|hd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$`)

func listBlock() []string {
	entries, err := os.ReadDir("/sys/block")
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		if diskName.MatchString(e.Name()) {
			out = append(out, e.Name())
		}
	}
	return out
}

func readDisk(name string) *Disk {
	base := filepath.Join("/sys/block", name)
	size := readUint(filepath.Join(base, "size")) * 512
	if size == 0 {
		return nil // empty card reader slot etc.
	}
	d := &Disk{Name: name, Size: size}
	d.Model = strings.TrimSpace(readStr(filepath.Join(base, "device", "model")))
	d.Removable = readStr(filepath.Join(base, "removable")) == "1"
	switch {
	case strings.HasPrefix(name, "nvme"):
		d.Kind = "nvme"
	case strings.HasPrefix(name, "vd") || strings.HasPrefix(name, "xvd"):
		d.Kind = "virtual"
	case d.Removable && isUSB(base):
		d.Kind = "usb"
	case readStr(filepath.Join(base, "queue", "rotational")) == "0":
		d.Kind = "ssd"
	default:
		d.Kind = "hdd"
	}
	return d
}

func isUSB(base string) bool {
	real, err := filepath.EvalSymlinks(base)
	return err == nil && strings.Contains(real, "/usb")
}

func listPartitions(disk string) []string {
	entries, err := os.ReadDir(filepath.Join("/sys/block", disk))
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), disk) {
			if _, err := os.Stat(filepath.Join("/sys/block", disk, e.Name(), "partition")); err == nil {
				out = append(out, e.Name())
			}
		}
	}
	return out
}

// kernelName resolves /dev/disk/by-uuid/… or /dev/mapper/… to the kernel name (sda1, dm-0).
func kernelName(dev string) string {
	if real, err := filepath.EvalSymlinks(dev); err == nil {
		return filepath.Base(real)
	}
	return filepath.Base(dev)
}

// parentDisk finds the physical disk behind a partition or device-mapper volume.
func parentDisk(name string) string {
	for depth := 0; depth < 4; depth++ {
		if diskName.MatchString(name) {
			return name
		}
		if _, err := os.Stat(filepath.Join("/sys/class/block", name, "partition")); err == nil {
			if real, err := filepath.EvalSymlinks(filepath.Join("/sys/class/block", name)); err == nil {
				name = filepath.Base(filepath.Dir(real))
				continue
			}
		}
		slaves, err := os.ReadDir(filepath.Join("/sys/block", name, "slaves"))
		if err != nil || len(slaves) == 0 {
			return ""
		}
		name = slaves[0].Name()
	}
	return ""
}

// udevProps reads the udev database entry for a block device (world-readable, no root).
func udevProps(name string) map[string]string {
	out := map[string]string{}
	dev := readStr(filepath.Join("/sys/class/block", name, "dev"))
	if dev == "" {
		return out
	}
	f, err := os.Open("/run/udev/data/b" + dev)
	if err != nil {
		return out
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		if rest, ok := strings.CutPrefix(sc.Text(), "E:"); ok {
			if k, v, ok := strings.Cut(rest, "="); ok {
				out[k] = v
			}
		}
	}
	return out
}

// diskTemps maps disk name -> temperature (°C) using hwmon (drivetemp and nvme drivers).
func diskTemps() map[string]*float64 {
	out := map[string]*float64{}
	hw, _ := filepath.Glob("/sys/class/hwmon/hwmon*")
	for _, h := range hw {
		name := readStr(filepath.Join(h, "name"))
		if name != "drivetemp" && name != "nvme" {
			continue
		}
		raw := readStr(filepath.Join(h, "temp1_input"))
		v, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			continue
		}
		t := v / 1000
		dev, err := filepath.EvalSymlinks(filepath.Join(h, "device"))
		if err != nil {
			continue
		}
		if name == "drivetemp" {
			blocks, _ := os.ReadDir(filepath.Join(dev, "block"))
			for _, b := range blocks {
				out[b.Name()] = &t
			}
		} else { // nvme controller nvme0 -> namespaces nvme0n1…
			ctrl := filepath.Base(dev)
			for _, d := range listBlock() {
				if strings.HasPrefix(d, ctrl+"n") {
					out[d] = &t
				}
			}
		}
	}
	return out
}

func readStr(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}
