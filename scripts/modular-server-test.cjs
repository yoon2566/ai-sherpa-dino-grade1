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
const phase2 = execFileSync('git', ['show', 'c597aaf:modules/entry.js'], {cwd:root, encoding:'utf8', maxBuffer:8*1024*1024});
function load(text) {
  const gateway = text.slice(text.indexOf('// cloud/ai-gateway.mjs'), text.indexOf('// cloud/prompt-gateway.mjs'));
  const sandbox = {Response, Request, Headers, URL, TextEncoder, fetch, __name:value=>value};
  vm.createContext(sandbox);
  vm.runInContext(gateway, sandbox);
  return sandbox;
}
const current = load(source), legacy = load(baseline), previous = load(phase2);
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
  for (const slot of ['hero','obstacle','item']) {
    await check('pixel '+slot+' contract, fresh context, SSE and usage',async()=>{
      const r=await run({mode:'pixel',slot,request:'귀여운 새 그림을 그려 줘.'});
      assert.equal(r.status,200); assert.equal(r.text,sse); assert.match(r.type,/text\/event-stream/); assert.equal(r.cache,'no-store, no-transform');
      const p=r.upstream.body, data=JSON.parse(p.messages[1].content);
      assert.equal(p.model,'anthropic/claude-haiku-5.5'); assert.equal(p.max_tokens,1000); assert.equal(p.reasoning.enabled,false); assert.equal(p.stream_options.include_usage,true);
      assert.equal(p.provider.require_parameters,true);assert.equal(p.response_format.type,'json_schema');assert.equal(p.response_format.json_schema.strict,true);
      const schema=p.response_format.json_schema.schema;assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,['palette','pixels']);
      assert.equal(schema.properties.pixels.items.pattern,'^[.0-7]{16}$');assert.equal(schema.properties.palette.items.pattern,'^#[0-9a-f]{6}$');
      assert.equal(schema.properties.pixels.maxItems,undefined);assert.equal(schema.properties.pixels.minItems,1);
      assert.equal(data.slot,slot); assert.equal(Object.hasOwn(data,'current'),false); assert.equal(data.contract,undefined);
      assert.match(p.messages[0].content,/오른쪽을 보고 달리는 옆모습/); assert.match(p.messages[0].content,/상하좌우로 연결/); assert.match(p.messages[0].content,/아래쪽 마지막 줄까지/);
      assert.equal(r.rateCalls,1); assert.equal(r.fetchCalls,1);
    });
  }
  const drawing = {palette:['#ABCDEF','#123456'],pixels:Array(16).fill('....00110011....')};
  await check('pixel redraw/retry preserve 2,000 character request without growth',async()=>{
    const r=await run({mode:'pixel',slot:'hero',request:'가'.repeat(2000),redraw:true,retry:true});assert.equal(r.status,200);
    const data=JSON.parse(r.upstream.body.messages[1].content);assert.equal(data.request,'가'.repeat(2000));assert.match(data.redrawInstruction,/새롭게/);assert.match(data.retryInstruction,/검사에 통과하지 못/);
  });
  await check('pixel edit carries only normalized compact current drawing',async()=>{
    const r=await run({mode:'pixel',slot:'hero',request:'캐릭터 색 파랗게',current:drawing});
    assert.equal(r.status,200); const data=JSON.parse(r.upstream.body.messages[1].content);
    assert.deepEqual(data.current,{palette:['#abcdef','#123456'],pixels:drawing.pixels});
    assert.deepEqual(Object.keys(data).sort(),['current','request','slot']);
  });
  await check('pixel current accepts all 12 edited colors without loss',async()=>{
    const edited = {palette:Array.from({length:12},(_,i)=>'#'+i.toString(16).padStart(6,'0')),pixels:Array(16).fill('..0123456789ab..')};
    const r=await run({mode:'pixel',slot:'item',request:'이 선물을 다시 그려 줘.',current:edited});
    assert.equal(r.status,200); assert.deepEqual(JSON.parse(r.upstream.body.messages[1].content).current,edited);
  });
  await check('pixel current permits sparse and disconnected manual edits',async()=>{
    const edited = {palette:['#123456'],pixels:['0...............',...Array(14).fill('................'),'...............0']};
    const r=await run({mode:'pixel',slot:'hero',request:'빈 칸을 채워 줘.',current:edited});
    assert.equal(r.status,200); assert.deepEqual(JSON.parse(r.upstream.body.messages[1].content).current,edited);
  });
  await check('pixel route selects art targets and keeps only background code contract',async()=>{
    const r=await run({mode:'route',artMode:'pixel',request:'장애물 더 뾰족하게',current:{background:'function drawBackground(ctx,v){}'},config:{initialLives:5}});
    assert.equal(r.status,200); const p=r.upstream.body, data=JSON.parse(p.messages[1].content);
    assert.equal(p.max_tokens,4000); assert.deepEqual(Object.keys(data.contracts),['background']);
    assert.match(p.messages[0].content,/"slot":"hero\|obstacle\|item","request"/); assert.match(p.messages[0].content,/그 칸의 함수 코드·palette·pixels를 절대 생성하지 않는다/);
    assert.match(p.messages[0].content,/"slot":"background","code"/); assert.match(p.messages[0].content,/캐릭터 없애기는 빈 그림으로 대신하지 않는다/);
    assert.equal(data.current.background,'function drawBackground(ctx,v){}'); assert.equal(data.config.initialLives,5);
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
    ['route sound range',{mode:'route',request:'cat',config:{soundPreset:'arbitrary'}}],
    ['pixel background rejected',{mode:'pixel',slot:'background',request:'cat'}],
    ['pixel missing slot',{mode:'pixel',request:'cat'}],
    ['pixel empty request',{mode:'pixel',slot:'hero',request:' '}],
    ['pixel long request',{mode:'pixel',slot:'hero',request:'x'.repeat(2001)}],
    ['pixel code current rejected',{mode:'pixel',slot:'hero',request:'cat',current:'function drawHero(ctx,v){}'}],
    ['pixel null current rejected',{mode:'pixel',slot:'hero',request:'cat',current:null}],
    ['pixel array current rejected',{mode:'pixel',slot:'hero',request:'cat',current:[]}],
    ['pixel current extra fields rejected',{mode:'pixel',slot:'hero',request:'cat',current:{...drawing,code:'bad'}}],
    ['pixel palette empty rejected',{mode:'pixel',slot:'hero',request:'cat',current:{...drawing,palette:[]}}],
    ['pixel palette too long rejected',{mode:'pixel',slot:'hero',request:'cat',current:{...drawing,palette:Array(13).fill('#123456')}}],
    ['pixel malformed color rejected',{mode:'pixel',slot:'hero',request:'cat',current:{...drawing,palette:['red']}}],
    ['pixel short color rejected',{mode:'pixel',slot:'hero',request:'cat',current:{...drawing,palette:['#abc']}}],
    ['pixel short height rejected',{mode:'pixel',slot:'hero',request:'cat',current:{...drawing,pixels:drawing.pixels.slice(1)}}],
    ['pixel short width rejected',{mode:'pixel',slot:'hero',request:'cat',current:{...drawing,pixels:Array(16).fill('000000000000000')}}],
    ['pixel invalid index rejected',{mode:'pixel',slot:'hero',request:'cat',current:{...drawing,pixels:Array(16).fill('0000000000000002')}}],
    ['pixel whitespace rejected',{mode:'pixel',slot:'hero',request:'cat',current:{...drawing,pixels:Array(16).fill('000000000000000 ')}}],
    ['pixel uppercase index rejected',{mode:'pixel',slot:'hero',request:'cat',current:{palette:Array(12).fill('#123456'),pixels:Array(16).fill('000000000000000B')}}],
    ['pixel untrusted contract rejected',{mode:'pixel',slot:'hero',request:'cat',contract:{maxColors:999}}],
    ['pixel legacy HTML rejected',{mode:'pixel',slot:'hero',request:'cat',baseHtml:'<html></html>'}],
    ['pixel config rejected',{mode:'pixel',slot:'hero',request:'cat',config:{initialLives:5}}],
    ['pixel nonboolean redraw rejected',{mode:'pixel',slot:'hero',request:'cat',redraw:'true'}],
    ['pixel nonboolean retry rejected',{mode:'pixel',slot:'hero',request:'cat',retry:1}],
    ['unknown route art mode rejected',{mode:'route',artMode:'code',request:'cat'}],
    ['slot art mode rejected',{mode:'slot',artMode:'pixel',slot:'hero',request:'cat'}],
    ['pixel art mode rejected',{mode:'pixel',artMode:'pixel',slot:'hero',request:'cat'}],
    ['pixel router hero code rejected',{mode:'route',artMode:'pixel',request:'cat',current:{hero:'function drawHero(ctx,v){}'}}],
    ['pixel router drawing rejected',{mode:'route',artMode:'pixel',request:'cat',current:{hero:drawing}}]
  ];
  for (const [name,body] of invalid) await check(name,async()=>{const r=await run(body);assert.equal(r.status,400);assert.equal(r.fetchCalls,0);assert.equal(r.rateCalls,0);});
  await check('20,000 character body limit',async()=>{const r=await run({mode:'slot',slot:'hero',request:'cat',contract:'x'.repeat(20000)});assert.equal(r.status,413);assert.equal(r.fetchCalls,0);});
  await check('origin guard unchanged',async()=>{assert.equal((await run({mode:'slot',slot:'hero',request:'cat'},{headers:{Origin:'https://foreign.example'}})).status,403);});
  await check('rate limiting retained',async()=>{const r=await run({mode:'slot',slot:'hero',request:'cat'},{rateLimited:true});assert.equal(r.status,429);assert.equal(r.fetchCalls,0);});
  await check('upstream error sanitized',async()=>{const r=await run({mode:'slot',slot:'hero',request:'cat'},{upstreamStatus:503});assert.equal(r.status,502);assert.equal(r.text.includes('mock-key'),false);});
  await check('pixel origin guard retained',async()=>{assert.equal((await run({mode:'pixel',slot:'hero',request:'cat'},{headers:{Origin:'https://foreign.example'}})).status,403);});
  await check('pixel rate limiting retained',async()=>{const r=await run({mode:'pixel',slot:'hero',request:'cat'},{rateLimited:true});assert.equal(r.status,429);assert.equal(r.fetchCalls,0);});
  await check('pixel upstream error sanitized',async()=>{const r=await run({mode:'pixel',slot:'hero',request:'cat'},{upstreamStatus:503});assert.equal(r.status,502);assert.equal(r.text.includes('mock-key'),false);});
  for(const body of [{mode:'slot',slot:'hero',request:'고양이',current:'function drawHero(ctx,v){}'}, {mode:'slot',slot:'background',request:'바닷가'}, {mode:'route',request:'캐릭터 파랗게',current:{hero:'function drawHero(ctx,v){}'},config:{initialLives:3}}, {mode:'route',request:'캐릭터 없애줘'}]) {
    await check('phase 2 request behavior '+results.length,async()=>{assert.equal(JSON.stringify(await run(body)),JSON.stringify(await run(body,{},previous)));});
  }
  for (const body of [{prompt:'  게임을 만들어 줘.  '},{prompt:'게임 변경',baseHtml:'<html><body>old</body></html>'},{prompt:''},{prompt:'x'.repeat(16001)},{prompt:'게임',baseHtml:'invalid'},null,{},'{broken']) {
    await check('legacy request behavior '+results.length,async()=>{assert.equal(JSON.stringify(await run(body)),JSON.stringify(await run(body,{},legacy)));});
  }
  await check('legacy request builder is byte-for-byte unchanged',()=>{
    const builder=text=>text.slice(text.indexOf('function gameRequest('),text.indexOf('__name(gameRequest, "gameRequest");'));
    assert.equal(builder(source),builder(baseline));
  });
  const out = process.env.MODULAR_CAPTURE_DIR || path.resolve(root,'../../85_공룡3_모듈화/3차캡처'); fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'서버검증결과.json'),JSON.stringify({baseline:'c597aaf',legacyBaseline:'7b40669',tests:results.length,results,actualAiCalls:0},null,2));
  console.log(`${results.length} tests passed; no external calls.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
