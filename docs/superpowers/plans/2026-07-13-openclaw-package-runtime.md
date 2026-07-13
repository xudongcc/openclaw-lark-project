# OpenClaw npm Runtime Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an ESM `dist/index.js` that OpenClaw 2026.6.11 can install from the npm tarball, with a Vitest regression and release gate preventing recurrence.

**Architecture:** Keep `src/index.ts` as the source-development entry and compile the complete source tree with TypeScript `NodeNext` semantics into `dist/`. Pair the source entry with `openclaw.runtimeExtensions`, build during `prepack`, and exercise a real packed tarball through the OpenClaw installer under an isolated HOME.

**Tech Stack:** TypeScript 5.9, Node ESM, Vitest 4, pnpm 10, OpenClaw 2026.6.11, GitHub Actions, semantic-release.

## Global Constraints

- The package remains ESM through `package.json` `"type": "module"`.
- Use `tsc`; do not add a bundler or migrate build tools.
- Emit production files only under `dist/`; never emit `*.test.ts` files.
- Keep `openclaw.extensions` as `["./src/index.ts"]` and add `openclaw.runtimeExtensions` as `["./dist/index.js"]`.
- Set `openclaw.plugin.json.entry` to `./dist/index.js`.
- Package verification must use Vitest and an isolated OpenClaw HOME/state directory.
- No Lark API behavior, config schema, or tool contract changes.
- Final release target is `openclaw-lark-project@1.13.2` on npm `latest` with Git tag `v1.13.2`.

---

## File Structure

- Create `src/package.test.ts`: package metadata, tarball contents, and isolated OpenClaw installation regression.
- Create `tsconfig.build.json`: production-only NodeNext emit configuration.
- Modify `package.json`: runtime entry pairing, `dist` packaging, and build lifecycle scripts.
- Modify `openclaw.plugin.json`: compiled manifest entry.
- Modify production files under `src/`: Node ESM-compatible `.js` relative import specifiers.
- Modify `.github/workflows/release.yml`: run type checking and Vitest before semantic-release.

---

### Task 1: Lock the package entry metadata

**Files:**
- Create: `src/package.test.ts`
- Modify: `package.json:7-17`
- Modify: `openclaw.plugin.json:4`

**Interfaces:**
- Consumes: `package.json` and `openclaw.plugin.json` as JSON files at the repository root.
- Produces: source entry `./src/index.ts`, runtime entry `./dist/index.js`, and an npm `files` list containing `dist`.

- [ ] **Step 1: Write the failing Vitest metadata test**

Create `src/package.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath: string) =>
  JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8"));

describe("npm package", () => {
  it("declares its compiled ESM runtime entry", () => {
    const packageJson = readJson("package.json");
    const pluginManifest = readJson("openclaw.plugin.json");

    expect(packageJson.type).toBe("module");
    expect(packageJson.files).toContain("dist");
    expect(packageJson.openclaw.extensions).toEqual(["./src/index.ts"]);
    expect(packageJson.openclaw.runtimeExtensions).toEqual([
      "./dist/index.js",
    ]);
    expect(pluginManifest.entry).toBe("./dist/index.js");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm exec vitest run src/package.test.ts
```

Expected: FAIL because `packageJson.files` does not contain `dist` and `runtimeExtensions` is absent.

- [ ] **Step 3: Add the minimal package metadata**

Change the relevant `package.json` fields to:

```json
{
  "files": [
    "skills",
    "src",
    "dist",
    "!src/**/*.test.ts",
    "openclaw.plugin.json"
  ],
  "openclaw": {
    "extensions": ["./src/index.ts"],
    "runtimeExtensions": ["./dist/index.js"]
  }
}
```

Change `openclaw.plugin.json` to:

```json
{
  "entry": "./dist/index.js"
}
```

Preserve every other existing field in both files.

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```bash
pnpm exec vitest run src/package.test.ts
```

