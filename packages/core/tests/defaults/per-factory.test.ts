import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { mutation, overrideDefaults, query } from "../../lib/index";
import { readStore } from "../support/runtime";

describe("defaults are keyed per factory", () => {
  test("a query override leaves mutation on its own handler", async () => {
    const q = query({ handler: async () => "q-real" });
    const m = mutation({ handler: async () => "m-real" });
    const revert = overrideDefaults(query, { executor: async () => "q-default" });
    try {
      const app = scope();
      await scoped(app, () => q(undefined));
      await scoped(app, () => m(undefined));
      expect(readStore(app, q.data)).toBe("q-default");
      expect(readStore(app, m.data)).toBe("m-real"); // mutation unaffected
    } finally {
      revert();
    }
  });
});
