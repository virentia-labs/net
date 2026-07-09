import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query, type Operator, type OperatorStage } from "../../lib/index";
import { prng } from "../support/prng";

// Reference model: net stage-sorts the chain (scheduler=0, executor=1, stageless→executor) with a
// STABLE sort, then composes so the first operator of a stage is the outermost wrapper.
const stageRank = (stage: OperatorStage | undefined): number => (stage === "scheduler" ? 0 : 1);

function expectedOrder(specs: Array<{ name: string; stage?: OperatorStage }>): string[] {
  const sorted = specs
    .map((spec, index) => ({ ...spec, index }))
    .sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || a.index - b.index);
  const enter = sorted.map((s) => `>${s.name}`);
  const exit = [...sorted].reverse().map((s) => `<${s.name}`);
  return [...enter, ...exit];
}

const STAGES: Array<OperatorStage | undefined> = ["scheduler", "executor", undefined];

describe("the middleware onion (property)", () => {
  test("nests any operator list by a stable stage sort, over 200 seeds", async () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = prng(seed);
      const n = rng.int(1, 6);
      const specs = Array.from({ length: n }, (_, i) => ({
        name: `op${i}`,
        stage: rng.pick(STAGES),
      }));

      const order: string[] = [];
      const use: Operator<any, any>[] = specs.map((spec) => ({
        name: spec.name,
        stage: spec.stage,
        wrapHandler(next) {
          return async (p, c) => {
            order.push(`>${spec.name}`);
            const r = await next(p, c);
            order.push(`<${spec.name}`);
            return r;
          };
        },
      }));

      const q = query({ handler: async () => "ok", use });
      await scoped(scope(), () => q(undefined));
      expect(order, `seed ${seed}`).toEqual(expectedOrder(specs));
    }
  });
});
