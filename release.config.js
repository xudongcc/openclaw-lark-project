import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export default {
  branches: ["main"],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    {
      async prepare(_config, { cwd, nextRelease }) {
        const path = resolve(cwd, "openclaw.plugin.json");
        const manifest = JSON.parse(await readFile(path, "utf8"));
        manifest.version = nextRelease.version;
        await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
      },
    },
    ["@semantic-release/npm", { tarballDir: "dist" }],
    [
      "@semantic-release/github",
      {
        assets: "dist/*.tgz",
        successCommentCondition: false,
        failCommentCondition: false,
        releasedLabels: false,
      },
    ],
  ],
};
