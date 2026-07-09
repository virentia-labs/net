import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query } from "../../lib/index";
import { readStore } from "../support/runtime";

describe("query data", () => {
  test("is null before the first run", () => {
    const q = query({ handler: async (id: string) => id });
    expect(readStore(scope(), q.data)).toBeNull();
  });

  describe("initialData", () => {
    test("seeds data before the first run", async () => {
      const q = query({ handler: async (id: string) => id, initialData: "INIT" });
      const app = scope();
      expect(readStore(app, q.data)).toBe("INIT");
      await scoped(app, () => q("x"));
      expect(readStore(app, q.data)).toBe("x");
    });

    test("is what reset restores data to", async () => {
      const q = query({ handler: async (id: string) => id, initialData: "INIT" });
      const app = scope();
      await scoped(app, () => q("x"));
      await scoped(app, () => q.reset());
      expect(readStore(app, q.data)).toBe("INIT");
    });
  });

  test("survives a failed run with its previous value", async () => {
    let ok = true;
    const q = query({
      handler: async (): Promise<string> => {
        if (!ok) throw new Error("boom");
        return "good";
      },
    });
    const app = scope();
    await scoped(app, () => q(undefined));
    expect(readStore(app, q.data)).toBe("good");
    ok = false;
    await scoped(app, () => q(undefined)).catch(() => {});
    expect(readStore(app, q.data)).toBe("good"); // not overwritten by the failure
  });

  test("keeps stale false — core never writes it", async () => {
    // No core operator flips `stale`; it stays at its default across success and failure.
    let ok = true;
    const q = query({
      handler: async (): Promise<string> => {
        if (!ok) throw new Error("x");
        return "v";
      },
    });
    const app = scope();
    expect(readStore(app, q.stale)).toBe(false);
    await scoped(app, () => q(undefined));
    expect(readStore(app, q.stale)).toBe(false);
    ok = false;
    await scoped(app, () => q(undefined)).catch(() => {});
    expect(readStore(app, q.stale)).toBe(false);
  });
});
