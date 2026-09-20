# Security

NodeDesk manages containers, files and disks, so it is built to be conservative. It is meant for a trusted home network or a tailnet, **not** the open internet, but nothing below assumes a friendly network.

## Threat model

In scope: a browser on your LAN / tailnet without credentials; a malicious web page in the admin's browser (CSRF / cross-origin); a file in a managed folder trying to attack the admin's session (XSS through previews); path tricks (`..`, symlinks); command injection.
Out of scope: a compromised admin session (it can do what the admin can do, within the limits below) and a compromised host.

## Authentication

- Single local admin. Passwords are hashed with **bcrypt** (cost 12), minimum 8 characters.
- Sessions are random 256-bit tokens; only their SHA-256 hash is stored. Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` when served over HTTPS. 14-day sliding expiry; changing the password revokes all sessions.
- Five failed sign-ins from one address lock it out for a minute.
- First run: either `NODEDESK_ADMIN_PASSWORD`, or a one-time setup code printed in the server log. Nobody who merely finds the port open can claim the admin account.
- Every state-changing request is checked for a same-origin `Origin` header (CSRF).
- Sign-ins (success and failure), container / app actions, deletions, edits and changes to apps and authorised folders are written to an audit table (Settings → Activity).

## No arbitrary execution

There is no `/exec` and no endpoint that accepts a command. Operations are typed: `POST /api/docker/containers/{id}/restart`, `POST /api/files/move`, `POST /api/apps/{id}/stop`, and so on.

- Docker uses the Engine SDK. Container names are validated against `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$`.
- systemd is driven over **D-Bus**, not `systemctl`. Unit names are validated at save time and only units belonging to a registered app can be acted on.
- The only subprocess is the optional `smartctl --json -H -A /dev/<disk>`, with fixed arguments and a device name taken from `/sys/block`, never from the request.

## File access

Only folders you authorise (Settings → File Access) are reachable. `/` is not exposed by default; the default is your home directory.

- Paths are cleaned and then resolved with Go's [`os.Root`](https://pkg.go.dev/os#Root), which refuses `..` and **symlinks that resolve outside the root at the syscall level**, so it is not a string check that a race or an odd encoding can defeat. Unit tests cover traversal and symlink escapes.
- NodeDesk’s own data directory is invisible and denied even when a parent folder is authorised (and a folder inside it cannot be added), so the database with password hashes is not reachable through Files. (A symlink you create inside an authorised folder that points at the data directory would bypass this check; do not do that.)
- Roots can be **read-only**.
- Uploads never overwrite (a free name is chosen); copy / move keep both files on conflict; text saves detect concurrent modification (HTTP 409).
- Deleting moves items to a per-folder trash (`.nodedesk-trash`, hidden and unaddressable). Permanent deletion needs an explicit confirmation.
- **Previews are untrusted content.** `/api/files/raw` serves files with `Content-Security-Policy: sandbox; default-src 'none'`, `X-Content-Type-Options: nosniff`, and HTML / XML / unknown types are downgraded to `text/plain`. A file in a managed folder cannot run script on NodeDesk's origin. (PDFs skip only the `sandbox` directive, which breaks the browser's PDF viewer, and are otherwise inert.)
- Symlinks are never followed when copying, zipping or searching.

## Disk analysis

The analysis endpoint only accepts folders on a real mounted disk (as reported by the storage overview) or inside an authorised folder; it never crosses filesystems, never follows symlinks, runs on demand only and is cancellable.

## Browser hardening

The UI is served with a strict CSP (`script-src 'self'`, no inline scripts), `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: same-origin` and `nosniff`. User-provided icon and wallpaper URLs are limited to `http(s)`; app URLs must be `http(s)` (no `javascript:`).

## Known limitations

- A process racing on the filesystem could still exploit inherent TOCTOU windows **inside** an authorised folder (`os.Root` prevents *escaping* the folder, not renaming things within it).
- There is no TLS termination in NodeDesk itself: use a reverse proxy, or keep it on a trusted network / Tailscale.
- One admin, no roles or 2FA yet.
- The Docker socket is powerful: anyone with an admin session can start / stop any container NodeDesk can see.

## Reporting

Please open a private security advisory on the GitHub repository rather than a public issue.
