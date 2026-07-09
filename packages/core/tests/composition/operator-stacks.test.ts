import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, debounce, fallback, query, retry, tap, timeout } from "../../lib/index";
import { defer, harness } from "../support/harness";
import { collect, microtask, readStore, tick } from "../support/runtime";

describe("timeout + retry", () => {
  test("[timeout, retry] shares one deadline across all attempts", async () => {
    let attempts = 0;
    const gate = defer<string>(); // never resolves
    const q = query({
      handler: () => {
        attempts += 1;
        return gate.promise;
      },
      use: [timeout(20), retry({ times: 5, delay: 0 })],
    });
    const errors = collect(q.failData);
    await scoped(scope(), () => q(undefined)).catch(() => {});
    expect(attempts).toBe(1); // deadline fired once, wrapping the whole retry loop
    expect((errors[0] as Error).name).toBe("TimeoutError");
  });

  test("[retry, timeout] gives each attempt its own deadline", async () => {
    let attempts = 0;
    const gate = defer<string>(); // never resolves
    const q = query({
      handler: () => {
        attempts += 1;
        return gate.promise;
      },
      use: [retry({ times: 2, delay: 0 }), timeout(20)],
    });
    await scoped(scope(), () => q(undefined)).catch(() => {});
    expect(attempts).toBe(3); // 1 + 2 retries, each timing out on its own deadline
  });
});

describe("fallback + retry", () => {
  test("[fallback, retry] recovers only after retries are exhausted", async () => {
    let attempts = 0;
    const q = query({
      handler: async (): Promise<string> => {
        attempts += 1;
        throw new Error("nope");
      },
      use: [fallback("fb"), retry({ times: 2, delay: 0 })],
    });
    const app = scope();
    await scoped(app, () => q(undefined));
    expect(attempts).toBe(3);
    expect(readStore(app, q.data)).toBe("fb");
  });

  test("[retry, fallback] recovers the first failure before retry fires", async () => {
    let attempts = 0;
    const q = query({
      handler: async (): Promise<string> => {
        attempts += 1;
        throw new Error("x");
      },
      use: [retry({ times: 3, delay: 0 }), fallback("fb")],
    });
    const app = scope();
    await scoped(app, () => q(undefined));
    expect(attempts).toBe(1); // fallback made the first attempt "succeed"
    expect(readStore(app, q.data)).toBe("fb");
  });
});

describe("concurrency + debounce", () => {
  test("[concurrency, debounce] runs only the last call of a burst", async () => {
    const started: string[] = [];
    const q = query({
      handler: async (text: string) => {
        started.push(text);
        return text;
      },
      use: [concurrency({ strategy: "takeLatest" }), debounce({ wait: 20 })],
    });
    const app = scope();
    scoped(app, () => {
      q("a").catch(() => {});
      q("b").catch(() => {});
      q("c").catch(() => {});
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(started).toEqual(["c"]);
    expect(readStore(app, q.data)).toBe("c");
  });

  test("[debounce, concurrency] starts every run before deduping", async () => {
    // Reversed order: every run finishes its independent wait and reaches the handler; only
    // then does concurrency dedup, so superseded handlers DO start (and are aborted after).
    const h = harness<"a" | "b" | "c">();
    const q = query({
      handler: h.handler,
      use: [debounce({ wait: 20 }), concurrency({ strategy: "takeLatest" })],
    });
    const app = scope();
    scoped(app, () => {
      q("a").catch(() => {});
      q("b").catch(() => {});
      q("c").catch(() => {});
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(h.started).toEqual(["a", "b", "c"]);
  });
});

describe("concurrency + retry", () => {
  test("retries under an outer concurrency operator", async () => {
    let attempts = 0;
    const q = query({
      handler: async () => {
        attempts += 1;
        if (attempts < 2) throw new Error("retry me");
        return "done";
      },
      use: [concurrency({ strategy: "takeLatest" }), retry({ times: 3, delay: 0 })],
    });
    const app = scope();
    await scoped(app, () => q(undefined));
    expect(attempts).toBe(2);
    expect(readStore(app, q.data)).toBe("done");
  });

  test("aborts a run mid-retry-backoff on supersede", async () => {
    let aAttempts = 0;
    const gate = { d: defer<string>() };
    const q = query({
      handler: async (id: string) => {
        if (id === "a") {
          aAttempts += 1;
          throw new Error("a-fails"); // fail → retry enters a 1000ms backoff
        }
        return gate.d.promise;
      },
      use: [concurrency({ strategy: "takeLatest" }), retry({ times: 5, delay: 1000 })],
    });
    const app = scope();
    let pa!: Promise<unknown>;
    scoped(app, () => {
      pa = q("a");
    });
    await microtask(); // let "a" fail once and settle into the backoff delay
    expect(aAttempts).toBe(1);
    scoped(app, () => q("b").catch(() => {})); // supersede → abort a's controller → backoff delay rejects
    await pa.catch(() => {});
    expect(aAttempts).toBe(1); // did NOT run its 5 retries
    gate.d.resolve("b");
  });

  test("stops retrying on abort with delay zero", async () => {
    // A superseded run is aborted; with delay 0 there is no backoff to reject, so ONLY retry's
    // `ctx.signal.aborted` check can stop it. Without that check it would run all 5 retries.
    let aAttempts = 0;
    const gate = defer<string>();
    const q = query({
      handler: async (id: string) => {
        if (id === "a") {
          aAttempts += 1;
          throw new Error("x");
        }
        return gate.promise;
      },
      use: [concurrency({ strategy: "takeLatest" }), retry({ times: 5, delay: 0 })],
    });
    const app = scope();
    scoped(app, () => {
      q("a").catch(() => {}); // fails, would retry immediately (delay 0) unless aborted
      q("b").catch(() => {}); // supersedes → aborts a's signal
    });
    await tick();
    expect(aAttempts).toBe(1); // the aborted check stopped it after one attempt
    gate.resolve("b");
  });
});

describe("tap + retry", () => {
  test("[tap, retry] reports start, error, settled once around the retry loop", async () => {
    let attempts = 0;
    const events: string[] = [];
    const q = query({
      handler: async (): Promise<string> => {
        attempts += 1;
        throw new Error("x");
      },
      use: [
        tap({
          onStart: () => events.push("start"),
          onError: () => events.push("error"),
          onSettled: () => events.push("settled"),
        }),
        retry({ times: 2, delay: 0 }),
      ],
    });
    await scoped(scope(), () => q(undefined)).catch(() => {});
    expect(attempts).toBe(3);
    expect(events).toEqual(["start", "error", "settled"]);
  });
});
