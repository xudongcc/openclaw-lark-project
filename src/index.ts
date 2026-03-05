import { TokenManager } from "./token";

type PluginConfig = {
  pluginId: string;
  pluginSecret: string;
  userId: string;
  baseUrl?: string;
};

export default function register(api: any) {
  const cfg = (api?.config || {}) as PluginConfig;
  const baseUrl = cfg.baseUrl || "https://project.feishu.cn";

  const tokenManager = new TokenManager({
    baseUrl,
    pluginId: cfg.pluginId,
    pluginSecret: cfg.pluginSecret,
    userId: cfg.userId,
  });

  api?.logger?.info?.("[lark-project-workitem] plugin loaded", {
    hasPluginId: Boolean(cfg.pluginId),
    hasPluginSecret: Boolean(cfg.pluginSecret),
    hasUserId: Boolean(cfg.userId),
    baseUrl,
  });

  // TODO: register tools for workitem management
  // Example usage in tool handler:
  // const userToken = await tokenManager.getUserAccessToken();
  // const pluginToken = await tokenManager.getPluginAccessToken();
  // const resp = await fetch(`${baseUrl}/open_api/...`, {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     "X-Plugin-Token": userToken,
  //   },
  //   body: JSON.stringify({...}),
  // });
}
