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

  it(
    "packs a compiled runtime that OpenClaw can install",
    () => {
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
            timeout: 300_000,
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
        expect(installOutput).not.toContain("requires compiled runtime output");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    300_000,
  );
});
