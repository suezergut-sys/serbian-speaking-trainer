import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { resolve } from "node:path";
import { validateAndroidEnvironment } from "./build/androidEnvironment.ts";

export default defineConfig(({ mode }) => {
  if (mode === "android") validateAndroidEnvironment(loadEnv(mode, process.cwd(), "VITE_"));
  return ({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: mode === "testlab"
        ? { main: resolve("index.html"), testlab: resolve("testlab.html") }
        : resolve("index.html"),
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: "./src/tests/setup.ts",
  },
});
});
