import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { NET, query, type Operator } from "../../lib/index";
import { buildNet } from "../../lib/query/internals";
import { readStore } from "../support/runtime";

let order: string[] = [];

function mark(name: string, stage: Operator["stage"]): Operator<any, any> {
  return {
    name,
    stage,
    wrapHandler(next) {
      return async (p, c) => {
        order.push(`>${name}`);
        const r = await next(p, c);
        order.push(`<${name}`);
        return r;
      };
    },
  };
}

describe("the NET handle", () => {
  test("exposes the chain, stores, mapParams and addOperator", () => {
    const q = query({ handler: async (id: string) => id });
    const internals = q[NET];
    expect(Array.isArray(internals.chain)).toBe(true);
    expect(typeof internals.addOperator).toBe("function");
    expect(typeof internals.mapParams).toBe("function");
    expect(internals.data).toBeDefined();
    expect(internals.error).toBeDefined();
    expect(internals.stale).toBeDefined();
  });

  describe("mapParams", () => {
    test("is identity by default, preserving the reference", () => {
      const q = query({ handler: async (p: { id: string }) => p.id });
      const obj = { id: "7" };
      expect(q[NET].mapParams(obj)).toBe(obj);
    });

    test("is the configured params mapper when one is given", () => {
      const q = query({
        params: (raw: { userId: string }) => ({ id: raw.userId }),
        handler: async (p: { id: string }) => p.id,
      });
      expect(q[NET].mapParams({ userId: "9" })).toEqual({ id: "9" });
    });
  });

  describe("addOperator", () => {
    test("runs the added operator's setup at attach time", async () => {
      order = [];
      let setupCalled = false;
      const q = query({ handler: async () => "ok" });
      const late: Operator<any, any> = {
        name: "late",
        setup() {
          setupCalled = true;
        },
        wrapHandler(next) {
          return async (p, c) => {
            order.push("late");
            return next(p, c);
          };
        },
      };
      q[NET].addOperator(late);
      expect(setupCalled).toBe(true); // setup runs at attach time
      await scoped(scope(), () => q(undefined));
      expect(order).toContain("late"); // wrapHandler applied on the run
    });

    test("re-sorts a late scheduler outside existing executors", async () => {
      order = [];
      const q = query({ handler: async () => "ok", use: [mark("e", "executor")] });
      q[NET].addOperator(mark("s", "scheduler"));
      await scoped(scope(), () => q(undefined));
      expect(order).toEqual([">s", ">e", "<e", "<s"]);
    });
  });

  describe("a config use operator's setup", () => {
    test("runs once at build time with initCtx", () => {
      const seen: string[] = [];
      let sawStores = false;
      const probe: Operator<any, any> = {
        name: "probe",
        setup(ctx) {
          seen.push("setup");
          sawStores = ctx.data !== undefined && ctx.stale !== undefined && ctx.effect !== undefined;
        },
      };
      query({ handler: async () => "x", use: [probe] });
      expect(seen).toEqual(["setup"]);
      expect(sawStores).toBe(true);
    });
  });

  describe("buildNet without a factory", () => {
    test("runs a net to completion", async () => {
      // query()/mutation() always pass a factory; building without one exercises the defaults
      // guard (no registry key → no global/scoped defaults, no default setup).
      const q = buildNet<undefined, undefined, string, unknown>({ handler: async () => "raw" });
      const app = scope();
      await scoped(app, () => q(undefined));
      expect(readStore(app, q.data)).toBe("raw");
    });
  });
});
