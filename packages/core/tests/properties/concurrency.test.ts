import { scope, scoped } from "@virentia/core";
import { describe, expect, test } from "vitest";

import { concurrency, query } from "../../lib/index";
import { harness } from "../support/harness";
import { prng } from "../support/prng";
import { readStore } from "../support/runtime";

describe("takeLatest supersession (property)", () => {
  test("keeps exactly the last of a single-lane burst, over 100 seeds", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = prng(seed);
      const n = rng.int(2, 6);
      const params = Array.from({ length: n }, (_, i) => `p${i}`);
      const h = harness<string>();
      const q = query({ handler: h.handler, use: [concurrency({ strategy: "takeLatest" })] });
      const app = scope();
      const promises: Promise<unknown>[] = [];
      scoped(app, () => {
        for (const p of params) promises.push(q(p));
      });

      // Every call but the last is superseded → aborted.
      for (let i = 0; i < n - 1; i++) {
        await expect(promises[i], `seed ${seed} idx ${i}`).rejects.toThrow(`aborted:${params[i]}`);
      }
      h.resolve(params[n - 1], "LAST");
      await promises[n - 1];

      expect(h.started, `seed ${seed} started`).toEqual(params); // all began
      expect(h.settled, `seed ${seed} settled`).toEqual([params[n - 1]]); // only the last settled
      expect(readStore(app, q.data), `seed ${seed} data`).toBe("LAST");
    }
  });
});

describe("per-key lanes (property)", () => {
  test("supersede within a key, never across keys, over 80 seeds", async () => {
    for (let seed = 1; seed <= 80; seed++) {
      const rng = prng(seed);
      const laneCount = rng.int(2, 4);
      // Build a call list of {lane, id}; each lane gets 1..3 calls.
      const calls: Array<{ lane: number; id: string }> = [];
      for (let lane = 0; lane < laneCount; lane++) {
        const c = rng.int(1, 3);
        for (let k = 0; k < c; k++) calls.push({ lane, id: `L${lane}_${k}` });
      }

      const h = harness<string>();
      const q = query({
        handler: h.handler,
        use: [concurrency({ strategy: "takeLatest", key: (id: string) => id.split("_")[0] })],
      });
      const app = scope();
      const byId = new Map<string, Promise<unknown>>();
      scoped(app, () => {
        for (const { id } of calls) {
          const p = q(id);
          p.catch(() => {}); // superseded calls reject; keep them from floating
          byId.set(id, p);
        }
      });

      // The survivor of each lane is its LAST call; earlier calls in a lane were superseded.
      for (let lane = 0; lane < laneCount; lane++) {
        const laneIds = calls.filter((c) => c.lane === lane).map((c) => c.id);
        const survivor = laneIds[laneIds.length - 1];
        for (const id of laneIds.slice(0, -1)) {
          await expect(byId.get(id)!, `seed ${seed} ${id}`).rejects.toThrow(`aborted:${id}`);
        }
        h.resolve(survivor, survivor);
        await byId.get(survivor);
      }

      // Every lane's survivor settled; every non-survivor was aborted (never a cross-lane abort).
      const survivors = Array.from({ length: laneCount }, (_, lane) => {
        const laneIds = calls.filter((c) => c.lane === lane).map((c) => c.id);
        return laneIds[laneIds.length - 1];
      });
      expect(h.settled.slice().sort(), `seed ${seed} settled`).toEqual(survivors.slice().sort());
    }
  });
});
