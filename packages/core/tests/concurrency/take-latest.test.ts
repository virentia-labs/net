import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, isSkip, query } from "../../lib/index";
import { harness, reasonHarness } from "../support/harness";
import { microtask, readStore } from "../support/runtime";

describe("takeLatest", () => {
  test("aborts the older run and keeps the newest result", async () => {
    const h = harness<"a" | "b">();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeLatest" })] });
    const app = scope();
    let pa!: Promise<unknown>;
    let pb!: Promise<unknown>;
    scoped(app, () => {
      pa = q("a");
      pb = q("b");
    });

    await expect(pa).rejects.toThrow("aborted:a");
    h.resolve("b");
    await pb;
    expect(h.settled).toEqual(["b"]);
    expect(readStore(app, q.data)).toBe("b");
  });

  test("aborts a superseded run with a SkipSignal reason", async () => {
    const h = reasonHarness<"a" | "b">();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeLatest" })] });
    const app = scope();
    let pa!: Promise<unknown>;
    scoped(app, () => {
      pa = q("a");
      q("b").catch(() => {});
    });
    await pa.catch(() => {});
    const reason = h.aborted[0]?.reason;
    expect(isSkip(reason)).toBe(true);
    expect((reason as Error).message).toMatch(/concurrency/);
  });

  test("settles only the last run of a superseded chain", async () => {
    const h = harness<"a" | "b" | "c">();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeLatest" })] });
    const app = scope();
    let pa!: Promise<unknown>;
    let pb!: Promise<unknown>;
    let pc!: Promise<unknown>;
    scoped(app, () => {
      pa = q("a");
      pb = q("b");
      pc = q("c");
    });
    await expect(pa).rejects.toThrow("aborted:a");
    await expect(pb).rejects.toThrow("aborted:b");
    h.resolve("c");
    await pc;
    expect(h.started).toEqual(["a", "b", "c"]);
    expect(h.settled).toEqual(["c"]);
  });

  test("keeps the live entry when a superseded run cleans up", async () => {
    // a and b are superseded (their `finally` will fire and, without the `runs.get(lane) === entry`
    // guard, would wrongly delete c's live entry). If that happened, a later supersede could not
    // find c to abort — so we prove the guard by aborting c with a fourth run AFTER a/b cleaned up.
    const h = harness<"a" | "b" | "c" | "d">();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeLatest" })] });
    const app = scope();
    let pc!: Promise<unknown>;
    scoped(app, () => {
      q("a").catch(() => {}); // superseded → rejects → its finally runs
      q("b").catch(() => {}); // superseded → rejects → its finally runs
      pc = q("c"); // the live entry
    });
    await microtask(); // let a's and b's finally callbacks run
    scoped(app, () => {
      q("d").catch(() => {}); // must still find c as current and abort it
    });
    await expect(pc).rejects.toThrow("aborted:c"); // c was aborted → its entry survived cleanup
  });

  describe("with no strategy given", () => {
    test("defaults to takeLatest", async () => {
      const h = harness<"a" | "b">();
      const q = query({ handler: h.handler, use: [concurrency()] });
      const app = scope();
      let pa!: Promise<unknown>;
      scoped(app, () => {
        pa = q("a");
        q("b").catch(() => {});
      });
      await expect(pa).rejects.toThrow("aborted:a");
    });
  });
});
