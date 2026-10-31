// Package shares publishes folders on the local network through Samba (SMB), so they
// can be opened from Windows Explorer and the macOS Finder.
//
// NodeDesk does not run as root, so it never edits smb.conf itself. A one-time setup
// (deploy/samba-setup.sh) installs Samba, makes smb.conf include a single file owned by
// the NodeDesk user, and allows that user to ask smbd to reload its configuration.
// NodeDesk regenerates that file from the smb_shares table on every change.
//
// Shares are open to guests (no password), like CasaOS does, and every file operation
// runs as the NodeDesk user (force user), so permissions match what the Files app sees.
package shares

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/exec"
	"os/user"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/JonathanLemes/nodedesk/backend/internal/files"
	"github.com/JonathanLemes/nodedesk/backend/internal/httpx"
)

// DefaultConfPath is the file smb.conf includes; deploy/samba-setup.sh creates it.
const DefaultConfPath = "/etc/samba/nodedesk.conf"

type Share struct {
	Name      string `json:"name"`
	Root      string `json:"root"`
	Path      string `json:"path"`
	CreatedAt int64  `json:"createdAt"`
}

type Address struct {
	IP        string `json:"ip"`
	Interface string `json:"interface"`
	Tailscale bool   `json:"tailscale"`
}

type Status struct {
	// Available is true when shares can be created (Samba installed and the include file writable).
	Available bool `json:"available"`
	// Reason explains why it is not available: "not_installed" or "not_configured".
	Reason string `json:"reason,omitempty"`
	// Running is true when something answers on the SMB port.
	Running   bool      `json:"running"`
	Hostname  string    `json:"hostname"`
	Addresses []Address `json:"addresses"`
	Shares    []Share   `json:"shares"`
}

// Resolver turns a (root, path) pair from the Files app into a real host directory.
type Resolver interface {
	HostDir(rootID, p string) (dir string, readOnly bool, err error)
	ContainsProtected(dir string) bool
}

type Service struct {
	db       *sql.DB
	conf     string
	user     string
	resolver Resolver
	mu       sync.Mutex
}

func New(db *sql.DB, confPath string, r Resolver) *Service {
	if confPath == "" {
		confPath = DefaultConfPath
	}
	name := ""
	if u, err := user.Current(); err == nil {
		name = u.Username
	}
	return &Service{db: db, conf: confPath, user: name, resolver: r}
}

func (s *Service) Status() (Status, error) {
	st := Status{Addresses: addresses()}
	st.Hostname, _ = os.Hostname()
	switch {
	case findBinary("smbd") == "":
		st.Reason = "not_installed"
	case !writable(s.conf):
		st.Reason = "not_configured"
	default:
		st.Available = true
	}
	st.Running = listening("127.0.0.1:445")
	list, err := s.List()
	st.Shares = list
	return st, err
}

