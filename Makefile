# NodeDesk build helpers. Requires Go >= 1.25 and Node >= 20 with pnpm.
GO      ?= go
PNPM    ?= pnpm
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
BIN     := bin/nodedesk

.PHONY: all build frontend backend dev-backend dev-frontend test lint clean

all: build

## build: compile the frontend, embed it, and produce a single binary at bin/nodedesk
build: frontend backend

frontend:
	cd frontend && $(PNPM) install --frozen-lockfile && $(PNPM) build
	rm -rf backend/web/dist/*
	cp -r frontend/dist/. backend/web/dist/

backend:
	cd backend && $(GO) build -trimpath -ldflags "-s -w -X main.version=$(VERSION)" -o ../$(BIN) ./cmd/nodedesk

## dev-backend: API on 127.0.0.1:8420 with a throwaway data dir and no login
dev-backend:
	cd backend && NODEDESK_DATA_DIR=../data NODEDESK_AUTH=disabled $(GO) run ./cmd/nodedesk

## dev-frontend: Vite dev server with hot reload (proxies /api to the backend)
dev-frontend:
	cd frontend && $(PNPM) dev

test:
	cd backend && $(GO) vet ./... && $(GO) test ./...
	cd frontend && $(PNPM) typecheck

lint:
	cd frontend && $(PNPM) lint

clean:
	rm -rf bin frontend/dist backend/web/dist/* && touch backend/web/dist/.gitkeep
