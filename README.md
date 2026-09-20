<div align="center">

# NodeDesk

**A desktop for your home server.** Your server, arranged like a Mac: wallpaper, widgets, a dock and windows, not another admin dashboard.

`One Go binary` · `SQLite` · `React` · `MIT`

</div>

<p align="center"><img src="examples/design.png" alt="NodeDesk design reference" width="820"></p>

## What you get

| | |
|---|---|
| **Phone layout** | Below 768 px wide the desktop turns into an iOS-style home screen: compact widgets, a swipeable 4-column app grid and a dock. Apps open as full-screen pages (the back gesture closes them), press and hold an icon for its menu (Edit Home Screen included) and keep dragging to rearrange it, or hold empty space, iOS-style; rearranged layouts are saved. Add it to your home screen for a full-screen PWA. |
| **Desktop shell** | Wallpaper, menu bar, dock with magnification, draggable / resizable windows, light and dark mode, English and Portuguese, `Ctrl/⌘ K` launcher. |
| **Widgets** | *System* (CPU / RAM / GPU), *Storage* (mounts and usage), *Services* (your apps and their state). Arrange them freely; the layout is saved. Adding your own is a matter of dropping a folder in ([guide](docs/widgets.md)). |
| **Apps** | A first-class notion of “app”: a Docker container, a systemd service, an external URL or a manual entry, shown as an application. Discover running containers with one click, pin any app to the dock or as a draggable desktop icon that opens it in a new tab. |
| **Files** | A Finder-style explorer: grid / list, preview pane, context menus, drag & drop, upload (files and folders), download (zip for folders), rename, copy, move, trash, search, properties, and a built-in editor (CodeMirror 6) with Markdown, JSON / YAML, code, image, audio, video and PDF preview. Only folders you authorise are reachable. |
| **Docker** | Containers (state, ports, mounts, CPU / RAM, live logs, start / stop / restart) and images, through the Docker Engine SDK. No CLI, no shell. |
| **Storage** | Disks, partitions, mounts, filesystems, temperatures, live I/O, optional SMART, and an on-demand, cached “what is using my space” analysis. |
| **Terminal** | A macOS-Terminal-style shell in the browser: tabs (a new tab opens in the current folder), ANSI colours (red errors, yellow warnings…), light / dark profiles, and "Open in Terminal" in the Files context menu. On a phone it has a key bar (Esc, Tab, Ctrl, arrows, `|`, `~`…) above the native keyboard. Closing a tab or the window ends its shell. Can be turned off ([security](docs/security.md#terminal)). |
| **Keyboard shortcuts** | Every shortcut lives in one service and can be rebound in Settings → Shortcuts (desktop web), with conflict detection. Saved with your account. ([guide](docs/shortcuts.md)) |
| **Monitor** | A task-manager style view of CPU, memory, GPU (NVIDIA via NVML, AMD via sysfs), VRAM, network and disk I/O. |

## Quick start

Requirements: Go ≥ 1.26, Node ≥ 20, [pnpm](https://pnpm.io), a C compiler (only for NVIDIA GPU support; see below).

```bash
make build                      # frontend + backend -> ./bin/nodedesk (single binary)

NODEDESK_ADDR=0.0.0.0:8420 \
NODEDESK_ADMIN_PASSWORD='choose-a-password' \
./bin/nodedesk
```

Open <http://localhost:8420>. Without `NODEDESK_ADMIN_PASSWORD`, the first start prints a one-time **setup code** in the log; the login screen asks for it together with the password you want.

The binary contains the whole UI (`go:embed`). At runtime it needs nothing but itself and one SQLite file (`~/.local/share/nodedesk/nodedesk.db` by default).

## Documentation

- [Architecture](docs/architecture.md): how the pieces fit, and why.
- [Deployment](docs/deployment.md): run it as a systemd service.
- [Configuration](docs/configuration.md): environment variables and in-app settings.
- [Security](docs/security.md): threat model, sandboxing of files, what is deliberately *not* there.
- [Development](docs/development.md): dev setup, project layout, tests.
- [Languages](docs/i18n.md): English and Portuguese, and how to add more.
- [Keyboard shortcuts](docs/shortcuts.md): the shortcut service, and how to add one.
- [Widgets](docs/widgets.md): build your own widget.
- [Integrations](docs/integrations.md): add a desktop app or a new kind of service.
- [Contributing](CONTRIBUTING.md)

## Design principles

1. **Design is a feature.** It should feel like a desktop, so few elements, lots of whitespace, discreet motion.
2. **Light.** One Go process, one SQLite file. Sampling stops when nobody is watching; nothing is scanned in the background.
3. **Typed, never generic.** No endpoint takes a command, with one deliberate exception: the Terminal, which is a shell by definition and can be switched off (`NODEDESK_TERMINAL=disabled`). Everything else is a narrow, validated endpoint.
4. **Extensible without a plugin system.** Widgets and desktop apps are self-contained folders discovered at build time.

## Stack

Go (`chi`, `modernc.org/sqlite`, `gopsutil`, Docker Engine SDK, `go-nvml`, `go-systemd`) · React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui (Radix), TanStack Query, Zustand, CodeMirror 6.

## License

[MIT](LICENSE)
