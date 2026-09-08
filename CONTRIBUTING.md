# Contributing

Contributions are welcome — new adapter capabilities, additional drizzle-orm version compatibility, bug fixes, documentation.

## Public Domain Dedication

By submitting a pull request, you dedicate your contribution to the public domain under the same [Unlicense](LICENSE) terms as this project.
You assert that you have the right to make this dedication.

## Guidelines

- Node 22+, ESM only, TypeScript `strict: true`
- ESLint (`typescript-eslint` strict + stylistic type-checked) clean, no errors
- 100% code coverage required
- 100% mutation score required (`npm run test:mutation`, Stryker — min MSI 100%); an escaped mutant means the test needs a stronger assertion, not a suppressed mutator
- A new adapter capability that needs an extra query (like `DrizzleIdentityAdapter`'s `ids()`) gets its own class extending `DrizzleSimpleAdapter`, not a new constructor parameter on `DrizzleSimpleAdapter` itself
- New drizzle-orm version support means adding a combo to `docker-compose.yml`, `package.json`'s `test:*-drizzle*` scripts, and `.github/workflows/ci.yml`'s matrix — not just widening the `peerDependencies` version constraint

## Before opening a PR

All of the following must pass locally:

```bash
npm run js:build
npm run js:lint
npm run js:format
npm run js:typecheck
npm run test:coverage
npm run test:mutation
```
