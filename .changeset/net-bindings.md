---
"@virentia/net-react": minor
"@virentia/net-vue": minor
"@virentia/net-core": minor
---

Framework bindings. `@virentia/net-react` and `@virentia/net-vue` add `useQuery`/`useMutation`
(thin sugar over `useUnit`, returning `{ data, error, pending, stale, run/mutate, refetch,
reset }`). `@virentia/net-core` gains an `error` store on query/mutation (latest error per
scope, cleared on success).
