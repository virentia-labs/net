import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, query } from "../../lib/index";
import { reasonHarness } from "../support/harness";
import { tick } from "../support/runtime";

describe("a parent (effect-global) abort", () => {
  test("propagates to the in-flight child run", async () => {
    // takeLatest runs behind a childController(ctx.signal); aborting the effect (the parent
    // signal) must cancel the child. Exercises childController's parent-abort listener path.
    const h = reasonHarness<"a">();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeLatest" })] });
    const app = scope();
    let p!: Promise<unknown>;
    scoped(app, () => {
      p = q("a");
    });
    p.catch(() => {});
    expect(h.started).toEqual(["a"]);
    scoped(app, () => q.abort()); // parent/effect abort
    await tick();
    expect(h.aborted[0]?.param).toBe("a"); // the child run observed the abort
  });
});
