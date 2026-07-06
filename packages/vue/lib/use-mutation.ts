import { useUnit } from "@virentia/vue";
import type { Mutation } from "@virentia/net-core";
import type { Ref } from "vue";

export interface UseMutationResult<Raw, Data, Err> {
  data: Readonly<Ref<Data | null>>;
  error: Readonly<Ref<Err | null>>;
  pending: Readonly<Ref<boolean>>;
  mutate: (params: Raw) => Promise<Data>;
  reset: () => Promise<void>;
}

// Read a mutation's state as refs and get a scope-bound `mutate`.
export function useMutation<Raw, Data, Err>(
  mutation: Mutation<Raw, Data, Err>,
): UseMutationResult<Raw, Data, Err> {
  return useUnit({
    data: mutation.data,
    error: mutation.error,
    pending: mutation.pending,
    mutate: mutation,
    reset: mutation.reset,
  }) as unknown as UseMutationResult<Raw, Data, Err>;
}
