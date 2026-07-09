import { reaction, scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { overrideDefaults, query, retry, type Operator } from "../../lib/index";
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

describe("a default operator applies to every query", () => {
  test("wires its behavior (e.g. retry) into a query with no operators", async () => {
    let attempts = 0;
    const q = query({
      handler: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("x");
        return "ok";
      },
    });
    const revert = overrideDefaults(query, { use: [retry({ times: 3, delay: 0 })] });
    try {
      const app = scope();
      await scoped(app, () => q(undefined));
      expect(attempts).toBe(3);
      expect(readStore(app, q.data)).toBe("ok");
    } finally {
      revert();
    }
  });

  test("stays inside its scope when registered scoped", async () => {
    let aAttempts = 0;
    let bAttempts = 0;
    const q = query({
      handler: async (which: "a" | "b"): Promise<string> => {
        if (which === "a") {
          aAttempts += 1;
          if (aAttempts < 2) throw new Error("x");
          return "ok-a";
        }
        bAttempts += 1;
        throw new Error("x");
      },
    });
    const a = scope();
    const revert = overrideDefaults(query, { use: [retry({ times: 3, delay: 0 })] }, { scope: a });
    try {
      const b = scope();
      await scoped(a, () => q("a"));
      await scoped(b, () => q("b")).catch(() => {});
      expect(aAttempts).toBe(2); // retried in scope a
      expect(bAttempts).toBe(1); // no retry in scope b
    } finally {
      revert();
    }
  });
});

describe("default operators order ahead of instance operators", () => {
  test("a scheduler default wraps an executor instance operator", async () => {
    order = [];
    const revert = overrideDefaults(query, { use: [mark("default-sched", "scheduler")] });
    try {
      const q = query({ handler: async () => "ok", use: [mark("own-exec", "executor")] });
      await scoped(scope(), () => q(undefined));
      expect(order).toEqual([">default-sched", ">own-exec", "<own-exec", "<default-sched"]);
    } finally {
      revert();
    }
  });

  test("within a stage, the default wraps the instance operator", async () => {
    order = [];
    const revert = overrideDefaults(query, { use: [mark("default-exec", "executor")] });
    try {
      const q = query({ handler: async () => "ok", use: [mark("own-exec", "executor")] });
      await scoped(scope(), () => q(undefined));
      expect(order).toEqual([">default-exec", ">own-exec", "<own-exec", "<default-exec"]);
    } finally {
      revert();
    }
  });

  test("stage beats registration: an own scheduler wraps a default executor", async () => {
    order = [];
    const revert = overrideDefaults(query, { use: [mark("default-exec", "executor")] });
    try {
      const q = query({ handler: async () => "ok", use: [mark("own-sched", "scheduler")] });
      await scoped(scope(), () => q(undefined));
      // own scheduler (rank 0) wraps the default executor (rank 1) even though the default is
      // merged first — stage ordering overrides the defaults-first rule.
      expect(order).toEqual([">own-sched", ">default-exec", "<default-exec", "<own-sched"]);
    } finally {
      revert();
    }
  });

  test("global then scoped then instance operators nest in that order", async () => {
    order = [];
    const a = scope();
    const rg = overrideDefaults(query, { use: [mark("global", "scheduler")] });
    const rs = overrideDefaults(query, { use: [mark("scoped", "scheduler")] }, { scope: a });
    try {
      const q = query({ handler: async () => "ok", use: [mark("own", "scheduler")] });
      await scoped(a, () => q(undefined));
      // resolveDefaults: [...global, ...scoped]; mergeChain: [global, scoped, own] (defaults first)
      expect(order).toEqual([">global", ">scoped", ">own", "<own", "<scoped", "<global"]);
    } finally {
      rs();
      rg();
    }
  });

  test("defaults and instance operators interleave per stage across both stages", async () => {
    order = [];
    const revert = overrideDefaults(query, {
      use: [mark("d-sched", "scheduler"), mark("d-exec", "executor")],
    });
    try {
      const q = query({
        handler: async () => "ok",
        use: [mark("i-sched", "scheduler"), mark("i-exec", "executor")],
      });
      await scoped(scope(), () => q(undefined));
      expect(order).toEqual([
        ">d-sched",
        ">i-sched",
        ">d-exec",
        ">i-exec",
        "<i-exec",
        "<d-exec",
        "<i-sched",
        "<d-sched",
      ]);
    } finally {
      revert();
    }
  });
});

describe("a global default operator's setup", () => {
  test("runs once per instance, ahead of the runs", async () => {
    let setupCalls = 0;
    let wrapCalls = 0;
    const op: Operator<any, any> = {
      name: "probe",
      setup() {
        setupCalls += 1;
      },
      wrapHandler(next) {
        return (p, c) => {
          wrapCalls += 1;
          return next(p, c);
        };
      },
    };
    const revert = overrideDefaults(query, { use: [op] });
    try {
      const q = query({ handler: async () => "ok" });
      const app = scope();
      await scoped(app, () => q(undefined));
      await scoped(app, () => q(undefined)); // a second run must NOT re-run setup
      expect(wrapCalls).toBe(2); // middleware ran each time
      expect(setupCalls).toBe(1); // setup ran exactly once
    } finally {
      revert();
    }
  });

  test("wires a reaction on every instance built while it is registered", async () => {
    const seen: string[] = [];
    const op: Operator<any, any> = {
      name: "watch",
      setup({ effect }) {
        reaction({ on: effect.doneData, run: (v) => seen.push(v as string) });
      },
    };
    const revert = overrideDefaults(query, { use: [op] });
    try {
      const q1 = query({ handler: async () => "one" });
      const q2 = query({ handler: async () => "two" });
      const app = scope();
      await scoped(app, () => q1(undefined));
      await scoped(app, () => q2(undefined));
      expect(seen.sort()).toEqual(["one", "two"]); // both instances' setup wired its reaction
    } finally {
      revert();
    }
  });

  describe("KNOWN LIMITATION: registered scoped", () => {
    test("applies its middleware but never runs setup", async () => {
      // Only GLOBAL default setup() runs — a global reaction is correct for every scope. A scoped
      // default's setup() would wire a scope-global reaction (core reactions aren't scope-scoped)
      // that leaks into other scopes, so net intentionally skips it. The wrapHandler still applies.
      let setupCalls = 0;
      let wrapCalls = 0;
      const op: Operator<any, any> = {
        name: "probe",
        setup() {
          setupCalls += 1;
        },
        wrapHandler(next) {
          return (p, c) => {
            wrapCalls += 1;
            return next(p, c);
          };
        },
      };
      const a = scope();
      const revert = overrideDefaults(query, { use: [op] }, { scope: a });
      try {
        const q = query({ handler: async () => "ok" });
        await scoped(a, () => q(undefined));
        expect(wrapCalls).toBe(1); // scoped default middleware DID apply in-scope
        expect(setupCalls).toBe(0); // but its setup() is intentionally skipped
      } finally {
        revert();
      }
    });
  });
});
