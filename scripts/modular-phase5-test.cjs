'use strict';
// Local classroom UI and synthetic AI only. Never reads/writes a real class or database.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require(path.resolve(__dirname, '../../../70_검수/node_modules/playwright'));
const repo = path.resolve(__dirname, '..');
const root = path.join(repo, 'assets');
const out = process.env.MODULAR_CAPTURE_DIR || path.resolve(__dirname, '../../../85_공룡3_모듈화/5차캡처');
const port = 19415;
const report = {scope:'Chromium classroom iframe, synthetic local AI; no external requests, live AI, database or deployment', checks:[], captures:[], layouts:[], errors:[], blockedRequests:[], mockRequests:[]};
fs.mkdirSync(out, {recursive:true});
const check = (name, details) => {report.checks.push({name, pass:true, ...(details ? {details} : {})});console.log('PASS '+name);};
const editor = f => f.locator('.grade1-pixel-editor');
const ready = f => f.waitForFunction(() => typeof working !== 'undefined' && !working);
const state = f => f.evaluate(() => ({html, project:JSON.stringify(modularProject), step, srcdoc:document.querySelector('#game').srcdoc}));
const chooseStep = (f, n) => f.evaluate(n => {step=n;next();}, n);
const clickChoice = (f, label) => f.getByRole('button', {name:label, exact:true}).last().click();
const openDraft = async (f,label) => {await clickChoice(f,label);await editor(f).waitFor({state:'visible'});};
const applyDraft = async f => {await editor(f).locator('.pixel-apply').click();await editor(f).waitFor({state:'detached'});await ready(f);};
const closed = async f => {await editor(f).waitFor({state:'detached'});await ready(f);};
function codeFor(slot, revision) {
  const code = {
    hero:"function drawHero(ctx, v) { ctx.fillStyle='#2364aa'; ctx.fillRect(0,0,v.pose==='duck'?59:44,v.pose==='duck'?25:47); ctx.fillStyle='#ffffff'; ctx.fillRect(26,8,8,8); ctx.fillStyle='#172c48'; ctx.fillRect(30,10,3,4); }",
    obstacle:"function drawObstacle(ctx, v) { ctx.fillStyle='#985832'; ctx.fillRect(0,0,v.w,v.h); ctx.fillStyle='#c48f54'; ctx.fillRect(3,3,v.w-6,v.h-6); }",
    item:"function drawItem(ctx, v) { ctx.fillStyle='#f44a61'; ctx.beginPath(); ctx.arc(v.w/2,v.h/2,v.w*.4,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#2c944a'; ctx.fillRect(v.w*.45,0,v.w*.15,v.h*.25); }"
  }[slot];
  assert(code, slot);
  return code.replace(/ }$/, ' // fixture '+revision+'\n}');
}
function sse(raw) {return 'data: '+JSON.stringify({choices:[{delta:{content:raw}}]})+'\n\ndata: [DONE]\n\n';}
function createServer() {
  return http.createServer((req,res) => {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/api/classroom/999999') {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({name:'로컬 검증',code:'999999',openPages:[1,2,3,4,5,6],canManage:false}));}
    if(pathname.startsWith('/api/')) {res.writeHead(503);return res.end('{"error":"Live APIs are forbidden in this test"}');}
    let rel=pathname.replace(/^\//,'');if(!rel||rel.endsWith('/'))rel+='index.html';if(rel==='lesson')rel='lesson.html';
    const filename=path.resolve(root,rel);if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try {const data=fs.readFileSync(filename);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.png':'image/png','.ttf':'font/ttf'})[path.extname(filename)]||'application/octet-stream');res.end(data);}
    catch {res.writeHead(404);res.end();}
  });
}
async function setup(browser,width,height) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:width===1024||width===768});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(['data:','blob:','about:'].includes(url.protocol)||url.hostname==='127.0.0.1'&&Number(url.port)===port)return route.continue();
    report.blockedRequests.push(url.origin+url.pathname);return route.abort();
  });
  const mock={calls:[]};
  await context.route('**/api/game',async route=>{
    const payload=route.request().postDataJSON();mock.calls.push(payload);report.mockRequests.push({mode:payload.mode,slot:payload.slot,request:payload.request});
    const raw='```javascript\n'+codeFor(payload.slot,mock.calls.length)+'\n```';
    await route.fulfill({status:200,contentType:'text/event-stream; charset=utf-8',body:sse(raw)});
  });
  context.on('page',page=>page.on('pageerror',error=>report.errors.push(error.message)));
  const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/lesson.html?room=999999`);
  await page.waitForFunction(()=>document.getElementById('next')&&!document.getElementById('next').disabled);
  for(let i=0;i<4;i++)await page.locator('#next').click();
  const f=await(await page.locator('#practice').elementHandle()).contentFrame();
  await f.waitForFunction(()=>typeof html==='string'&&html.length>0&&document.querySelector('#conversation article'));
  return {context,page,f,mock};
}
async function paint(f) {
  const canvas=editor(f).locator('canvas'), box=await canvas.boundingBox();
  await editor(f).locator('.pixel-palette button').last().click();
  await canvas.click({position:{x:box.width*.4,y:box.height*.5}});
}
async function layout(page,f,name,{slot='hero',retry=true,maxPalette=false}={}) {
  // A preceding click can leave the new button under the mouse while its inherited
  // hover-color transition is running. Measure the normal style consistently.
  await page.mouse.move(0,0);
  await f.waitForFunction(()=>getComputedStyle(document.querySelector('.grade1-pixel-editor .pixel-cancel')).backgroundColor==='rgb(255, 255, 255)');
  // Wait for layout + ResizeObserver/rAF fit pass, then measure the complete modal.
  await f.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const frameBox=await page.locator('#practice').boundingBox(), viewport=page.viewportSize();
  const data=await editor(f).evaluate(dialog=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const style=el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,border:s.border,borderRadius:s.borderRadius,fontSize:s.fontSize};};
    const parts={};
    for(const selector of ['h2','p','canvas','.pixel-palette','.pixel-brushes','.pixel-eraser','.pixel-undo','.pixel-clear','.pixel-actions'])parts[selector]=rect(dialog.querySelector(selector));
    if(dialog.querySelector('.pixel-message').textContent)parts['.pixel-message']=rect(dialog.querySelector('.pixel-message'));
    return {viewport:{width:innerWidth,height:innerHeight},dialog:rect(dialog),parts,scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight,scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth,scrollTop:dialog.scrollTop,bodyScrollHeight:document.documentElement.scrollHeight,bodyClientHeight:document.documentElement.clientHeight,canvasSize:[dialog.querySelector('canvas').width/20,dialog.querySelector('canvas').height/20],buttons:[...dialog.querySelectorAll('.pixel-actions button')].map(b=>({text:b.textContent,rect:rect(b),style:style(b)})),paletteCount:dialog.querySelectorAll('.pixel-palette button').length,closeCount:dialog.querySelectorAll('.pixel-close,[aria-label="닫기"]').length};
  });
  const suffix={hero:'캐릭터',obstacle:'장애물',item:'선물'}[slot];
  const expectedApply=retry||slot!=='hero'?{hero:'이 캐릭터로 달리기 ✓',obstacle:'이 장애물로 정하기 ✓',item:'이 선물로 정하기 ✓'}[slot]:'이 캐릭터로 달리기';
  assert.equal(data.closeCount,0,name+' close removed');
  assert.equal(data.buttons[0].text,'다른 '+suffix+' 고르기',name+' cancel label');
  assert.equal(data.buttons.length,retry?3:2,name+' action count');
  if(retry)assert.equal(data.buttons[1].text,'다시 그려줘');
  assert.equal(data.buttons.at(-1).text,expectedApply,name+' apply label');
  assert.equal(data.buttons[0].style.background,'rgb(255, 255, 255)',name+' white cancel');
  if(retry)for(const key of ['background','color','border','borderRadius','fontSize'])assert.equal(data.buttons[0].style[key],data.buttons[1].style[key],name+' matching white buttons '+key);
  assert(data.dialog.x>=-1&&data.dialog.y>=-1&&data.dialog.right<=data.viewport.width+1&&data.dialog.bottom<=data.viewport.height+1,name+' modal inside iframe');
  assert(frameBox.x+data.dialog.x>=-1&&frameBox.y+data.dialog.y>=-1&&frameBox.x+data.dialog.right<=viewport.width+1&&frameBox.y+data.dialog.bottom<=viewport.height+1,name+' modal inside full screen');
  assert(data.scrollHeight<=data.clientHeight+1,name+' no vertical modal scrolling');
  assert(data.scrollWidth<=data.clientWidth+1,name+' no horizontal modal scrolling');
  assert.equal(data.scrollTop,0,name+' no prior modal scroll');
  for(const [selector,r] of Object.entries(data.parts))assert(r.width>0&&r.height>0&&r.x>=data.dialog.x-1&&r.y>=data.dialog.y-1&&r.right<=data.dialog.right+1&&r.bottom<=data.dialog.bottom+1,name+' complete '+selector);
  for(let i=1;i<data.buttons.length;i++){const a=data.buttons[i-1].rect,b=data.buttons[i].rect;assert(Math.abs(a.y-b.y)<2&&b.x>=a.right-1,name+' action row order');}
  for(const b of data.buttons)assert(b.rect.bottom<=data.dialog.bottom+1&&b.rect.right<=data.dialog.right+1,name+' complete button');
  const cell={width:data.parts.canvas.width/data.canvasSize[0],height:data.parts.canvas.height/data.canvasSize[1]};
  if(viewport.width===768&&viewport.height===1024)assert(cell.width>=9&&cell.height>=9,name+' portrait cell at least 9px');
  if(maxPalette)assert.equal(data.paletteCount,21,name+' max palette');
  report.layouts.push({name,viewport,frame:frameBox,...data,cell});
  check(name+' 전체 요소·한 줄 버튼·스크롤 없음',{cell,paletteCount:data.paletteCount});
}
async function shot(page,name) {await page.screenshot({path:path.join(out,name)});report.captures.push(name);}
async function preservation(f,before,label) {assert.deepEqual(await state(f),before,label);}
async function runViewport(browser,width,height) {
  const {context,page,f,mock}=await setup(browser,width,height),size=`${width}x${height}`;
  try {
    for(const config of [
      {slot:'hero',index:0,label:'고양이',alternative:'로봇',name:'캐릭터'},
      {slot:'obstacle',index:2,label:'상자',alternative:'바위',name:'장애물'},
      {slot:'item',index:5,label:'사과',alternative:'딸기',name:'선물'}
    ]) {
      const {slot,index,label,alternative,name}=config;
      await chooseStep(f,index);const before=await state(f);
      await openDraft(f,label);await preservation(f,before,'unconfirmed '+slot);
      await layout(page,f,`${size} AI ${name}`,{slot});await shot(page,`phase5-${size}-AI-${name}.png`);
      await paint(f);let calls=mock.calls.length;await editor(f).locator('.pixel-cancel').click();await closed(f);
      await preservation(f,before,'cancel '+slot);assert.equal(mock.calls.length,calls);assert.equal(await f.getByRole('button',{name:alternative,exact:true}).last().isEnabled(),true);check(`${size} AI ${name} 다른 고르기: 이전 게임·srcdoc·단계 보존, 선택지 활성`);
      await openDraft(f,alternative);assert.equal(mock.calls.length,calls+1);assert.equal(mock.calls.at(-1).slot,slot);
      await paint(f);await page.keyboard.press('Escape');await closed(f);await preservation(f,before,'Esc '+slot);check(`${size} AI ${name} 다른 선택 재생성·Esc 이전 게임 유지`);
      await openDraft(f,label);calls=mock.calls.length;await editor(f).locator('.pixel-retry').click();
      await f.waitForFunction(()=>document.querySelector('.grade1-pixel-editor')?.open);assert.equal(mock.calls.length,calls+1);assert.equal(mock.calls.at(-1).redraw,true);await preservation(f,before,'retry '+slot);
      await applyDraft(f);const after=await state(f);assert.notEqual(after.project,before.project);assert.equal(JSON.parse(after.project).slots[slot].mode,'pixel');assert.equal(after.step,index);check(`${size} AI ${name} 다시 그려줘 유지·확인 후에만 게임 반영`);
    }
    await chooseStep(f,0);const directBefore=await state(f),calls=mock.calls.length;
    await openDraft(f,'직접 그리기');await layout(page,f,`${size} 직접 그리기`,{retry:false});await shot(page,`phase5-${size}-직접그리기.png`);
    await paint(f);await editor(f).locator('.pixel-cancel').click();await closed(f);await preservation(f,directBefore,'direct cancel');assert.equal(await f.getByRole('button',{name:'직접 그리기',exact:true}).last().isEnabled(),true);
    await openDraft(f,'직접 그리기');await paint(f);await page.keyboard.press('Escape');await closed(f);await preservation(f,directBefore,'direct Esc');
    await openDraft(f,'직접 그리기');await paint(f);await applyDraft(f);assert.notEqual((await state(f)).project,directBefore.project);assert.equal(mock.calls.length,calls);check(`${size} 직접 그리기 다른 고르기·Esc·재선택·확인, AI 요청 없음`);
    // Test the full 21-color palette, including maximum tool height, in the actual iframe.
    const palette=Array.from({length:12},(_,i)=>'#'+(0x102030+i*1024).toString(16));
    for(const slot of ['hero','obstacle','item']) {
      const [w,h]=slot==='item'?[24,24]:[44,47],draft={palette,pixels:Array(h).fill('0123456789ab'+'.'.repeat(w-12))};
      const stable=await state(f);
      await f.evaluate(({slot,draft})=>{
        window.__phase5Save=saveClassroomPractice;window.saveClassroomPractice=()=>false;
        grade1Pixel.open({slot,draft,onRetry:()=>{},onApply:pixel=>savePracticePreview(SherpaProject.buildGameHtml(SherpaProject.withPixel(modularProject,slot,pixel)))});
      },{slot,draft});
      await layout(page,f,`${size} 최대21색 ${slot}`,{slot,maxPalette:true});
      if(slot==='hero')await shot(page,`phase5-${size}-최대21색.png`);
      await editor(f).locator('.pixel-apply').click();
      await editor(f).locator('.pixel-message').waitFor({state:'visible'});
      assert.equal(await editor(f).locator('.pixel-message').textContent(),'게임을 저장하지 못했어요. 브라우저의 저장 공간을 확인한 뒤 다시 시도해 주세요.');
      await preservation(f,stable,'maximum palette failed save '+slot);
      await layout(page,f,`${size} 최대21색 저장실패 ${slot}`,{slot,maxPalette:true});
      if(slot==='hero')await shot(page,`phase5-${size}-저장실패21색.png`);
      await f.evaluate(()=>window.saveClassroomPractice=window.__phase5Save);
      await page.keyboard.press('Escape');await editor(f).waitFor({state:'detached'});
      await preservation(f,stable,'maximum palette failed save Esc '+slot);
      check(`${size} 최대21색 ${slot} 저장실패·Esc 이전 게임 보존`);
    }
    // Direct saved obstacle/item drawings use the same editor with no retry callback.
    for(const slot of ['obstacle','item']) {
      const [w,h]=slot==='item'?[24,24]:[44,47],draft={palette,pixels:Array(h).fill('0123456789ab'+'.'.repeat(w-12))};
      await f.evaluate(({slot,draft})=>{window.__phase5Cancelled=0;grade1Pixel.open({slot,draft,description:'직접 그린 그림은 손보기 창에서 고쳐 봐요',onApply:()=>{},onCancel:()=>window.__phase5Cancelled++});},{slot,draft});
      await layout(page,f,`${size} 직접 저장 그림 ${slot}`,{slot,retry:false,maxPalette:true});
      await editor(f).locator('.pixel-cancel').click();await editor(f).waitFor({state:'detached'});assert.equal(await f.evaluate(()=>window.__phase5Cancelled),1);
    }
  } finally {await context.close();}
}
async function main() {
  const server=createServer();await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  try {
    for(const[width,height]of[[1280,720],[1366,768],[1920,1080],[1024,768],[768,1024]])await runViewport(browser,width,height);
    assert.deepEqual(report.blockedRequests,[]);assert.deepEqual(report.errors,[]);check('외부 요청·실제 AI·DB·브라우저 런타임 예외 0건');report.ok=true;
  }catch(error){report.failure={message:error.message,stack:error.stack};throw error;}
  finally {report.count=report.checks.length;fs.writeFileSync(path.join(out,'5차-창검증.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
