import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query, timeout } from "../../lib/index";
import { defer } from "../support/harness";
import { collect, readStore } from "../support/runtime";

describe("timeout", () => {
  test("rejects a run that outlives its deadline with a TimeoutError", async () => {
    const gate = defer<string>();
    const q = query({ handler: () => gate.promise, use: [timeout(10)] });
    const errors = collect(q.failData);
    const app = scope();
    await scoped(app, () => q(undefined)).catch(() => {});
    expect((errors[0] as Error).name).toBe("TimeoutError");
    expect(readStore(app, q.data)).toBeNull();
  });

  test("resolves with the value when the run beats the deadline", async () => {
    const q = query({ handler: async (id: string) => id, use: [timeout(1000)] });
    const app = scope();
    await scoped(app, () => q("ok"));
    expect(readStore(app, q.data)).toBe("ok");
  });

  test("aborts the run's child signal when the deadline fires", async () => {
    let handlerSignalAborted = false;
    const gate = defer<string>();
    const q = query({
      handler: (_: void, { signal }) => {
        signal.addEventListener("abort", () => {
          handlerSignalAborted = true;
          gate.reject(signal.reason);
        });
        return gate.promise;
      },
      use: [timeout(10)],
    });
    await scoped(scope(), () => q(undefined)).catch(() => {});
    expect(handlerSignalAborted).toBe(true);
  });

  test("surfaces a pre-deadline rejection instead of a TimeoutError", async () => {
    const q = query({
      handler: async (): Promise<string> => {
        throw new Error("early");
      },
      use: [timeout(1000)],
    });
    const errors = collect(q.failData);
    await scoped(scope(), () => q(undefined)).catch(() => {});
    expect((errors[0] as Error).message).toBe("early");
  });

  describe("config forms", () => {
    test("accepts a bare number as the deadline", async () => {
      const q = query({ handler: async () => "a", use: [timeout(1000)] });
      const app = scope();
      await scoped(app, () => q(undefined));
      expect(readStore(app, q.data)).toBe("a");
    });

    test("accepts an { ms } config", async () => {
      const q = query({ handler: async () => "b", use: [timeout({ ms: 1000 })] });
      const app = scope();
      await scoped(app, () => q(undefined));
      expect(readStore(app, q.data)).toBe("b");
    });
  });

  describe("with ms 0", () => {
    test("resolves a microtask handler before the timer fires", async () => {
      const q = query({ handler: async () => "fast", use: [timeout(0)] });
      const app = scope();
      await scoped(app, () => q(undefined));
      expect(readStore(app, q.data)).toBe("fast");
    });
  });
});
