// Package audit records important events (logins, container actions, deletions…).
package audit

import (
	"database/sql"
	"log/slog"
)

const keep = 1000

type Event struct {
	ID      int64  `json:"id"`
	TS      int64  `json:"ts"`
	Level   string `json:"level"`
	Source  string `json:"source"`
	Message string `json:"message"`
}

type Log struct{ db *sql.DB }

func New(db *sql.DB) *Log { return &Log{db: db} }

func (l *Log) Add(level, source, message string) {
	if _, err := l.db.Exec(`INSERT INTO events(level, source, message) VALUES (?, ?, ?)`, level, source, message); err != nil {
		slog.Warn("audit write failed", "err", err)
		return
	}
	// Cheap retention: trim opportunistically.
	l.db.Exec(`DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - ?`, keep)
}

func (l *Log) Info(source, msg string) { l.Add("info", source, msg) }
func (l *Log) Warn(source, msg string) { l.Add("warn", source, msg) }

func (l *Log) Recent(limit int) ([]Event, error) {
	rows, err := l.db.Query(`SELECT id, ts, level, source, message FROM events ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Event{}
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.TS, &e.Level, &e.Source, &e.Message); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
