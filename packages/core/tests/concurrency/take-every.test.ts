import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, query } from "../../lib/index";
import { harness } from "../support/harness";

describe("takeEvery", () => {
  test("starts every call immediately with no coordination", async () => {
    const h = harness<"a" | "b">();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeEvery" })] });
    const app = scope();
    let pa!: Promise<unknown>;
    let pb!: Promise<unknown>;
    scoped(app, () => {
      pa = q("a");
      pb = q("b");
    });
    expect(h.started).toEqual(["a", "b"]);
    h.resolve("a");
    h.resolve("b");
    expect(await pa).toBe("a");
    expect(await pb).toBe("b");
  });
});