Expected: 1 test passes.

- [ ] **Step 5: Commit the metadata contract**

```bash
git add src/package.test.ts package.json openclaw.plugin.json
git commit -m "fix: declare compiled OpenClaw runtime entry"
```

---

### Task 2: Compile and prove an installable ESM tarball

**Files:**
- Modify: `src/package.test.ts`
- Create: `tsconfig.build.json`
- Modify: `package.json:23-27`
- Modify: `src/index.ts`
- Modify: `src/client/index.ts`
- Modify: `src/client/client.ts`
- Modify: `src/client/mcp-client.ts`
- Modify: `src/client/user-cache.ts`
- Modify: `src/client/schemas/comment.ts`
- Modify: `src/client/schemas/common.ts`
- Modify: `src/client/schemas/index.ts`
- Modify: `src/client/schemas/team.ts`
- Modify: `src/client/schemas/view.ts`
- Modify: `src/client/schemas/work-item.ts`

**Interfaces:**
- Consumes: TypeScript source entry `src/index.ts`, repository-local `pnpm`, and the devDependency OpenClaw CLI.
- Produces: `dist/index.js` plus its local imported modules, and a tarball accepted by `openclaw plugins install <tarball> --force`.

- [ ] **Step 1: Add the failing packed-install Vitest test**

Extend imports in `src/package.test.ts`:

```ts
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
```

Add this test inside the existing `describe` block:

```ts
  it(
    "packs a compiled runtime that OpenClaw can install",
    () => {
      const tempDir = mkdtempSync(
        path.join(tmpdir(), "openclaw-lark-project-package-"),
      );

      try {
        const packOutput = execFileSync(
          "pnpm",
          ["pack", "--pack-destination", tempDir, "--json"],
          { cwd: rootDir, encoding: "utf8" },
        );
        const tarballPath = JSON.parse(packOutput).filename as string;
        const archiveFiles = execFileSync("tar", ["-tzf", tarballPath], {
          encoding: "utf8",
        }).split("\n");

        expect(archiveFiles).toContain("package/dist/index.js");
        expect(archiveFiles.some((file) => file.endsWith(".test.js"))).toBe(
          false,
        );

        const homeDir = path.join(tempDir, "home");
        mkdirSync(homeDir);
        const install = spawnSync(
          "pnpm",
          [
            "exec",
            "openclaw",
            "plugins",
            "install",
            tarballPath,
            "--force",
          ],
          {
            cwd: rootDir,
            encoding: "utf8",
            timeout: 120_000,
            env: {
              ...process.env,
              CI: "1",
              HOME: homeDir,
              USERPROFILE: homeDir,
              OPENCLAW_STATE_DIR: path.join(homeDir, ".openclaw"),
            },
          },
        );
        const installOutput = `${install.stdout}\n${install.stderr}`;

        expect(install.status, installOutput).toBe(0);
        expect(installOutput).not.toContain(
          "requires compiled runtime output",
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    120_000,
  );
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
pnpm exec vitest run src/package.test.ts -t "packs a compiled runtime"
```

Expected: FAIL because the tarball has no `package/dist/index.js`.

- [ ] **Step 3: Add the production TypeScript build config**

