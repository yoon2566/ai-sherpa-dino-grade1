'use strict';
// Offline integration fixtures only. This script never invokes OpenRouter or a database.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const {chromium} = require(path.resolve(__dirname, '../../../70_검수/node_modules/playwright'));
const repo = path.resolve(__dirname, '..');
const root = path.join(repo, 'assets');
const out = path.resolve(__dirname, '../../../85_공룡3_모듈화/2차캡처');
const ports = [19213, 19214];
const report = {scope:'localhost synthetic classroom and mock SSE; no live AI, database or deployment',checks:[],errors:[],blockedRequests:[],mockRequests:[],captures:[]};
fs.mkdirSync(out, {recursive:true});
const cache = new Map();
function check(name,details) { report.checks.push({name,pass:true,...(details===undefined?{}:{details})}); console.log('PASS '+name); }
function createServer(baseline=false) {
  return http.createServer((req,res)=>{
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname === '/api/classroom/999999') {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({name:'로컬 검증',code:'999999',openPages:[1,2,3,4,5,6],canManage:false}));}
    if(pathname.startsWith('/api/')) {res.writeHead(503);return res.end('{"error":"Local tests block live APIs"}');}
    let rel=pathname.replace(/^\//,'');if(!rel||rel.endsWith('/'))rel+='index.html';if(rel==='lesson')rel='lesson.html';
    const filename=path.resolve(root,rel);if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try {
      let data;
      if(baseline){if(!cache.has(rel))cache.set(rel,execFileSync('git',['show','7b40669:assets/'+rel],{cwd:repo,maxBuffer:25000000,windowsHide:true,stdio:['ignore','pipe','pipe']}));data=cache.get(rel);}
      else data=fs.readFileSync(filename);
      res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.png':'image/png','.ttf':'font/ttf'})[path.extname(filename)]||'application/octet-stream');res.end(data);
    }catch{res.writeHead(404);res.end();}
  });
}
function codeFor(slot,revision=0) {
  const code={
    hero:"function drawHero(ctx, v) {\n  ctx.fillStyle = '#2364aa';\n  ctx.fillRect(0, 0, v.pose === 'duck' ? 59 : 44, v.pose === 'duck' ? 25 : 47);\n  ctx.fillStyle = '#ffffff';\n  ctx.fillRect(26, 8, 8, 8);\n  ctx.fillStyle = '#172c48';\n  ctx.fillRect(30, 10, 3, 4);\n}",
    background:"function drawBackground(ctx, v) {\n  ctx.fillStyle = '#d5efff';\n  ctx.fillRect(0, 0, v.w, v.h);\n  ctx.fillStyle = '#ffe8a8';\n  ctx.fillRect(0, v.groundY, v.w, v.h - v.groundY);\n  ctx.fillStyle = '#ffffff';\n  ctx.fillRect(60, 24, 56, 12);\n}",
    obstacle:"function drawObstacle(ctx, v) {\n  ctx.fillStyle = '#985832';\n  ctx.fillRect(0, 0, v.w, v.h);\n  ctx.fillStyle = '#c48f54';\n  ctx.fillRect(3, 3, v.w - 6, v.h - 6);\n}",
    item:"function drawItem(ctx, v) {\n  ctx.fillStyle = '#f44a61';\n  ctx.beginPath();\n  ctx.arc(8, 9, 6, 0, Math.PI * 2);\n  ctx.fill();\n  ctx.fillStyle = '#2c944a';\n  ctx.fillRect(7, 0, 3, 4);\n}"
  }[slot];
  if(!code)throw Error('unknown fixture slot '+slot);
  return code.replace(/\n}$/, '\n  // fixture '+revision+'\n}');
}
function fenced(code,style) {return '```javascript\n'+(style?'// obstacleStyle: '+JSON.stringify(style)+'\n':'')+code+'\n```';}
function sse(raw) {
  const chunks=[];for(let i=0;i<raw.length;i+=47)chunks.push('data: '+JSON.stringify({choices:[{delta:{content:raw.slice(i,i+47)}}]})+'\n\n');
  chunks.push('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:111,completion_tokens:222,cost:0}})+'\n\n');
  chunks.push('data: [DONE]\n\n');return chunks.join('');
}
async function guardedContext(browser,options={}) {
  const ctx=await browser.newContext({acceptDownloads:true,...options});
  await ctx.addInitScript(()=>{
    const fill=CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){
      if(this.fillStyle==='#2364aa'&&x===0&&y===0&&(w===44||w===59)){
        const m=this.getTransform();window.__observedHero={x:m.e,y:m.f,w:w*m.a,h:h*m.d};
      }
      return fill.call(this,x,y,w,h);
    };
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...a){if(a.length===9&&a[0].naturalWidth===704&&a[0].naturalHeight===94)window.__observedHero={x:a[5],y:a[6],w:a[7],h:a[8]};return draw.apply(this,a);};
  });
  await ctx.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(['data:','blob:','about:','file:'].includes(url.protocol))return route.continue();
    if(url.hostname==='127.0.0.1'&&ports.includes(Number(url.port)))return route.continue();
    report.blockedRequests.push(url.origin+url.pathname);return route.abort();
  });
  ctx.on('page',p=>p.on('pageerror',e=>report.errors.push(e.message)));
  return ctx;
}
async function mockAI(context) {
  const mock={calls:[],respond:null,revision:0};
  await context.route('**/api/game',async route=>{
    const payload=route.request().postDataJSON();mock.calls.push(payload);
    report.mockRequests.push({mode:payload.mode,slot:payload.slot,request:payload.request,bytes:Buffer.byteLength(JSON.stringify(payload))});
    let raw;
    if(mock.respond)raw=mock.respond(payload,mock.calls.length);
    else if(payload.mode==='route')raw=JSON.stringify({slot:'background',code:codeFor('background',++mock.revision)});
    else raw=fenced(codeFor(payload.slot,++mock.revision),payload.slot==='obstacle'?{sizeScale:1.1,shape:'rect'}:null);
    await route.fulfill({status:200,contentType:'text/event-stream; charset=utf-8',body:sse(raw)});
  });
  return mock;
}
async function practicePage(context,baseline=false) {
  const page=await context.newPage();await page.goto(`http://127.0.0.1:${baseline?ports[1]:ports[0]}/lesson.html?room=999999`);
  await page.waitForFunction(()=>document.getElementById('next')&&!document.getElementById('next').disabled);
  for(let i=0;i<4;i++)await page.locator('#next').click();
  const f=await(await page.locator('#practice').elementHandle()).contentFrame();
  await f.waitForFunction(()=>typeof html==='string'&&html.length>0&&document.querySelector('#conversation article'));
  await f.locator('#game').waitFor({state:'attached'});return {page,f};
}
const lastButton=(f,name)=>f.getByRole('button',{name,exact:true}).last().click();
const ready=f=>f.waitForFunction(()=>typeof working!=='undefined'&&!working);
const state=f=>f.evaluate(()=>({html,project:JSON.stringify(modularProject),step,progress:document.getElementById('progress').textContent}));
async function shot(page,name) {await page.screenshot({path:path.join(out,name)});report.captures.push(name);}
async function snapshotUI(f) {return f.evaluate(()=>{
  const selectors=['#progress','#chat-panel','#preview-panel','.preview-heading','.play-controls','#special','#duck','#jump','#expand-game'];
  const values={};for(const selector of selectors){const el=document.querySelector(selector),r=el.getBoundingClientRect(),s=getComputedStyle(el);values[selector]={text:['#progress','#special','#duck','#jump','#expand-game'].includes(selector)?el.textContent:null,x:r.x,y:r.y,w:r.width,h:r.height,color:s.color,background:s.backgroundColor,display:s.display};}
  values.choices=[...document.querySelectorAll('.choice-label')].map(n=>n.textContent);values.headings=[...document.querySelectorAll('#conversation h2')].map(n=>n.textContent);return values;
});}
async function customRequest(f,text) {
  await f.evaluate(()=>{step=8;customPicker();});
  await lastButton(f,'직접 적기');await f.getByRole('textbox',{name:'바꾸고 싶은 내용'}).last().fill(text);await lastButton(f,'이렇게 바꾸기 ✨');await ready(f);
}
async function runRejections(browser) {
  const ctx=await guardedContext(browser,{viewport:{width:1280,height:900}}),mock=await mockAI(ctx),{page,f}=await practicePage(ctx);
  await f.getByRole('button',{name:'고양이',exact:true}).click();await ready(f);
  const installed=await state(f);assert.notEqual(JSON.parse(installed.project).slots.hero.mode,'default');assert.match(installed.html,/fixture 1/);assert.equal(mock.calls.length,1);check('정상 AI 칸: AST·실행 검사 통과 후에만 교체');
  const bad=[
    ['문법 오류','function drawHero(ctx,v) { ctx.fillRect(0,0,44,47);'],
    ['무한 루프','function drawHero(ctx,v) { while (true) {} }'],
    ['빈 그림','function drawHero(ctx,v) {}'],
    ['금지 API document',"function drawHero(ctx,v) { document.body.textContent='x'; ctx.fillRect(0,0,44,47); }"],
    ['금지 API fetch',"function drawHero(ctx,v) { fetch('https://example.com'); ctx.fillRect(0,0,44,47); }"],
    ['함수 여러 개','function drawHero(ctx,v) { ctx.fillRect(0,0,44,47); } function extra() {}'],
    ['이름 틀림','function drawItem(ctx,v) { ctx.fillRect(0,0,44,47); }']
  ];
  for(const [label,code]of bad){
    const before=await state(f),count=mock.calls.length;mock.respond=()=>fenced(code);
    await f.evaluate(()=>{step=0;next();});await f.getByRole('button',{name:'로봇',exact:true}).last().click();await ready(f);
    const after=await state(f);assert.equal(after.html,before.html,label);assert.equal(after.project,before.project,label);assert.equal(mock.calls.length-count,2,label+' exactly one retry');
    assert.equal(await f.locator('#conversation .error').last().textContent(),'잘 안 됐어요. 다시 해봐요.');
    assert.equal(await f.locator('#status').textContent(),'이전 게임 유지');check(label+': 거절·1회 재요청·이전 칸 유지');
  }
  await shot(page,'safety-rejected-previous-preserved.png');
  mock.respond=null;await f.evaluate(()=>{step=0;next();});await f.getByRole('button',{name:'로봇',exact:true}).last().click();await ready(f);
  const first=JSON.parse((await state(f)).project),count=mock.calls.length;
  await lastButton(f,'다시 그리기');await ready(f);const second=JSON.parse((await state(f)).project),payload=mock.calls.at(-1);
  assert.equal(mock.calls.length-count,1);assert.equal(payload.slot,'hero');assert.match(JSON.stringify(payload.current),/fixture/);assert(JSON.stringify(payload.current).includes(first.slots.hero.code.replace(/\n/g,'\\n'))||JSON.stringify(payload.current).includes('fixture'));assert.match(payload.request,/새롭게/);assert.notEqual(second.slots.hero.code,first.slots.hero.code);assert.deepEqual(second.config,first.config);check('다시 그리기: 같은 칸·이전 소스·새롭게 요청·설정 유지');
  const beforeRoute=await state(f);mock.respond=()=>JSON.stringify({unsupported:true});const n=mock.calls.length;await customRequest(f,'캐릭터 없애줘');assert.equal(mock.calls.length-n,1);assert.equal((await state(f)).html,beforeRoute.html);assert.equal((await state(f)).project,beforeRoute.project);assert(await f.getByText('그건 이 게임에서 바꿀 수 없어요. 다른 걸 골라 봐요.',{exact:true}).last().isVisible());check('9단계 unsupported: 엔진 변경 거절·기존 작품 유지·재시도 없음');
  mock.respond=()=>JSON.stringify({config:{speedMultiplier:1.5,initialLives:5,soundPreset:'뿅!'}});await customRequest(f,'좀 빠르게 달리고 목숨 다섯 개, 점프 소리 뿅');const routed=JSON.parse((await state(f)).project);assert.equal(routed.config.speedMultiplier,1.5);assert.equal(routed.config.initialLives,5);assert.equal(routed.config.soundPreset,'뿅!');assert.deepEqual(routed.slots,second.slots);check('9단계 config: 허용 속도·목숨·소리만 변경');
  const badRoutes=[['범위 밖 설정',{config:{initialLives:99}}],['엔진 설정 주입',{config:{gravity:0}}],['슬롯 두 개',{slot:'hero',code:codeFor('hero'),config:{initialLives:5}}],['그림 안전 검사',{slot:'background',code:'function drawBackground(ctx,v){fetch("https://example.com");}'}]];
  for(const[label,response]of badRoutes){const before=await state(f);mock.respond=()=>JSON.stringify(response);await customRequest(f,'설정을 바꿔줘');assert.equal((await state(f)).html,before.html,label);assert.equal((await state(f)).project,before.project,label);check('9단계 '+label+': 거절·원본 보존');}
  let routedAttempts=0;const routeCount=mock.calls.length;
  mock.respond=payload=>{routedAttempts++;return payload.mode==='route'?JSON.stringify({slot:'background',code:'function drawBackground(ctx,v) {}'}):fenced(codeFor('background',98));};
  await customRequest(f,'무지개 배경');assert.equal(routedAttempts,2);assert.deepEqual(mock.calls.slice(routeCount).map(x=>[x.mode,x.slot]),[['route',undefined],['slot','background']]);assert.match(JSON.parse((await state(f)).project).slots.background.code,/fixture 98/);check('9단계 그림 검사 실패: 라우터 1회·같은 칸만 1회 재요청');
  mock.respond=()=>JSON.stringify({slot:'background',code:codeFor('background',99)});const before=JSON.parse((await state(f)).project);await customRequest(f,'무지개 배경');const after=JSON.parse((await state(f)).project);assert.match(after.slots.background.code,/fixture 99/);assert.deepEqual(after.slots.hero,before.slots.hero);assert.deepEqual(after.config,before.config);check('9단계 slot: 검사 통과한 한 칸만 교체');
  await shot(page,'route-one-slot.png');await ctx.close();
}
async function runUI(browser) {
  for(const[width,height]of[[1280,900],[1024,768],[768,1024]]){
    const ctx=await guardedContext(browser,{viewport:{width,height},hasTouch:width!==1280});
    const old=await practicePage(ctx,true);await shot(old.page,`phase1-baseline-${width}x${height}.png`);const before=await snapshotUI(old.f);await old.page.close();
    const mock=await mockAI(ctx),{page,f}=await practicePage(ctx);await shot(page,`initial-${width}x${height}.png`);const after=await snapshotUI(f);assert.deepEqual(after,before);check(`초기 학생 UI 문구·선택지·색·배치 유지 ${width}×${height}`);
    for(let stepNumber=1;stepNumber<=9;stepNumber++){
      await f.locator('.step-message').last().evaluate(n=>n.scrollIntoView({behavior:'instant',block:'start'}));
      await shot(page,`step${stepNumber}-${width}x${height}.png`);
      if(stepNumber===1)await f.getByRole('button',{name:'고양이',exact:true}).click();
      if(stepNumber===2)await f.getByRole('button',{name:'바닷가',exact:true}).click();
      if(stepNumber===3)await f.getByRole('button',{name:'상자',exact:true}).click();
      if(stepNumber===4){await f.locator('#speed-range').fill('0');await lastButton(f,'이걸로 정하기 ✓');}
      if(stepNumber===5){await f.locator('#lives-range').fill('9');await lastButton(f,'이걸로 정하기 ✓');}
      if(stepNumber===6)await f.getByRole('button',{name:'사과',exact:true}).click();
      if(stepNumber===7)await f.getByRole('button',{name:'잠깐 무적',exact:true}).click();
      if(stepNumber===8)await f.getByRole('button',{name:'반짝!',exact:true}).click();
      if(stepNumber===9){await lastButton(f,'직접 적기');await f.getByRole('textbox',{name:'바꾸고 싶은 내용'}).fill('무지개 배경');await lastButton(f,'이렇게 바꾸기 ✨');}
      await ready(f);assert.equal(await f.locator('#conversation .error').count(),0,`${stepNumber} generation failed`);
      await lastButton(f,stepNumber===9?'완성하기 ✓':stepNumber===8?'내 생각 더하기 →':'다음 단계 →');
    }
    const completed=await state(f),project=JSON.parse(completed.project);assert.equal(completed.progress,'완성');assert.equal(mock.calls.length,5);assert.deepEqual(mock.calls.map(x=>x.mode),['slot','slot','slot','slot','route']);assert.deepEqual(mock.calls.filter(x=>x.mode==='slot').map(x=>x.slot),['hero','background','obstacle','item']);assert.equal(project.config.itemsEnabled,true);assert.equal(project.config.itemName,'사과');assert.equal(project.config.speedMultiplier,.5);assert.equal(project.config.initialLives,9);assert.equal(project.config.abilityId,'invincible');assert.equal(project.config.soundPreset,'반짝!');check(`1~9 전체 흐름: AI 4칸·라우터, 설정 단계 AI 없음 ${width}×${height}`,{modes:mock.calls.map(x=>x.mode),requestBytes:mock.calls.map(x=>Buffer.byteLength(JSON.stringify(x)))});
    const lessonData=JSON.parse(fs.readFileSync(path.join(root,'practice/lesson-data.json'),'utf8'));
    for(const[index,[stage,label]]of[[0,'고양이'],[1,'바닷가'],[2,'상자'],[5,'사과']].entries())assert.equal(mock.calls[index].request,lessonData.stages[stage].questions[0].issues.find(x=>x.label===label)?.request||[`주인공을 ${label} 모습으로 새로 그려 줘.`,`배경을 ${label} 풍경으로 바꿔 줘.`,`장애물을 ${label} 모양으로 바꿔 줘.`][stage]);
    check(`선택지의 기존 요청 문구 그대로 전송 ${width}×${height}`);
    await f.getByRole('heading',{name:'나만의 게임 완성! 🎉',exact:true}).evaluate(n=>n.scrollIntoView({behavior:'instant',block:'center'}));await shot(page,`complete-${width}x${height}.png`);
    if(await f.locator('#preview-tab').isVisible())await f.locator('#preview-tab').click();await f.locator('#game').waitFor({state:'visible'});await shot(page,`preview-${width}x${height}.png`);
    const controls=await f.locator('.play-controls button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return{id:b.id,x:r.x,y:r.y,right:r.right,width:r.width};}));assert.equal(controls.length,3);assert(Math.max(...controls.map(x=>x.y))-Math.min(...controls.map(x=>x.y))<2);for(let i=1;i<controls.length;i++)assert(controls[i].x>=controls[i-1].right);check(`버튼 한 줄 ${width}×${height}`,controls);
    await runEmbeddedInput(page,f,width,height);
    await f.locator('#expand-game').click();await f.waitForFunction(()=>document.querySelector('#preview-panel').classList.contains('expanded-game'));await shot(page,`expanded-${width}x${height}.png`);await f.locator('#expand-game').click();check(`크게 보기 열기·닫기 ${width}×${height}`);
    await page.reload();await page.waitForFunction(()=>!document.getElementById('next').disabled);for(let i=0;i<4;i++)await page.locator('#next').click();const rf=await(await page.locator('#practice').elementHandle()).contentFrame();await rf.waitForFunction(()=>document.getElementById('progress').textContent==='완성');assert.equal((await state(rf)).html,completed.html);check(`room 로컬 이어하기: AI 칸 단일 HTML 보존 ${width}×${height}`);
    if(width===1280){const dp=page.waitForEvent('download');await rf.locator('#download').click();const download=await dp;report.download=path.join(out,'내려받은-2차-모듈화-게임.html');await download.saveAs(report.download);assert.equal(fs.readFileSync(report.download,'utf8'),completed.html);}
    await ctx.close();
  }
}
async function runEmbeddedInput(page,f,width,height) {
  const game=await(await f.locator('#game').elementHandle()).contentFrame();await game.waitForFunction(()=>window.__observedHero?.h===47);
  assert.equal(await game.locator('#grade1-duck').isVisible(),false);assert.equal(await game.locator('#grade1-special').isVisible(),false);
  if(width===1280)await f.locator('#jump').click();else await f.locator('#jump').tap();await game.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));await game.waitForFunction(()=>window.__observedHero?.x===24&&window.__observedHero?.y===93);
  if(width===1280){await game.locator('canvas').focus();await page.keyboard.down('Space');await game.waitForFunction(()=>window.__observedHero.y<85);await page.keyboard.up('Space');await game.waitForFunction(()=>window.__observedHero.y===93);await page.keyboard.down('ArrowDown');await game.waitForFunction(()=>window.__observedHero.h===25);await page.keyboard.up('ArrowDown');await game.waitForFunction(()=>window.__observedHero.h===47);}
  else {await game.locator('canvas').tap({position:{x:150,y:60}});await game.waitForFunction(()=>window.__observedHero.y<85);await game.waitForFunction(()=>window.__observedHero.y===93);const b=await f.locator('#duck').boundingBox(),cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await game.waitForFunction(()=>window.__observedHero.h===25);assert.equal(await f.locator('#duck').getAttribute('aria-pressed'),'true');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await game.waitForFunction(()=>window.__observedHero.h===47);assert.equal(await f.locator('#duck').getAttribute('aria-pressed'),'false');}
  await f.locator('#special').click();await f.waitForFunction(()=>document.getElementById('special').dataset.state==='active');await shot(page,`embedded-input-${width}x${height}.png`);check(`AI 캐릭터 키보드·터치·특수 버튼 ${width}×${height}`);
  await page.locator('#previous').click();await f.waitForFunction(()=>document.getElementById('game').getAttribute('srcdoc')==='');assert.equal(await f.locator('#duck').getAttribute('aria-pressed'),'false');await page.locator('#next').click();await f.waitForFunction(()=>document.getElementById('game').getAttribute('srcdoc').length>0);check(`수업 페이지 이동 시 게임 중지·복원 ${width}×${height}`);
}
async function runDownload(browser) {
  for(const[width,height]of[[1280,900],[1024,768],[768,1024]]){
    const ctx=await guardedContext(browser,{viewport:{width,height},hasTouch:width!==1280}),page=await ctx.newPage();await page.goto(pathToFileURL(report.download).href);await page.waitForFunction(()=>window.__observedHero?.h===47);assert.match(await page.locator('#status').textContent(),/시작 전/);
    if(width===1280)await page.locator('canvas').click({position:{x:150,y:60}});else await page.locator('canvas').tap({position:{x:150,y:60}});await page.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));await page.waitForFunction(()=>window.__observedHero?.x===24&&window.__observedHero?.y===93);
    if(width===1280){await page.keyboard.down('Space');await page.waitForFunction(()=>window.__observedHero.y<85);await page.keyboard.up('Space');await page.waitForFunction(()=>window.__observedHero.y===93);await page.keyboard.down('ArrowDown');await page.waitForFunction(()=>window.__observedHero.h===25);await shot(page,`file-${width}x${height}-keyboard-duck.png`);await page.keyboard.up('ArrowDown');await page.waitForFunction(()=>window.__observedHero.h===47);await page.keyboard.press('x');}
    else{const duck=page.locator('#grade1-duck'),b=await duck.boundingBox(),cdp=await ctx.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await page.waitForFunction(()=>window.__observedHero.h===25);assert.equal(await duck.getAttribute('aria-pressed'),'true');await shot(page,`file-${width}x${height}-touch-duck.png`);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>window.__observedHero.h===47);assert.equal(await duck.getAttribute('aria-pressed'),'false');await page.locator('#grade1-special').tap();}
    await page.waitForFunction(()=>document.getElementById('grade1-special').dataset.state==='active');await page.locator('#soundBtn').click();assert.equal(await page.locator('#soundBtn').getAttribute('aria-pressed'),'false');await page.locator('#soundBtn').click();assert.equal(await page.locator('#soundBtn').getAttribute('aria-pressed'),'true');await shot(page,`file-${width}x${height}.png`);check(`다운로드 file:// AI 4칸·입력·소리 버튼 ${width}×${height}`);await ctx.close();
  }
}
async function runCompatibility(browser) {
  const ctx=await guardedContext(browser,{viewport:{width:1280,height:900}}),mock=await mockAI(ctx),{page,f}=await practicePage(ctx);
  await f.getByRole('button',{name:'고양이',exact:true}).click();await ready(f);const before=await state(f);
  await f.evaluate(()=>{window.__originalSave=saveClassroomPractice;window.saveClassroomPractice=()=>false;});await lastButton(f,'다시 그리기');await ready(f);assert.equal((await state(f)).html,before.html);assert.equal((await state(f)).project,before.project);await f.evaluate(()=>{window.saveClassroomPractice=window.__originalSave;});check('검사 통과 후 저장 실패: AI 칸·HTML 동시 원복');
  const count=mock.calls.length;await f.evaluate(()=>{step=0;next();});await f.getByRole('button',{name:'직접 그리기',exact:true}).last().click();const editor=f.locator('.grade1-pixel-editor canvas');await editor.click({position:{x:30,y:30}});await editor.click({position:{x:280,y:280}});await f.getByRole('button',{name:'이 캐릭터로 달리기',exact:true}).click();assert.equal(JSON.parse((await state(f)).project).slots.hero.mode,'pixel');assert.equal(mock.calls.length,count);check('직접 그리기: AI 칸에서 픽셀로 교체·AI 호출 없음');await shot(page,'pixel-after-ai.png');await ctx.close();
  const legacyHtml=fs.readFileSync(path.join(root,'original-game.html'),'utf8'),legacy=await guardedContext(browser,{viewport:{width:1280,height:900}});await legacy.addInitScript(({html})=>{if(window===top&&location.hostname==='127.0.0.1')localStorage.setItem('sherpa-room-999999:sherpa-grade1-practice-v1',JSON.stringify({version:1,html,step:3,complete:false}));},{html:legacyHtml});const old=await practicePage(legacy);assert.equal((await state(old.f)).html,legacyHtml);const game=await(await old.f.locator('#game').elementHandle()).contentFrame();await game.waitForFunction(()=>window.__observedHero?.h===47);await old.f.locator('#jump').click();await game.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));await old.f.evaluate(()=>{window.__mockLegacyCalls=0;receiveGameHtml=async()=>{window.__mockLegacyCalls++;return{html:lesson.game.replace('</body>','<!-- local legacy edit fixture --></body>')};};});await old.f.locator('#speed-range').fill('4');await lastButton(old.f,'이걸로 정하기 ✓');await ready(old.f);assert.match((await state(old.f)).html,/local legacy edit fixture/);assert.doesNotMatch((await state(old.f)).html,/sherpa-project/);assert.equal(await old.f.evaluate(()=>window.__mockLegacyCalls),1);check('구형 작품 원문 재생·기존 전체 HTML 편집 경로 보존');await shot(old.page,'legacy-playback-edit.png');await legacy.close();
}
async function main() {
  const servers=ports.map((_,i)=>createServer(i===1));await Promise.all(servers.map((s,i)=>new Promise(r=>s.listen(ports[i],'127.0.0.1',r))));
  if(process.argv.includes('--serve')){console.log('Synthetic phase2 servers '+ports.join(', '));return;}
  const browser=await chromium.launch({headless:true});
  try{await runRejections(browser);if(!process.argv.includes('--safety-only')){await runUI(browser);await runDownload(browser);await runCompatibility(browser);}assert.equal(report.blockedRequests.length,0);assert.equal(report.errors.length,0,report.errors.join('\n'));check('외부 요청·실제 AI 호출·JavaScript 런타임 예외 0건');report.ok=true;}
  catch(error){report.failure={message:error.message,stack:error.stack};throw error;}
  finally{report.count=report.checks.length;fs.writeFileSync(path.join(out,'2차-통합검증.json'),JSON.stringify(report,null,2));await browser.close();servers.forEach(s=>s.close());}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
