#!/usr/bin/env bash
# One-time setup for "Share on Network" in the Files app.
#
# Installs Samba (SMB file sharing), wsdd (so Windows lists the server under Network)
# and Avahi (so macOS lists it in the Finder sidebar), then lets NodeDesk manage its
# own shares without running as root:
#   - smb.conf includes /etc/samba/nodedesk.conf, a file owned by the NodeDesk user;
#   - that user may run exactly "smbcontrol smbd reload-config" through sudo.
#
# usage: sudo deploy/samba-setup.sh [user]   (default: the user who invoked sudo)
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 1; }
RUN_USER="${1:-${SUDO_USER:-}}"
[ -n "$RUN_USER" ] || { echo "pass the user NodeDesk runs as: sudo deploy/samba-setup.sh <user>" >&2; exit 1; }
id "$RUN_USER" >/dev/null

SMB_CONF=/etc/samba/smb.conf
SHARES_CONF="${NODEDESK_SAMBA_CONF:-/etc/samba/nodedesk.conf}"

if ! command -v smbd >/dev/null 2>&1 && [ ! -x /usr/sbin/smbd ]; then
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y samba wsdd avahi-daemon || apt-get install -y samba avahi-daemon
  else
    echo "install Samba with your package manager, then run this script again" >&2
    exit 1
  fi
fi
[ -f "$SMB_CONF" ] || { echo "$SMB_CONF not found" >&2; exit 1; }

# Guests (no password) map to the share's forced user, like CasaOS shares.
if ! grep -Eq '^[[:space:]]*map to guest[[:space:]]*=' "$SMB_CONF"; then
  sed -i '0,/^\[global\]/s//[global]\n   map to guest = bad user/' "$SMB_CONF"
fi

# The include goes last so the sections it adds do not swallow global options.
if ! grep -Fq "include = $SHARES_CONF" "$SMB_CONF"; then
  printf '\n# Shares managed by NodeDesk (Files > Share on Network)\ninclude = %s\n' "$SHARES_CONF" >> "$SMB_CONF"
fi
[ -f "$SHARES_CONF" ] || : > "$SHARES_CONF"
chown "$RUN_USER": "$SHARES_CONF"
chmod 0644 "$SHARES_CONF"

SMBCONTROL="$(command -v smbcontrol || echo /usr/bin/smbcontrol)"
SUDOERS=/etc/sudoers.d/nodedesk-samba
printf '%s ALL=(root) NOPASSWD: %s smbd reload-config\n' "$RUN_USER" "$SMBCONTROL" > "$SUDOERS.tmp"
chmod 0440 "$SUDOERS.tmp"
visudo -cf "$SUDOERS.tmp" >/dev/null
mv "$SUDOERS.tmp" "$SUDOERS"

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow samba >/dev/null
  ufw allow 5357/tcp comment "wsdd" >/dev/null
  ufw allow 3702/udp comment "wsdd" >/dev/null
  ufw allow mdns >/dev/null 2>&1 || ufw allow 5353/udp comment "mdns" >/dev/null
fi

testparm -s "$SMB_CONF" >/dev/null 2>&1 || { echo "testparm rejected $SMB_CONF" >&2; testparm -s "$SMB_CONF" >/dev/null; exit 1; }

for unit in smbd nmbd wsdd avahi-daemon; do
  systemctl list-unit-files "$unit.service" >/dev/null 2>&1 && systemctl enable --now "$unit.service" >/dev/null 2>&1 || true
done
systemctl restart smbd.service

echo "Network sharing is ready. Share folders from the Files app (right-click a folder > Share on Network)."
