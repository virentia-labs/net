# @virentia/net-react

## 0.1.1

### Patch Changes

- fix: bump virentia
- Updated dependencies
  - @virentia/net-core@0.1.1

## 0.1.0

### Minor Changes

- fb00108: Framework bindings. `@virentia/net-react` and `@virentia/net-vue` add `useQuery`/`useMutation`
  (thin sugar over `useUnit`, returning `{ data, error, pending, stale, run/mutate, refetch,
reset }`). `@virentia/net-core` gains an `error` store on query/mutation (latest error per
  scope, cleared on success).

### Patch Changes

- Updated dependencies [fb00108]
- Updated dependencies [fb00108]
  - @virentia/net-core@0.1.0
