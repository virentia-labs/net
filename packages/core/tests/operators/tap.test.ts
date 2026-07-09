import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, isSkip, query, tap } from "../../lib/index";
import { reasonHarness } from "../support/harness";
import { collect, readStore } from "../support/runtime";

describe("tap", () => {
  test("reports start, success, settled around an unchanged result", async () => {
    const events: string[] = [];
    const q = query({
      handler: async (id: string) => `v:${id}`,
      use: [
        tap({
          onStart: (id) => events.push(`start:${id}`),
          onSuccess: (data, params) => events.push(`success:${data}:${params}`),
          onSettled: (params) => events.push(`settled:${params}`),
        }),
      ],
    });
    const app = scope();
    await scoped(app, () => q("1"));
    expect(events).toEqual(["start:1", "success:v:1:1", "settled:1"]);
    expect(readStore(app, q.data)).toBe("v:1");
  });

  test("reports start, error, settled then re-throws the error", async () => {
    const events: string[] = [];
    const q = query({
      handler: async (): Promise<string> => {
        throw new Error("bad");
      },
      use: [
        tap({
          onStart: () => events.push("start"),
          onError: (error) => events.push(`error:${(error as Error).message}`),
          onSettled: () => events.push("settled"),
        }),
      ],
    });
    const errors = collect(q.failData);
    await scoped(scope(), () => q(undefined)).catch(() => {});
    expect(events).toEqual(["start", "error:bad", "settled"]);
    expect((errors[0] as Error).message).toBe("bad"); // still reached failData
  });

  test("reports a superseded run's SkipSignal as onError", async () => {
    const h = reasonHarness<"a" | "b">();
    const skips: unknown[] = [];
    const q = query({
      handler: h.handler,
      use: [tap({ onError: (e) => skips.push(e) }), concurrency({ strategy: "takeLatest" })],
    });
    const app = scope();
    let pa!: Promise<unknown>;
    scoped(app, () => {
      pa = q("a");
      q("b").catch(() => {});
    });
    await pa.catch(() => {});
    expect(skips.some((e) => isSkip(e))).toBe(true);
  });

  describe("KNOWN LIMITATION: callbacks are not isolated from the result", () => {
    test("a throwing onSuccess turns the run into a failure", async () => {
      // tap runs onSuccess inside its try, so a throw there is caught by the same catch → onError
      // fires with the callback's error and the run rejects, discarding the handler's result.
      const events: string[] = [];
      const q = query({
        handler: async () => "ok",
        use: [
          tap({
            onStart: () => events.push("start"),
            onSuccess: () => {
              events.push("succ");
              throw new Error("cb");
            },
            onError: (e) => events.push(`err:${(e as Error).message}`),
            onSettled: () => events.push("settled"),
          }),
        ],
      });
      const app = scope();
      await scoped(app, () => q(undefined)).catch(() => {});
      expect(events).toEqual(["start", "succ", "err:cb", "settled"]);
      expect(readStore(app, q.data)).toBeNull(); // successful result discarded
      expect((readStore(app, q.error) as Error).message).toBe("cb");
    });
  });
});
