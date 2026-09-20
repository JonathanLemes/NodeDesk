-- Apps can be pinned to the desktop as icons; -1 means "no position chosen yet".
ALTER TABLE apps ADD COLUMN on_desktop INTEGER NOT NULL DEFAULT 0;
ALTER TABLE apps ADD COLUMN desktop_x  INTEGER NOT NULL DEFAULT -1;
ALTER TABLE apps ADD COLUMN desktop_y  INTEGER NOT NULL DEFAULT -1;
