import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { overrideDefaults, query } from "../../lib/index";
import { readStore } from "../support/runtime";

describe("reverting a default", () => {
  test("restores the built-in handler executor", async () => {
    const q = query({ handler: async () => "real" });
    const revert = overrideDefaults(query, { executor: async () => "global" });
    revert();
    const app = scope();
    await scoped(app, () => q(undefined));
    expect(readStore(app, q.data)).toBe("real");
  });

  describe("when global overrides are nested", () => {
    test("reverting the inner one restores the outer override", async () => {
      const q = query({ handler: async () => "real" });
      const r1 = overrideDefaults(query, { executor: async () => "first" });
      const r2 = overrideDefaults(query, { executor: async () => "second" });
      try {
        r2(); // back to "first", not built-in
        const app = scope();
        await scoped(app, () => q(undefined));
        expect(readStore(app, q.data)).toBe("first");
      } finally {
        r1();
      }
    });
  });

  describe("when scoped overrides are nested", () => {
    test("reverting the inner one restores the outer scoped override", async () => {
      const q = query({ handler: async () => "real" });
      const a = scope();
      const r1 = overrideDefaults(query, { executor: async () => "first" }, { scope: a });
      const r2 = overrideDefaults(query, { executor: async () => "second" }, { scope: a });
      try {
        r2();
        await scoped(a, () => q(undefined));
        expect(readStore(a, q.data)).toBe("first");
      } finally {
        r1();
      }
    });
  });
});
