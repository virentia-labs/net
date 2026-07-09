import { event, scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query, trigger } from "../../lib/index";
import { readStore } from "../support/runtime";

describe("a trigger across scopes", () => {
  test("runs the query only in the firing scope", async () => {
    const opened = event<string>();
    const q = query({ handler: async (id: string) => id });
    trigger(q, { on: opened });
    const a = scope();
    const b = scope();
    await scoped(a, () => opened("in-a"));
    expect(readStore(a, q.data)).toBe("in-a");
    expect(readStore(b, q.data)).toBeNull();
  });
});
