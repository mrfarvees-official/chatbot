import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": resolve(__dirname, "lib/test-server-only.ts"),
    },
  },
});
