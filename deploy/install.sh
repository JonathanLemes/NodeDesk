#!/usr/bin/env bash
# Installs NodeDesk as a systemd service that starts at boot.
# usage: sudo deploy/install.sh [user]   (default: the user who invoked sudo)
set -euo pipefail

cd "$(dirname "$0")/.."
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 1; }
[ -x bin/nodedesk ] || { echo "bin/nodedesk not found: run 'make build' first" >&2; exit 1; }

RUN_USER="${1:-${SUDO_USER:-}}"
[ -n "$RUN_USER" ] || { echo "pass the user to run as: sudo deploy/install.sh <user>" >&2; exit 1; }
id "$RUN_USER" >/dev/null

install -m 0755 bin/nodedesk /usr/local/bin/nodedesk
install -d -m 0755 /etc/nodedesk
[ -f /etc/nodedesk/nodedesk.env ] || install -m 0640 -o root -g "$RUN_USER" deploy/nodedesk.env.example /etc/nodedesk/nodedesk.env
sed "s/@USER@/$RUN_USER/" deploy/nodedesk.service > /etc/systemd/system/nodedesk.service

systemctl daemon-reload
systemctl enable nodedesk.service
systemctl restart nodedesk.service
sleep 1
systemctl --no-pager --lines=5 status nodedesk.service || true