func (s *Service) List() ([]Share, error) {
	rows, err := s.db.Query(`SELECT name, root, path, created_at FROM smb_shares ORDER BY name COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Share{}
	for rows.Next() {
		var sh Share
		if err := rows.Scan(&sh.Name, &sh.Root, &sh.Path, &sh.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, sh)
	}
	return out, rows.Err()
}

// Share names Windows and macOS accept, and that cannot break out of a config section.
var namePattern = regexp.MustCompile(`^[\p{L}\p{N}][\p{L}\p{N} ._'()&-]{0,79}$`)

var reservedNames = map[string]bool{"global": true, "homes": true, "printers": true, "print$": true, "ipc$": true}

func validName(name string) error {
	if !namePattern.MatchString(name) || strings.HasSuffix(name, " ") || reservedNames[strings.ToLower(name)] {
		return httpx.BadRequest("invalid share name %q (letters, numbers, spaces and . _ - only)", name)
	}
	return nil
}

// Samba expands %-variables in "path" and cannot represent newlines or edge spaces.
func validHostPath(p string) error {
	if strings.ContainsAny(p, "%\n\r\x00\\") || strings.TrimSpace(p) != p || strings.Contains(p, "/ ") || strings.Contains(p, " /") {
		return httpx.BadRequest("this folder's path has characters Samba cannot share (%%, backslash or leading/trailing spaces)")
	}
	return nil
}

func (s *Service) Add(name, root, p string) (Share, error) {
	name = strings.TrimSpace(name)
	if err := validName(name); err != nil {
		return Share{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !writable(s.conf) {
		return Share{}, httpx.Unavailable("network sharing is not set up on this server")
	}
	host, readOnly, err := s.resolver.HostDir(root, p)
	if err != nil {
		return Share{}, err
	}
	if err := validHostPath(host); err != nil {
		return Share{}, err
	}
	rel, err := files.Clean(p)
	if err != nil {
		return Share{}, err
	}
	apiPath := "/"
	if rel != "." {
		apiPath += rel
	}
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM smb_shares WHERE name = ?`, name).Scan(&n)
	if n > 0 {
		return Share{}, httpx.Conflict("a share named %q already exists", name)
	}
	s.db.QueryRow(`SELECT COUNT(*) FROM smb_shares WHERE root = ? AND path = ?`, root, apiPath).Scan(&n)
	if n > 0 {
		return Share{}, httpx.Conflict("this folder is already shared")
	}
	sh := Share{Name: name, Root: root, Path: apiPath, CreatedAt: time.Now().Unix()}
	ro := 0
	if readOnly {
		ro = 1
	}
	if _, err := s.db.Exec(`INSERT INTO smb_shares(name, root, path, host_path, read_only, created_at) VALUES (?,?,?,?,?,?)`,
		sh.Name, sh.Root, sh.Path, host, ro, sh.CreatedAt); err != nil {
		return Share{}, err
	}
	if err := s.apply(); err != nil {
		s.db.Exec(`DELETE FROM smb_shares WHERE name = ?`, name)
		return Share{}, err
	}
	return sh, nil
}

func (s *Service) Remove(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	res, err := s.db.Exec(`DELETE FROM smb_shares WHERE name = ?`, name)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.NotFound("unknown share")
	}
	return s.apply()
}

// Sync rewrites the Samba file from the database (at startup, in case it was lost or edited).
func (s *Service) Sync() {
	if !writable(s.conf) {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.apply(); err != nil {
		slog.Warn("could not sync Samba shares", "err", err)
	}
}

func (s *Service) apply() error {
	rows, err := s.db.Query(`SELECT name, host_path, read_only FROM smb_shares ORDER BY name COLLATE NOCASE`)
	if err != nil {
		return err
	}
	type entry struct {
		name, host string
		readOnly   bool
	}
	var list []entry
	for rows.Next() {
		var e entry
		if err := rows.Scan(&e.name, &e.host, &e.readOnly); err != nil {
			rows.Close()
			return err
		}
		list = append(list, e)
	}
	rows.Close()

	var b bytes.Buffer
	b.WriteString("# Managed by NodeDesk (Files > Share on Network). Changes here are overwritten.\n")
	for _, e := range list {
		veto := "/.nodedesk-trash/"
		if s.resolver.ContainsProtected(e.host) {
			veto += "nodedesk*.db*/"
		}
		fmt.Fprintf(&b, "\n[%s]\n", e.name)
		fmt.Fprintf(&b, "   path = %s\n", e.host)
		fmt.Fprintf(&b, "   browseable = yes\n   read only = %s\n   guest ok = yes\n", yesNo(e.readOnly))
		if s.user != "" {
			fmt.Fprintf(&b, "   force user = %s\n", s.user)
		}
		b.WriteString("   create mask = 0664\n   directory mask = 0775\n")
		fmt.Fprintf(&b, "   veto files = %s\n", veto)
		b.WriteString("   delete veto files = no\n")
	}
	if err := os.WriteFile(s.conf, b.Bytes(), 0o644); err != nil {
		return httpx.Unavailable("could not write the Samba configuration: %v", err)
	}
	reload()
	return nil
}

// reload asks smbd to re-read its configuration. setup grants exactly this command via
// sudo; if it is not allowed, smbd still picks the file up for new connections.
func reload() {
	bin := findBinary("smbcontrol")
	if bin == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if out, err := exec.CommandContext(ctx, "sudo", "-n", bin, "smbd", "reload-config").CombinedOutput(); err != nil {
		slog.Debug("smbd reload via sudo failed", "err", err, "out", strings.TrimSpace(string(out)))
	}
}

func yesNo(b bool) string {
	if b {
		return "yes"
	}
	return "no"
}

func findBinary(name string) string {
	if p, err := exec.LookPath(name); err == nil {
		return p
	}
	for _, dir := range []string{"/usr/sbin", "/usr/bin", "/sbin", "/usr/local/sbin"} {
		p := dir + "/" + name
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

func writable(path string) bool {
	f, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return false
	}
	f.Close()
	return true
}

func listening(addr string) bool {
	c, err := net.DialTimeout("tcp", addr, 300*time.Millisecond)
	if err != nil {
		return false
	}
	c.Close()
	return true
}

var tailnet = mustCIDR("100.64.0.0/10")

func mustCIDR(s string) *net.IPNet {
	_, n, err := net.ParseCIDR(s)
	if err != nil {
		panic(err)
	}
	return n
}

// addresses lists the IPv4 addresses other machines can use, skipping container bridges.
func addresses() []Address {
	out := []Address{}
	ifaces, err := net.Interfaces()
	if err != nil {
		return out
	}
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 || virtual(ifc.Name) {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipn.IP.To4()
			if ip == nil || ip.IsLinkLocalUnicast() {
				continue
			}
			out = append(out, Address{IP: ip.String(), Interface: ifc.Name, Tailscale: tailnet.Contains(ip) || strings.HasPrefix(ifc.Name, "tailscale")})
		}
	}
	// LAN addresses first: those are what Explorer and Finder find on the local network.
	sortAddrs(out)
	return out
}

func sortAddrs(a []Address) {
	for i := 1; i < len(a); i++ {
		for j := i; j > 0 && !a[j].Tailscale && a[j-1].Tailscale; j-- {
			a[j], a[j-1] = a[j-1], a[j]
		}
	}
}

func virtual(name string) bool {
	for _, p := range []string{"docker", "br-", "veth", "virbr", "lxc", "lxd", "cni", "flannel", "vnet", "podman", "zt"} {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}
