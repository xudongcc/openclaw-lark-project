// The URL-kind fixture corpus is adapted from meegle-cli url_decode_test.go
// (51b6c92fe7bab9f830db9f4bbf2739927c434815), MIT, Lark Technologies Pte. Ltd.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decodeURL } from "../src/url-decode.js";

const cases = JSON.parse(await readFile(new URL("./fixtures/url-cases.json", import.meta.url)));
for (const { name, url, want } of cases) test(`official URL: ${name}`, () => assert.equal(decodeURL(url).url_kind, want));

test("decodes path once, keeps large IDs and first query values, ignores fragment", () => {
  const raw = " https://project.feishu.cn/%E7%A9%BA%E9%97%B4/story/detail/900719925474099312345?node=a&node=b&scope=workspaces#ignored ";
  assert.deepEqual(decodeURL(raw), {
    url_kind: "workitem_detail", host: "project.feishu.cn", pathname: "/空间/story/detail/900719925474099312345", raw,
    query: { node: "a", scope: "workspaces" }, simple_name: "空间", work_item_type: "story", work_item_id: "900719925474099312345",
  });
  assert.equal(decodeURL("/space/story/detail/%2531").work_item_id, "%31");
});

test("legacy prefix and aliases preserve original path and captures", () => {
  const result = decodeURL("project.feishu.cn/meego/space/jiraImport");
  assert.equal(result.url_kind, "import_jira");
  assert.equal(result.simple_name, "space");
  assert.equal(result.redirected_from, "/meego/space/jiraImport");
  assert.equal(decodeURL("/story_create_open/bn_42").business_name, "bn_42");
  assert.equal(decodeURL("/meego").url_kind, "root");
  assert.equal(decodeURL("/meego/meego/story/detail/123").simple_name, "meego");
});

test("resource wrappers, view extras and reserved routes remain distinct", () => {
  const result = decodeURL("/space/workObjectView/_story_resource/v1");
  assert.equal(result.work_item_type, "story");
  assert.equal(result.is_resource, true);
  assert.equal(result.view_id, "v1");
  assert.equal(decodeURL("/space/workObjectView/__resource/v1").is_resource, undefined);
  assert.equal(decodeURL("/space/storyView/v1").work_item_type, "story");
  assert.equal(decodeURL("/workbench").simple_name, undefined);
  assert.equal(decodeURL("/space/chart/detail/1").work_item_id, undefined);
  assert.equal(decodeURL("/space/setting/future/nested").url_kind, "setting_other");
});

test("accepts hostless paths, preserves internal empty segments, does not invent short routes", () => {
  assert.equal(decodeURL("/space/story/detail/123").host, undefined);
  assert.equal(decodeURL("/space/story").url_kind, "unknown");
  assert.equal(decodeURL("/space//story/detail/123").url_kind, "unknown");
  assert.equal(decodeURL("/space/story/detail/123/").work_item_id, "123");
});

test("rejects malformed and ambiguous paths without WHATWG normalization", () => {
  for (const url of [" ", "ftp://project.feishu.cn/space", "https://u:p@project.feishu.cn/space", "/space/%zz", "/space/story/detail/a%2Fb", "/space/story/detail/a%5Cb", "/space/../story/detail/1", "/space/%2e%2e/story/detail/1", "/space/story/detail/%00", "/space\\story"]) {
    assert.throws(() => decodeURL(url), undefined, url);
  }
});
