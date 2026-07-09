import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query } from "../../lib/index";
import { reasonHarness } from "../support/harness";
import { readStore, tick } from "../support/runtime";

describe("reset", () => {
  describe("after a failed run", () => {
    test("restores data to its initial value", async () => {
      const q = query({
        handler: async (): Promise<string> => {
          throw new Error("boom");
        },
      });
      const app = scope();
      await scoped(app, () => q(undefined)).catch(() => {});
      await scoped(app, () => q.reset());
      expect(readStore(app, q.data)).toBeNull();
    });

    test("nulls the error store", async () => {
      const q = query({
        handler: async (): Promise<string> => {
          throw new Error("boom");
        },
      });
      const app = scope();
      await scoped(app, () => q(undefined)).catch(() => {});
      expect(readStore(app, q.error)).not.toBeNull();
      await scoped(app, () => q.reset());
      expect(readStore(app, q.error)).toBeNull();
    });

    test("leaves stale false", async () => {
      const q = query({
        handler: async (): Promise<string> => {
          throw new Error("boom");
        },
      });
      const app = scope();
      await scoped(app, () => q(undefined)).catch(() => {});
      await scoped(app, () => q.reset());
      expect(readStore(app, q.stale)).toBe(false);
    });
  });

  test("aborts the in-flight run without recording an error", async () => {
    const h = reasonHarness<"x">();
    const q = query({ handler: h.handler });
    const app = scope();
    let p!: Promise<unknown>;
    scoped(app, () => {
      p = q("x");
    });
    await scoped(app, () => q.reset());
    await p.catch(() => {});
    await tick();
    expect(readStore(app, q.data)).toBeNull();
    expect(readStore(app, q.error)).toBeNull();
    expect(h.aborted[0]?.param).toBe("x");
  });

  test("makes a following refresh do nothing", async () => {
    let calls = 0;
    const q = query({ handler: async (id: string) => `${id}:${(calls += 1)}` });
    const app = scope();
    await scoped(app, () => q("x"));
    await scoped(app, () => q.reset());
    await scoped(app, () => q.refresh());
    await tick();
    expect(calls).toBe(1);
    expect(readStore(app, q.data)).toBeNull();
  });

  describe("across scopes", () => {
    test("clears only the acting scope", async () => {
      const q = query({ handler: async (id: string) => id });
      const a = scope();
      const b = scope();
      await scoped(a, () => q("a"));
      await scoped(b, () => q("b"));
      await scoped(a, () => q.reset());
      expect(readStore(a, q.data)).toBeNull();
      expect(readStore(b, q.data)).toBe("b");
    });

    test("aborts only the acting scope's in-flight run, leaving others pending", async () => {
      // reset() cancels only the acting scope's runs (net tracks per-scope run controllers under
      // core's signal), unlike core's fx.abort() which cancels every active call.
      const h = reasonHarness<"a" | "b">();
      const q = query({ handler: h.handler });
      const a = scope();
      const b = scope();
      let pa!: Promise<unknown>;
      let pb!: Promise<unknown>;
      scoped(a, () => {
        pa = q("a");
      });
      scoped(b, () => {
        pb = q("b");
      });
      pa.catch(() => {}); // attach before the abort so the rejection is never unhandled
      pb.catch(() => {});
      expect(h.started).toEqual(["a", "b"]);
      scoped(a, () => q.reset()); // reset ONLY scope A
      await tick();
      expect(h.aborted.map((x) => x.param)).toEqual(["a"]); // only A aborted; B still pending
      h.resolve("b"); // let B settle so nothing floats
      await tick();
    });

    test("aborts nothing when the acting scope has no in-flight run", async () => {
      const h = reasonHarness<"a">();
      const q = query({ handler: h.handler });
      const a = scope();
      const b = scope();
      let pb!: Promise<unknown>;
      scoped(b, () => {
        pb = q("a");
      });
      pb.catch(() => {});
      scoped(a, () => q.reset()); // scope A has no run; B's must be untouched
      await tick();
      expect(h.aborted).toEqual([]); // B's run was not aborted by A's reset
      h.resolve("a");
      await tick();
    });
  });

  describe("a signal-ignoring handler", () => {
    test("has its late result force-discarded after reset", async () => {
      // The handler never inspects ctx.signal; only net's raceAbort discards its result. Proves
      // reset force-cancels (mirroring core) rather than relying on the handler to observe abort.
      let release!: (value: string) => void;
      const gate = new Promise<string>((r) => {
        release = r;
      });
      const q = query({ handler: async () => gate }); // ignores ctx.signal entirely
      const app = scope();
      let p!: Promise<unknown>;
      scoped(app, () => {
        p = q(undefined);
      });
      p.catch(() => {});
      await scoped(app, () => q.reset()); // abort while the handler is still pending
      release("late"); // the handler now resolves with a value
      await tick();
      expect(readStore(app, q.data)).toBeNull(); // late result discarded, not written
      expect(readStore(app, q.error)).toBeNull(); // and the abort is not surfaced as error
    });
  });
});
