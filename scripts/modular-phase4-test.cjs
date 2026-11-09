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
const out = process.env.MODULAR_CAPTURE_DIR || path.resolve(__dirname, '../../../85_공룡3_모듈화/4차캡처');
const ports = [19413, 19414];
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
      if(baseline){if(!cache.has(rel))cache.set(rel,execFileSync('git',['show','d4e0663:assets/'+rel],{cwd:repo,maxBuffer:25000000,windowsHide:true,stdio:['ignore','pipe','pipe']}));data=cache.get(rel);}
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
    item:"function drawItem(ctx, v) {\n  ctx.fillStyle = '#f44a61';\n  ctx.beginPath();\n  ctx.arc(v.w / 2, v.h / 2, v.w * .4, 0, Math.PI * 2);\n  ctx.fill();\n  ctx.fillStyle = '#2c944a';\n  ctx.fillRect(v.w * .45, 0, v.w * .15, v.h * .25);\n}"
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
function pixelFor(slot,revision=0) {
  const color={hero:'#2364aa',obstacle:'#985832',item:'#f44a61'}[slot];
  return {palette:[color,'#172c48',revision%2?'#ffffff':'#ffca35'],pixels:Array.from({length:16},(_,y)=>{
    if(y<2)return '................';
    if(y===2||y===15)return '...1111111111...';
    if(y===5)return '...1000020011...';
    return '...1000000001...';
  })};
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
    CanvasRenderingContext2D.prototype.drawImage=function(...a){if(a.length===9&&(a[0].naturalWidth===704&&a[0].naturalHeight===94||(a[0].width===16&&a[0].height===16||a[0].width===44&&a[0].height===47)&&a[5]>=0&&a[5]<70&&a[7]>20))window.__observedHero={x:a[5],y:a[6],w:a[7],h:a[8]};return draw.apply(this,a);};
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
    else if(payload.mode==='pixel')raw=JSON.stringify(pixelFor(payload.slot,++mock.revision));
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
const editor=f=>f.locator('.grade1-pixel-editor');
async function openDraft(f,label) {await f.getByRole('button',{name:label,exact:true}).last().click();await editor(f).waitFor({state:'visible'});}
async function applyDraft(f) {await editor(f).locator('.pixel-apply').click();await editor(f).waitFor({state:'detached'});await ready(f);}
async function chooseStep(f,index) {await f.evaluate(n=>{step=n;next();},index);}
async function startCustom(f,text) {await f.evaluate(()=>{step=8;customPicker();});await lastButton(f,'직접 적기');await f.getByRole('textbox',{name:'바꾸고 싶은 내용'}).last().fill(text);await lastButton(f,'이렇게 바꾸기 ✨');}
async function editorSnapshot(f) {return editor(f).evaluate(dialog=>{
  const result={};for(const selector of ['canvas','.pixel-workspace','.pixel-tools','.pixel-cancel','.pixel-apply']){
    const el=dialog.querySelector(selector),s=getComputedStyle(el),r=el.getBoundingClientRect();
    result[selector]={w:r.width,h:r.height,color:s.color,background:s.backgroundColor,border:s.border,borderRadius:s.borderRadius,padding:s.padding,fontSize:s.fontSize,touchAction:s.touchAction};
  }
  return result;
});}
async function canvasColor(f,x,y){return editor(f).locator('canvas').evaluate((canvas,{x,y})=>Array.from(canvas.getContext('2d').getImageData(x*20+10,y*20+10,1,1).data),{x,y});}
async function paintCell(page,f,x,y,touch=false) {
  const canvas=editor(f).locator('canvas'),box=await canvas.boundingBox(),size=await canvas.evaluate(c=>({w:c.width/20,h:c.height/20})),point={x:box.width*(x+.5)/size.w,y:box.height*(y+.5)/size.h};
  if(touch)await canvas.tap({position:point});else await canvas.click({position:point});
}
async function closeDraft(f) {await editor(f).locator('.pixel-cancel').click();await editor(f).waitFor({state:'detached'});await ready(f);}
async function dimensions(f,w,h) {assert.deepEqual(await editor(f).locator('canvas').evaluate(c=>[c.width/20,c.height/20]),[w,h]);}
async function runRejections(browser) {
  const ctx=await guardedContext(browser,{viewport:{width:1280,height:900}}),mock=await mockAI(ctx),{page,f}=await practicePage(ctx);
  assert.equal(JSON.parse((await state(f)).project).authoringVersion,4);check('새 작품 authoringVersion 4');
  const initial=await state(f);
  for(const method of ['닫기','Esc','바깥']){
    await openDraft(f,'고양이');await dimensions(f,44,47);assert.equal((await state(f)).project,initial.project);assert.equal((await state(f)).html,initial.html);
    assert.equal(await editor(f).locator('h2').textContent(),'AI가 그린 밑그림이에요');
    if(method==='닫기')await editor(f).locator('.pixel-cancel').click();
    if(method==='Esc')await page.keyboard.press('Escape');
    if(method==='바깥'){const b=await editor(f).boundingBox();await page.mouse.click(b.x-5,b.y+10);}
    await ready(f);await editor(f).waitFor({state:'detached'});assert.equal((await state(f)).html,initial.html);assert.equal((await state(f)).project,initial.project);assert.equal((await state(f)).step,0);
    check(`코드 밑그림 ${method} 취소: 이전 작품·단계 보존`);
  }
  await openDraft(f,'고양이');let n=mock.calls.length;await editor(f).locator('.pixel-retry').click();await editor(f).waitFor({state:'visible'});
  await f.waitForFunction(()=>document.querySelector('.grade1-pixel-editor')?.open);assert.equal(mock.calls.length,n+1);assert.equal(mock.calls.at(-1).mode,'slot');assert.equal(Object.hasOwn(mock.calls.at(-1),'current'),false);assert.equal(mock.calls.at(-1).redraw,true);assert.equal((await state(f)).project,initial.project);check('새 선택 다시 그려줘: 이전 코드 생략·slot 재생성·확인 전 미반영');
  await applyDraft(f);let installed=JSON.parse((await state(f)).project);assert.equal(installed.slots.hero.mode,'pixel');assert.match(installed.slots.hero.code,/function drawHero/);assert.equal(installed.assets.pixel.pixels.length,47);assert.equal(installed.assets.pixel.pixels[0].length,44);assert.equal(await f.getByText('바꿨어요! 미리보기에서 게임을 해봐요.',{exact:true}).last().isVisible(),true);check('확인 후 44×47 bitmap과 원본 코드 동시 보존·pixel 모드 반영');
  await lastButton(f,'다시 그리기');await editor(f).waitFor({state:'visible'});assert.equal(mock.calls.at(-1).current,installed.slots.hero.code);check('확인 후 다시 그리기: 비트맵 대신 현재 칸 코드 전송');
  const sourceAtOpen=codeFor('hero',mock.revision);await editor(f).locator('.pixel-palette button').nth(1).click();await paintCell(page,f,5,7);n=mock.calls.length;await editor(f).locator('.pixel-retry').click();await editor(f).waitFor({state:'visible'});assert.equal(mock.calls.length,n+1);assert.equal(mock.calls.at(-1).current,sourceAtOpen);assert.equal(typeof mock.calls.at(-1).current,'string');await applyDraft(f);check('손보기 중 다시 그려줘: 편집 비트맵 대신 밑그림 소스 전달');
  const stable=await state(f);await f.evaluate(()=>{window.__realSave=saveClassroomPractice;window.saveClassroomPractice=()=>false;});await lastButton(f,'다시 그리기');await editor(f).waitFor({state:'visible'});await editor(f).locator('.pixel-apply').click();assert.equal(await editor(f).isVisible(),true);assert.match(await editor(f).locator('.pixel-message').textContent(),/저장/);assert.equal((await state(f)).project,stable.project);assert.equal((await state(f)).html,stable.html);await f.evaluate(()=>window.saveClassroomPractice=window.__realSave);await closeDraft(f);check('저장 실패: 이전 코드·bitmap·HTML 보존, 손보기 창 재시도 가능');
  await chooseStep(f,0);await openDraft(f,'로봇');assert.equal(Object.hasOwn(mock.calls.at(-1),'current'),false);await closeDraft(f);check('새 캐릭터 선택: 이전 고양이 코드 전송 없음');
  const invalid=[
    ['함수 형식', 'function drawHero(ctx,v){'],
    ['무한 반복','function drawHero(ctx,v){while(true){}}'],
    ['빈 그림','function drawHero(ctx,v){}'],
    ['금지 API','function drawHero(ctx,v){document.body.textContent="x";}'],
    ['25% 미만','function drawHero(ctx,v){ctx.fillRect(0,0,8,8);}'],
    ['분리된 두 덩어리','function drawHero(ctx,v){ctx.fillRect(0,0,12,v.h);ctx.fillRect(v.w-12,0,12,v.h);}']
  ];
  for(const[label,code]of invalid){const before=await state(f),count=mock.calls.length;mock.respond=()=>fenced(code);await chooseStep(f,0);await lastButton(f,'외계인');await ready(f);assert.equal(mock.calls.length-count,2,label);assert.equal(mock.calls.at(-1).retry,true);assert.equal(mock.calls.at(-1).request,mock.calls.at(-2).request);assert.equal((await state(f)).project,before.project);assert.equal((await state(f)).html,before.html);assert.equal(await editor(f).count(),0);assert.equal(await f.locator('#conversation .error').last().textContent(),'잘 안 됐어요. 다시 해봐요.');check(`${label}: 정확히 1회 재요청·요청문 유지·이전 그림 보존`);}
  mock.respond=null;await chooseStep(f,5);const beforeItem=await state(f);await openDraft(f,'사과');await dimensions(f,24,24);assert.equal(JSON.parse((await state(f)).project).config.itemsEnabled,false);await closeDraft(f);assert.equal((await state(f)).project,beforeItem.project);await openDraft(f,'사과');await applyDraft(f);assert.equal(JSON.parse((await state(f)).project).config.itemsEnabled,true);check('선물 24×24: 확인 후에만 활성, 취소는 이전 상태 유지');
  for(const[slot,text]of [['hero','캐릭터 색 파랗게'],['obstacle','장애물 더 뾰족하게']]){
    if(slot==='obstacle'){await chooseStep(f,2);await openDraft(f,'상자');await applyDraft(f);}
    const before=await state(f),current=JSON.parse(before.project).slots[slot].code,count=mock.calls.length;
    mock.respond=p=>p.mode==='route'?JSON.stringify({slot,request:text}):fenced(codeFor(p.slot,95),p.slot==='obstacle'?{sizeScale:.8,shape:'rect'}:null);
    await startCustom(f,text);await editor(f).waitFor({state:'visible'});assert.equal((await state(f)).project,before.project);assert.deepEqual(mock.calls.slice(count).map(p=>p.mode),['route','slot']);assert.equal(mock.calls[count].artMode,'code');assert.equal(mock.calls[count].current[slot],current);assert.equal(mock.calls.at(-1).current,current);await closeDraft(f);assert.equal((await state(f)).project,before.project);assert.equal((await state(f)).step,8);assert.equal(await f.getByRole('textbox',{name:'바꾸고 싶은 내용'}).last().inputValue(),text);await lastButton(f,'이렇게 바꾸기 ✨');await editor(f).waitFor({state:'visible'});await applyDraft(f);assert.match(JSON.parse((await state(f)).project).slots[slot].code,/fixture 95/);check(`9단계 ${slot}: route 1회→현재 코드 slot 수정→취소·재입력·확인`);
  }
  const beforeRoute=await state(f);mock.respond=()=>JSON.stringify({unsupported:true});n=mock.calls.length;await customRequest(f,'캐릭터 없애줘');assert.equal(mock.calls.length-n,1);assert.equal((await state(f)).project,beforeRoute.project);check('9단계 엔진 변경 거절·이전 그림 유지');
  mock.respond=()=>JSON.stringify({config:{initialLives:5}});await customRequest(f,'목숨 다섯 개');assert.equal(JSON.parse((await state(f)).project).config.initialLives,5);assert.equal(await editor(f).count(),0);check('9단계 허용 설정 즉시 반영');
  await shot(page,'phase4-safety-and-route.png');await ctx.close();
}

async function verifyBrushes(page,f,touch){
  await dimensions(f,44,47);assert.equal(await editor(f).locator('[data-brush="3"]').getAttribute('aria-pressed'),'true');
  const original=await canvasColor(f,5,7);await editor(f).locator('.pixel-palette button').nth(1).click();
  for(const size of [1,3,5]){
    await editor(f).locator(`[data-brush="${size}"]`).click();await paintCell(page,f,5,7,touch);assert.notDeepEqual(await canvasColor(f,5,7),original);const radius=(size-1)/2;
    for(const [x,y]of [[5-radius,7-radius],[5+radius,7+radius]])assert.notDeepEqual(await canvasColor(f,x,y),original);
    assert.deepEqual(await canvasColor(f,5+radius+1,7),original);await editor(f).locator('.pixel-undo').click();assert.deepEqual(await canvasColor(f,5,7),original);
  }
  await editor(f).locator('[data-brush="3"]').click();const box=await editor(f).locator('canvas').boundingBox();const point=(x,y)=>({x:box.x+box.width*(x+.5)/44,y:box.y+box.height*(y+.5)/47});
  if(touch){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(5,7)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(15,7)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{const p=point(5,7),q=point(15,7);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y);await page.mouse.up();}
  for(let x=5;x<=15;x++)assert.notDeepEqual(await canvasColor(f,x,7),original);await editor(f).locator('.pixel-undo').click();for(let x=5;x<=15;x++)assert.deepEqual(await canvasColor(f,x,7),original);
  await editor(f).locator('.pixel-eraser').click();await paintCell(page,f,5,7,touch);for(const[x,y]of[[4,6],[5,7],[6,8]])assert.notDeepEqual(await canvasColor(f,x,y),original);await editor(f).locator('.pixel-undo').click();assert.deepEqual(await canvasColor(f,5,7),original);
  await editor(f).locator('.pixel-clear').click();assert.equal(await editor(f).locator('.pixel-clear').isDisabled(),true);await editor(f).locator('.pixel-undo').click();assert.deepEqual(await canvasColor(f,5,7),original);
}

async function runUI(browser){
  for(const[width,height]of[[1280,900],[1024,768],[768,1024]]){
    const ctx=await guardedContext(browser,{viewport:{width,height},hasTouch:width!==1280});
    const old=await practicePage(ctx,true),before=await snapshotUI(old.f);await old.f.getByRole('button',{name:'직접 그리기',exact:true}).click();const oldEditor=await editorSnapshot(old.f);await shot(old.page,`phase3-direct-baseline-${width}x${height}.png`);await old.page.close();
    const mock=await mockAI(ctx),{page,f}=await practicePage(ctx);assert.deepEqual(await snapshotUI(f),before);check(`운영 d4e0663 대비 초기 UI 문구·색·선택지·배치 동일 ${width}×${height}`);
    await f.getByRole('button',{name:'직접 그리기',exact:true}).click();await dimensions(f,44,47);assert.equal(await editor(f).locator('.pixel-clear').isDisabled(),true);const directStyle=await editorSnapshot(f);
    for(const key of ['color','background','border','borderRadius','padding','fontSize'])for(const button of ['.pixel-cancel','.pixel-apply'])assert.equal(directStyle[button][key],oldEditor[button][key],`${button} ${key}`);
    await shot(page,`phase4-direct-${width}x${height}.png`);await editor(f).locator('.pixel-cancel').click();check(`직접 그리기 44×47 빈 칸·기존 버튼 모양 유지 ${width}×${height}`);
    await openDraft(f,'고양이');const canvasBox=await editor(f).locator('canvas').boundingBox();if(width===768)assert(canvasBox.width/44>=9,`cell ${canvasBox.width/44}`);await verifyBrushes(page,f,width!==1280);await shot(page,`phase4-ai-editor-${width}x${height}.png`);check(`붓 1·3·5·연속 ${width===1280?'마우스':'터치'}·한긋기 되돌리기·동일크기 지우개 ${width}×${height}`,{cellPx:canvasBox.width/44});await applyDraft(f);await lastButton(f,'다음 단계 →');
    for(let stage=2;stage<=9;stage++){
      if(stage===2)await lastButton(f,'바닷가');
      if(stage===3){await openDraft(f,'상자');await dimensions(f,44,47);await applyDraft(f);}
      if(stage===4){await f.locator('#speed-range').fill('0');await lastButton(f,'이걸로 정하기 ✓');}
      if(stage===5){await f.locator('#lives-range').fill('9');await lastButton(f,'이걸로 정하기 ✓');}
      if(stage===6){await openDraft(f,'사과');await dimensions(f,24,24);await applyDraft(f);}
      if(stage===7)await lastButton(f,'잠깐 무적');if(stage===8)await lastButton(f,'반짝!');
      if(stage===9){await lastButton(f,'직접 적기');await f.getByRole('textbox',{name:'바꾸고 싶은 내용'}).fill('무지개 배경');await lastButton(f,'이렇게 바꾸기 ✨');}
      await ready(f);assert.equal(await f.locator('#conversation .error').count(),0,`stage ${stage}`);await lastButton(f,stage===9?'완성하기 ✓':stage===8?'내 생각 더하기 →':'다음 단계 →');
    }
    const completed=await state(f),project=JSON.parse(completed.project);assert.equal(completed.progress,'완성');assert.deepEqual(mock.calls.map(x=>[x.mode,x.slot]),[['slot','hero'],['slot','background'],['slot','obstacle'],['slot','item'],['route',undefined]]);assert.equal(project.config.itemsEnabled,true);assert.equal(project.config.speedMultiplier,.5);assert.equal(project.config.initialLives,9);assert.equal(project.config.abilityId,'invincible');assert.equal(project.config.soundPreset,'반짝!');assert.equal(project.assets.item.pixels.length,24);check(`1~9 전체 흐름: AI 코드4칸·router·설정 AI 없음 ${width}×${height}`);
    await shot(page,`phase4-complete-${width}x${height}.png`);if(await f.locator('#preview-tab').isVisible())await f.locator('#preview-tab').click();
    const controls=await f.locator('.play-controls button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return{id:b.id,x:r.x,y:r.y,right:r.right,width:r.width};}));assert.equal(controls.length,3);assert(Math.max(...controls.map(x=>x.y))-Math.min(...controls.map(x=>x.y))<2);for(let i=1;i<controls.length;i++)assert(controls[i].x>=controls[i-1].right);check(`게임 버튼 한 줄 ${width}×${height}`);
    await f.locator('#expand-game').click();await f.waitForFunction(()=>document.querySelector('#preview-panel').classList.contains('expanded-game'));await shot(page,`phase4-expanded-${width}x${height}.png`);await f.locator('#expand-game').click();
    const game=await(await f.locator('#game').elementHandle()).contentFrame();await page.waitForTimeout(350);await f.locator('#jump').click();await game.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));await f.waitForFunction(()=>!document.getElementById('special').disabled);await f.locator('#special').click();await f.waitForFunction(()=>document.getElementById('special').dataset.state==='active');check(`크게 보기·게임 점프·특수 능력 ${width}×${height}`);
    await page.reload();await page.waitForFunction(()=>!document.getElementById('next').disabled);for(let i=0;i<4;i++)await page.locator('#next').click();const rf=await(await page.locator('#practice').elementHandle()).contentFrame();await rf.waitForFunction(()=>document.getElementById('progress').textContent==='완성');assert.equal((await state(rf)).html,completed.html);assert.equal((await state(rf)).project,completed.project);check(`로컬 이어하기: 비트맵·코드·설정 정확히 보존 ${width}×${height}`);
    if(width===1280){const dp=page.waitForEvent('download');await rf.locator('#download').click();const download=await dp;report.download=path.join(out,'내려받은-4차-모듈화-게임.html');await download.saveAs(report.download);assert.equal(fs.readFileSync(report.download,'utf8'),completed.html);}
    await ctx.close();
  }
}
async function runDownload(browser) {
  for(const[width,height]of[[1280,900],[1024,768],[768,1024]]){
    const ctx=await guardedContext(browser,{viewport:{width,height},hasTouch:width!==1280}),page=await ctx.newPage();await page.goto(pathToFileURL(report.download).href);await page.waitForFunction(()=>window.__observedHero?.h>40);assert.match(await page.locator('#status').textContent(),/시작 전/);
    if(width===1280)await page.locator('canvas').click({position:{x:150,y:60}});else await page.locator('canvas').tap({position:{x:150,y:60}});await page.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));await page.waitForFunction(()=>window.__observedHero.y<85);await page.waitForFunction(()=>window.__observedHero.y>=93);
    if(width===1280){await page.keyboard.down('ArrowDown');await page.waitForFunction(()=>window.__observedHero.h<30);await shot(page,`phase4-file-${width}x${height}-duck.png`);await page.keyboard.up('ArrowDown');await page.waitForFunction(()=>window.__observedHero.h>40);await page.keyboard.press('x');}
    else{const duck=page.locator('#grade1-duck'),b=await duck.boundingBox(),cdp=await ctx.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await page.waitForFunction(()=>window.__observedHero.h<30);await shot(page,`phase4-file-${width}x${height}-duck.png`);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>window.__observedHero.h>40);await page.locator('#grade1-special').tap();}
    await page.waitForFunction(()=>document.getElementById('grade1-special').dataset.state==='active');await page.locator('#soundBtn').click();assert.equal(await page.locator('#soundBtn').getAttribute('aria-pressed'),'false');check(`다운로드 file:// 픽셀 게임·${width===1280?'키보드':'터치'} 숙이기·능력·소리 ${width}×${height}`);await ctx.close();
  }
}
async function runCompatibility(browser) {
  const ctx=await guardedContext(browser,{viewport:{width:1280,height:900}}),mock=await mockAI(ctx),{page,f}=await practicePage(ctx);
  await openDraft(f,'고양이');await applyDraft(f);await lastButton(f,'다른 캐릭터 고르기');let count=mock.calls.length;await lastButton(f,'직접 그리기');await dimensions(f,44,47);assert.equal(await editor(f).locator('.pixel-clear').isDisabled(),true);await paintCell(page,f,5,7);await applyDraft(f);let p=JSON.parse((await state(f)).project);assert.equal(mock.calls.length,count);assert.equal(p.slots.hero.mode,'pixel');assert.equal(p.slots.hero.code,undefined);assert.equal(p.assets.pixel.pixels.length,47);check('직접 그리기: 44×47 빈 칸·AI 없음·이전 AI 소스 제거');
  const directBefore=await state(f);mock.respond=()=>JSON.stringify({slot:'hero',request:'캐릭터 색 파랗게'});count=mock.calls.length;await startCustom(f,'캐릭터 색 파랗게');await editor(f).waitFor({state:'visible'});await dimensions(f,44,47);assert.equal(mock.calls.length-count,1);assert.equal(mock.calls.at(-1).mode,'route');assert.equal(mock.calls.at(-1).current.hero,undefined);assert.equal(await editor(f).locator('p').first().textContent(),'직접 그린 그림은 손보기 창에서 고쳐 봐요');assert.equal(await editor(f).locator('.pixel-cancel').textContent(),'다른 캐릭터 고르기');assert.equal((await state(f)).project,directBefore.project);await paintCell(page,f,10,10);await applyDraft(f);assert.equal(mock.calls.length-count,1);assert.equal(JSON.parse((await state(f)).project).slots.hero.code,undefined);check('9단계 직접그림: route만 호출·안내와 편집·AI 코드 생성 없음');await shot(page,'phase4-direct-route-editor.png');await ctx.close();
  const phase2=await guardedContext(browser,{viewport:{width:1280,height:900}}),phase2Mock=await mockAI(phase2),old=await practicePage(phase2);await old.f.evaluate(()=>{const p=SherpaProject.createProject();delete p.authoringVersion;preview(SherpaProject.buildGameHtml(p));});await lastButton(old.f,'고양이');await ready(old.f);assert.equal(JSON.parse((await state(old.f)).project).authoringVersion,2);assert.equal(JSON.parse((await state(old.f)).project).slots.hero.mode,'code');assert.equal(phase2Mock.calls.at(-1).mode,'slot');assert.equal(await editor(old.f).count(),0);check('2차 authoringVersion 없음: 코드 즉시 적용 경로 유지');
  await chooseStep(old.f,0);await lastButton(old.f,'직접 그리기');await dimensions(old.f,16,16);await paintCell(old.page,old.f,5,7);await applyDraft(old.f);const first16=JSON.parse((await state(old.f)).project);assert.equal(first16.authoringVersion,2);assert.equal(typeof first16.assets.pixel,'string');assert.equal(first16.assets.pixel.length,256);assert.equal(first16.slots.hero.mode,'pixel');
  await chooseStep(old.f,0);await lastButton(old.f,'직접 그리기');await dimensions(old.f,16,16);assert.deepEqual(await canvasColor(old.f,5,7),[23,44,72,255]);await editor(old.f).locator('.pixel-palette button').nth(1).click();await paintCell(old.page,old.f,10,10);await applyDraft(old.f);const second16=JSON.parse((await state(old.f)).project);assert.equal(second16.authoringVersion,2);assert.equal(typeof second16.assets.pixel,'string');assert.notEqual(second16.assets.pixel,first16.assets.pixel);assert.equal(phase2Mock.calls.length,1);check('2차 직접그림: 16×16 문자열 저장·기존 그림 재편집·AI 호출 없음');await phase2.close();
  const phase3=await guardedContext(browser,{viewport:{width:1280,height:900}}),phase3Mock=await mockAI(phase3),saved3=await practicePage(phase3);await saved3.f.evaluate(pixel=>{let p=SherpaProject.createProject();p.authoringVersion=3;p=SherpaProject.withPixel(p,'hero',pixel);preview(SherpaProject.buildGameHtml(p));},pixelFor('hero'));
  const old3=JSON.parse((await state(saved3.f)).project);assert.equal(old3.authoringVersion,3);assert.equal(old3.assets.pixel.pixels.length,16);const game3=await(await saved3.f.locator('#game').elementHandle()).contentFrame();await game3.waitForFunction(()=>window.__observedHero?.h>40);
  phase3Mock.respond=()=>JSON.stringify({slot:'hero',request:'캐릭터 색 파랗게'});await startCustom(saved3.f,'캐릭터 색 파랗게');await editor(saved3.f).waitFor({state:'visible'});await dimensions(saved3.f,16,16);assert.equal(phase3Mock.calls.length,1);await editor(saved3.f).locator('.pixel-palette button').nth(1).click();await paintCell(saved3.page,saved3.f,5,7);await applyDraft(saved3.f);const changed3=JSON.parse((await state(saved3.f)).project);assert.equal(changed3.authoringVersion,3);assert.equal(changed3.assets.pixel.pixels.length,16);assert.notDeepEqual(changed3.assets.pixel,old3.assets.pixel);check('3차 16×16 저장 작품: 재생·같은 크기로 편집·저장 호환');await phase3.close();
  const legacyHtml=fs.readFileSync(path.join(root,'original-game.html'),'utf8'),legacy=await guardedContext(browser,{viewport:{width:1280,height:900}});await legacy.addInitScript(({html})=>{if(window===top&&location.hostname==='127.0.0.1')localStorage.setItem('sherpa-room-999999:sherpa-grade1-practice-v1',JSON.stringify({version:1,html,step:3,complete:false}));},{html:legacyHtml});const saved=await practicePage(legacy);assert.equal((await state(saved.f)).html,legacyHtml);const game=await(await saved.f.locator('#game').elementHandle()).contentFrame();await game.waitForFunction(()=>window.__observedHero?.h===47);await saved.f.locator('#jump').click();await game.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));await saved.f.evaluate(()=>{window.__mockLegacyCalls=0;receiveGameHtml=async()=>{window.__mockLegacyCalls++;return{html:lesson.game.replace('</body>','<!-- local legacy edit fixture --></body>')};};});await saved.f.locator('#speed-range').fill('4');await lastButton(saved.f,'이걸로 정하기 ✓');await ready(saved.f);assert.match((await state(saved.f)).html,/local legacy edit fixture/);assert.doesNotMatch((await state(saved.f)).html,/sherpa-project/);assert.equal(await saved.f.evaluate(()=>window.__mockLegacyCalls),1);check('구형 전체 HTML: 이어하기·재생·기존 편집 경로 보존');await legacy.close();
}
async function main(){
  const servers=ports.map((_,i)=>createServer(i===1));await Promise.all(servers.map((s,i)=>new Promise(r=>s.listen(ports[i],'127.0.0.1',r))));
  const browser=await chromium.launch({headless:true});
  try{await runRejections(browser);if(!process.argv.includes('--safety-only')){await runUI(browser);await runDownload(browser);await runCompatibility(browser);}assert.equal(report.blockedRequests.length,0);assert.equal(report.errors.length,0,report.errors.join('\n'));check('외부 요청·실제 AI 호출·JavaScript 런타임 예외 0건');report.ok=true;}
  catch(error){report.failure={message:error.message,stack:error.stack};throw error;}
  finally{report.count=report.checks.length;fs.writeFileSync(path.join(out,'4차-통합검증.json'),JSON.stringify(report,null,2));await browser.close();servers.forEach(s=>s.close());}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
