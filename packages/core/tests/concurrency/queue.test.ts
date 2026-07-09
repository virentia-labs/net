import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, query } from "../../lib/index";
import { harness } from "../support/harness";
import { tick } from "../support/runtime";

describe("queue", () => {
  test("serializes same-lane runs", async () => {
    const h = harness<"a" | "b">();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "queue" })] });
    const app = scope();
    scoped(app, () => {
      q("a").catch(() => {});
      q("b").catch(() => {});
    });
    await tick();
    expect(h.started).toEqual(["a"]);
    h.resolve("a");
    await tick();
    expect(h.started).toEqual(["a", "b"]);
    h.resolve("b");
    await tick();
    expect(h.settled).toEqual(["a", "b"]);
  });

  test("preserves enqueue order across three runs", async () => {
    const h = harness<"a" | "b" | "c">();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "queue" })] });
    const app = scope();
    scoped(app, () => {
      q("a").catch(() => {});
      q("b").catch(() => {});
      q("c").catch(() => {});
    });
    await tick();
    expect(h.started).toEqual(["a"]);
    h.resolve("a");
    await tick();
    h.resolve("b");
    await tick();
    h.resolve("c");
    await tick();
    expect(h.settled).toEqual(["a", "b", "c"]);
  });

  describe("when a run fails", () => {
    test("still runs the next queued run", async () => {
      const h = harness<"a" | "b">();
      const q = query({ handler: h.handler, use: [concurrency({ strategy: "queue" })] });
      const app = scope();
      let pa!: Promise<unknown>;
      scoped(app, () => {
        pa = q("a");
        q("b").catch(() => {});
      });
      await tick();
      h.reject("a", new Error("a-failed"));
      await pa.catch(() => {});
      await tick();
      expect(h.started).toEqual(["a", "b"]);
      h.resolve("b");
      await tick();
      expect(h.settled).toEqual(["b"]);
    });

    test("chains a run enqueued after the failure off the stored caught tail", async () => {
      const h = harness<"a" | "b">();
      const q = query({ handler: h.handler, use: [concurrency({ strategy: "queue" })] });
      const app = scope();
      let pa!: Promise<unknown>;
      scoped(app, () => {
        pa = q("a");
      });
      await tick();
      h.reject("a", new Error("a-failed"));
      await pa.catch(() => {});
      await tick(); // a settled; its rejection is stored as the (caught) lane tail
      scoped(app, () => {
        q("b").catch(() => {}); // prev = the stored rejected tail → must not block b
      });
      await tick();
      expect(h.started).toEqual(["a", "b"]);
      h.resolve("b");
      await tick();
      expect(h.settled).toEqual(["b"]);
    });
  });
});
