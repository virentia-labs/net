import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query, type Operator } from "../../lib/index";
import { readStore } from "../support/runtime";

let order: string[] = [];

// An order-recording middleware operator.
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

describe("the middleware onion", () => {
  test("nests schedulers outside executors, preserving array order within a stage", async () => {
    order = [];
    const q = query({
      handler: async () => "ok",
      use: [
        mark("e1", "executor"),
        mark("s1", "scheduler"),
        mark("e2", "executor"),
        mark("s2", "scheduler"),
      ],
    });
    await scoped(scope(), () => q(undefined));
    // stage sort (stable): [s1, s2, e1, e2]; compose folds so the first is the outermost wrapper
    expect(order).toEqual([">s1", ">s2", ">e1", ">e2", "<e2", "<e1", "<s2", "<s1"]);
  });

  test("places a stageless operator inside schedulers (default stage is executor)", async () => {
    order = [];
    const noStage: Operator<any, any> = {
      name: "def",
      // no stage
      wrapHandler(next) {
        return async (p, c) => {
          order.push(">def");
          const r = await next(p, c);
          order.push("<def");
          return r;
        };
      },
    };
    const q = query({ handler: async () => "ok", use: [noStage, mark("s", "scheduler")] });
    await scoped(scope(), () => q(undefined));
    expect(order).toEqual([">s", ">def", "<def", "<s"]); // scheduler outside the default-stage op
  });

  test("composes past a setup-only operator without breaking the chain", async () => {
    order = [];
    let setupRan = false;
    const setupOnly: Operator<any, any> = {
      name: "setup-only",
      setup() {
        setupRan = true;
      },
    };
    const q = query({
      handler: async () => "ok",
      use: [setupOnly, mark("w", "executor")],
    });
    const app = scope();
    await scoped(app, () => q(undefined));
    expect(setupRan).toBe(true);
    expect(order).toEqual([">w", "<w"]); // chain composed past the setup-only op
    expect(readStore(app, q.data)).toBe("ok");
  });
});
