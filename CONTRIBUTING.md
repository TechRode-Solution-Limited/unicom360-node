# Contributing

Thanks for helping. This is the official Node.js SDK for the Unicom360 API; its behaviour is
fixed by the shared contract in
[unicom360-openapi](https://github.com/TechRode-Solution-Limited/unicom360-openapi)
(`docs/sdk-design.md`, `openapi.yaml` and the conformance fixtures). A change in behaviour
starts there, not here.

## Setup

Node.js 20 or later (CI also runs 22 and 24). npm 11 wrote `package-lock.json`; npm 10 reads it
too.

```sh
npm ci
npm test            # unit tests and the whole conformance suite
npm run lint        # ESLint (typescript-eslint strict, type-checked)
npm run format      # Prettier (CI runs format:check)
npm run typecheck   # the source (without Node types), the tests, and examples/
npm run build       # tsup: dist/index.js (ESM), dist/index.cjs (CJS) and .d.ts/.d.cts
npm run check:package   # publint --strict and Are the Types Wrong, after a build
npm run docs        # TypeDoc into docs/, warnings are errors
```

The source must not use Node-only APIs: it runs on Node, Bun, Deno and edge runtimes with the
web platform's `fetch`, Web Crypto and timers. `tsconfig.src.json` type-checks it without Node's
types to enforce that.

Never write the em dash character anywhere (code, comments, docs, commit messages); CI greps
for it.

## The conformance fixtures

`test/conformance/` is a vendored copy of unicom360-openapi's `conformance/` directory, and
`test/conformance.test.ts` runs every vector in it through the public API. The copy is never
edited by hand: a test recomputes its sha256 and compares it with `test/conformance/VERSION`.

To move to a new contract version, from a checkout of unicom360-openapi at the new tag:

```sh
scripts/sync-conformance ../unicom360-node/test/conformance
scripts/sync-conformance --check ../unicom360-node/test/conformance
```

Then run `npm test`, implement what the new vectors require, update the README's "targets
Unicom360 API contract" line, and commit the fixtures together with the code.

## The contract test (Prism)

`npm run test:contract` sends every `requests.json` call through the real `fetch` transport to
a [Prism](https://github.com/stoplightio/prism) mock of `openapi.yaml`, and fails on any
validation error. It is not part of `npm test`, because it needs Prism running:

```sh
docker run --rm -p 4010:4010 -v "$PWD/../unicom360-openapi:/spec:ro" \
  stoplight/prism:5 mock -h 0.0.0.0 --multiprocess=false --errors /spec/openapi.yaml

npm run test:contract
```

`--multiprocess=false` avoids a crash of the `stoplight/prism:5` image's cluster mode on some
hosts. If port 4010 is taken, publish another (`-p 4016:4010`) and set
`UNICOM360_CONTRACT_BASE_URL=http://127.0.0.1:4016`.

## Pull requests

- Keep a change small and focused, with tests.
- Add a line under `## [Unreleased]` in `CHANGELOG.md` for anything a user would notice.
- Commit messages are plain sentences; no AI attribution lines.

## Releasing

Releases are cut from `main` by pushing a tag `vX.Y.Z`:

1. Set `version` in `package.json` and `VERSION` in `src/version.ts` (a test checks they
   agree), and run `npm install` so `package-lock.json` follows.
2. In `CHANGELOG.md`, move the notes into `## [X.Y.Z] - YYYY-MM-DD` and update the links at
   the bottom. The release workflow refuses an undated heading.
3. Commit, then `git tag vX.Y.Z && git push origin main vX.Y.Z`.

`.github/workflows/release.yml` then checks, tests and builds again, publishes with
`npm publish --provenance --access public` through npm trusted publishing (no token), and
creates the GitHub Release from the CHANGELOG section.

### First publish (manual, once)

npm can only attach a trusted publisher to a package that exists, so the very first version is
published by hand by a maintainer with an npm account (with 2FA):

```sh
git checkout v0.1.0
npm ci
npm test
npm run build
npm run check:package
npm login
npm publish --access public
```

Then, on npmjs.com, open the package's Settings, Trusted publishing, and add a GitHub Actions
publisher: organisation `TechRode-Solution-Limited`, repository `unicom360-node`, workflow
`release.yml`, environment `npm`. Create the `npm` environment in the GitHub repository's
settings (optionally with required reviewers). Later releases need no token. Once trusted
publishing works, consider setting the package to "Require two-factor authentication and
disallow tokens".

If GitHub Actions is unavailable, any later version can be published the same manual way.
