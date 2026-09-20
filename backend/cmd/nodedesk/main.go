// Command nodedesk runs the NodeDesk server: API + embedded desktop UI in one process.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/JonathanLemes/nodedesk/backend/internal/api"
	"github.com/JonathanLemes/nodedesk/backend/internal/apps"
	"github.com/JonathanLemes/nodedesk/backend/internal/audit"
	"github.com/JonathanLemes/nodedesk/backend/internal/auth"
	"github.com/JonathanLemes/nodedesk/backend/internal/config"
	"github.com/JonathanLemes/nodedesk/backend/internal/database"
	"github.com/JonathanLemes/nodedesk/backend/internal/docker"
	"github.com/JonathanLemes/nodedesk/backend/internal/files"
	"github.com/JonathanLemes/nodedesk/backend/internal/settings"
	"github.com/JonathanLemes/nodedesk/backend/internal/storage"
	"github.com/JonathanLemes/nodedesk/backend/internal/system"
	"github.com/JonathanLemes/nodedesk/backend/internal/widgets"
	"github.com/JonathanLemes/nodedesk/backend/web"
)

// version is overridden at build time: -ldflags "-X main.version=v0.1.0".
var version = "dev"

func main() {
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()
	if *showVersion {
		fmt.Println("nodedesk", version)
		return
	}
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.LogLevel})))

	db, err := database.Open(cfg.DataDir)
	if err != nil {
		return err
	}
	defer db.Close()

	settingsStore := settings.New(db)
	authSvc := auth.New(db)
	if !cfg.AuthDisabled {
		authSvc.Bootstrap(cfg.AdminPassword)
	} else {
		slog.Warn("authentication is DISABLED (NODEDESK_AUTH=disabled); do not expose this instance")
	}

	fileMgr := files.NewManager(db, cfg.DataDir)
	seed := map[string]string{}
	for _, r := range cfg.SeedRoots {
		seed[r.Name] = r.Path
	}
	for _, e := range fileMgr.Seed(seed) {
		slog.Warn("could not seed file root", "err", e)
	}

	sys := system.NewCollector()
	dockerSvc := docker.New(cfg.DockerHost)
	appSvc := apps.NewService(apps.NewStore(db), dockerSvc)

	srv := api.New(api.Deps{
		Config: cfg, Auth: authSvc, Audit: audit.New(db), Settings: settingsStore,
		System: sys, Docker: dockerSvc, Apps: appSvc, Widgets: widgets.NewStore(db, settingsStore),
		Files: fileMgr, Storage: storage.New(), Web: web.FS(), Version: version,
	})

	httpSrv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
		// No Read/WriteTimeout: uploads, downloads and SSE streams are long-lived by design.
	}
	ln, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		return err
	}
	slog.Info("NodeDesk listening", "addr", ln.Addr().String(), "version", version, "data", cfg.DataDir)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errc := make(chan error, 1)
	go func() { errc <- httpSrv.Serve(ln) }()

	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		slog.Info("shutting down")
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Close()
	err = httpSrv.Shutdown(shutdownCtx)
	sys.Close()
	dockerSvc.Close()
	appSvc.Close()
	return err
}
