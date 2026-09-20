package files

import (
	"mime"
	"path/filepath"
	"strings"
)

// Kind is a coarse category the UI uses for icons and preview selection.
type Kind string

const (
	KindFolder   Kind = "folder"
	KindImage    Kind = "image"
	KindVideo    Kind = "video"
	KindAudio    Kind = "audio"
	KindPDF      Kind = "pdf"
	KindMarkdown Kind = "markdown"
	KindJSON     Kind = "json"
	KindYAML     Kind = "yaml"
	KindLog      Kind = "log"
	KindCode     Kind = "code"
	KindText     Kind = "text"
	KindArchive  Kind = "archive"
	KindOther    Kind = "other"
)

var extKinds = map[string]Kind{
	"png": KindImage, "jpg": KindImage, "jpeg": KindImage, "gif": KindImage, "webp": KindImage,
	"svg": KindImage, "bmp": KindImage, "ico": KindImage, "avif": KindImage,
	"mp4": KindVideo, "webm": KindVideo, "mkv": KindVideo, "mov": KindVideo, "m4v": KindVideo, "ogv": KindVideo,
	"mp3": KindAudio, "flac": KindAudio, "wav": KindAudio, "ogg": KindAudio, "m4a": KindAudio, "opus": KindAudio, "aac": KindAudio,
	"pdf": KindPDF,
	"md":  KindMarkdown, "markdown": KindMarkdown,
	"json": KindJSON, "jsonc": KindJSON,
	"yml": KindYAML, "yaml": KindYAML,
	"log": KindLog,
	"txt": KindText, "conf": KindText, "cfg": KindText, "ini": KindText, "env": KindText, "csv": KindText, "toml": KindText, "properties": KindText,
	"sh": KindCode, "bash": KindCode, "zsh": KindCode, "py": KindCode, "js": KindCode, "ts": KindCode, "tsx": KindCode, "jsx": KindCode,
	"go": KindCode, "rs": KindCode, "c": KindCode, "h": KindCode, "cpp": KindCode, "java": KindCode, "rb": KindCode, "php": KindCode,
	"html": KindCode, "css": KindCode, "xml": KindCode, "sql": KindCode, "lua": KindCode, "service": KindCode, "timer": KindCode,
	"dockerfile": KindCode, "makefile": KindCode, "nginx": KindCode,
	"zip": KindArchive, "tar": KindArchive, "gz": KindArchive, "tgz": KindArchive, "xz": KindArchive, "7z": KindArchive,
	"rar": KindArchive, "bz2": KindArchive, "zst": KindArchive, "iso": KindArchive,
}

// wellKnown text files without a useful extension.
var nameKinds = map[string]Kind{
	"dockerfile": KindCode, "makefile": KindCode, ".env": KindText, ".gitignore": KindText,
	"compose.yml": KindYAML, "compose.yaml": KindYAML, "docker-compose.yml": KindYAML,
}

func KindOf(name string, isDir bool) Kind {
	if isDir {
		return KindFolder
	}
	lower := strings.ToLower(name)
	if k, ok := nameKinds[lower]; ok {
		return k
	}
	ext := strings.TrimPrefix(filepath.Ext(lower), ".")
	if k, ok := extKinds[ext]; ok {
		return k
	}
	return KindOther
}

// Editable reports whether a kind is plain text the editor can open.
func (k Kind) Editable() bool {
	switch k {
	case KindMarkdown, KindJSON, KindYAML, KindLog, KindCode, KindText:
		return true
	}
	return false
}

func mimeOf(name string) string {
	if t := mime.TypeByExtension(filepath.Ext(name)); t != "" {
		return t
	}
	return "application/octet-stream"
}
