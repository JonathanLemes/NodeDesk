# Development

## Prerequisites

Go ≥ 1.26 · Node ≥ 20 · pnpm · a C compiler (for NVIDIA/NVML; without cgo the build still works and simply reports no NVIDIA GPU) · Docker (optional, for the Docker features).

## Run it

Two terminals:

```bash
make dev-backend     # API on 127.0.0.1:8420, auth disabled, data in ./data
make dev-frontend    # Vite on http://localhost:5173, proxies /api to the backend
```

Hot reload comes from Vite. Set `NODEDESK_API=http://host:port` to point the dev UI at another backend.

## Build

```bash
make build           # frontend/dist -> backend/web/dist -> bin/nodedesk
./bin/nodedesk -version
```

`make backend` alone rebuilds the binary with whatever is in `backend/web/dist`. Release builds embed the version: `make build VERSION=v0.1.0`.

## Checks

```bash
make test            # go vet + go test, then tsc --noEmit
make lint            # eslint
```

The backend tests cover the security-critical parts: the file sandbox (traversal, symlink escapes, read-only roots, trash, conflicts), authentication (sessions, lockout, password rules), app validation and widget layout persistence.

## Conventions

- **Backend:** one package per domain under `internal/`, handlers only in `internal/api`. Return `*httpx.Error` for expected failures (they become JSON with the right status); everything else is a 500 without details. No shelling out.
- **Frontend:** server state in TanStack Query (`services/queries.ts`), UI state in small Zustand stores (`stores/`), never both for the same thing. Use shadcn/ui components and semantic tokens (`bg-primary`, `text-muted-foreground`); the glass / window look comes from the utilities in `index.css`.
- **Phones:** test below 768 px (browser device mode). Use `max-md:` variants, never `window.innerWidth` checks, for layout differences; use `useIsMobile()` only for behaviour (e.g. tap opens instead of select).
- **Home-screen gestures** (`mobile/HomeScreen.tsx`): hold on an icon (450 ms) opens the action menu; moving the finger while still holding closes it and starts rearranging; holding empty space (550 ms) enters edit mode; in edit mode icons drag immediately. Pointer events are delegated on the pages container, pointer capture is taken once a drag starts (the DOM is reshuffled while reordering), and `touchmove` is cancelled with a non-passive listener during drags because iOS ignores `touch-action` changes mid-gesture.
- **Theming:** all colours are CSS variables in `frontend/src/index.css`. Light/dark is a token swap.
- Keep files small; prefer a new file over a 600-line one.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).

## Adding shadcn components

```bash
cd frontend && pnpm dlx shadcn@latest add <component>
```

Overlays (`dialog`, `menu`, `popover`, …) use `z-[10000]` so they sit above windows (z ≤ 8000). Keep that when regenerating them.
