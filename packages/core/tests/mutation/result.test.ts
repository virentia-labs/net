import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { mutation } from "../../lib/index";
import { readStore } from "../support/runtime";

describe("a mutation run", () => {
  test("exposes the handler result on data", async () => {
    const add = mutation({ handler: async (name: string) => `added:${name}` });
    const app = scope();
    await scoped(app, () => add("milk"));
    expect(readStore(app, add.data)).toBe("added:milk");
  });

  test("feeds params-mapped input to the handler", async () => {
    const seen: Array<{ name: string }> = [];
    const add = mutation({
      params: (raw: string) => ({ name: raw }),
      handler: async (p: { name: string }) => {
        seen.push(p);
        return p.name;
      },
    });
    await scoped(scope(), () => add("eggs"));
    expect(seen).toEqual([{ name: "eggs" }]);
  });

  test("puts a thrown error on the error store", async () => {
    const add = mutation({
      handler: async (): Promise<string> => {
        throw new Error("server rejected");
      },
    });
    const app = scope();
    await scoped(app, () => add(undefined)).catch(() => {});
    expect((readStore(app, add.error) as Error).message).toBe("server rejected");
  });
});
