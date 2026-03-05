type PluginConfig = {
  pluginId: string;
  pluginSecret: string;
  userKey: string;
  baseUrl?: string;
};

export default function register(api: any) {
  const cfg = (api?.config || {}) as PluginConfig;
  const baseUrl = cfg.baseUrl || "https://project.feishu.cn";

  api?.logger?.info?.("[lark-project-workitem] plugin loaded (tools disabled)", {
    hasPluginId: Boolean(cfg.pluginId),
    hasPluginSecret: Boolean(cfg.pluginSecret),
    hasUserKey: Boolean(cfg.userKey),
    baseUrl,
    toolsEnabled: false,
  });
}
