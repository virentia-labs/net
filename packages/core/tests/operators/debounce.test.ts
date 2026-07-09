import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { debounce, query } from "../../lib/index";
import { tick } from "../support/runtime";

describe("debounce", () => {
  describe("without concurrency", () => {
    test("runs every call after its own wait", async () => {
      const started: string[] = [];
      const q = query({
        handler: async (x: string) => {
          started.push(x);
          return x;
        },
        use: [debounce({ wait: 0 })],
      });
      const app = scope();
      scoped(app, () => {
        q("a").catch(() => {});
        q("b").catch(() => {});
      });
      await tick();
      expect(started.sort()).toEqual(["a", "b"]);
    });
  });

  describe("config forms", () => {
    test("accepts a bare number as the wait", async () => {
      const num: string[] = [];
      const a = query({
        handler: async (x: string) => {
          num.push(x);
          return x;
        },
        use: [debounce(0)],
      });
      await scoped(scope(), () => a("x"));
      expect(num).toEqual(["x"]);
    });

    test("accepts a { wait } config", async () => {
      const obj: string[] = [];
      const b = query({
        handler: async (x: string) => {
          obj.push(x);
          return x;
        },
        use: [debounce({ wait: 0 })],
      });
      await scoped(scope(), () => b("y"));
      expect(obj).toEqual(["y"]);
    });
  });
});
