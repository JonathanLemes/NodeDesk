import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // `make dev` runs the Go backend on :8420; the UI talks to it through this proxy.
    proxy: { "/api": { target: process.env.NODEDESK_API ?? "http://127.0.0.1:8420", changeOrigin: false } },
  },
  build: { chunkSizeWarningLimit: 900 },
})
