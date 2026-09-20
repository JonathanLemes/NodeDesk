//go:build !cgo

package system

// Built without cgo: NVML (dlopen) is unavailable, NVIDIA GPUs are not reported.
func newNVML() GPUProvider { return nil }
