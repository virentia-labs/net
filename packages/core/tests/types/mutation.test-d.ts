import type { Store } from "@virentia/core";
import { describe, expectTypeOf, test } from "vitest";

import { mutation, type Mutation } from "../../lib/index";

describe("mutation types", () => {
  test("mirrors query and threads optimistic params from Params", () => {
    const m = mutation({
      handler: async (name: string) => `added:${name}`,
      optimistic: {
        update: (name) => expectTypeOf(name).toEqualTypeOf<string>(),
        rollback: (name) => expectTypeOf(name).toEqualTypeOf<string>(),
      },
    });
    expectTypeOf(m).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(m.data).toEqualTypeOf<Store<string | null>>();
    expectTypeOf(m).toEqualTypeOf<Mutation<string, string, unknown>>();
  });
});
