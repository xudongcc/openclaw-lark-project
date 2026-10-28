import test from "node:test";
import assert from "node:assert/strict";
import { defaultContentType } from "../src/mime-type.js";

test("MIME inference covers attachment formats using the bundled database", () => {
  for (const [file, type] of [
    ["video.webm", "video/webm"], ["photo.avif", "image/avif"], ["scan.tiff", "image/tiff"],
    ["audio.ogg", "audio/ogg"], ["icon.ico", "image/vnd.microsoft.icon"],
    ["module.mjs", "text/javascript"], ["style.css", "text/css"], ["app.wasm", "application/wasm"],
    ["note.txt", "text/plain"], ["page.htm", "text/html"], ["data.xml", "application/xml"],
    ["report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ]) assert.equal(defaultContentType(file), type, file);
});

test("MIME inference uses the final extension, case-insensitively, including dotfiles", () => {
  for (const file of ["photo.AVIF", "photo.AvIf", ".avif", "folder.pdf/photo.avif", "photo.pdf.avif"]) {
    assert.equal(defaultContentType(file), "image/avif", file);
  }
  assert.equal(defaultContentType(".json"), "application/json");
});

test("unknown or absent extensions fall back without treating the filename or parent as a type", () => {
  for (const file of ["json", "webm", "no-extension", "unknown.lark-fixture", "file.", "folder.webm/json"]) {
    assert.equal(defaultContentType(file), "application/octet-stream", file);
  }
});
