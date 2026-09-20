// Package httpx holds small HTTP helpers shared by the API handlers.
package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// Error is an error that carries the HTTP status it should be reported with.
type Error struct {
	Status  int
	Code    string
	Message string // English, already formatted
	// Format and Args let Fail render the message in the client's language.
	Format string
	Args   []any
}

func (e *Error) Error() string { return e.Message }

func Err(status int, code, format string, args ...any) *Error {
	return &Error{Status: status, Code: code, Message: fmt.Sprintf(format, args...), Format: format, Args: args}
}

func BadRequest(format string, args ...any) *Error {
	return Err(http.StatusBadRequest, "bad_request", format, args...)
}
func NotFound(format string, args ...any) *Error {
	return Err(http.StatusNotFound, "not_found", format, args...)
}
func Forbidden(format string, args ...any) *Error {
	return Err(http.StatusForbidden, "forbidden", format, args...)
}
func Conflict(format string, args ...any) *Error {
	return Err(http.StatusConflict, "conflict", format, args...)
}
func Unavailable(format string, args ...any) *Error {
	return Err(http.StatusServiceUnavailable, "unavailable", format, args...)
}

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Debug("encode response", "err", err)
	}
}

func OK(w http.ResponseWriter, v any) { JSON(w, http.StatusOK, v) }

func NoContent(w http.ResponseWriter) { w.WriteHeader(http.StatusNoContent) }

// Fail writes err as a JSON problem. Unknown errors are logged and reported as 500
// without leaking internals.
func Fail(w http.ResponseWriter, r *http.Request, err error) {
	var he *Error
	if errors.As(err, &he) {
		JSON(w, he.Status, map[string]string{"code": he.Code, "error": Localize(r, he.Format, he.Args, he.Message)})
		return
	}
	slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
	JSON(w, http.StatusInternalServerError, map[string]string{"code": "internal", "error": Localize(r, "internal error", nil, "internal error")})
}

// Decode parses a JSON body (capped at 1 MiB) and rejects unknown fields.
func Decode(r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return BadRequest("invalid JSON body: %v", err)
	}
	return nil
}

// Handler adapts an error-returning handler.
func Handler(fn func(w http.ResponseWriter, r *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			Fail(w, r, err)
		}
	}
}

// SSE is a server-sent events writer.
type SSE struct {
	w  http.ResponseWriter
	rc *http.ResponseController
}

func NewSSE(w http.ResponseWriter) (*SSE, error) {
	rc := http.NewResponseController(w)
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no")
	// Long-lived stream: lift the server write deadline for this response only.
	_ = rc.SetWriteDeadline(time.Time{})
	w.WriteHeader(http.StatusOK)
	if err := rc.Flush(); err != nil {
		return nil, err
	}
	return &SSE{w: w, rc: rc}, nil
}

func (s *SSE) Event(name string, data any) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	if name != "" {
		if _, err := fmt.Fprintf(s.w, "event: %s\n", name); err != nil {
			return err
		}
	}
	if _, err := fmt.Fprintf(s.w, "data: %s\n\n", b); err != nil {
		return err
	}
	return s.rc.Flush()
}

func (s *SSE) Comment(text string) error {
	if _, err := fmt.Fprintf(s.w, ": %s\n\n", text); err != nil {
		return err
	}
	return s.rc.Flush()
}
