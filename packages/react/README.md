# @virentia/net-react

React bindings for [`@virentia/net-core`](https://movpushmov.dev/net/). A net query is a
Virentia effect, so these hooks are thin sugar over `@virentia/react`'s `useUnit`.

## Install

```sh
pnpm add @virentia/net-react @virentia/net-core @virentia/react @virentia/core react
```

## Usage

```tsx
import { ScopeProvider, useQuery, useMutation } from "@virentia/net-react";

function User({ id }: { id: string }) {
  const { data, error, pending, run } = useQuery(userQuery);
  useEffect(() => { run({ id }); }, [id]);
  if (pending) return <Spinner />;
  if (error) return <ErrorView />;
  return <Profile user={data} />;
}
```

`useQuery(query)` → `{ data, error, pending, stale, run, refetch, reset }`.
`useMutation(mutation)` → `{ data, error, pending, mutate, reset }`.
Wrap the tree in `ScopeProvider` (re-exported) so state is per-scope.

## License

MIT © 2026 movpushmov
