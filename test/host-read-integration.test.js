import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import plugin from "../src/index.js";
import { loadHostMcpModule } from "../src/mcp-read-client.js";

const hasHost = await import("openclaw/plugin-sdk/security-runtime").then(() => true, () => false);
test("registered native tools reuse a real OpenClaw MCP session against a stdio fixture", { skip: !hasHost && "OpenClaw host SDK is not installed", timeout: 15000 }, async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "lark-project-mcp-integration-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const entry = path.join(workspace, "mcp-fixture.mjs");
  await writeFile(entry, `
import readline from 'node:readline';
const send = (id, result) => process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\\n');
const schema = {type:'object',properties:{project_key:{type:'string'},work_item_id:{type:'string'},fields:{type:'array',items:{type:'string'}}},required:['project_key','work_item_id'],additionalProperties:false};
const querySchema = {type:'object',properties:{project_key:{type:'string'},mql:{type:'string'},session_id:{type:'string'},group_pagination_list:{type:'array',items:{type:'object',properties:{group_id:{type:'string'},page_num:{type:'integer'}},required:['group_id','page_num']}}},required:['project_key'],additionalProperties:false};
for await (const line of readline.createInterface({input:process.stdin})) {
  const req=JSON.parse(line);
  if(req.id===undefined)continue;
  if(req.method==='initialize')send(req.id,{protocolVersion:req.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'lark-project-test',version:'1.0.0'}});
  else if(req.method==='tools/list')send(req.id,{tools:[{name:'get_workitem_brief',inputSchema:schema},{name:'search_by_mql',inputSchema:querySchema}]});
  else if(req.method==='tools/call'){
    const input=req.params.arguments;
    let data;
    if(req.params.name==='get_workitem_brief')data=input.work_item_id==='2'?{code:403,msg:'denied'}:{code:0,data:{work_item_id:input.work_item_id,name:'fixture'}};
    else if(input.mql)data={code:0,data:{session_id:'fixture-session',list:[{count:120,group_infos:[{group_id:'1'}]}],data:Array.from({length:50},(_,i)=>({work_item_id:String(i+1)}))}};
    else {
      if(input.session_id!=='fixture-session'||input.mql)throw Error('Invalid pagination');
      const page=input.group_pagination_list[0].page_num;
      data={code:0,data:{session_id:null,list:null,data:Array.from({length:page===3?20:50},(_,i)=>({work_item_id:String((page-1)*50+i+1)}))}};
    }
    send(req.id,{content:[{type:'text',text:'log_id: fixture-trace'},{type:'text',text:JSON.stringify(data)}]});
  }else send(req.id,{});
}
`);
  await loadHostMcpModule();
  const sdkEntry = import.meta.resolve("openclaw/plugin-sdk/security-runtime");
  // Only this isolated fixture creates a runtime. Production only peeks at the
  // host's existing session and never initializes a scheduler or connection.
  const host = await import(new URL("../agents/agent-bundle-mcp-manager-api.js", sdkEntry));
  const { GatewayScheduler } = await import(new URL("../infra/gateway-scheduler.js", sdkEntry));
  const scheduler = new GatewayScheduler();
  await host.setSessionMcpRuntimeScheduler(scheduler);
  const sessionId = `lark-project-integration-${randomUUID()}`;
  const cfg = { plugins: { enabled: false }, mcp: { servers: { "lark-project": { command: process.execPath, args: [entry] } } } };
  let lease;
  t.after(async () => {
    lease?.releaseLease();
    try { assert.equal(await host.retireSessionMcpRuntime({ sessionId, reason: "test complete" }), true); }
    finally { await scheduler.stop(); }
  });
  lease = await host.acquireSessionMcpRuntime({ sessionId, workspaceDir: workspace, cfg });
  const { runtime } = lease;
  const catalog = await runtime.getCatalog();
  assert.equal(catalog.tools.length, 2);
  const tools = [];
  plugin.register({ registerTool(value) { tools.push(typeof value === "function" ? value({ sessionId, workspaceDir: workspace }) : value); } });
  const batch = tools.find((tool) => tool?.name === "lark-project__workitem_batch_get");
  const query = tools.find((tool) => tool?.name === "lark-project__query_all");
  const batchResult = await batch.execute("batch-integration", { project_key: "fixture", work_item_ids: ["1", "2", "900719925474099312345"] });
  assert.equal(batchResult.details.summary.succeeded, 2);
  assert.equal(batchResult.details.summary.failed, 1);
  assert.equal(batchResult.details.results[1].data.work_item_id, "900719925474099312345");
  assert.equal(batchResult.details.results[0].log_id, "fixture-trace");
  assert.equal(batchResult.details.errors[0].server_code, 403);
  assert.equal(batchResult.details.errors[0].log_id, "fixture-trace");
  assert.match(batchResult.details.errors[0].message, /denied/);
  const all = await query.execute("query-integration", { arguments: { project_key: "fixture", mql: "SELECT work_item_id FROM fixture.story" } });
  assert.equal(all.details.summary.complete, true);
  assert.equal(all.details.pages.length, 3);
  assert.equal(all.details.pages.flatMap((page) => page.data.data).length, 120);
  assert.equal(all.details.pages[2].data.data.at(-1).work_item_id, "120");
  assert.equal(all.details.summary.received_items, 120);
  assert.equal(all.details.pages[2].log_id, "fixture-trace");
});
