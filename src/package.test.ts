import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath: string) =>
  JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8"));

const createIsolatedOpenClawEnv = (homeDir: string): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("OPENCLAW_")) {
      delete env[key];
    }
  }

  const stateDir = path.join(homeDir, ".openclaw");
  return {
    ...env,
    CI: "1",
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CACHE_HOME: path.join(homeDir, ".cache"),
    XDG_CONFIG_HOME: path.join(homeDir, ".config"),
    XDG_DATA_HOME: path.join(homeDir, ".local", "share"),
    XDG_STATE_HOME: path.join(homeDir, ".local", "state"),
    OPENCLAW_HOME: homeDir,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: path.join(stateDir, "openclaw.json"),
  };
};

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

  it(
    "packs a compiled runtime that OpenClaw can install",
    async () => {
      const tempDir = mkdtempSync(
        path.join(tmpdir(), "openclaw-lark-project-package-"),
      );

      try {
        execFileSync(
          "pnpm",
          ["--silent", "pack", "--pack-destination", tempDir],
          { cwd: rootDir, encoding: "utf8" },
        );
        const tarballName = readdirSync(tempDir).find((file) =>
          file.endsWith(".tgz"),
        );
        if (!tarballName) {
          throw new Error("pnpm pack did not create a tarball");
        }
        const tarballPath = path.join(tempDir, tarballName);
        const archiveFiles = execFileSync("tar", ["-tzf", tarballPath], {
          encoding: "utf8",
        }).split("\n");

        expect(archiveFiles).toContain("package/dist/index.js");
        expect(
          archiveFiles.some((file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)),
        ).toBe(false);

        const runtimeUrl = pathToFileURL(path.join(rootDir, "dist/index.js"));
        runtimeUrl.searchParams.set("package-test", String(Date.now()));
        const runtimeModule = await import(runtimeUrl.href);
        expect(runtimeModule.default?.id).toBe("openclaw-lark-project");

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
            timeout: 300_000,
            env: createIsolatedOpenClawEnv(homeDir),
          },
        );
        const installOutput = `${install.stdout}\n${install.stderr}`;

        expect(install.status, installOutput).toBe(0);
        expect(installOutput).not.toContain("requires compiled runtime output");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    300_000,
  );
});
