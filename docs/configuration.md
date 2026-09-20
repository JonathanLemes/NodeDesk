# Configuration

NodeDesk is configured with environment variables (process-level) and with the **Settings** app (stored in SQLite). See [`.env.example`](../.env.example).

| Variable | Default | Meaning |
|---|---|---|
| `NODEDESK_ADDR` | `127.0.0.1:8420` | Listen address. Use `0.0.0.0:8420` to reach it from other machines. |
| `NODEDESK_DATA_DIR` | `~/.local/share/nodedesk` | Directory for `nodedesk.db` (SQLite + WAL files). Created with mode `0700`. |
| `NODEDESK_ADMIN_PASSWORD` | – | Creates the admin account on first start (ignored once an account exists). Without it, a one-time setup code is printed in the log. |
| `NODEDESK_FILE_ROOTS` | `Home=$HOME` | Seeds authorised file folders on **first start only**, as `Name=/abs/path,Other=/abs/path`. Afterwards manage them in Settings → File Access. |
| `NODEDESK_DOCKER_HOST` | Docker default | e.g. `unix:///var/run/docker.sock` or `tcp://host:2375`. `DOCKER_HOST` is honoured too. |
| `NODEDESK_AUTH` | enabled | `disabled` turns authentication off. **Development only**: never expose such an instance. |
| `NODEDESK_SECURE_COOKIES` | auto | `true` forces the `Secure` cookie flag. It is set automatically behind HTTPS / `X-Forwarded-Proto: https`. |
| `NODEDESK_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`. |

## In-app settings

Theme, language, wallpaper, dock size and magnification, clock format, display name and the desktop watermark live in SQLite and follow you across browsers. Widget layout (position, size, per-widget settings) is stored in the `widgets` table. Authorised file folders are managed in **Settings → File Access**.

## Permissions the server user needs

| Feature | Needs |
|---|---|
| Docker | Access to the Docker socket (member of the `docker` group). |
| systemd apps | polkit permission to manage the unit over D-Bus (usually root, or a polkit rule for that unit). Reading state works without it. |
| SMART | `smartctl` plus privileges to read the device (root, or `CAP_SYS_RAWIO`/`disk` group). Optional: temperatures come from `hwmon` without root when the `drivetemp` module is loaded. |
| NVIDIA GPU | The NVIDIA driver (`libnvidia-ml.so.1`). |
| Files | Read / write on the folders you authorise. |

## Reverse proxy

Put NodeDesk behind any TLS-terminating proxy and forward `Host` and `X-Forwarded-Proto`. Streams (`/api/metrics/stream`, `/api/events`, log streams) need response buffering off (`proxy_buffering off;` in nginx); NodeDesk already sends `X-Accel-Buffering: no`.
