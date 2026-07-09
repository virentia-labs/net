import { describe, expect, test } from "vitest";

import * as net from "../../lib/index";
import { query } from "../../lib/index";

describe("the public surface", () => {
  test("re-exports the documented API", () => {
    expect(typeof net.query).toBe("function");
    expect(typeof net.mutation).toBe("function");
    expect(typeof net.trigger).toBe("function");
    expect(typeof net.concurrency).toBe("function");
    expect(typeof net.retry).toBe("function");
    expect(typeof net.timeout).toBe("function");
    expect(typeof net.fallback).toBe("function");
    expect(typeof net.debounce).toBe("function");
    expect(typeof net.tap).toBe("function");
    expect(typeof net.overrideDefaults).toBe("function");
    expect(typeof net.isSkip).toBe("function");
    expect(typeof net.SkipSignal).toBe("function");
    expect(typeof net.NET).toBe("symbol");
  });

  test("a query exposes the effect surface plus net's stores and events", () => {
    const q = query({ handler: async () => "x" });
    for (const key of [
      "pending",
      "inFlight",
      "started",
      "done",
      "doneData",
      "failData",
      "finally",
      "settled",
      "abort",
      "aborted",
      "data",
      "error",
      "stale",
      "refresh",
      "reset",
    ] as const) {
      expect((q as unknown as Record<string, unknown>)[key]).toBeDefined();
    }
    expect(typeof q).toBe("function"); // it is callable (an effect)
  });
});
