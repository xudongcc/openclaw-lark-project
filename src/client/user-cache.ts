import { TTLCache } from "@isaacs/ttlcache";
import type { UserDetail } from "./types";

export class UserCache extends TTLCache<string, UserDetail> {
  constructor() {
    super({ ttl: 24 * 60 * 60 * 1000 });
  }

  set(key: string, value: UserDetail): this {
    super.set(key, value);
    super.set(value.name, value);
    super.set(value.email, value);

    return this;
  }
}
