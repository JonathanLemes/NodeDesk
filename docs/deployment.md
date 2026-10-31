# Running NodeDesk as a service

`deploy/install.sh` installs the binary and a systemd unit so NodeDesk starts at boot and restarts on failure.

```bash
make build
sudo deploy/install.sh            # runs as the user who called sudo
```

What it does:

- copies `bin/nodedesk` to `/usr/local/bin/nodedesk`;
- creates `/etc/nodedesk/nodedesk.env` from `deploy/nodedesk.env.example` (only if missing, mode `0640`), where you set `NODEDESK_ADDR` and friends ([configuration](configuration.md));
- writes `/etc/systemd/system/nodedesk.service` (running as that user, so it gets the user's Docker group and file permissions), enables and starts it.

The data directory defaults to `~/.local/share/nodedesk` of that user. **Do not put the admin password in the env file**: it only seeds the account on the very first start. Use the one-time setup code printed in the journal instead (`journalctl -u nodedesk`).

## Everyday commands

```bash
systemctl status nodedesk
journalctl -u nodedesk -f          # logs
sudo systemctl restart nodedesk
```

## Updating

```bash
git pull && make build && sudo deploy/install.sh
```

The script keeps `/etc/nodedesk/nodedesk.env` and restarts the service. Migrations run automatically.

## Terminal and `sudo`

The unit deliberately does **not** set `NoNewPrivileges=true`: that flag is inherited by every child process and makes `sudo` (and any setuid helper) fail inside the Terminal app with "the no new privileges flag is set". The terminal is therefore as powerful as your account, `sudo` included ([security](security.md#terminal)); `NODEDESK_TERMINAL=disabled` turns it off. If you install an older copy of the unit that still has the flag, re-run `deploy/install.sh`.

## Network sharing (Samba)

Files → right-click a folder → **Share on Network…** publishes it over SMB so Windows Explorer and the macOS Finder can open it, and the dialog shows the exact addresses and steps for each system. It needs a one-time setup on the server:

```sh
sudo deploy/samba-setup.sh            # the user NodeDesk runs as; defaults to $SUDO_USER
```

The script installs Samba, `wsdd` (the server shows up under Network in Windows) and Avahi (it shows up in the Finder sidebar), opens the ports if `ufw` is active, adds `include = /etc/samba/nodedesk.conf` to the end of `smb.conf`, gives that file to the NodeDesk user and allows that user to run only `smbcontrol smbd reload-config` through `sudo`. NodeDesk never touches `smb.conf` itself: it rewrites `nodedesk.conf` from its database (also at startup) and asks smbd to reload. `NODEDESK_SAMBA_CONF` points at a different include file.

Shares work like CasaOS: anyone on the network can open them **without a password**, and every change is made as the NodeDesk user (`force user`), so permissions are the same as in the Files app. Folders in read-only roots become read-only shares; the per-folder trash and NodeDesk's database are hidden. Recent Windows 10 / 11 builds refuse guest shares by default; the dialog shows the PowerShell command that allows them.

## Boot order

The unit starts after the network and Docker. If your authorised folders live on a disk that mounts late, add a drop-in with `RequiresMountsFor=/mnt/your-disk` (`sudo systemctl edit nodedesk`): otherwise NodeDesk shows that folder as "unavailable" until the disk appears (roots are opened on demand, so it recovers by itself).
