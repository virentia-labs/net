import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    cache: false,
    include: ["tests/**/*.test.ts"],
  },
});
