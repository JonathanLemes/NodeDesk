# Architecture

```
┌────────────────────────── browser ───────────────────────────┐
│ React desktop: windows · dock · widgets · apps               │
│  TanStack Query (REST)   ·   SSE (metrics 1 Hz, change events)│
└───────────────▲──────────────────────────────▲───────────────┘
                │ /api/*                       │ text/event-stream
┌───────────────┴──────────────────────────────┴───────────────┐
│ nodedesk (single Go process, go:embed serves the UI)          │
│  api ── chi routes, auth, CSRF, security headers              │
│  ├ system   collector ─► ring buffer (RAM) ─► SSE             │
│  ├ docker   Engine SDK, events, one-shot stats                │
│  ├ files    os.Root sandbox, trash, search, zip               │
│  ├ storage  disks / mounts / SMART / on-demand analysis       │
│  ├ apps     App abstraction (docker · systemd · url · manual) │
│  ├ widgets  layout persistence                                │
│  └ database SQLite (WAL) + versioned migrations               │
└──────────────────────────────────────────────────────────────┘
```

## Repository layout

```
backend/
  cmd/nodedesk/        main: wiring, graceful shutdown
  internal/
    api/               HTTP layer, one file per domain
    apps/              App store + live status (Docker, systemd via D-Bus)
    audit/             important events (sign-ins, actions) in SQLite
    auth/              single-admin local auth, sessions, rate limit
    config/            environment configuration
    database/          SQLite open + embedded migrations
    docker/            Docker Engine SDK wrapper
    files/             sandboxed file manager
    httpx/             JSON / error / SSE helpers
    settings/          key-value settings
    storage/           disks, SMART, usage analysis
    system/            metrics collector, GPU providers
    terminal/          PTY shells for the Terminal app (sessions, scrollback, reaping)
    widgets/           widget layout store
  web/                 go:embed of the compiled frontend
frontend/src/
  apps/                desktop applications (Files, Docker, ...), auto-registered
  components/          shared UI (+ ui/ = shadcn)
  desktop/             shell: menu bar, dock, wallpaper, widget layer, login
  hooks/ stores/ services/ types/   (services/shortcuts = keyboard shortcut service)
  widgets/             widgets, auto-registered
  windows/             window frame, manager, launch helpers
docs/  examples/
```

## Desktop and phone shells

`App.tsx` picks a shell from the viewport (`useIsMobile`, < 768 px): `desktop/Desktop` (menu bar, dock, windows, widgets) or `mobile/MobileShell` (home screen + full-screen pages). Both drive the same window store and the same apps: on a phone a "window" is rendered by `MobileFrame` (back button, toolbar in the header) instead of `WindowFrame`. Apps adapt with Tailwind `max-md:` variants (sidebars become drawers or tab strips, detail panes become full-screen overlays), and widgets switch to a compact layout below `COMPACT_WIDTH`. **iOS home-screen app.** The status bar style is `black` (dark theme) or `default` (light), set at launch by `public/theme-init.js`, *not* `black-translucent`: on iOS 26 a translucent bar makes WebKit report a viewport shorter by the top inset (WebKit bug 301108), leaving a band at the bottom that no CSS can paint. The cost is a solid status bar instead of the wallpaper showing through it. While the on-screen keyboard is open, `mobile/useMobileViewport` shrinks the page to the visible area but keeps an opaque full-screen backdrop behind it. The phone home always shows the built-in System / Storage / Services widgets in the reference layout; per-widget arrangement is a desktop feature.

## Decisions worth knowing

**One process, one file.** `go:embed` ships the UI; SQLite is pure Go (`modernc.org/sqlite`), so the build has no runtime dependency. The only cgo piece is NVIDIA support (`go-nvml`, which `dlopen`s the driver at runtime). Building with `CGO_ENABLED=0` drops NVIDIA GPU metrics and nothing else.

**Metrics never touch SQLite.** The collector samples once per second **only while at least one browser is subscribed**, writes into a 5-minute ring buffer in RAM, and fans samples out over SSE. A closed or hidden tab disconnects, so an idle server does no sampling. Historical aggregation can be added later without changing the live path.

**SSE over WebSocket, except the Terminal.** Metrics and change notifications are one-way. SSE is simpler, works through proxies, and reconnects by itself. The terminal is genuinely bidirectional, so it alone uses a WebSocket. The change stream (`/api/events`) only says “Docker changed”; the client refetches through the normal queries.

**No polling storms.** Docker state comes from the Docker events stream (only watched while a browser is connected). Container stats are polled every 5 s only while the Docker window is open and visible. Disk analysis is explicit, cached for 30 minutes and never continuous.

**Files are sandboxed by the kernel, not by string checks.** Every operation goes through Go's `os.Root`, which rejects `..` and symlinks that leave the root at syscall level. See [security](security.md).

**Apps are their own abstraction.** An `App` (`id, name, icon, type, url, containers, systemdUnits, favorite, category`) is independent of Docker. Status is resolved from whatever backs it. `{host}` in an app URL is replaced client-side by the hostname you used to reach NodeDesk, so the same link works on the LAN and over Tailscale.

**Extensibility without a plugin runtime.** Widgets (`src/widgets/*/widget.tsx`) and desktop apps (`src/apps/*/app.tsx`) are discovered with `import.meta.glob`. The backend only stores layout as opaque JSON, so a new widget needs no backend change.

**Terminal sessions outlive the socket, not the tab.** `POST /api/terminal/sessions` starts a shell on a PTY; the browser attaches over a WebSocket (binary frames = raw terminal bytes, text frames = JSON `resize` / `exit`). The server keeps the last 256 KB of output, so a page that reconnects after a phone lock gets its screen back; closing a tab (`DELETE`) kills the shell and a session with nobody attached is reaped after a grace period. The client is xterm.js. See [security](security.md#terminal).

**Persistence.** SQLite holds settings, apps, widget layout, authorised file roots, sessions and an audit trail. Migrations are numbered SQL files in `internal/database/migrations`, applied in a transaction at start-up.

## Data flow examples

*Opening the desktop:* `GET /api/auth/status` → `GET /api/settings`, `/api/widgets`, `/api/apps` → open `/api/metrics/stream` and `/api/events`.

*Restarting a container from a widget/dock/app:* `POST /api/apps/{id}/restart` → Docker SDK → Docker emits an event → SSE `change` → the client invalidates its queries.
