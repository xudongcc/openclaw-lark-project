type PluginConfig = {
  pluginId: string;
  pluginSecret: string;
  userId: string;
  baseUrl?: string;
};

export default function register(api: any) {
  const cfg = (api?.config || {}) as PluginConfig;
  const baseUrl = cfg.baseUrl || "https://project.feishu.cn";

  api?.logger?.info?.("[lark-project-workitem] plugin loaded (tools disabled)", {
    hasPluginId: Boolean(cfg.pluginId),
    hasPluginSecret: Boolean(cfg.pluginSecret),
    hasUserId: Boolean(cfg.userId),
    baseUrl,
    toolsEnabled: false,
  });
}
