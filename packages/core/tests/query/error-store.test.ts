import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query } from "../../lib/index";
import { defer } from "../support/harness";
import { collect, readStore } from "../support/runtime";

describe("the query error store", () => {
  describe("a rejected run", () => {
    test("records the error", async () => {
      const q = query({
        handler: async (): Promise<string> => {
          throw new Error("boom");
        },
      });
      const app = scope();
      await scoped(app, () => q(undefined)).catch(() => {});
      expect((readStore(app, q.error) as Error).message).toBe("boom");
    });

    test("leaves data null", async () => {
      const q = query({
        handler: async (): Promise<string> => {
          throw new Error("boom");
        },
      });
      const app = scope();
      await scoped(app, () => q(undefined)).catch(() => {});
      expect(readStore(app, q.data)).toBeNull();
    });

    test("emits the error on failData", async () => {
      const q = query({
        handler: async (): Promise<string> => {
          throw new Error("boom");
        },
      });
      const errors = collect(q.failData);
      await scoped(scope(), () => q(undefined)).catch(() => {});
      expect((errors[0] as Error).message).toBe("boom");
    });
  });

  test("clears on a later success", async () => {
    let ok = false;
    const q = query({
      handler: async (): Promise<string> => {
        if (!ok) throw new Error("boom");
        return "recovered";
      },
    });
    const app = scope();
    await scoped(app, () => q(undefined)).catch(() => {});
    expect(readStore(app, q.error)).not.toBeNull();
    ok = true;
    await scoped(app, () => q(undefined));
    expect(readStore(app, q.error)).toBeNull();
    expect(readStore(app, q.data)).toBe("recovered");
  });

  test("survives a pending refetch, clearing only once it succeeds", async () => {
    let ok = false;
    const gate = { d: defer<string>() };
    const q = query({
      handler: async (): Promise<string> => {
        if (!ok) throw new Error("first-fail");
        return gate.d.promise;
      },
    });
    const app = scope();
    await scoped(app, () => q(undefined)).catch(() => {});
    ok = true;
    let p!: Promise<unknown>;
    scoped(app, () => {
      p = q(undefined);
    });
    expect((readStore(app, q.error) as Error).message).toBe("first-fail");
    expect(readStore(app, q.pending)).toBe(true);
    gate.d.resolve("second-ok");
    await p;
    expect(readStore(app, q.error)).toBeNull();
  });
});
