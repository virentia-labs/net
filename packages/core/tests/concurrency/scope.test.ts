import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, query } from "../../lib/index";
import { harness } from "../support/harness";

describe("takeLatest across scopes", () => {
  test("leaves runs in other scopes untouched", async () => {
    const h = harness<string>();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeLatest" })] });
    const a = scope();
    const b = scope();
    let pb!: Promise<unknown>;
    scoped(a, () => q("a1").catch(() => {}));
    scoped(b, () => {
      pb = q("b1");
    });
    let pa2!: Promise<unknown>;
    scoped(a, () => {
      pa2 = q("a2");
    });
    expect(h.started).toEqual(["a1", "b1", "a2"]);
    h.resolve("b1");
    h.resolve("a2");
    await pb;
    await pa2;
    expect(h.settled.sort()).toEqual(["a2", "b1"]);
  });
});
