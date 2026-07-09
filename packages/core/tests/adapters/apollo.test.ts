import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query } from "../../lib/index";
import { apolloExecutor, type ApolloClientLike } from "../../lib/adapters/apollo";
import { readStore, tick } from "../support/runtime";

const DOC = { kind: "Document" };

describe("apolloExecutor", () => {
  test("sends the document, variables and fetchPolicy to client.query and returns .data", async () => {
    let received: any;
    const client = {
      query: async (opts: any) => {
        received = opts;
        return { data: { name: "Ada" } };
      },
    } as unknown as ApolloClientLike;
    const q = query({
      executor: apolloExecutor<{ id: string }, { name: string }>(() => client, {
        document: DOC,
        variables: (p) => ({ id: p.id }),
        fetchPolicy: "no-cache",
      }),
    });
    const app = scope();
    await scoped(app, () => q({ id: "7" }));
    expect(readStore(app, q.data)).toEqual({ name: "Ada" });
    expect(received).toMatchObject({
      query: DOC,
      variables: { id: "7" },
      fetchPolicy: "no-cache",
    });
  });

  test("forwards the run's live abort signal via context.fetchOptions.signal", async () => {
    let signal: AbortSignal | undefined;
    const client = {
      query: (opts: any) => {
        signal = opts.context.fetchOptions.signal;
        return new Promise(() => {}); // stay pending so we can abort it
      },
    } as unknown as ApolloClientLike;
    const q = query({
      executor: apolloExecutor<void, number>(() => client, { document: DOC }),
    });
    const app = scope();
    let p!: Promise<unknown>;
    scoped(app, () => {
      p = q(undefined);
    });
    p.catch(() => {});
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
    scoped(app, () => q.abort());
    await tick();
    expect(signal!.aborted).toBe(true);
  });

  test("builds the document from params", async () => {
    const docs: unknown[] = [];
    const client = {
      query: async (opts: any) => {
        docs.push(opts.query);
        return { data: opts.query };
      },
    } as unknown as ApolloClientLike;
    const q = query({
      executor: apolloExecutor<string, unknown>(() => client, {
        document: (p: string) => ({ kind: "Document", for: p }),
      }),
    });
    const app = scope();
    await scoped(app, () => q("A"));
    expect(docs[0]).toEqual({ kind: "Document", for: "A" });
  });

  describe("with no handler", () => {
    test("fetches through Apollo alone", async () => {
      const client = {
        query: async () => ({ data: "from-apollo" }),
      } as unknown as ApolloClientLike;
      const q = query({ executor: apolloExecutor<void, string>(() => client, { document: DOC }) });
      const app = scope();
      await scoped(app, () => q(undefined));
      expect(readStore(app, q.data)).toBe("from-apollo");
    });
  });
});
