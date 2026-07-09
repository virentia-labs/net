import { describe, test } from "vitest";

import { concurrency, mutation, overrideDefaults, query, trigger } from "../../lib/index";

// Each @ts-expect-error MUST be a compile error. This file is tsc-only (outside the runtime glob),
// so the bodies never execute — the compiler alone enforces them. A directive that stops catching
// an error becomes an "unused @ts-expect-error" and fails the typecheck.
describe("mistyped usage is rejected by the compiler", () => {
  test("a string query rejects a number argument", () => {
    const qs = query({ handler: async (id: string) => id });
    // @ts-expect-error a string query rejects a number argument
    qs(123);
  });

  test("the run argument is required", () => {
    const qs = query({ handler: async (id: string) => id });
    // @ts-expect-error the run argument is required
    qs();
  });

  test("a number query rejects a string argument", () => {
    const qn = query({ handler: async (n: number) => n });
    // @ts-expect-error a number query rejects a string argument
    qn("nope");
  });

  test("a bad concurrency strategy is rejected", () => {
    // @ts-expect-error strategy must be a ConcurrencyStrategy
    concurrency({ strategy: "bogus" });
  });

  test("a non-function params mapper is rejected", () => {
    // @ts-expect-error params must be a function
    query({ handler: async (id: string) => id, params: 5 });
  });

  test("a non-executor default is rejected", () => {
    // @ts-expect-error executor must be an Executor, not a number
    overrideDefaults(query, { executor: 5 });
  });

  test("a non-net trigger target is rejected", () => {
    const qs = query({ handler: async (id: string) => id });
    // @ts-expect-error trigger target must be a net effect
    trigger({}, { on: qs.doneData });
  });

  test("a non-function optimistic update is rejected", () => {
    // @ts-expect-error optimistic update must be a function
    mutation({ handler: async (n: number) => n, optimistic: { update: 1, rollback: () => {} } });
  });
});
