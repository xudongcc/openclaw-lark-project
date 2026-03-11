import { z } from "zod";

/**
 * 将 Zod schema 转为 JSON Schema（draft-07，兼容 ajv）。
 *
 * - 强制 draft-07（Zod v4 默认 draft-2020-12，OpenClaw 的 ajv 不支持）
 * - 移除 `$schema` 字段
 */
export function toJSONSchema<T extends z.ZodType>(schema: T) {
  const { $schema, ...rest } = z.toJSONSchema(schema, {
    target: "draft-07",
  });

  return rest;
}
