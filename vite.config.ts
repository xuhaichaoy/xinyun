import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const pkgDir = path.resolve(__dirname, "rust-core", "pkg");

const watchWasmPlugin = (): PluginOption => ({
  name: "watch-wasm-pkg",
  configureServer(server) {
    const reloadWasm = (file: string) => {
      if (file && file.startsWith(pkgDir)) {
        server.ws.send({ type: "full-reload" });
      }
    };

    server.watcher.add(`${pkgDir}/**/*`);
    server.watcher.on("add", reloadWasm);
    server.watcher.on("change", reloadWasm);
    server.watcher.on("unlink", reloadWasm);
  },
});

export default defineConfig({
  plugins: [react(), watchWasmPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    open: true,
    port: 5173,
    strictPort: true,
    fs: {
      allow: [pkgDir, __dirname],
    },
  },
  build: {
    target: "esnext",
    outDir: "dist",
    emptyOutDir: true,
  },
});
