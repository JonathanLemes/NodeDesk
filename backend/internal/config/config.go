// Package config loads process-level configuration from the environment.
// Anything the user changes at runtime (wallpaper, roots, layout…) lives in SQLite instead.
package config

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Config struct {
	Addr          string
	DataDir       string
	LogLevel      slog.Level
	DockerHost    string // empty = client default (/var/run/docker.sock or DOCKER_HOST)
	AdminPassword string // seeds the admin account on first run
	AuthDisabled  bool   // development only
	SecureCookies bool
	// Terminal app: a shell running as the server's user (see docs/security.md).
	TerminalEnabled   bool
	TerminalShell     string        // empty = $SHELL
	TerminalDetachTTL time.Duration // how long a shell survives without a connected browser
	SeedRoots         []Root        // used only when no root is stored yet
}

type Root struct {
	Name string
	Path string
}

func Load() (*Config, error) {
	c := &Config{
		Addr:          env("NODEDESK_ADDR", "127.0.0.1:8420"),
		DockerHost:    os.Getenv("NODEDESK_DOCKER_HOST"),
		AdminPassword: os.Getenv("NODEDESK_ADMIN_PASSWORD"),
		AuthDisabled:  os.Getenv("NODEDESK_AUTH") == "disabled",
		SecureCookies: os.Getenv("NODEDESK_SECURE_COOKIES") == "true",

		TerminalEnabled: os.Getenv("NODEDESK_TERMINAL") != "disabled",
		TerminalShell:   os.Getenv("NODEDESK_TERMINAL_SHELL"),
	}
	ttl, err := time.ParseDuration(env("NODEDESK_TERMINAL_DETACH_TTL", "5m"))
	if err != nil || ttl <= 0 {
		return nil, fmt.Errorf("NODEDESK_TERMINAL_DETACH_TTL: want a positive duration such as 5m")
	}
	c.TerminalDetachTTL = ttl

	dataDir := os.Getenv("NODEDESK_DATA_DIR")
	if dataDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("resolve home dir: %w", err)
		}
		dataDir = filepath.Join(home, ".local", "share", "nodedesk")
	}
	abs, err := filepath.Abs(dataDir)
	if err != nil {
		return nil, err
	}
	c.DataDir = abs

	if err := c.LogLevel.UnmarshalText([]byte(env("NODEDESK_LOG_LEVEL", "info"))); err != nil {
		return nil, fmt.Errorf("NODEDESK_LOG_LEVEL: %w", err)
	}

	roots, err := parseRoots(os.Getenv("NODEDESK_FILE_ROOTS"))
	if err != nil {
		return nil, err
	}
	if len(roots) == 0 {
		if home, err := os.UserHomeDir(); err == nil {
			roots = []Root{{Name: "Home", Path: home}}
		}
	}
	c.SeedRoots = roots
	return c, nil
}

// parseRoots reads "Name=/path,Other=/path2".
func parseRoots(v string) ([]Root, error) {
	var out []Root
	for _, part := range strings.Split(v, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		name, path, ok := strings.Cut(part, "=")
		if !ok || name == "" || !filepath.IsAbs(path) {
			return nil, fmt.Errorf("NODEDESK_FILE_ROOTS: invalid entry %q (want Name=/absolute/path)", part)
		}
		out = append(out, Root{Name: strings.TrimSpace(name), Path: filepath.Clean(path)})
	}
	return out, nil
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
