import { reaction, scoped, type Event, type Scope } from "@virentia/core";

// Flush pending macrotasks (setTimeout(0)) — lets queued/settled promises drain.
export const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// Flush a few microtask turns without yielding to the macrotask queue.
export const microtask = async (turns = 3): Promise<void> => {
  for (let i = 0; i < turns; i++) await Promise.resolve();
};

// Collect every payload an event emits (across all scopes) into an array.
export function collect<T>(unit: Event<T>): T[] {
  const seen: T[] = [];
  reaction({ on: unit, run: (value: T) => void seen.push(value) });
  return seen;
}

// Read a per-scope store's value inside a scope, without the scoped(() => store.value) noise.
export function readStore<T>(scope: Scope, store: { readonly value: T }): T {
  return scoped(scope, () => store.value);
}
