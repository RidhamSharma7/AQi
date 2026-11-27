// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { spawn, type ChildProcess } from "node:child_process";
import type { Plugin } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const ML_PORT = process.env["ML_PORT"] ?? "8001";
const ML_TARGET = `http://127.0.0.1:${ML_PORT}`;

function mlServerPlugin(): Plugin {
  let child: ChildProcess | null = null;

  const ensurePythonServer = async () => {
    if (child && !child.killed) return;
    try {
      const res = await fetch(`${ML_TARGET}/health`);
      if (res.ok) return;
    } catch {
      // Not running yet; start the Python ML inference server.
    }

    const pythonBin = process.platform === "win32" ? "python" : "python3";
    child = spawn(pythonBin, ["ml/server.py"], {
      env: { ...process.env, ML_PORT },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(`[ml] ${chunk.toString()}`);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`[ml] ${chunk.toString()}`);
    });
    child.on("exit", () => {
      child = null;
    });
  };

  const stopPythonServer = () => {
    if (child && !child.killed) {
      child.kill();
      child = null;
    }
  };

  return {
    name: "airwatch-ml-server",
    configureServer(server) {
      void ensurePythonServer();
      server.httpServer?.once("close", stopPythonServer);
    },
    configurePreviewServer(server) {
      void ensurePythonServer();
      server.httpServer?.once("close", stopPythonServer);
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mlServerPlugin()],
    server: {
      proxy: {
        "/api/ml": {
          target: ML_TARGET,
          changeOrigin: true,
        },
      },
    },
    preview: {
      proxy: {
        "/api/ml": {
          target: ML_TARGET,
          changeOrigin: true,
        },
      },
    },
  },
});
