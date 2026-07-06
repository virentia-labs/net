import { useUnit } from "@virentia/react";
import type { Mutation } from "@virentia/net-core";

export interface UseMutationResult<Raw, Data, Err> {
  data: Data | null;
  error: Err | null;
  pending: boolean;
  mutate: (params: Raw) => Promise<Data>;
  reset: () => Promise<void>;
}

// Read a mutation's state and get a scope-bound `mutate`. Like useQuery, thin sugar over
// `useUnit` — a mutation is a Virentia effect.
export function useMutation<Raw, Data, Err>(
  mutation: Mutation<Raw, Data, Err>,
): UseMutationResult<Raw, Data, Err> {
  return useUnit({
    data: mutation.data,
    error: mutation.error,
    pending: mutation.pending,
    mutate: mutation,
    reset: mutation.reset,
  }) as UseMutationResult<Raw, Data, Err>;
}
