// A deterministic seeded PRNG (mulberry32) for property tests. No unseeded Math.random, so a
// failure reproduces from its seed — pass the seed as the assertion message.
export function prng(seed: number) {
  let s = seed >>> 0;

  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    // Inclusive integer in [lo, hi].
    int: (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
  };
}
