package files

import (
	"io/fs"
	"os/user"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
)

type Ref struct {
	Root string `json:"root"`
	Path string `json:"path"`
}

type Entry struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	IsDir    bool   `json:"isDir"`
	Size     int64  `json:"size"`
	ModTime  int64  `json:"modTime"` // unix ms
	Mode     string `json:"mode"`    // e.g. -rw-r--r--
	Kind     Kind   `json:"kind"`
	Mime     string `json:"mime,omitempty"`
	Hidden   bool   `json:"hidden,omitempty"`
	Symlink  bool   `json:"symlink,omitempty"`
	Broken   bool   `json:"broken,omitempty"` // symlink that cannot be followed inside the root
	Editable bool   `json:"editable,omitempty"`
}

func newEntry(dirRel, name string, fi fs.FileInfo) Entry {
	e := Entry{
		Name:    name,
		Path:    api(join(dirRel, name)),
		IsDir:   fi.IsDir(),
		Size:    fi.Size(),
		ModTime: fi.ModTime().UnixMilli(),
		Mode:    fi.Mode().String(),
		Hidden:  strings.HasPrefix(name, "."),
		Symlink: fi.Mode()&fs.ModeSymlink != 0,
	}
	e.Kind = KindOf(name, e.IsDir)
	if e.IsDir {
		e.Size = 0
	} else {
		e.Mime = mimeOf(name)
		e.Editable = e.Kind.Editable()
	}
	return e
}

func sortEntries(es []Entry) {
	sort.SliceStable(es, func(i, j int) bool {
		if es[i].IsDir != es[j].IsDir {
			return es[i].IsDir
		}
		return strings.ToLower(es[i].Name) < strings.ToLower(es[j].Name)
	})
}

var (
	idNames   sync.Map // uid/gid string -> name
	lookupOne sync.Mutex
)

func owner(fi fs.FileInfo) (string, string) {
	st, ok := fi.Sys().(*syscall.Stat_t)
	if !ok {
		return "", ""
	}
	return lookupName("u", st.Uid), lookupName("g", st.Gid)
}

func lookupName(kind string, id uint32) string {
	key := kind + strconv.FormatUint(uint64(id), 10)
	if v, ok := idNames.Load(key); ok {
		return v.(string)
	}
	lookupOne.Lock()
	defer lookupOne.Unlock()
	name := strconv.FormatUint(uint64(id), 10)
	if kind == "u" {
		if u, err := user.LookupId(name); err == nil {
			name = u.Username
		}
	} else if g, err := user.LookupGroupId(name); err == nil {
		name = g.Name
	}
	idNames.Store(key, name)
	return name
}
