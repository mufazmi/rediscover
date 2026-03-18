import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["scripts/**/*.test.ts"],
    testTimeout: 60000,
  },
});
