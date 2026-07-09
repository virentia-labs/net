import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { query, retry } from "../../lib/index";
import { collect, readStore } from "../support/runtime";

describe("retry attempts", () => {
  test("retries a failing handler until it succeeds", async () => {
    let attempts = 0;
    const q = query({
      handler: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error(`attempt ${attempts}`);
        return "ok";
      },
      use: [retry({ times: 3, delay: 0 })],
    });
    const app = scope();
    await scoped(app, () => q(undefined));
    expect(attempts).toBe(3);
    expect(readStore(app, q.data)).toBe("ok");
  });

  test("surfaces the last error after exhausting retries", async () => {
    let attempts = 0;
    const q = query({
      handler: async (): Promise<string> => {
        attempts += 1;
        throw new Error(`fail ${attempts}`);
      },
      use: [retry({ times: 2, delay: 0 })],
    });
    const errors = collect(q.failData);
    const app = scope();
    await scoped(app, () => q(undefined)).catch(() => {});
    expect(attempts).toBe(3); // 1 initial + 2 retries
    expect((errors[0] as Error).message).toBe("fail 3");
  });

  test("never retries a first-attempt success", async () => {
    let attempts = 0;
    const q = query({
      handler: async () => {
        attempts += 1;
        return "ok";
      },
      use: [retry({ times: 3, delay: 0 })],
    });
    await scoped(scope(), () => q(undefined));
    expect(attempts).toBe(1);
  });

  test("fires started once across all retries", async () => {
    let attempts = 0;
    const q = query({
      handler: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("x");
        return "ok";
      },
      use: [retry({ times: 3, delay: 0 })],
    });
    const starts = collect(q.started);
    await scoped(scope(), () => q(undefined));
    expect(attempts).toBe(3);
    expect(starts.length).toBe(1);
  });

  describe("with times zero", () => {
    test("runs a single attempt", async () => {
      let attempts = 0;
      const q = query({
        handler: async (): Promise<string> => {
          attempts += 1;
          throw new Error("x");
        },
        use: [retry({ times: 0, delay: 0 })],
      });
      await scoped(scope(), () => q(undefined)).catch(() => {});
      expect(attempts).toBe(1);
    });
  });

  describe("with times omitted", () => {
    test("defaults to three retries", async () => {
      let attempts = 0;
      const q = query({
        handler: async (): Promise<string> => {
          attempts += 1;
          throw new Error("x");
        },
        use: [retry({ delay: 0 })],
      });
      await scoped(scope(), () => q(undefined)).catch(() => {});
      expect(attempts).toBe(4); // 1 + 3 default retries
    });
  });

  describe("with delay omitted", () => {
    test("still retries", async () => {
      let attempts = 0;
      const q = query({
        handler: async () => {
          attempts += 1;
          if (attempts < 3) throw new Error("x");
          return "ok";
        },
        use: [retry({ times: 3 })], // no delay specified
      });
      await scoped(scope(), () => q(undefined));
      expect(attempts).toBe(3);
    });
  });
});
