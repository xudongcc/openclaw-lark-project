type PluginConfig = {
  pluginId: string;
  pluginSecret: string;
  userId: string;
  baseUrl?: string;
};

export default function register(api: any) {
  const cfg = (api?.config || {}) as PluginConfig;

  api?.logger?.info?.("[lark-project-workitem] plugin loaded", {
    hasPluginId: Boolean(cfg.pluginId),
    hasPluginSecret: Boolean(cfg.pluginSecret),
    hasUserId: Boolean(cfg.userId),
    baseUrl: cfg.baseUrl || "https://project.feishu.cn",
  });

  // TODO: register tools for workitem management
  // e.g. listWorkItems, getWorkItem, updateWorkItemStatus
}
