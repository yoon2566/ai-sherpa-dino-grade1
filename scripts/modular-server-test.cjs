'use strict';
// Read-only gateway tests. No Worker bindings, database, secrets or external AI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const results = [];
const source = fs.readFileSync(path.join(root, 'modules/entry.js'), 'utf8');
const baseline = execFileSync('git', ['show', '7b40669:modules/entry.js'], {cwd:root, encoding:'utf8', maxBuffer:8*1024*1024});
function load(text) {
  const gateway = text.slice(text.indexOf('// cloud/ai-gateway.mjs'), text.indexOf('// cloud/prompt-gateway.mjs'));
  const sandbox = {Response, Request, Headers, URL, TextEncoder, fetch, __name:value=>value};
  vm.createContext(sandbox);
  vm.runInContext(gateway, sandbox);
  return sandbox;
}
const current = load(source), legacy = load(baseline);
const sse = 'data: {"choices":[{"delta":{"content":"sample"}}]}\n\ndata: {"usage":{"prompt_tokens":10,"completion_tokens":20,"cost":0.0001}}\n\ndata: [DONE]\n\n';
function request(body, options={}) {
  return new Request('http://127.0.0.1:19186/api/game', {method:options.method || 'POST', headers:{Origin:'http://127.0.0.1:19186','Content-Type':'application/json',...options.headers}, ...(options.method==='GET'?{}:{body: typeof body === 'string' ? body : JSON.stringify(body)})});
}
async function run(body, options={}, api=current) {
  let upstream, rateCalls=0, fetchCalls=0;
  const response = await api.handleGame(request(body, options), {apiKey:options.noKey?'':'mock-key', checkRate:async()=>{rateCalls++; return options.rateLimited ? Response.json({error:'rate'}, {status:429}) : null;}, fetchImpl:async(url, init)=>{
    fetchCalls++; upstream={url,body:JSON.parse(init.body),headers:init.headers};
    return new Response(sse, {status:options.upstreamStatus || 200});
  }});
  return {status:response.status, text:await response.text(), type:response.headers.get('Content-Type'), cache:response.headers.get('Cache-Control'), upstream,rateCalls,fetchCalls};
}
async function check(name, work) {await work(); results.push({name,ok:true}); console.log('PASS '+name);}
(async()=>{
  for (const [slot,fn] of Object.entries({hero:'drawHero',background:'drawBackground',obstacle:'drawObstacle',item:'drawItem'})) {
    await check('slot '+slot+' contract, SSE and usage',async()=>{
      const r=await run({mode:'slot',slot,request:'고양이로 바꿔 줘.',current:'',contract:{name:'evil',engine:'do not forward'}});
      assert.equal(r.status,200); assert.equal(r.text,sse); assert.match(r.type,/text\/event-stream/); assert.equal(r.cache,'no-store, no-transform');
      const p=r.upstream.body, data=JSON.parse(p.messages[1].content);
      assert.equal(p.model,'anthropic/claude-haiku-5.5'); assert.equal(p.max_tokens,4000); assert.equal(p.reasoning.enabled,false); assert.equal(p.reasoning.effort,undefined); assert.equal(p.stream,true); assert.equal(p.stream_options.include_usage,true);
      assert.equal(data.contract.name,fn); assert.equal(data.contract.engine,undefined); assert.equal(data.request,'고양이로 바꿔 줘.'); assert.match(p.messages[0].content,/함수 하나만 javascript 코드펜스/);
      assert.equal(r.rateCalls,1); assert.equal(r.fetchCalls,1);
    });
  }
  await check('route contract and allowed config', async()=>{
    const r=await run({mode:'route',request:'점프 소리 바꿔줘',current:{hero:'function drawHero(ctx,v){}'},config:{speedMultiplier:1,initialLives:5,soundPreset:'뿅!'}});
    assert.equal(r.status,200); const p=r.upstream.body, data=JSON.parse(p.messages[1].content);
    assert.equal(p.max_tokens,4000); assert.equal(Object.keys(data.contracts).length,4); assert.equal(data.config.soundPreset,'뿅!');
    assert.match(p.messages[0].content,/캐릭터 없애기는 빈 그림으로 대신하지 않는다/); assert.match(p.messages[0].content,/unsupported/);
  });
  const invalid = [
    ['unknown mode',{mode:'other',request:'cat'}], ['unknown slot',{mode:'slot',slot:'engine',request:'cat'}],
    ['empty request',{mode:'slot',slot:'hero',request:' '}], ['long request',{mode:'slot',slot:'hero',request:'x'.repeat(2001)}],
    ['long current',{mode:'slot',slot:'hero',request:'cat',current:'x'.repeat(6001)}],
    ['legacy HTML rejected in slot mode',{mode:'slot',slot:'hero',request:'cat',baseHtml:'<html></html>'}],
    ['wrong current shape',{mode:'slot',slot:'hero',request:'cat',current:{}}],
    ['route unknown source',{mode:'route',request:'cat',current:{engine:'source'}}],
    ['route slot field',{mode:'route',slot:'hero',request:'cat'}],
    ['route unapproved config',{mode:'route',request:'cat',config:{abilityId:'giant'}}],
    ['route speed range',{mode:'route',request:'cat',config:{speedMultiplier:3}}],
    ['route lives integer',{mode:'route',request:'cat',config:{initialLives:1.5}}],
    ['route sound range',{mode:'route',request:'cat',config:{soundPreset:'arbitrary'}}]
  ];
  for (const [name,body] of invalid) await check(name,async()=>{const r=await run(body);assert.equal(r.status,400);assert.equal(r.fetchCalls,0);assert.equal(r.rateCalls,0);});
  await check('20,000 character body limit',async()=>{const r=await run({mode:'slot',slot:'hero',request:'cat',contract:'x'.repeat(20000)});assert.equal(r.status,413);assert.equal(r.fetchCalls,0);});
  await check('origin guard unchanged',async()=>{assert.equal((await run({mode:'slot',slot:'hero',request:'cat'},{headers:{Origin:'https://foreign.example'}})).status,403);});
  await check('rate limiting retained',async()=>{const r=await run({mode:'slot',slot:'hero',request:'cat'},{rateLimited:true});assert.equal(r.status,429);assert.equal(r.fetchCalls,0);});
  await check('upstream error sanitized',async()=>{const r=await run({mode:'slot',slot:'hero',request:'cat'},{upstreamStatus:503});assert.equal(r.status,502);assert.equal(r.text.includes('mock-key'),false);});
  for (const body of [{prompt:'  게임을 만들어 줘.  '},{prompt:'게임 변경',baseHtml:'<html><body>old</body></html>'},{prompt:''},{prompt:'x'.repeat(16001)},{prompt:'게임',baseHtml:'invalid'},null,{},'{broken']) {
    await check('legacy request behavior '+results.length,async()=>{assert.equal(JSON.stringify(await run(body)),JSON.stringify(await run(body,{},legacy)));});
  }
  await check('legacy request builder is byte-for-byte unchanged',()=>{
    const builder=text=>text.slice(text.indexOf('function gameRequest('),text.indexOf('__name(gameRequest, "gameRequest");'));
    assert.equal(builder(source),builder(baseline));
  });
  const out=path.resolve(root,'../../85_공룡3_모듈화/2차캡처'); fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'서버검증결과.json'),JSON.stringify({baseline:'7b40669',tests:results.length,results,actualAiCalls:0},null,2));
  console.log(`${results.length} tests passed; no external calls.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
