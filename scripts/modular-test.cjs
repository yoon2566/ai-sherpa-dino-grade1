'use strict';
// Local synthetic fixtures only: never starts Wrangler or connects to a real classroom.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const {chromium} = require(path.resolve(__dirname, '../../../70_검수/node_modules/playwright'));
const repo = path.resolve(__dirname, '..');
const root = path.join(repo, 'assets');
const out = path.resolve(__dirname, '../../../85_공룡3_모듈화/1차캡처');
fs.mkdirSync(out, {recursive:true});
const report = {scope:'localhost synthetic classroom; no deployment, database or live AI',checks:[],errors:[],blockedRequests:[],aiRequests:0,publishRequests:[]};
const cache = new Map();
const ports = [19113,19114];
function check(name,details) { report.checks.push({name,pass:true,details}); console.log('PASS '+name); }
function createServer(baseline=false) {
  return http.createServer((req,res)=>{
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname === '/api/classroom/999999') {
      res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify({name:'로컬 검증',code:'999999',openPages:[1,2,3,4,5,6],canManage:false}));
    }
    if(pathname.startsWith('/api/')) {res.writeHead(503);return res.end('{"error":"Local tests block live APIs"}');}
    let rel = pathname.replace(/^\//,'');
    if(!rel || rel.endsWith('/')) rel += 'index.html';
    if(rel==='lesson') rel='lesson.html';
    const filename=path.resolve(root,rel);
    if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try{
      let data;
      if(baseline){if(!cache.has(rel))cache.set(rel,execFileSync('git',['show','a54bbdc:assets/'+rel],{cwd:repo,maxBuffer:25000000,windowsHide:true}));data=cache.get(rel);}
      else data=fs.readFileSync(filename);
      res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.png':'image/png','.ttf':'font/ttf'})[path.extname(filename)]||'application/octet-stream');res.end(data);
    }catch{res.writeHead(404);res.end();}
  });
}
async function guardedContext(browser,options={}){
  const ctx=await browser.newContext({acceptDownloads:true,...options});
  // Read-only rendering observation: verify real input changes the atlas pose.
  await ctx.addInitScript(()=>{const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...a){if(a.length===9&&a[0].naturalWidth===704&&a[0].naturalHeight===94)window.__observedHero={x:a[5],y:a[6],w:a[7],h:a[8],frame:a[1]/88};return draw.apply(this,a);};});
  await ctx.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(['data:','blob:','about:','file:'].includes(url.protocol))return route.continue();
    if(url.hostname==='127.0.0.1'&&ports.includes(Number(url.port)))return route.continue();
    report.blockedRequests.push(url.origin+url.pathname);return route.abort();
  });
  ctx.on('page',p=>{p.on('pageerror',e=>report.errors.push(e.message));p.on('request',r=>{if(new URL(r.url()).pathname==='/api/game')report.aiRequests++;});});
  return ctx;
}
async function practicePage(context,baseline=false){
  const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${baseline?19114:19113}/lesson.html?room=999999`);
  await page.waitForFunction(()=>document.getElementById('next')&&!document.getElementById('next').disabled);
  for(let i=0;i<4;i++)await page.locator('#next').click();
  const f=await (await page.locator('#practice').elementHandle()).contentFrame();
  await f.waitForFunction(()=>typeof html==='string'&&html.length>0&&document.querySelector('#conversation article'));
  await f.locator('#game').waitFor({state:'attached'});
  return {page,f};
}
async function lastButton(f,name){await f.getByRole('button',{name,exact:true}).last().click();}
async function state(f){return f.evaluate(()=>({html,step,progress:document.getElementById('progress').textContent}));}
async function ready(f){await f.waitForFunction(()=>typeof working!=='undefined'&&!working);}
async function snapshotUI(f){return f.evaluate(()=>{
  const selectors=['#progress','#chat-panel','#preview-panel','.preview-heading','.play-controls','#special','#duck','#jump','#expand-game'];
  const values={};for(const selector of selectors){const el=document.querySelector(selector),r=el.getBoundingClientRect(),s=getComputedStyle(el);values[selector]={text:['#progress','#special','#duck','#jump','#expand-game'].includes(selector)?el.textContent:null,x:r.x,y:r.y,w:r.width,h:r.height,color:s.color,background:s.backgroundColor,display:s.display};}
  values.choices=[...document.querySelectorAll('.choice-label')].map(n=>n.textContent);values.headings=[...document.querySelectorAll('#conversation h2')].map(n=>n.textContent);return values;
});}
async function runUI(browser){
  for(const [width,height]of [[1280,900],[1024,768],[768,1024]]){
    const ctx=await guardedContext(browser,{viewport:{width,height},hasTouch:width!==1280});
    const old=await practicePage(ctx,true);await old.page.screenshot({path:path.join(out,`baseline-${width}x${height}.png`)});const before=await snapshotUI(old.f);await old.page.close();
    const {page,f}=await practicePage(ctx);await page.screenshot({path:path.join(out,`step1-${width}x${height}.png`)});const after=await snapshotUI(f);
    assert.deepEqual(after,before,'student UI must preserve text, choices, colors and geometry');check(`초기 학생 UI ${width}×${height}`,after);
    await f.getByRole('button',{name:'로봇',exact:true}).click();await ready(f);await lastButton(f,'다음 단계 →');
    await f.getByRole('button',{name:'숲속',exact:true}).click();await ready(f);await lastButton(f,'다음 단계 →');
    await f.getByRole('button',{name:'바위',exact:true}).click();await ready(f);await lastButton(f,'다음 단계 →');
    await f.locator('#speed-range').fill('6');await lastButton(f,'이걸로 정하기 ✓');await ready(f);await lastButton(f,'다음 단계 →');
    await f.locator('#lives-range').fill('9');await lastButton(f,'이걸로 정하기 ✓');await ready(f);await lastButton(f,'다음 단계 →');
    await f.getByRole('button',{name:'별',exact:true}).click();await ready(f);await lastButton(f,'다음 단계 →');
    await f.getByRole('button',{name:'잠깐 무적',exact:true}).click();await ready(f);await lastButton(f,'다음 단계 →');
    await f.getByRole('button',{name:'반짝!',exact:true}).click();await ready(f);await lastButton(f,'내 생각 더하기 →');
    await f.getByRole('button',{name:'직접 적기',exact:true}).click();await f.getByRole('textbox',{name:'바꾸고 싶은 내용'}).fill('하늘에 별을 그려 줘');await lastButton(f,'이렇게 바꾸기 ✨');await ready(f);await lastButton(f,'완성하기 ✓');
    const completed=await state(f);assert.equal(completed.progress,'완성');assert.match(completed.html,/id="sherpa-project"/);assert.equal(report.aiRequests,0);check(`AI 없이 1~9 단계 ${width}×${height}`);
    await f.getByRole('heading',{name:'나만의 게임 완성! 🎉',exact:true}).evaluate(n=>n.scrollIntoView({behavior:'instant',block:'center'}));
    await page.screenshot({path:path.join(out,`complete-${width}x${height}.png`)});
    if(await f.locator('#preview-tab').isVisible())await f.locator('#preview-tab').click();
    await f.locator('#game').waitFor({state:'visible'});
    await page.screenshot({path:path.join(out,`preview-${width}x${height}.png`)});
    const controls=await f.locator('.play-controls button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {id:b.id,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
    assert.equal(controls.length,3);assert(Math.max(...controls.map(b=>b.y))-Math.min(...controls.map(b=>b.y))<2);for(let i=1;i<controls.length;i++)assert(controls[i].x>=controls[i-1].right);check(`버튼 한 줄 ${width}×${height}`,controls);
    await runEmbeddedInput(page,f,width,height);
    await f.locator('#expand-game').click();await f.waitForFunction(()=>document.querySelector('#preview-panel').classList.contains('expanded-game'));await page.screenshot({path:path.join(out,`expanded-${width}x${height}.png`)});await f.locator('#expand-game').click();check(`크게 보기 열기·닫기 ${width}×${height}`);
    await page.reload();
    // The lesson itself opens at page 1; visit page 5 through the same navigation again.
    await page.waitForFunction(()=>!document.getElementById('next').disabled);for(let i=0;i<4;i++)await page.locator('#next').click();
    const rf=await(await page.locator('#practice').elementHandle()).contentFrame();await rf.waitForFunction(()=>document.getElementById('progress').textContent==='완성');assert.equal((await state(rf)).html,completed.html);check(`v1 외피 이어하기 ${width}×${height}`);
    if(width===1280){
      const dp=page.waitForEvent('download');await rf.locator('#download').click();const download=await dp;const saved=path.join(out,'내려받은-모듈화-게임.html');await download.saveAs(saved);assert.equal(fs.readFileSync(saved,'utf8'),completed.html);report.download=saved;
      await runPublish(rf,ctx,completed.html);
    }
    await ctx.close();
  }
}
async function runEmbeddedInput(page,f,width,height){
  const game=await(await f.locator('#game').elementHandle()).contentFrame();
  await game.waitForFunction(()=>window.__observedHero?.h===47);
  assert.equal(await game.locator('#grade1-duck').isVisible(),false);assert.equal(await game.locator('#grade1-special').isVisible(),false);assert.equal(await game.locator('#grade1-current-ability').isVisible(),false);
  if(width===1280)await f.locator('#jump').click();else await f.locator('#jump').tap();await game.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));await game.waitForFunction(()=>window.__observedHero?.x===24&&window.__observedHero?.y===93);
  if(width===1280){
    await game.locator('canvas').focus();await page.keyboard.down('Space');await game.waitForFunction(()=>window.__observedHero.y<85);await page.keyboard.up('Space');await game.waitForFunction(()=>window.__observedHero.y===93);await page.keyboard.down('ArrowDown');await game.waitForFunction(()=>window.__observedHero.h===25);await page.keyboard.up('ArrowDown');await game.waitForFunction(()=>window.__observedHero.h===47);
  }else{
    await game.locator('canvas').tap({position:{x:150,y:60}});await game.waitForFunction(()=>window.__observedHero.y<85);await game.waitForFunction(()=>window.__observedHero.y===93);
    const box=await f.locator('#duck').boundingBox(),cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await game.waitForFunction(()=>window.__observedHero.h===25);assert.equal(await f.locator('#duck').getAttribute('aria-pressed'),'true');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await game.waitForFunction(()=>window.__observedHero.h===47);assert.equal(await f.locator('#duck').getAttribute('aria-pressed'),'false');
  }
  await f.locator('#special').click();await f.waitForFunction(()=>document.getElementById('special').dataset.state==='active');await page.screenshot({path:path.join(out,`embedded-input-${width}x${height}.png`)});check(`수업 내 키보드·터치·특수 버튼 ${width}×${height}`,{touch:width!==1280,internalControlsHidden:true});
  await page.locator('#previous').click();await f.waitForFunction(()=>document.getElementById('game').getAttribute('srcdoc')==='');assert.equal(await f.locator('#duck').getAttribute('aria-pressed'),'false');await page.locator('#next').click();await f.waitForFunction(()=>document.getElementById('game').getAttribute('srcdoc').length>0);const restored=await(await f.locator('#game').elementHandle()).contentFrame();await restored.waitForFunction(()=>document.getElementById('status')?.textContent.includes('시작 전'));check(`수업 페이지 이동 시 게임 종료·복원 ${width}×${height}`);
}
async function runPublish(f,context,expectedHtml){
  const id='1'.repeat(32);let revision=0;
  await context.route('**/api/board**',async route=>{
    const request=route.request(),u=new URL(request.url());
    if(u.pathname.endsWith('/session'))return route.fulfill({json:{registered:revision>0,...(revision?{item:{id}}:{})}});
    const payload=request.postDataJSON();assert.equal(payload.html,expectedHtml);assert.equal(payload.expectedRevision,revision||undefined);assert.equal(request.method(),revision?'PATCH':'POST');revision++;
    report.publishRequests.push({method:request.method(),htmlBytes:Buffer.byteLength(payload.html),formatVersion:2,revision});
    return route.fulfill({json:{item:{id,revision,title:payload.title}}});
  });
  await lastButton(f,'게시판에 저장하기');await f.locator('dialog input[name="title"]').fill('로컬 합성 검증');await f.locator('dialog').getByRole('button',{name:'게시판에 저장하기',exact:true}).click();await f.getByRole('button',{name:'닫기',exact:true}).click();
  await lastButton(f,'수정 내용 업데이트');await f.locator('dialog').getByRole('button',{name:'수정 내용 업데이트',exact:true}).click();await f.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(revision,2);check('게시 HTML 계약 POST→PATCH (로컬 mock)',report.publishRequests);
}
async function runDownload(browser){
  for(const [width,height]of [[1280,900],[1024,768],[768,1024]]){
    const ctx=await guardedContext(browser,{viewport:{width,height},hasTouch:width!==1280});
    const p=await ctx.newPage();await p.goto(pathToFileURL(report.download).href);await p.waitForFunction(()=>window.__observedHero?.h===47);
    assert.match(await p.locator('#status').textContent(),/시작 전/);
    if(width===1280)await p.locator('canvas').first().click({position:{x:150,y:60}});else await p.locator('canvas').first().tap({position:{x:150,y:60}});await p.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));await p.waitForFunction(()=>window.__observedHero?.x===24&&window.__observedHero?.y===93);
    if(width===1280){
      await p.keyboard.down('Space');await p.waitForFunction(()=>window.__observedHero.y<85);await p.keyboard.up('Space');await p.waitForFunction(()=>window.__observedHero.y===93);
      await p.keyboard.down('ArrowDown');await p.waitForFunction(()=>window.__observedHero.h===25);await p.screenshot({path:path.join(out,`file-${width}x${height}-keyboard-duck.png`)});await p.keyboard.up('ArrowDown');await p.waitForFunction(()=>window.__observedHero.h===47);await p.keyboard.press('x');
    }else{
      const duck=p.locator('#grade1-duck');await duck.waitFor({state:'visible'});const box=await duck.boundingBox(),cdp=await ctx.newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await p.waitForFunction(()=>window.__observedHero.h===25);assert.equal(await duck.getAttribute('aria-pressed'),'true');await p.screenshot({path:path.join(out,`file-${width}x${height}-touch-duck.png`)});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForFunction(()=>window.__observedHero.h===47);assert.equal(await duck.getAttribute('aria-pressed'),'false');
      await p.locator('#grade1-special').tap();
    }
    await p.waitForFunction(()=>document.getElementById('grade1-special').dataset.state==='active');assert.match(await p.locator('#grade1-special').textContent(),/5초/);
    await p.locator('#soundBtn').click();assert.equal(await p.locator('#soundBtn').getAttribute('aria-pressed'),'false');await p.locator('#soundBtn').click();assert.equal(await p.locator('#soundBtn').getAttribute('aria-pressed'),'true');
    await p.screenshot({path:path.join(out,`file-${width}x${height}.png`)});check(`내려받은 HTML file 실제 조작 ${width}×${height}`,{input:width===1280?'keyboard Space/ArrowDown/X':'Chromium emulated CDP touch down/up + special',mutedToggle:true});await ctx.close();
  }
}
async function runCompatibility(browser){
  const ctx=await guardedContext(browser,{viewport:{width:1280,height:900}}),{page,f}=await practicePage(ctx);
  const metadata=await f.evaluate(()=>{
    const p=SherpaProject.createProject();p.config.itemName='</script><img src=x onerror=alert(1)>';const built=buildGameHtml(p),doc=new DOMParser().parseFromString(built,'text/html');
    const roundtrip=SherpaProject.inspectHtml(built);let rejected=false;try{const bad=structuredClone(p);bad.slots.hero.code='function drawHero(ctx,v){while(true){}}';buildGameHtml(bad);}catch{rejected=true;}
    return {itemName:roundtrip.project.config.itemName,images:doc.querySelectorAll('img[src="x"]').length,metaCount:doc.querySelectorAll('#sherpa-project').length,rejected,bytes:new TextEncoder().encode(built).length};
  });assert.equal(metadata.itemName,'</script><img src=x onerror=alert(1)>');assert.equal(metadata.images,0);assert.equal(metadata.metaCount,1);assert(metadata.rejected);assert(metadata.bytes<1500000);check('메타데이터 탈출 방지·임의 칸 코드 비활성',metadata);
  await f.getByRole('button',{name:'직접 그리기',exact:true}).click();const editor=f.locator('.grade1-pixel-editor canvas');await editor.click({position:{x:30,y:30}});await editor.click({position:{x:280,y:280}});await f.getByRole('button',{name:'이 캐릭터로 달리기',exact:true}).click();
  const pixels=await f.evaluate(()=>SherpaProject.inspectHtml(html).project);assert.equal(pixels.slots.hero.mode,'pixel');assert.equal(pixels.assets.pixel.length,256);assert.equal([...pixels.assets.pixel].filter(x=>x!=='0').length,2);await page.screenshot({path:path.join(out,'pixel-editor-applied.png')});check('픽셀 편집기→작품 데이터 저장', {mode:pixels.slots.hero.mode,colored:2});
  await page.close();await ctx.close();
  const legacyHtml=fs.readFileSync(path.join(root,'original-game.html'),'utf8');
  const legacy=await guardedContext(browser,{viewport:{width:1280,height:900}});await legacy.addInitScript(({html})=>{if(window===top&&location.hostname==='127.0.0.1')localStorage.setItem('sherpa-room-999999:sherpa-grade1-practice-v1',JSON.stringify({version:1,html,step:3,complete:false}));},{html:legacyHtml});
  const old=await practicePage(legacy);assert.equal((await state(old.f)).html,legacyHtml);await provePlayback(old.f);await old.page.screenshot({path:path.join(out,'legacy-playback.png')});
  await old.f.evaluate(()=>{window.__mockLegacyCalls=0;receiveGameHtml=async()=>{window.__mockLegacyCalls++;return {html:lesson.game.replace('</body>','<!-- local legacy edit fixture --></body>')};};});
  await old.f.locator('#speed-range').fill('4');await lastButton(old.f,'이걸로 정하기 ✓');await ready(old.f);const edited=await state(old.f);assert.match(edited.html,/local legacy edit fixture/);assert.doesNotMatch(edited.html,/sherpa-project/);assert.equal(await old.f.evaluate(()=>window.__mockLegacyCalls),1);check('구형 원문 재생·기존 편집 경로 (응답만 로컬 fixture)');await legacy.close();
  const edge=await guardedContext(browser,{viewport:{width:1280,height:900}}),rollback=await practicePage(edge);await rollback.f.evaluate(()=>{step=3;next();});const before=await state(rollback.f),projectBefore=await rollback.f.evaluate(()=>JSON.stringify(modularProject));
  await rollback.f.evaluate(()=>{window.__saveOriginal=saveClassroomPractice;window.saveClassroomPractice=()=>false;});await rollback.f.locator('#speed-range').fill('6');await lastButton(rollback.f,'이걸로 정하기 ✓');await ready(rollback.f);assert.equal((await state(rollback.f)).html,before.html);assert.equal(await rollback.f.evaluate(()=>JSON.stringify(modularProject)),projectBefore);assert.equal(await rollback.f.evaluate(()=>modularProject.config.speedMultiplier),1);await rollback.f.evaluate(()=>{window.saveClassroomPractice=window.__saveOriginal;});check('저장 실패 시 속도 변경 취소·HTML·프로젝트 동시 유지');
  const future=before.html.replace('"engineVersion":"1.0.0"','"engineVersion":"999.0.0"');await rollback.f.evaluate(({html})=>localStorage.setItem('sherpa-room-999999:sherpa-grade1-practice-v1',JSON.stringify({version:1,html,step:3,complete:false})),{html:future});await rollback.page.close();const unsupported=await practicePage(edge);assert.equal((await state(unsupported.f)).html,future);await provePlayback(unsupported.f);await unsupported.f.locator('#speed-range').fill('4');await lastButton(unsupported.f,'이걸로 정하기 ✓');await ready(unsupported.f);assert.equal((await state(unsupported.f)).html,future);check('알 수 없는 엔진 버전 실제 재생·원문 유지·다운그레이드 차단');await edge.close();
}
async function provePlayback(f){
  const game=await(await f.locator('#game').elementHandle()).contentFrame();await game.waitForFunction(()=>window.__observedHero?.h===47);await f.locator('#jump').click();await game.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));
  // The unchanged legacy runner pauses after a font/layout resize. Resume using
  // its real control, then retain the same exact grounded-state assertion.
  for(let attempt=0;attempt<3;attempt++){
    await game.waitForFunction(()=>(window.__observedHero?.x===24&&window.__observedHero?.y===93)||document.getElementById('status').textContent.includes('일시 정지'));
    if(await game.evaluate(()=>document.getElementById('status').textContent.includes('일시 정지'))){await f.locator('#jump').click();report.legacyResizeResumes=(report.legacyResizeResumes||0)+1;}else break;
  }
  await game.waitForFunction(()=>window.__observedHero?.x===24&&window.__observedHero?.y===93);await game.locator('canvas').focus();await f.page().keyboard.down('Space');await game.waitForFunction(()=>window.__observedHero.y<85);await f.page().keyboard.up('Space');
}
async function main(){
  const servers=ports.map((port,i)=>createServer(i===1));await Promise.all(servers.map((s,i)=>new Promise(r=>s.listen(ports[i],'127.0.0.1',r))));
  if(process.argv.includes('--serve')){console.log('Synthetic local servers: '+ports.join(', '));return;}
  const browser=await chromium.launch({headless:true});
  try{if(!process.argv.includes('--compat-only')){await runUI(browser);await runDownload(browser);}await runCompatibility(browser);assert.equal(report.aiRequests,0);assert.equal(report.blockedRequests.length,0);assert.equal(report.errors.length,0,report.errors.join('\n'));check('실제 AI·외부 요청 0건·JavaScript 런타임 예외 없음');}
  catch(e){report.failure={message:e.message,stack:e.stack};throw e;}
  finally{fs.writeFileSync(path.join(out,'검증결과.json'),JSON.stringify(report,null,2));await browser.close();servers.forEach(s=>s.close());}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
