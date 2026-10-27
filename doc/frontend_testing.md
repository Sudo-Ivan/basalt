# Overview of the testing environment

## Configuration files

Tests run via jest. The root config is `jest.config.js`, which delegates to
project configs such as `src/backend/jest.config.js`. Run them with `pnpm test`.

Jest uses [ts-jest](https://kulshekhar.github.io/ts-jest/) to test `.tsx` and `.ts` files and is
configured with the `tsconfig.json` from the root path.

Tests live in `__tests__` directories next to the code under test (for example
`src/backend/__tests__`). At the moment only backend code has unit tests.

## Mocks

Manual mocks live in `__mocks__` directories and are picked up by jest
automatically:

- `src/backend/__mocks__` holds mocks for node modules used by the backend
  (`electron`, `electron-store`, `i18next`, and others)
- `__mocks__` directories next to a source file mock that module itself

If you add new calls to a mocked module, make sure the corresponding mock
resolves them, else tests can run into unresolved promises and fail.
