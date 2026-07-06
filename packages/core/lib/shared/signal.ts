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
