import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query } from "../../lib/index";
import { readStore } from "../support/runtime";

describe("query params", () => {
  describe("with a params mapper", () => {
    test("feeds the mapped shape to the handler", async () => {
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
      expect(readStore(app, q.data)).toBe("7");
    });

    test("runs before the handler", async () => {
      const order: string[] = [];
      const q = query({
        params: (raw: string) => {
          order.push(`map:${raw}`);
          return raw.toUpperCase();
        },
        handler: async (p: string) => {
          order.push(`handle:${p}`);
          return p;
        },
      });
      const app = scope();
      await scoped(app, () => q("a"));
      expect(order).toEqual(["map:a", "handle:A"]);
    });
  });

  describe("without a params mapper", () => {
    test("passes raw input to the handler unchanged", async () => {
      const seen: number[] = [];
      const q = query({
        handler: async (n: number) => {
          seen.push(n);
          return n * 2;
        },
      });
      const app = scope();
      await scoped(app, () => q(21));
      expect(seen).toEqual([21]);
      expect(readStore(app, q.data)).toBe(42);
    });
  });
});
