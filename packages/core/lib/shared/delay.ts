// A cancellable delay: resolves after `ms`, rejects if the signal aborts first.
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return signal.aborted ? Promise.reject(abortReason(signal)) : Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortReason(signal));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Aborted");
}
