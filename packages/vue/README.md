# @virentia/net-vue

Vue 3 bindings for [`@virentia/net-core`](https://movpushmov.dev/net/). Mirrors
`@virentia/net-react`; stores come back as refs.

## Install

```sh
pnpm add @virentia/net-vue @virentia/net-core @virentia/vue @virentia/core vue
```

## Usage

```vue
<script setup lang="ts">
import { useQuery } from "@virentia/net-vue";
const { data, error, pending, run } = useQuery(userQuery);
</script>

<template>
  <Spinner v-if="pending" />
  <Profile v-else :user="data" />
</template>
```

`useQuery(query)` → `{ data, error, pending, stale }` refs + `run`/`refetch`/`reset`.
`useMutation(mutation)` → `{ data, error, pending }` refs + `mutate`/`reset`.
Provide a scope from an ancestor with `ScopeProvider` / `provideScope` (re-exported).

## License

MIT © 2026 movpushmov
