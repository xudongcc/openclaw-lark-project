# OpenClaw npm runtime packaging design

## Context

`openclaw-lark-project@1.13.1` publishes TypeScript sources only. OpenClaw
2026.6.11 rejects npm-installed plugins whose TypeScript extension entry has no
compiled JavaScript runtime entry. The package already declares tool ownership
through `contracts.tools`; this design addresses only the missing runtime
artifact and the release guard that allowed it to ship.

## Goals

- Publish an ESM runtime under `dist/` using the existing TypeScript compiler.
- Preserve `src/index.ts` as the development source entry.
- Declare `dist/index.js` as the installed-package runtime entry.
- Point `openclaw.plugin.json.entry` at `dist/index.js` as requested.
- Prevent npm publication unless the packed artifact installs successfully in
  OpenClaw.
- Publish the completed fix as the next patch release.

## Non-goals

- No runtime behavior or Lark API changes.
- No dependency bundling.
- No migration to another build tool.
- No unrelated plugin manifest or configuration changes.

## Build and module design

The package remains ESM through `package.json`'s `"type": "module"`.
`tsconfig.build.json` will extend the existing type-checking configuration and
override it with `module` and `moduleResolution` set to `NodeNext`, `noEmit`
disabled, `rootDir` set to `src`, and `outDir` set to `dist`. Test files will be
excluded from emitted output.

All relative TypeScript imports will use `.js` specifiers. Under NodeNext,
TypeScript resolves those specifiers to the corresponding `.ts` source files
during compilation and preserves valid `.js` specifiers in emitted ESM.

`package.json` will:

- include `dist` in `files`;
- retain `openclaw.extensions: ["./src/index.ts"]` for source development;
- add `openclaw.runtimeExtensions: ["./dist/index.js"]` for installed packages;
- add `build` and `prepack` scripts so every npm pack or publish rebuilds the
  runtime artifact.

`openclaw.plugin.json.entry` will change to `./dist/index.js`.

## Verification design

A Vitest package regression test will create a real npm tarball in a temporary
directory. It will verify that the archive contains `package/dist/index.js`,
then install that tarball with the repository's OpenClaw 2026.6.11 CLI under an
isolated temporary HOME and state directory. The test passes only when the CLI
returns success and no compiled-runtime packaging error appears.

Temporary files and state are removed in test cleanup. The test uses no Lark
credentials and does not touch the user's OpenClaw configuration.

The release workflow will run the Vitest suite before semantic-release. The
`prepack` build remains the final publication safeguard even if a package is
packed outside CI.

## Success criteria

- `pnpm build` emits ESM JavaScript under `dist/` with no test files.
- `pnpm test` passes, including the package installation regression.
- `pnpm pack` contains `dist/index.js` and excludes test sources.
- An isolated `openclaw plugins install <tarball> --force` succeeds.
- Type checking and `git diff --check` pass.
- GitHub Actions publishes `openclaw-lark-project@1.13.2`, npm `latest` points
  to `1.13.2`, and tag `v1.13.2` points to the release commit.
