export type SkipReason = "cache-hit" | "barrier" | "concurrency";

// A run that was intentionally not executed (barrier closed, superseded by a newer
// takeLatest run, …). It travels the effect's failure path, but callers can tell it
// apart from a real error with `isSkip`.
export class SkipSignal extends Error {
  readonly isNetSkip = true;

  constructor(readonly reason: SkipReason) {
    super(`net: run skipped (${reason})`);
    this.name = "SkipSignal";
  }
}

export function isSkip(value: unknown): value is SkipSignal {
  return typeof value === "object" && value !== null && (value as SkipSignal).isNetSkip === true;
}
