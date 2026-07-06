import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { overrideDefaults, query, retry, type Executor } from "../lib/index";
import { tanstackExecutor } from "../lib/adapters/tanstack";
import { apolloExecutor } from "../lib/adapters/apollo";

describe("overrideDefaults", () => {
  test("global default operators apply to every query", async () => {
    let attempts = 0;
    const q = query({
      handler: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("retry me");
        return "ok";
      },
    });

    const revert = overrideDefaults(query, { use: [retry({ times: 3, delay: 0 })] });
    try {
      await scoped(scope(), () => q(undefined));
      expect(attempts).toBe(3); // the default retry recovered it
    } finally {
      revert();
    }
  });

  test("global default executor is used, and revert restores built-in", async () => {
    const q = query({ handler: async () => "real" });
    const fake: Executor<any, any> = async () => "fake";

    const revert = overrideDefaults(query, { executor: fake });
    const a = scope();
    await scoped(a, () => q(undefined));
    expect(scoped(a, () => q.data.value)).toBe("fake");

    revert();
    const b = scope();
    await scoped(b, () => q(undefined));
    expect(scoped(b, () => q.data.value)).toBe("real");
  });

  test("scoped override only affects its scope", async () => {
    const q = query({ handler: async () => "real" });
    const fake: Executor<any, any> = async () => "scoped-fake";

    const a = scope();
    const b = scope();
    const revert = overrideDefaults(query, { executor: fake }, { scope: a });
    try {
      await scoped(a, () => q(undefined));
      await scoped(b, () => q(undefined));

      expect(scoped(a, () => q.data.value)).toBe("scoped-fake");
      expect(scoped(b, () => q.data.value)).toBe("real"); // untouched
    } finally {
      revert();
    }
  });

  test("an explicit per-query executor wins over defaults", async () => {
    const own: Executor<any, any> = async () => "own";
    const q = query({ handler: async () => "real", executor: own });

    const revert = overrideDefaults(query, { executor: async () => "default" });
    try {
      const app = scope();
      await scoped(app, () => q(undefined));
      expect(scoped(app, () => q.data.value)).toBe("own");
    } finally {
      revert();
    }
  });
});

describe("tanstackExecutor", () => {
  test("routes the handler through the client and returns its result", async () => {
    const keys: (readonly unknown[])[] = [];
    const client = {
      fetchQuery: async <D>(opts: {
        queryKey: readonly unknown[];
        queryFn: (c: { signal?: AbortSignal }) => Promise<D>;
      }): Promise<D> => {
        keys.push(opts.queryKey);
        return opts.queryFn({});
      },
    };

    const q = query({
      handler: async (id: string) => `user:${id}`,
      executor: tanstackExecutor(() => client),
    });

    const app = scope();
    await scoped(app, () => q("1"));

    expect(scoped(app, () => q.data.value)).toBe("user:1");
    expect(keys[0]).toEqual(["net", "1"]);
  });
});

describe("apolloExecutor", () => {
  test("fetches via client.query from a document + variables, no handler needed", async () => {
    const DOC = { kind: "Document" };
    let received: { query: unknown; variables?: Record<string, unknown> } | undefined;

    const client = {
      query: async <D>(opts: {
        query: unknown;
        variables?: Record<string, unknown>;
      }): Promise<{ data: D }> => {
        received = opts;
        return { data: { name: "Ada" } as D };
      },
    };

    const q = query<{ id: string }, { name: string }>({
      executor: apolloExecutor(() => client, {
        document: DOC,
        variables: (p) => ({ id: p.id }),
      }),
    });

    const app = scope();
    await scoped(app, () => q({ id: "7" }));

    expect(scoped(app, () => q.data.value)).toEqual({ name: "Ada" });
    expect(received?.query).toBe(DOC);
    expect(received?.variables).toEqual({ id: "7" });
  });
});
