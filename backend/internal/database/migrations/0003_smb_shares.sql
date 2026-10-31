-- Folders shared on the local network through Samba (see internal/shares).
CREATE TABLE smb_shares (
    name       TEXT    NOT NULL PRIMARY KEY COLLATE NOCASE,
    root       TEXT    NOT NULL,
    path       TEXT    NOT NULL,
    host_path  TEXT    NOT NULL,
    read_only  INTEGER NOT NULL DEFAULT 0, -- follows the root's read-only flag
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (root, path)
);
