import { getOwner, onCleanup, reaction, type AnyUnit, type Reaction } from "@virentia/core";

import type { NetEffect } from "../query/internals";

// `on` is intentionally any Virentia unit (or list); reaction's overloads are keyed on
// concrete unit types, so we go through a permissive signature at this adapter seam.
const bindReaction = reaction as (config: {
  on: AnyUnit | readonly AnyUnit[];
  run: (payload: unknown) => void;
}) => Reaction;

export interface TriggerBinding<Raw> {
  // Any Virentia unit whose firing should run the query/mutation.
  on: AnyUnit | readonly AnyUnit[];
  // Map the trigger payload into the run's input. Omit to forward the payload as-is;
  // a zero-arg mapper may instead read reactive stores (e.g. () => ({ id: route.params.id })).
  params?: (payload: any) => Raw;
  // Optional guard: run only when it returns true.
  filter?: (payload: any) => boolean;
}

export type Unsubscribe = () => void;

// Bind a trigger to a query/mutation: when `on` fires, call the effect with mapped params.
// Composable — attach as many as needed. Auto-cleans up when created inside an owner.
export function trigger<Raw>(
  target: NetEffect<Raw, any, any>,
  binding: TriggerBinding<Raw>,
): Unsubscribe {
  const map = binding.params ?? ((payload: any) => payload as Raw);

  const r = bindReaction({
    on: binding.on,
    run: (payload: unknown) => {
      if (binding.filter && !binding.filter(payload)) {
        return;
      }

      // Fire-and-forget: a run may reject (skip / superseded by takeLatest / abort). Errors
      // still surface on the effect's failData; swallow the floating promise so a skipped run
      // doesn't become an unhandled rejection.
      target(map(payload)).catch(noop);
    },
  });

  const stop = () => r.stop();

  if (getOwner()) {
    onCleanup(stop);
  }

  return stop;
}

function noop(): void {}
