type TokenCacheEntry = {
  token: string;
  expiresAt: number;
};

export type TokenManagerConfig = {
  baseUrl: string;
  pluginId: string;
  pluginSecret: string;
  userId: string;
  fetchImpl?: typeof fetch;
};

export class TokenManager {
  private readonly baseUrl: string;
  private readonly pluginId: string;
  private readonly pluginSecret: string;
  private readonly userId: string;
  private readonly fetchImpl: typeof fetch;

  private pluginToken?: TokenCacheEntry;
  private userToken?: TokenCacheEntry;

  constructor(cfg: TokenManagerConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, "");
    this.pluginId = cfg.pluginId;
    this.pluginSecret = cfg.pluginSecret;
    this.userId = cfg.userId;
    this.fetchImpl = cfg.fetchImpl || fetch;
  }

  async getPluginAccessToken(): Promise<string> {
    if (this.pluginToken && this.pluginToken.expiresAt > Date.now() + 30_000) {
      return this.pluginToken.token;
    }

    const res = await this.fetchImpl(`${this.baseUrl}/open_api/authen/plugin_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plugin_id: this.pluginId,
        plugin_secret: this.pluginSecret,
      }),
    });

    if (!res.ok) throw new Error(`get plugin_access_token failed: HTTP ${res.status}`);

    const data = await res.json() as any;
    const token = data?.data?.plugin_access_token || data?.plugin_access_token;
    const expire = Number(data?.data?.expire_time || data?.expire_time || 7200);
    if (!token) throw new Error("plugin_access_token missing in response");

    this.pluginToken = { token, expiresAt: Date.now() + expire * 1000 };
    return token;
  }

  async getUserAccessToken(): Promise<string> {
    if (this.userToken && this.userToken.expiresAt > Date.now() + 30_000) {
      return this.userToken.token;
    }

    const pluginToken = await this.getPluginAccessToken();
    const res = await this.fetchImpl(`${this.baseUrl}/open_api/authen/user_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Plugin-Token": pluginToken,
      },
      body: JSON.stringify({
        user_key: this.userId,
      }),
    });

    if (!res.ok) throw new Error(`get user_access_token failed: HTTP ${res.status}`);

    const data = await res.json() as any;
    const token = data?.data?.user_access_token || data?.user_access_token;
    const expire = Number(data?.data?.expire_time || data?.expire_time || 7200);
    if (!token) throw new Error("user_access_token missing in response");

    this.userToken = { token, expiresAt: Date.now() + expire * 1000 };
    return token;
  }
}