Create `tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

Add these `package.json` scripts while preserving existing scripts:

```json
{
  "scripts": {
    "clean": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
    "build": "pnpm clean && tsc -p tsconfig.build.json",
    "prepack": "pnpm build"
  }
}
```

- [ ] **Step 4: Make production relative imports NodeNext-compatible**

Apply these exact specifier replacements in production `.ts` files only:

```text
./client/client                 -> ./client/client.js
./client/mcp-client             -> ./client/mcp-client.js
./client/utils/to-json-schema   -> ./client/utils/to-json-schema.js
./client/schemas/work-item      -> ./client/schemas/work-item.js
./client/schemas/comment        -> ./client/schemas/comment.js
./client/schemas/view           -> ./client/schemas/view.js
./client/schemas/user           -> ./client/schemas/user.js
./client/schemas/team           -> ./client/schemas/team.js
./client/schemas/mcp            -> ./client/schemas/mcp.js
./user-cache                    -> ./user-cache.js
./schemas                       -> ./schemas/index.js
./client                        -> ./client.js
./mcp-client                    -> ./mcp-client.js
./common                        -> ./common.js
./comment                       -> ./comment.js
./work-item                     -> ./work-item.js
./view                          -> ./view.js
./mcp                           -> ./mcp.js
./user                          -> ./user.js
./team                          -> ./team.js
../utils/date-format            -> ../utils/date-format.js
```

Do not change relative specifiers in `*.test.ts`; Vitest continues to resolve those through Vite.

- [ ] **Step 5: Run build and targeted package test to verify GREEN**

Run:

```bash
pnpm build
pnpm exec vitest run src/package.test.ts
```

Expected: build exits 0; both package tests pass; isolated OpenClaw install exits 0.

- [ ] **Step 6: Verify emitted ESM imports**

Run:

```bash
rg -n 'from "\./.*\.js"|from "\.\./.*\.js"' dist
find dist -name '*.test.js' -print
```

Expected: emitted relative imports end in `.js`; `find` prints nothing.

- [ ] **Step 7: Commit the compiled runtime**

```bash
git add package.json tsconfig.build.json src
git commit -m "fix: publish compiled ESM runtime"
```

---

### Task 3: Gate release and publish 1.13.2

**Files:**
- Modify: `.github/workflows/release.yml:29-30`
- Generated by semantic-release: `CHANGELOG.md`, `package.json`

**Interfaces:**
- Consumes: `pnpm exec tsc --noEmit`, the complete Vitest suite, and semantic-release on `main`.
- Produces: a release workflow that blocks publication on type/test/package failures, npm `latest` version `1.13.2`, and GitHub tag/release `v1.13.2`.

- [ ] **Step 1: Enable the release verification gate**

Replace the commented test step in `.github/workflows/release.yml` with:

```yaml
      - name: Typecheck
        run: pnpm exec tsc --noEmit

      - name: Test
        run: pnpm test
```

- [ ] **Step 2: Run complete local verification**

Run:

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm build
pnpm test
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pnpm --silent pack --pack-destination "$tmp"
tar -tzf "$tmp"/*.tgz
git diff --check
```

Expected: every command exits 0; all Vitest tests pass; pack output lists `dist/index.js` and no test files.

- [ ] **Step 3: Commit the release gate**

```bash
git add .github/workflows/release.yml
git commit -m "ci: verify npm package before release"
```

- [ ] **Step 4: Push main and wait for semantic-release**

```bash
git push origin main
gh run list --repo xudongcc/openclaw-lark-project --branch main --limit 5
gh run watch <run-id> --repo xudongcc/openclaw-lark-project --exit-status
```

Expected: Release workflow completes with `success` and semantic-release reports `Published release 1.13.2`.

- [ ] **Step 5: Synchronize and verify publication**

```bash
git pull --ff-only origin main
git fetch origin tag v1.13.2
npm view openclaw-lark-project version
npm view openclaw-lark-project dist-tags.latest
git describe --tags --exact-match HEAD
git status --short --branch
```

Expected: npm version and `latest` are `1.13.2`; exact tag is `v1.13.2`; local `main` equals `origin/main`; worktree is clean.

- [ ] **Step 6: Verify the published artifact itself**

Run the npm install path in an isolated temporary HOME:

```bash
tmp=$(mktemp -d)
HOME="$tmp" OPENCLAW_STATE_DIR="$tmp/.openclaw" CI=1 pnpm exec openclaw plugins install openclaw-lark-project@1.13.2 --force
code=$?
rm -rf "$tmp"
exit $code
```

Expected: exit 0 with no `requires compiled runtime output` diagnostic.
