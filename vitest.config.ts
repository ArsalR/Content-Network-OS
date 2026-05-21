import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // happy-dom for the html-sanitize tests (DOMPurify needs a DOM); the rest
    // are pure logic and could run in node, but the small overhead of running
    // every test under happy-dom isn't worth a per-file split.
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Tests should never touch the real DB / OpenAI / fetch — fail loudly
    // if a stray import tries to hit prod env.
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
