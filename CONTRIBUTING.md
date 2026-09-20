# Contributing

Thanks for helping! NodeDesk is small on purpose. Before a big change, open an issue to talk about it.

## Ground rules

- **Design first.** UI changes should stay faithful to `examples/design.png`: few elements, calm, desktop-like. No dashboards full of cards.
- **Light and safe.** No new services, no polling loops, no shell-outs, no generic execution endpoints. See [security](docs/security.md).
- Keep changes focused and files small; match the surrounding style.

## Workflow

1. Fork and branch (`feat/…`, `fix/…`).
2. `make dev-backend` + `make dev-frontend` ([development](docs/development.md)).
3. Add tests for backend logic, especially anything touching paths, auth or commands.
4. `make test` and `make lint` must pass.
5. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat: …`, `fix: …`, `docs: …`).
6. Open a pull request describing the *why*; screenshots for UI changes (light and dark).

## Good first contributions

New widgets ([guide](docs/widgets.md)), icons for popular self-hosted apps (`components/AppIcon.tsx`), wallpapers, translations, and docs.
