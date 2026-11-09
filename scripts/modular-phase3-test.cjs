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
const out = process.env.MODULAR_CAPTURE_DIR || path.resolve(__dirname, '../../../85_공룡3_모듈화/3차캡처');
const ports = [19313, 19314];
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
      if(baseline){if(!cache.has(rel))cache.set(rel,execFileSync('git',['show','c597aaf:assets/'+rel],{cwd:repo,maxBuffer:25000000,windowsHide:true,stdio:['ignore','pipe','pipe']}));data=cache.get(rel);}
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
    CanvasRenderingContext2D.prototype.drawImage=function(...a){if(a.length===9&&(a[0].naturalWidth===704&&a[0].naturalHeight===94||a[0].width===16&&a[0].height===16&&a[5]>=0&&a[5]<70&&a[7]>20))window.__observedHero={x:a[5],y:a[6],w:a[7],h:a[8]};return draw.apply(this,a);};
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
  const canvas=editor(f).locator('canvas'),box=await canvas.boundingBox(),point={x:box.width*(x+.5)/16,y:box.height*(y+.5)/16};
  if(touch)await canvas.tap({position:point});else await canvas.click({position:point});
}
async function runRejections(browser) {
  const ctx=await guardedContext(browser,{viewport:{width:1280,height:900}}),mock=await mockAI(ctx),{page,f}=await practicePage(ctx);
  assert.equal(JSON.parse((await state(f)).project).authoringVersion,3);check('새 작품 authoringVersion 3');
  const initial=await state(f);
  for(const method of ['닫기','Esc','바깥']){
    await openDraft(f,'고양이');assert.equal((await state(f)).html,initial.html);assert.equal((await state(f)).project,initial.project);
    assert.equal(await editor(f).locator('h2').textContent(),'AI가 그린 밑그림이에요');
    if(method==='닫기')await editor(f).getByRole('button',{name:'닫기',exact:true}).click();
    if(method==='Esc')await page.keyboard.press('Escape');
    if(method==='바깥'){const box=await editor(f).boundingBox();await page.mouse.click(box.x-5,box.y+10);}
    await ready(f);await editor(f).waitFor({state:'detached'});assert.equal((await state(f)).html,initial.html);assert.equal((await state(f)).project,initial.project);assert.equal((await state(f)).step,0);assert.equal(await f.getByRole('button',{name:'고양이',exact:true}).last().isEnabled(),true);
    check(`밑그림 ${method} 취소: HTML·작품 유지·같은 단계 재선택`);
  }
  await openDraft(f,'고양이');const count=mock.calls.length;await editor(f).locator('.pixel-cancel').click();await f.waitForFunction(()=>document.querySelector('.grade1-pixel-editor')?.open);assert.equal(mock.calls.length,count+1);assert.equal(Object.hasOwn(mock.calls.at(-1),'current'),false);assert.equal((await state(f)).html,initial.html);check('새 캐릭터 다시 그려줘: 같은 선택·current 생략·확인 전 미반영');
  await applyDraft(f);const installed=await state(f);assert.equal(JSON.parse(installed.project).slots.hero.mode,'pixel');assert.equal(await f.getByText('바꿨어요! 미리보기에서 게임을 해봐요.',{exact:true}).last().isVisible(),true);check('확인 후에만 저장·게임 반영·완료 문구와 다음 단계');
  await lastButton(f,'다시 그리기');await editor(f).waitFor({state:'visible'});assert.deepEqual(mock.calls.at(-1).current,await f.evaluate(()=>SherpaSlotAI.currentPixel(modularProject,'hero')));check('확인 후 다시 그리기: 현재 캐릭터 전달');
  await editor(f).locator('.pixel-palette button').nth(2).click();await paintCell(page,f,5,7);const prior=mock.calls.length;await editor(f).locator('.pixel-cancel').click();await f.waitForFunction(()=>document.querySelector('.grade1-pixel-editor')?.open);assert.equal(mock.calls.length,prior+1);assert.equal(mock.calls.at(-1).current.pixels[7][5],'2');check('기존 캐릭터 다시 그려줘: 손본 현재 그림 전달');await applyDraft(f);
  const stable=await state(f);
  await f.evaluate(()=>{window.__realSave=saveClassroomPractice;window.saveClassroomPractice=()=>false;});await lastButton(f,'다시 그리기');await editor(f).waitFor({state:'visible'});await editor(f).locator('.pixel-apply').click();assert.equal(await editor(f).isVisible(),true);assert.match(await editor(f).locator('.pixel-message').textContent(),/저장/);assert.equal((await state(f)).html,stable.html);assert.equal((await state(f)).project,stable.project);await f.evaluate(()=>{window.saveClassroomPractice=window.__realSave;});await editor(f).getByRole('button',{name:'닫기',exact:true}).click();await ready(f);check('확인 저장 실패: 창 유지·이전 HTML/프로젝트 보존·취소 가능');
  await chooseStep(f,0);await openDraft(f,'로봇');assert.equal(Object.hasOwn(mock.calls.at(-1),'current'),false);await editor(f).getByRole('button',{name:'닫기',exact:true}).click();await ready(f);check('새 로봇 선택: 기존 고양이 전송 안 함');
  const invalid=[['형식','{invalid'],['15% 미만',JSON.stringify({palette:['#123456'],pixels:['0...............',...Array(15).fill('.'.repeat(16))]})],['분리된 캐릭터',JSON.stringify({palette:['#123456'],pixels:Array.from({length:16},(_,y)=>y<2?'00............00':'.'.repeat(16))})]];
  for(const[label,raw]of invalid){const before=await state(f),n=mock.calls.length;mock.respond=()=>raw;await chooseStep(f,0);await f.getByRole('button',{name:'외계인',exact:true}).last().click();await ready(f);assert.equal(mock.calls.length-n,2);assert.equal((await state(f)).html,before.html);assert.equal((await state(f)).project,before.project);assert.equal(await editor(f).count(),0);assert.equal(await f.locator('#conversation .error').last().textContent(),'잘 안 됐어요. 다시 해봐요.');check(`밑그림 ${label} 실패: 한 번만 재요청·이전 유지`);}
  for(const [label,value] of [['크기',{palette:['#123456'],pixels:Array(15).fill('0'.repeat(16))}],['팔레트 번호',{palette:['#123456'],pixels:Array(16).fill('1'.repeat(16))}],['연결 보정',{palette:['#123456'],pixels:Array(16).fill('0000........0000')}]]) {
    const before=await state(f),n=mock.calls.length;mock.respond=()=>JSON.stringify(value);await chooseStep(f,0);await openDraft(f,'외계인');assert.equal(mock.calls.length-n,1);assert.equal((await state(f)).html,before.html);await applyDraft(f);check('밑그림 '+label+' 자동 보정: 1회 응답·확인 후 반영');
  }
  await shot(page,'phase3-invalid-draft-preserved.png');mock.respond=null;
  await chooseStep(f,5);const beforeItem=await state(f);await openDraft(f,'사과');assert.equal(JSON.parse((await state(f)).project).config.itemsEnabled,false);await editor(f).getByRole('button',{name:'닫기',exact:true}).click();await ready(f);assert.equal((await state(f)).project,beforeItem.project);await openDraft(f,'사과');await applyDraft(f);assert.equal(JSON.parse((await state(f)).project).config.itemsEnabled,true);assert.equal(JSON.parse((await state(f)).project).config.itemName,'사과');check('선물 생성·취소는 비활성 유지, 확인 후에만 활성');
  for(const[slot,text]of [['hero','캐릭터 색 파랗게'],['obstacle','장애물 더 뾰족하게']]){
    if(slot==='obstacle'){await chooseStep(f,2);await openDraft(f,'상자');await applyDraft(f);}
    const current=await f.evaluate(s=>SherpaSlotAI.currentPixel(modularProject,s),slot),before=await state(f),n=mock.calls.length;
    mock.respond=p=>p.mode==='route'?JSON.stringify({slot,request:text}):JSON.stringify(pixelFor(p.slot,9));
    await startCustom(f,text);await editor(f).waitFor({state:'visible'});assert.equal((await state(f)).project,before.project);assert.deepEqual(mock.calls.slice(n).map(p=>p.mode),['route','pixel']);assert.equal(mock.calls[n].artMode,'pixel');assert.deepEqual(mock.calls.at(-1).current,current);await shot(page,`phase3-route-${slot}-editor.png`);
    await editor(f).getByRole('button',{name:'닫기',exact:true}).click();await ready(f);await editor(f).waitFor({state:'detached'});
    const cancelled=await state(f),input=f.getByRole('textbox',{name:'바꾸고 싶은 내용'}).last();
    assert.equal(cancelled.step,8);assert.equal(cancelled.html,before.html);assert.equal(cancelled.project,before.project);assert.equal(await input.inputValue(),text);assert.equal(await input.isEnabled(),true);assert.equal(await f.getByRole('button',{name:'다른 부분 고르기',exact:true}).last().isEnabled(),true);
    const repeatedAt=mock.calls.length;await lastButton(f,'이렇게 바꾸기 ✨');await editor(f).waitFor({state:'visible'});assert.deepEqual(mock.calls.slice(repeatedAt).map(p=>p.mode),['route','pixel']);assert.deepEqual(mock.calls.at(-1).current,current);assert.equal((await state(f)).project,before.project);check(`9단계 ${slot} 취소: 같은 단계·입력·이전 작품 유지 후 동일 입력 재실행`);
    await applyDraft(f);check(`9단계 ${slot}: 라우터 한 번·현재 그림 pixel 요청·동일 편집기·확인 후 반영`);
  }
  const beforeRoute=await state(f);mock.respond=()=>JSON.stringify({unsupported:true});let n=mock.calls.length;await customRequest(f,'캐릭터 없애줘');assert.equal(mock.calls.length-n,1);assert.equal((await state(f)).project,beforeRoute.project);check('9단계 unsupported: 기존 작품 유지');
  mock.respond=()=>JSON.stringify({slot:'hero',code:codeFor('hero',100)});await customRequest(f,'캐릭터 파랗게');assert.equal((await state(f)).project,beforeRoute.project);check('신규 9단계 캐릭터 코드 응답 거절');
  mock.respond=()=>JSON.stringify({config:{initialLives:5}});await customRequest(f,'목숨 다섯 개');assert.equal(JSON.parse((await state(f)).project).config.initialLives,5);check('9단계 설정 즉시 적용·편집기 없음');
  mock.respond=()=>JSON.stringify({slot:'background',code:codeFor('background',99)});await customRequest(f,'무지개 배경');assert.match(JSON.parse((await state(f)).project).slots.background.code,/fixture 99/);assert.equal(await editor(f).count(),0);check('9단계 배경 코드 칸 유지');await ctx.close();
}
async function runUI(browser) {
  const css=fs.readFileSync(path.join(root,'practice/grade1-pixel.css'),'utf8').replace(/\r\n/g,'\n'),oldCss=execFileSync('git',['show','c597aaf:assets/practice/grade1-pixel.css'],{cwd:repo,encoding:'utf8'}).replace(/\r\n/g,'\n');assert.equal(css,oldCss);check('직접 그리기 CSS 기준 커밋과 동일');
  for(const[width,height]of[[1280,900],[1024,768],[768,1024]]){
    const ctx=await guardedContext(browser,{viewport:{width,height},hasTouch:width!==1280});
    const old=await practicePage(ctx,true);const before=await snapshotUI(old.f);await old.f.getByRole('button',{name:'직접 그리기',exact:true}).click();const oldEditor=await editorSnapshot(old.f);await shot(old.page,`phase2-direct-baseline-${width}x${height}.png`);await old.page.close();
    const mock=await mockAI(ctx),{page,f}=await practicePage(ctx);assert.deepEqual(await snapshotUI(f),before);check(`초기 UI 문구·선택지·색·배치 동일 ${width}×${height}`);
    await f.getByRole('button',{name:'직접 그리기',exact:true}).click();assert.deepEqual(await editorSnapshot(f),oldEditor);await shot(page,`phase3-direct-${width}x${height}.png`);await editor(f).locator('.pixel-cancel').click();check(`직접 그리기 창 기존 디자인·크기·색 동일 ${width}×${height}`);
    await openDraft(f,'고양이');const aiStyle=await editorSnapshot(f);assert.deepEqual(aiStyle.canvas,oldEditor.canvas);for(const key of ['color','background','border','borderRadius','padding','fontSize'])for(const button of ['.pixel-cancel','.pixel-apply'])assert.deepEqual(aiStyle[button][key],oldEditor[button][key]);
    assert.deepEqual(await canvasColor(f,5,7),[35,100,170,255]);const original=await canvasColor(f,5,7);await editor(f).locator('.pixel-palette button').nth(1).click();await paintCell(page,f,5,7,width!==1280);assert.notDeepEqual(await canvasColor(f,5,7),original);await editor(f).locator('.pixel-undo').click();assert.deepEqual(await canvasColor(f,5,7),original);await editor(f).locator('.pixel-eraser').click();await paintCell(page,f,5,7,width!==1280);assert.notDeepEqual(await canvasColor(f,5,7),original);await editor(f).locator('.pixel-undo').click();assert.deepEqual(await canvasColor(f,5,7),original);await editor(f).locator('.pixel-clear').click();assert.equal(await editor(f).locator('.pixel-clear').isDisabled(),true);await editor(f).locator('.pixel-undo').click();assert.deepEqual(await canvasColor(f,5,7),original);await shot(page,`phase3-ai-editor-${width}x${height}.png`);check(`밑그림 채움·기존 그림판 크기/버튼 색·${width===1280?'마우스':'터치'} 칠하기·지우개·되돌리기·모두 지우기 ${width}×${height}`);await applyDraft(f);await lastButton(f,'다음 단계 →');
    for(let stage=2;stage<=9;stage++){
      if(stage===2)await f.getByRole('button',{name:'바닷가',exact:true}).click();
      if(stage===3){await openDraft(f,'상자');await applyDraft(f);}
      if(stage===4){await f.locator('#speed-range').fill('0');await lastButton(f,'이걸로 정하기 ✓');}
      if(stage===5){await f.locator('#lives-range').fill('9');await lastButton(f,'이걸로 정하기 ✓');}
      if(stage===6){await openDraft(f,'사과');await applyDraft(f);}
      if(stage===7)await f.getByRole('button',{name:'잠깐 무적',exact:true}).click();
      if(stage===8)await f.getByRole('button',{name:'반짝!',exact:true}).click();
      if(stage===9){await lastButton(f,'직접 적기');await f.getByRole('textbox',{name:'바꾸고 싶은 내용'}).fill('무지개 배경');await lastButton(f,'이렇게 바꾸기 ✨');}
      await ready(f);assert.equal(await f.locator('#conversation .error').count(),0,`${stage} generation failed`);await lastButton(f,stage===9?'완성하기 ✓':stage===8?'내 생각 더하기 →':'다음 단계 →');
    }
    const completed=await state(f),project=JSON.parse(completed.project);assert.equal(completed.progress,'완성');assert.deepEqual(mock.calls.map(x=>[x.mode,x.slot]),[['pixel','hero'],['slot','background'],['pixel','obstacle'],['pixel','item'],['route',undefined]]);assert.equal(project.config.itemsEnabled,true);assert.equal(project.config.itemName,'사과');assert.equal(project.config.speedMultiplier,.5);assert.equal(project.config.initialLives,9);assert.equal(project.config.abilityId,'invincible');assert.equal(project.config.soundPreset,'반짝!');check(`1~9 전체 흐름: 픽셀 3칸·배경 코드·설정 AI 없음 ${width}×${height}`);
    await shot(page,`phase3-complete-${width}x${height}.png`);if(await f.locator('#preview-tab').isVisible())await f.locator('#preview-tab').click();
    const controls=await f.locator('.play-controls button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return{id:b.id,x:r.x,y:r.y,right:r.right,width:r.width};}));assert.equal(controls.length,3);assert(Math.max(...controls.map(x=>x.y))-Math.min(...controls.map(x=>x.y))<2);for(let i=1;i<controls.length;i++)assert(controls[i].x>=controls[i-1].right);check(`버튼 한 줄 ${width}×${height}`);
    await f.locator('#expand-game').click();await f.waitForFunction(()=>document.querySelector('#preview-panel').classList.contains('expanded-game'));await shot(page,`phase3-expanded-${width}x${height}.png`);await f.locator('#expand-game').click();check(`크게 보기 열기·닫기 ${width}×${height}`);
    const game=await(await f.locator('#game').elementHandle()).contentFrame();// The existing engine pauses 250 ms after viewport resize; finish that debounce before starting.
    await page.waitForTimeout(350);await f.locator('#jump').click();await game.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));await f.waitForFunction(()=>!document.getElementById('special').disabled);await f.locator('#special').click();await f.waitForFunction(()=>document.getElementById('special').dataset.state==='active');check(`픽셀 게임 점프·능력 버튼 ${width}×${height}`);
    await page.reload();await page.waitForFunction(()=>!document.getElementById('next').disabled);for(let i=0;i<4;i++)await page.locator('#next').click();const rf=await(await page.locator('#practice').elementHandle()).contentFrame();await rf.waitForFunction(()=>document.getElementById('progress').textContent==='완성');assert.equal((await state(rf)).html,completed.html);assert.equal((await state(rf)).project,completed.project);check(`가상 room 이어하기: 픽셀3칸·배경·설정 보존 ${width}×${height}`);
    if(width===1280){const dp=page.waitForEvent('download');await rf.locator('#download').click();const download=await dp;report.download=path.join(out,'내려받은-3차-모듈화-게임.html');await download.saveAs(report.download);assert.equal(fs.readFileSync(report.download,'utf8'),completed.html);}
    await ctx.close();
  }
}
async function runDownload(browser) {
  for(const[width,height]of[[1280,900],[1024,768],[768,1024]]){
    const ctx=await guardedContext(browser,{viewport:{width,height},hasTouch:width!==1280}),page=await ctx.newPage();await page.goto(pathToFileURL(report.download).href);await page.waitForFunction(()=>window.__observedHero?.h>40);assert.match(await page.locator('#status').textContent(),/시작 전/);
    if(width===1280)await page.locator('canvas').click({position:{x:150,y:60}});else await page.locator('canvas').tap({position:{x:150,y:60}});await page.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));await page.waitForFunction(()=>window.__observedHero.y<85);await page.waitForFunction(()=>window.__observedHero.y>=93);
    if(width===1280){await page.keyboard.down('ArrowDown');await page.waitForFunction(()=>window.__observedHero.h<30);await shot(page,`phase3-file-${width}x${height}-duck.png`);await page.keyboard.up('ArrowDown');await page.waitForFunction(()=>window.__observedHero.h>40);await page.keyboard.press('x');}
    else{const duck=page.locator('#grade1-duck'),b=await duck.boundingBox(),cdp=await ctx.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await page.waitForFunction(()=>window.__observedHero.h<30);await shot(page,`phase3-file-${width}x${height}-duck.png`);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>window.__observedHero.h>40);await page.locator('#grade1-special').tap();}
    await page.waitForFunction(()=>document.getElementById('grade1-special').dataset.state==='active');await page.locator('#soundBtn').click();assert.equal(await page.locator('#soundBtn').getAttribute('aria-pressed'),'false');check(`다운로드 file:// 픽셀 게임·${width===1280?'키보드':'터치'} 숙이기·능력·소리 ${width}×${height}`);await ctx.close();
  }
}
async function runCompatibility(browser) {
  const ctx=await guardedContext(browser,{viewport:{width:1280,height:900}}),mock=await mockAI(ctx),{page,f}=await practicePage(ctx);await openDraft(f,'고양이');await applyDraft(f);await lastButton(f,'다른 캐릭터 고르기');const count=mock.calls.length;await f.getByRole('button',{name:'직접 그리기',exact:true}).last().click();assert.equal(await editor(f).locator('.pixel-clear').isDisabled(),true);await paintCell(page,f,5,7);await applyDraft(f);assert.equal(mock.calls.length,count);assert.equal(typeof JSON.parse((await state(f)).project).assets.pixel,'string');check('새 작품 직접 그리기: 항상 빈 칸·AI 호출 없이 적용');await ctx.close();
  const phase2Context=await guardedContext(browser,{viewport:{width:1280,height:900}}),phase2Mock=await mockAI(phase2Context),old=await practicePage(phase2Context);await old.f.evaluate(()=>{const p=SherpaProject.createProject();delete p.authoringVersion;preview(SherpaProject.buildGameHtml(p));});await old.f.getByRole('button',{name:'고양이',exact:true}).click();await ready(old.f);assert.equal(JSON.parse((await state(old.f)).project).authoringVersion,2);assert.equal(JSON.parse((await state(old.f)).project).slots.hero.mode,'code');assert.equal(phase2Mock.calls.at(-1).mode,'slot');assert.equal(await editor(old.f).count(),0);check('2차 저장 작품 authoringVersion 없음 → 2차 코드 칸 경로 유지');await phase2Context.close();
  const legacyHtml=fs.readFileSync(path.join(root,'original-game.html'),'utf8'),legacy=await guardedContext(browser,{viewport:{width:1280,height:900}});await legacy.addInitScript(({html})=>{if(window===top&&location.hostname==='127.0.0.1')localStorage.setItem('sherpa-room-999999:sherpa-grade1-practice-v1',JSON.stringify({version:1,html,step:3,complete:false}));},{html:legacyHtml});const saved=await practicePage(legacy);assert.equal((await state(saved.f)).html,legacyHtml);await saved.f.evaluate(()=>{window.__mockLegacyCalls=0;receiveGameHtml=async()=>{window.__mockLegacyCalls++;return{html:lesson.game.replace('</body>','<!-- local legacy edit fixture --></body>')};};});await saved.f.locator('#speed-range').fill('4');await lastButton(saved.f,'이걸로 정하기 ✓');await ready(saved.f);assert.match((await state(saved.f)).html,/local legacy edit fixture/);assert.doesNotMatch((await state(saved.f)).html,/sherpa-project/);assert.equal(await saved.f.evaluate(()=>window.__mockLegacyCalls),1);check('구형 HTML 이어하기·기존 전체 HTML 편집 경로 유지');await legacy.close();
}
async function main(){
  const servers=ports.map((_,i)=>createServer(i===1));await Promise.all(servers.map((s,i)=>new Promise(r=>s.listen(ports[i],'127.0.0.1',r))));
  const browser=await chromium.launch({headless:true});
  try{await runRejections(browser);if(!process.argv.includes('--safety-only')){await runUI(browser);await runDownload(browser);await runCompatibility(browser);}assert.equal(report.blockedRequests.length,0);assert.equal(report.errors.length,0,report.errors.join('\n'));check('외부 요청·실제 AI 호출·JavaScript 런타임 예외 0건');report.ok=true;}
  catch(error){report.failure={message:error.message,stack:error.stack};throw error;}
  finally{report.count=report.checks.length;fs.writeFileSync(path.join(out,'3차-통합검증.json'),JSON.stringify(report,null,2));await browser.close();servers.forEach(s=>s.close());}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
