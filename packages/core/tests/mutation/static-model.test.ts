import { scope, scoped, store } from "@virentia/core";
import { staticModel } from "@virentia/core/models";
import { expect, it } from "vitest";
import { mutation, query } from "../../lib";

it("keeps mutation invalidation, optimistic rollback and reused identities in their model scope", async () => {
  const calls: string[] = [], failure = new Error("save failed");
  const Editor = staticModel({ setup() {
    const label = store("");
    const load = query({ handler: async (id: string) => { calls.push(id); return id; } });
    const save = mutation({
      handler: async (name: string) => { if (name === "fail") throw failure; return name; },
      invalidates: [load],
      optimistic: {
        update(name) { label.value = name; },
        rollback() { label.value = "rolled back"; },
      },
    });
    return { label, load, save };
  } });
  const app = scope(), [a, b] = scoped(app, () => Editor.create([{ id: "a" }, { id: "b" }]));
  try {
    await a.load("a"); await b.load("b");
    await a.save("saved");
    expect(calls).toEqual(["a", "b", "a"]);
    expect([a.label.value, b.label.value]).toEqual(["saved", ""]);
    await expect(b.save("fail")).rejects.toBe(failure);
    expect([a.label.value, b.label.value]).toEqual(["saved", "rolled back"]);
    expect([a.save.error.value, b.save.error.value]).toEqual([null, failure]);
    expect(calls).toEqual(["a", "b", "a"]);
    await a.dispose();
    const fresh = scoped(app, () => Editor.create({ id: "a" }));
    try {
      expect(fresh.load.data.value).toBeNull();
      expect(fresh.save.error.value).toBeNull();
      expect(fresh.label.value).toBe("");
      await b.save("still live");
      expect(calls).toEqual(["a", "b", "a", "b"]);
      expect(fresh.load.data.value).toBeNull();
    } finally { await fresh.dispose(); }
  } finally { await a.dispose(); await b.dispose(); }
});
