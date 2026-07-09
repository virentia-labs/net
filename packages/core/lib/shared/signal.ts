// A rejection produced by an aborted AbortSignal (a native `fetch` abort, `effect.abort()`,
// `reset()`) — i.e. a cancellation, not a real error. Deliberately does NOT match a
// `TimeoutError` (name "TimeoutError"), which is a genuine deadline breach callers want to see.
export function isAbortReason(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { name?: unknown }).name === "AbortError"
  );
}

// Create a child controller that aborts when the parent signal aborts. Used by operators
// that need to cancel an individual run (e.g. takeLatest) without touching the effect's
// global abort.
export function childController(parent: AbortSignal): AbortController {
  const controller = new AbortController();

  if (parent.aborted) {
    controller.abort(parent.reason);
    return controller;
  }

  const onAbort = () => controller.abort(parent.reason);
  parent.addEventListener("abort", onAbort, { once: true });

  return controller;
}

// Reject as soon as `signal` aborts, regardless of whether `promise` settles first. Mirrors the
// core effect's own force-cancel (Promise.race([handler, waitForAbort])) so a scoped reset() can
// discard an in-flight run's result even when the handler ignores its signal.
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });

    const detach = (): void => signal.removeEventListener("abort", onAbort);
    promise.then(
      (value) => {
        detach();
        resolve(value);
      },
      (error) => {
        detach();
        reject(error);
      },
    );
  });
}
