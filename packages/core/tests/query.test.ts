import { reaction, scope, scoped, type Event } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query } from "../lib/index";

// Collect every payload an event emits (across scopes) into an array.
function collect<T>(unit: Event<T>): T[] {
  const seen: T[] = [];
  reaction({ on: unit, run: (value: T) => void seen.push(value) });
  return seen;
}

describe("query", () => {
  test("is an effect: runs the handler and exposes the result on data and doneData", async () => {
    const q = query({
      handler: async (id: string) => `user:${id}`,
    });
    const done = collect(q.doneData);

    const app = scope();
    await scoped(app, () => q("42"));

    expect(scoped(app, () => q.data.value)).toBe("user:42");
    expect(scoped(app, () => q.pending.value)).toBe(false);
    expect(done).toEqual(["user:42"]);
  });

  test("maps raw input into handler params", async () => {
    const seen: Array<{ id: string }> = [];
    const q = query({
      params: (raw: { userId: string }) => ({ id: raw.userId }),
      handler: async (params: { id: string }) => {
        seen.push(params);
        return params.id;
      },
    });

    const app = scope();
    await scoped(app, () => q({ userId: "7" }));

    expect(seen).toEqual([{ id: "7" }]);
    expect(scoped(app, () => q.data.value)).toBe("7");
  });

  test("failure surfaces on failData and leaves data null", async () => {
    const q = query({
      handler: async (): Promise<string> => {
        throw new Error("boom");
      },
    });
    const errors = collect(q.failData);

    const app = scope();
    await scoped(app, () => q(undefined)).catch(() => {});

    expect(scoped(app, () => q.data.value)).toBeNull();
    expect((errors[0] as Error).message).toBe("boom");
    expect((scoped(app, () => q.error.value) as Error).message).toBe("boom");
  });

  test("a later success clears the error store", async () => {
    let ok = false;
    const q = query({
      handler: async (): Promise<string> => {
        if (!ok) throw new Error("boom");
        return "recovered";
      },
    });

    const app = scope();
    await scoped(app, () => q(undefined)).catch(() => {});
    expect(scoped(app, () => q.error.value)).not.toBeNull();

    ok = true;
    await scoped(app, () => q(undefined));
    expect(scoped(app, () => q.error.value)).toBeNull();
    expect(scoped(app, () => q.data.value)).toBe("recovered");
  });

  test("isolation: separate scopes keep independent data", async () => {
    const q = query({ handler: async (id: string) => id });

    const a = scope();
    const b = scope();
    await scoped(a, () => q("a"));
    await scoped(b, () => q("b"));

    expect(scoped(a, () => q.data.value)).toBe("a");
    expect(scoped(b, () => q.data.value)).toBe("b");
  });

  test("reset clears data", async () => {
    const q = query({ handler: async (id: string) => id });
    const app = scope();

    await scoped(app, () => q("x"));
    expect(scoped(app, () => q.data.value)).toBe("x");

    await scoped(app, () => q.reset());
    expect(scoped(app, () => q.data.value)).toBeNull();
  });
});
