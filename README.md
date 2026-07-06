# Net

**Inspired by farfetched**

Monorepo for the Net library.

## Packages

- `@virentia/net-core` — framework-agnostic core.
- `@virentia/net-react` — React bindings for core.
- `@virentia/net-vue` — Vue 3 bindings for core.

## Development

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

## Release

Run `pnpm changeset` when a package change should be released, then follow the
release flow described in [`.changeset/README.md`](.changeset/README.md).

## License

MIT © 2026 movpushmov
