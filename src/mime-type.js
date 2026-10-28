import path from "node:path";
import mime from "mime";

export function defaultContentType(sourcePath) {
  // Only the source filename's final extension determines the type. A bare
  // filename like "json" is not an extension; ".json" remains supported.
  const name = path.basename(sourcePath), dot = name.lastIndexOf(".");
  return (dot < 0 ? null : mime.getType(name.slice(dot + 1))) ?? "application/octet-stream";
}
