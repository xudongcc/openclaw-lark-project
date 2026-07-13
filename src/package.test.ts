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
