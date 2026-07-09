import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, query } from "../../lib/index";
import { harness } from "../support/harness";
import { readStore } from "../support/runtime";

describe("takeFirst", () => {
  test("shares one in-flight run across duplicate calls", async () => {
    const h = harness<"a">();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeFirst" })] });
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
    expect(h.started).toEqual(["a"]);
  });

  test("shares the first run across same-lane calls with different params", async () => {
    const h = harness<string>();
    const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeFirst" })] });
    const app = scope();
    let pa!: Promise<unknown>;
    let pb!: Promise<unknown>;
    scoped(app, () => {
      pa = q("a");
      pb = q("b"); // no key → same single lane → shares "a"'s in-flight run
    });
    h.resolve("a", "A-RESULT");
    expect(await pa).toBe("A-RESULT");
    expect(await pb).toBe("A-RESULT");
    expect(h.started).toEqual(["a"]);
  });

  describe("after the in-flight run settles", () => {
    test("runs the handler again on the next call", async () => {
      let calls = 0;
      const q = query({
        handler: async () => `r${(calls += 1)}`,
        use: [concurrency({ strategy: "takeFirst" })],
      });
      const app = scope();
      await scoped(app, () => q(undefined));
      expect(readStore(app, q.data)).toBe("r1");
      // sequential (not concurrent) → the first entry was cleaned up, so this is a real new run
      await scoped(app, () => q(undefined));
      expect(readStore(app, q.data)).toBe("r2");
      expect(calls).toBe(2);
    });
  });
});
