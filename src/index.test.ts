import { describe, expect, it } from "vitest";
import manifest from "../openclaw.plugin.json";
import larkProjectPlugin from "./index";

describe("plugin manifest", () => {
  it("declares every registered tool in contracts.tools", () => {
    const registeredTools: string[] = [];

    larkProjectPlugin.register({
      pluginConfig: {
        pluginId: "test-plugin-id",
        pluginSecret: "test-plugin-secret",
        userKey: "test-user-key",
        mcpKey: "test-mcp-key",
      },
      registerTool(tool: { name: string }) {
        registeredTools.push(tool.name);
      },
    } as never);

    expect([...manifest.contracts.tools].sort()).toEqual(
      registeredTools.sort(),
    );
  });
});
