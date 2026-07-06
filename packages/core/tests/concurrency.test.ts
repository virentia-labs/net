import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, query } from "../lib/index";
import { harness } from "./helpers";

// Flush all pending microtasks.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("concurrency", () => {
  test("takeLatest aborts the previous run and keeps the newest result", async () => {
    const h = harness<"a" | "b">();
    const q = query({
      handler: h.handler,
      use: [concurrency({ strategy: "takeLatest" })],
    });

    const app = scope();
    let pa!: Promise<unknown>;
    let pb!: Promise<unknown>;
    scoped(app, () => {
      pa = q("a");
      pb = q("b");
    });

    // "a" was superseded synchronously by "b": its handler should have been aborted.
    await expect(pa).rejects.toThrow("aborted:a");

    h.resolve("b");
    await pb;

    expect(h.settled).toEqual(["b"]);
    expect(scoped(app, () => q.data.value)).toBe("b");
  });

  test("takeFirst dedups: the second call shares the first in-flight result", async () => {
    const h = harness<"a">();
    const q = query({
      handler: h.handler,
      use: [concurrency({ strategy: "takeFirst" })],
    });

    const app = scope();
    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    scoped(app, () => {
      p1 = q("a");
      p2 = q("a");
    });

    h.resolve("a", "shared");
    expect(await p1).toBe("shared");
    expect(await p2).toBe("shared");
    expect(h.started).toEqual(["a"]); // handler ran once
  });

  test("queue serializes runs on the same lane", async () => {
    const h = harness<"a" | "b">();
    const q = query({
      handler: h.handler,
      use: [concurrency({ strategy: "queue" })],
    });

    const app = scope();
    scoped(app, () => {
      void q("a");
      void q("b");
    });

    // queue chains off a resolved promise, so the first run starts asynchronously;
    // the second waits for the first to settle.
    await tick();
    expect(h.started).toEqual(["a"]);

    h.resolve("a");
    await tick();
    expect(h.started).toEqual(["a", "b"]);

    h.resolve("b");
    await tick();
    expect(h.settled).toEqual(["a", "b"]);
  });

  test("per-key lanes run independently under takeLatest", async () => {
    const h = harness<string>();
    const q = query({
      handler: h.handler,
      use: [concurrency({ strategy: "takeLatest", key: (id: string) => id })],
    });

    const app = scope();
    scoped(app, () => {
      void q("x");
      void q("y");
    });

    // Different keys => neither aborts the other; both are in flight.
    expect(h.started).toEqual(["x", "y"]);

    h.resolve("x");
    h.resolve("y");
    await tick();
    expect(h.settled.sort()).toEqual(["x", "y"]);
  });
});
