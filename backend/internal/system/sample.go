package system

// Sample is one point-in-time reading of the host. It is deliberately compact:
// it is pushed to every connected browser once per second.
type Sample struct {
	T       int64      `json:"t"` // unix milliseconds
	CPU     float64    `json:"cpu"`
	Cores   []float64  `json:"cores"`
	CPUTemp *float64   `json:"cpuTemp,omitempty"`
	Load    [3]float64 `json:"load"`
	Mem     Memory     `json:"mem"`
	Swap    Memory     `json:"swap"`
	GPUs    []GPU      `json:"gpus"`
	Net     Throughput `json:"net"`
	Disk    Throughput `json:"disk"`
	// Devices maps block device name -> throughput, for the Storage app.
	Devices map[string]Throughput `json:"devices,omitempty"`
}

type Memory struct {
	Total   uint64  `json:"total"`
	Used    uint64  `json:"used"`
	Percent float64 `json:"percent"`
}

// Throughput is expressed in bytes per second. For Net, Rx/Tx are download/upload;
// for Disk they are read/write.
type Throughput struct {
	Rx float64 `json:"rx"`
	Tx float64 `json:"tx"`
}

type GPU struct {
	Index    int      `json:"index"`
	Vendor   string   `json:"vendor"`
	Name     string   `json:"name"`
	Util     float64  `json:"util"`
	MemUsed  uint64   `json:"memUsed"`
	MemTotal uint64   `json:"memTotal"`
	Temp     *float64 `json:"temp,omitempty"`
	Power    *float64 `json:"power,omitempty"` // watts
}

// GPUProvider reads GPU stats for one vendor. Implementations must be safe to
// call from a single goroutine and must return quickly.
type GPUProvider interface {
	Sample() []GPU
	Close()
}
