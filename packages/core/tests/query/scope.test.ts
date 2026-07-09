import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query } from "../../lib/index";
import { readStore } from "../support/runtime";

describe("separate scopes", () => {
  test("keep independent data and error", async () => {
    let mode: "ok" | "fail" = "ok";
    const q = query({
      handler: async (id: string): Promise<string> => {
        if (mode === "fail") throw new Error(`fail:${id}`);
        return id;
      },
    });
    const a = scope();
    const b = scope();
    await scoped(a, () => q("a"));
    mode = "fail";
    await scoped(b, () => q("b")).catch(() => {});

    expect(readStore(a, q.data)).toBe("a");
    expect(readStore(a, q.error)).toBeNull();
    expect(readStore(b, q.data)).toBeNull();
    expect((readStore(b, q.error) as Error).message).toBe("fail:b");
  });
});
