import { event, scope, scoped } from "@virentia/core";
import { staticModel } from "@virentia/core/models";
import { withUnitDeclarationTracker } from "@virentia/core/internal";
import { expect, it } from "vitest";
import { query, trigger } from "../../lib";
import { reasonHarness } from "../support/harness";

it("declares a trigger once and routes it to independent staticModel instances", async () => {
  let setups = 0;
  const calls: string[] = [];
  const Search = staticModel({
    setup() {
      setups++;
      const changed = event<string>();
      const load = query({ handler: async (id: string) => {
        calls.push(id);
        return `result:${id}`;
      } });
      trigger(load, { on: changed });
      return { changed, data: load.data };
    },
  });
  const app = scope(), other = scope();
  const a = scoped(app, () => Search.create({ id: "same" }));
  const b = scoped(app, () => Search.create({ id: "sibling" }));
  const c = scoped(other, () => Search.create({ id: "same" }));
  try {
    expect(setups).toBe(1);
    expect(a.changed.node).toBe(b.changed.node);
    await a.changed("a");
    await b.changed("b");
    await c.changed("c");
    expect(calls).toEqual(["a", "b", "c"]);
    expect([a.data.value, b.data.value, c.data.value]).toEqual(["result:a", "result:b", "result:c"]);

    await a.dispose();
    await b.changed("live");
    expect(calls).toEqual(["a", "b", "c", "live"]);
    expect(c.data.value).toBe("result:c");
    const reused = scoped(app, () => Search.create({ id: "same" }));
    try {
      expect(reused.data.value).toBeNull();
      await reused.changed("fresh");
      expect(reused.data.value).toBe("result:fresh");
      expect(b.data.value).toBe("result:live");
    } finally { await reused.dispose(); }
  } finally {
    await a.dispose(); await b.dispose(); await c.dispose();
  }
});

it("aborts a disposed staticModel request while a sibling request keeps running", async () => {
  const h = reasonHarness<"a" | "b">();
  const Loader = staticModel({
    setup() {
      const load = query({ handler: h.handler });
      return { load };
    },
  });
  const [a, b] = scoped(scope(), () => Loader.create([{ id: "a" }, { id: "b" }]));
  const failed = a.load("a").catch(error => error);
  const completed = b.load("b");
  try {
    expect([a.load.pending.value, b.load.pending.value]).toEqual([true, true]);
    await a.dispose();
    expect(h.aborted.map(call => call.param)).toEqual(["a"]);
    expect(await failed).toBe(h.aborted[0].reason);
    expect(b.load.pending.value).toBe(true);
    h.resolve("b", "done");
    expect(await completed).toBe("done");
    expect(b.load.data.value).toBe("done");
    expect(b.load.pending.value).toBe(false);
  } finally {
    h.resolve("a"); h.resolve("b");
    await a.dispose(); await b.dispose();
    await Promise.allSettled([failed, completed]);
  }
});

it("keeps query data, reset and refresh bound without flattening the API", async () => {
  const calls: string[] = [];
  const Search = staticModel({ setup() {
    return { load: query({ handler: async (value: string) => { calls.push(value); return value.toUpperCase(); } }) };
  } });
  const counts: string[] = [], app = scope();
  const [a, b] = withUnitDeclarationTracker(kind => counts.push(kind), () => scoped(app, () => Search.create([{}, {}])));
  try {
    expect(counts).toEqual([]);
    expect(a.load.node).toBe(b.load.node);
    expect(a.load.data.node).toBe(b.load.data.node);
    expect(await a.load("first")).toBe("FIRST");
    expect(await b.load("second")).toBe("SECOND");
    await a.load.refresh();
    expect(calls).toEqual(["first", "second", "first"]);
    await a.load.reset();
    expect([a.load.data.value, b.load.data.value]).toEqual([null, "SECOND"]);
    expect([a.load.error.value, b.load.error.value]).toEqual([null, null]);
    await a.load.refresh();
    expect(calls).toHaveLength(3);
  } finally { await a.dispose(); await b.dispose(); }
});
