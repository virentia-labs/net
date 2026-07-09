import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { overrideDefaults, query, retry, type Executor } from "../../lib/index";
import { readStore } from "../support/runtime";

describe("a default executor", () => {
  describe("global", () => {
    test("fills in for a query with no executor", async () => {
      const q = query({ handler: async () => "real" });
      const revert = overrideDefaults(query, { executor: async () => "global" });
      try {
        const app = scope();
        await scoped(app, () => q(undefined));
        expect(readStore(app, q.data)).toBe("global");
      } finally {
        revert();
      }
    });
  });

  describe("scoped", () => {
    test("overrides the global only inside its scope", async () => {
      const q = query({ handler: async () => "real" });
      const revertGlobal = overrideDefaults(query, { executor: async () => "global" });
      const a = scope();
      const revertScoped = overrideDefaults(query, { executor: async () => "scoped" }, { scope: a });
      try {
        const b = scope();
        await scoped(a, () => q(undefined));
        await scoped(b, () => q(undefined));
        expect(readStore(a, q.data)).toBe("scoped"); // scoped wins in a
        expect(readStore(b, q.data)).toBe("global"); // global elsewhere
      } finally {
        revertScoped();
        revertGlobal();
      }
    });
  });

  test("is outranked by the query's own executor", async () => {
    const own: Executor<any, any> = async () => "own";
    const q = query({ handler: async () => "real", executor: own });
    const a = scope();
    const revertGlobal = overrideDefaults(query, { executor: async () => "global" });
    const revertScoped = overrideDefaults(query, { executor: async () => "scoped" }, { scope: a });
    try {
      await scoped(a, () => q(undefined));
      expect(readStore(a, q.data)).toBe("own");
    } finally {
      revertScoped();
      revertGlobal();
    }
  });

  test("runs under a scoped default operator (a scoped retry re-runs it)", async () => {
    let calls = 0;
    const globalExec = async () => {
      calls += 1;
      if (calls < 2) throw new Error("transient");
      return `global:${calls}`;
    };
    const q = query({ handler: async () => "real" });
    const a = scope();
    const rg = overrideDefaults(query, { executor: globalExec });
    const rs = overrideDefaults(query, { use: [retry({ times: 3, delay: 0 })] }, { scope: a });
    try {
      await scoped(a, () => q(undefined));
      expect(calls).toBe(2); // scoped retry re-ran the global executor
      expect(readStore(a, q.data)).toBe("global:2"); // global executor's result
    } finally {
      rs();
      rg();
    }
  });
});
