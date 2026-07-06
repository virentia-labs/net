export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

// A handler harness: records started/settled params and lets a test release each call
// (by param) or observe abort. Gates are created lazily on first call for a param.
export function harness<P extends string>() {
  const gates = new Map<P, Deferred<unknown>>();
  const started: P[] = [];
  const settled: P[] = [];

  const gate = (p: P): Deferred<unknown> => {
    let d = gates.get(p);

    if (!d) {
      d = defer<unknown>();
      gates.set(p, d);
    }

    return d;
  };

  const handler = async (p: P, ctx: { signal: AbortSignal }): Promise<unknown> => {
    started.push(p);
    const d = gate(p);
    const onAbort = () => d.reject(new Error(`aborted:${p}`));

    if (ctx.signal.aborted) {
      onAbort();
    } else {
      ctx.signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const value = await d.promise;
      settled.push(p);
      return value;
    } finally {
      ctx.signal.removeEventListener("abort", onAbort);
    }
  };

  return {
    handler,
    started,
    settled,
    resolve: (p: P, value: unknown = p) => gate(p).resolve(value),
    reject: (p: P, error: unknown = new Error(`fail:${p}`)) => gate(p).reject(error),
  };
}
