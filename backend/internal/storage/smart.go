package storage

import (
	"context"
	"encoding/json"
	"os/exec"
	"sync"
	"time"

	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

// SMART data needs privileges most service users do not have, so it is strictly optional:
// when smartctl is missing or not permitted the API reports "unavailable".
type SMART struct {
	Available   bool     `json:"available"`
	Reason      string   `json:"reason,omitempty"` // not_installed | unreadable
	Passed      *bool    `json:"passed,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	PowerOnH    *int64   `json:"powerOnHours,omitempty"`
	Reallocated *int64   `json:"reallocated,omitempty"`
	PercentUsed *int64   `json:"percentUsed,omitempty"` // NVMe wear
}

type smartCache struct {
	mu sync.Mutex
	m  map[string]smartEntry
}

type smartEntry struct {
	at time.Time
	v  SMART
}

const smartTTL = 10 * time.Minute

// SMART queries one disk (on demand, cached). name must be a disk from the overview.
func (s *Service) SMART(ctx context.Context, name string) (SMART, error) {
	known := false
	for _, d := range s.Overview().Disks {
		if d.Name == name {
			known = true
			break
		}
	}
	if !known {
		return SMART{}, httpx.NotFound("unknown disk")
	}
	s.smart.mu.Lock()
	defer s.smart.mu.Unlock()
	if e, ok := s.smart.m[name]; ok && time.Since(e.at) < smartTTL {
		return e.v, nil
	}
	v := runSmartctl(ctx, name)
	if s.smart.m == nil {
		s.smart.m = map[string]smartEntry{}
	}
	s.smart.m[name] = smartEntry{at: time.Now(), v: v}
	return v, nil
}

func runSmartctl(ctx context.Context, name string) SMART {
	bin, err := exec.LookPath("smartctl")
	if err != nil {
		return SMART{Reason: "not_installed"}
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	// Fixed arguments; name was validated against /sys/block above.
	out, _ := exec.CommandContext(ctx, bin, "--json=c", "-H", "-A", "/dev/"+name).Output()
	var doc struct {
		SmartStatus *struct {
			Passed bool `json:"passed"`
		} `json:"smart_status"`
		Temperature *struct {
			Current float64 `json:"current"`
		} `json:"temperature"`
		PowerOnTime *struct {
			Hours int64 `json:"hours"`
		} `json:"power_on_time"`
		ATA *struct {
			Table []struct {
				ID  int `json:"id"`
				Raw struct {
					Value int64 `json:"value"`
				} `json:"raw"`
			} `json:"table"`
		} `json:"ata_smart_attributes"`
		NVMe *struct {
			PercentageUsed int64 `json:"percentage_used"`
		} `json:"nvme_smart_health_information_log"`
	}
	if json.Unmarshal(out, &doc) != nil || doc.SmartStatus == nil {
		return SMART{Reason: "unreadable"}
	}
	r := SMART{Available: true, Passed: &doc.SmartStatus.Passed}
	if doc.Temperature != nil {
		r.Temperature = &doc.Temperature.Current
	}
	if doc.PowerOnTime != nil {
		r.PowerOnH = &doc.PowerOnTime.Hours
	}
	if doc.NVMe != nil {
		r.PercentUsed = &doc.NVMe.PercentageUsed
	}
	if doc.ATA != nil {
		for _, a := range doc.ATA.Table {
			if a.ID == 5 {
				v := a.Raw.Value
				r.Reallocated = &v
			}
		}
	}
	return r
}
