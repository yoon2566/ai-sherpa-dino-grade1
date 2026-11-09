'use strict';
// Browser integration with local static files and an in-memory classroom board.
// Every external request is blocked; no live database, AI, credentials or deployment.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
const assets=path.resolve(__dirname,'../assets'),out=process.env.MODULAR_CAPTURE_DIR||path.resolve(__dirname,'../../../85_공룡3_모듈화/6차캡처'),port=19416;
fs.mkdirSync(out,{recursive:true});
const report={scope:'Local Chromium and in-memory classroom board; no external requests or live AI/DB',checks:[],captures:[],errors:[],external:[],requests:[]};
const check=(name,details)=>{report.checks.push({name,pass:true,...(details?{details}:{})});console.log('PASS '+name);};
const sse=raw=>'data: '+JSON.stringify({choices:[{delta:{content:raw},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,cost:0}})+'\n\ndata: [DONE]\n\n';
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');let rel=decodeURIComponent(url.pathname).replace(/^\//,'');if(rel==='lesson'||rel==='board')rel+='.html';if(!rel||rel.endsWith('/'))rel+='index.html';const file=path.resolve(assets,rel);if(!file.startsWith(assets+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
function slotCode(slot){return {hero:"function drawHero(ctx,v){ctx.fillStyle='#2364aa';ctx.fillRect(0,0,v.pose==='duck'?59:44,v.pose==='duck'?25:47);ctx.fillStyle='#ffffff';ctx.fillRect(30,5,8,8);}",background:"function drawBackground(ctx,v){ctx.fillStyle='#cceeff';ctx.fillRect(0,0,v.w,v.h);}",obstacle:"function drawObstacle(ctx,v){ctx.fillStyle='#985832';ctx.fillRect(0,0,v.w,v.h);}",item:"function drawItem(ctx,v){ctx.fillStyle='#f44a61';ctx.fillRect(0,0,v.w,v.h);}"}[slot];}
async function setup(browser,width=1280,height=900,room=true){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width!==1280,acceptDownloads:true});
 await context.addInitScript(()=>{const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...a){if(a.length===9&&a[0].width===44&&a[0].height===47&&a[5]>=0&&a[5]<70)window.__heroDraw={x:a[5],y:a[6],w:a[7],h:a[8]};return draw.apply(this,a);};});
 const mock={calls:[],writes:[],sessions:[],item:null,owner:null,failWhole:false,failTitle:false,titleDelay:0,failPublish:false,route:'unsupported',dropControls:true};
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),p=url.pathname,method=request.method();
  if(['data:','blob:','about:','file:'].includes(url.protocol))return route.continue();
  if(url.hostname!=='127.0.0.1'||Number(url.port)!==port){report.external.push(url.origin+p);return route.abort();}
  const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(p==='/api/classroom/999999')return json({name:'로컬 가상 수업',code:'999999',openPages:[1,2,3,4,5,6],canManage:false,boardVisibility:'class'});
  if(p==='/api/classroom/config')return json({authenticated:false});
  if(p==='/api/game'){
   const body=request.postDataJSON();mock.calls.push(body);report.requests.push({mode:body.mode||'html',slot:body.slot,bytes:Buffer.byteLength(JSON.stringify(body))});
   if(body.mode==='title'){assert.deepEqual(Object.keys(body).sort(),['mode','summary']);assert(!/<(?:html|script|body)/i.test(body.summary));if(mock.titleDelay)await new Promise(r=>setTimeout(r,mock.titleDelay));return mock.failTitle?json({error:'fixture title failure'},503):route.fulfill({contentType:'text/event-stream',body:sse('우주를 달리는 고양이')});}
   if(body.mode==='route')return route.fulfill({contentType:'text/event-stream',body:sse(mock.route==='broken'?'broken route':mock.route==='config'?'{"config":{"speedMultiplier":1.8}}':mock.route==='slotfail'?'{"slot":"hero","request":"주인공 색 바꿔 줘"}':'{"unsupported":true}')});
   if(body.mode==='slot')return route.fulfill({contentType:'text/event-stream',body:sse(mock.route==='slotfail'?'broken slot':'```javascript\n'+slotCode(body.slot).replace(/}$/, '// revision '+mock.calls.length+'\n}')+'\n```')});
   if(mock.failWhole)return json({error:'fixture whole failure'},503);
   if(mock.wholeDelay)await new Promise(r=>setTimeout(r,mock.wholeDelay));
   assert.equal(typeof body.baseHtml,'string');assert(body.baseHtml.includes('<html'));let game=body.baseHtml.replace('</body>','<span hidden data-fixture-edit="'+mock.calls.length+'">바뀐 게임</span></body>');
   if(mock.dropControls)game=game.replace(/\/\* GRADE1_(DUCK|SPECIAL)_START \*\/[\s\S]*?\/\* GRADE1_\1_END \*\//g,'');
   return route.fulfill({contentType:'text/event-stream',body:sse('```html\n'+game+'\n```')});
  }
  if(p==='/api/board/session'){
   const body=request.postDataJSON();mock.sessions.push(body);
   if(mock.item&&(body.workId!==mock.item.id||body.editSecret!==mock.owner.editSecret))return json({code:'ALREADY_POSTED'},403);
   return json({registered:!!mock.item,...(mock.item?{item:mock.item}:{})});
  }
  if(p==='/api/board/hearts')return json({items:mock.item?[{id:mock.item.id,count:0,hearted:false}]:[]});
  if(p==='/api/board'&&method==='POST'){
   if(mock.failPublish)return json({error:'fixture publish failure'},503);
   const body=request.postDataJSON();if(mock.item)return json({code:'ALREADY_POSTED'},403);
   assert(/^[a-f0-9]{32}$/.test(body.workKey));assert(/^[a-f0-9]{64}$/.test(body.editSecret));mock.owner={workKey:body.workKey,editSecret:body.editSecret};mock.item={id:'a'.repeat(32),revision:1,title:body.title,html:body.html,author:'가상 학생',created_at:Date.now(),bytes:Buffer.byteLength(body.html)};mock.writes.push({method,id:mock.item.id,title:body.title,revision:1});return json({item:mock.item});
  }
  if(p==='/api/board'&&method==='GET')return json({items:mock.item?[mock.item]:[],nextCursor:null});
  if(p==='/api/board/'+'a'.repeat(32)){
   if(method==='GET')return json({item:mock.item});
   const body=request.postDataJSON();if(!mock.item||body.editSecret!==mock.owner.editSecret)return json({error:'ownership'},403);if(body.expectedRevision!==mock.item.revision)return json({item:mock.item},409);if(mock.failPublish)return json({error:'fixture publish failure'},503);Object.assign(mock.item,{title:body.title,html:body.html,revision:mock.item.revision+1});mock.writes.push({method,id:mock.item.id,title:body.title,revision:mock.item.revision});return json({item:mock.item});
  }
  if(p.startsWith('/api/'))return json({error:'unhandled local API '+p},503);
  return route.continue();
 });
 context.on('page',page=>page.on('pageerror',error=>report.errors.push(error.message)));
 const page=await context.newPage();await page.goto(`http://127.0.0.1:${port}/lesson?${room?'room=999999':'preview=1'}`);
 await page.waitForFunction(()=>document.getElementById('next')&&!document.getElementById('next').disabled);for(let i=0;i<4;i++)await page.locator('#next').click();
 const f=await(await page.locator('#practice').elementHandle()).contentFrame();await f.waitForFunction(()=>typeof html==='string'&&html.length>0&&document.querySelector('#conversation article'));
 return {context,page,f,mock};
}
const ready=async f=>{await f.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await f.waitForFunction(()=>typeof working!=='undefined'&&!working);};
const button=(f,text)=>f.getByRole('button',{name:text,exact:true}).last();
const state=f=>f.evaluate(()=>({html,step,project:JSON.stringify(modularProject),freeMode,freeEditsUsed,practiceCompleted}));
const stage=(f,n)=>f.evaluate(n=>{step=n;next();},n);
async function applyChoice(f,text,draft=false){await button(f,text).click();if(draft){await f.locator('.grade1-pixel-editor').waitFor({state:'visible'});await f.locator('.pixel-apply').click();await f.locator('.grade1-pixel-editor').waitFor({state:'detached'});}await ready(f);}
async function custom(f,text){await stage(f,8);await button(f,'직접 적기').click();await f.getByRole('textbox',{name:'바꾸고 싶은 내용'}).last().fill(text);await button(f,'이렇게 바꾸기 ✨').click();await ready(f);}
async function freeRequest(f,text){await f.locator('.free-edit-message textarea').last().fill(text);await f.locator('.free-edit-message').last().getByRole('button',{name:'이렇게 바꾸기 ✨',exact:true}).click();await ready(f);}
async function shot(page,name){await page.screenshot({path:path.join(out,name)});report.captures.push(name);}
async function settledConversation(f){await f.evaluate(()=>new Promise(resolve=>{const c=document.getElementById('conversation');let last=c.scrollTop,stable=0;function frame(){const next=c.scrollTop;stable=Math.abs(next-last)<.5?stable+1:0;last=next;if(stable>=8)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));}
async function controlCheck(f,page,label){
 if(await f.locator('#preview-tab').isVisible())await f.locator('#preview-tab').click();
 const controls=await f.locator('.play-controls button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {id:n.id,x:r.x,y:r.y,right:r.right,width:r.width};}));assert.equal(controls.length,3);assert(Math.max(...controls.map(v=>v.y))-Math.min(...controls.map(v=>v.y))<2);assert(controls.every(v=>v.width>0));check(label+' 버튼 줄 한 줄·특수·숙이기·점프 유지');
 const game=await(await f.locator('#game').elementHandle()).contentFrame();await game.waitForFunction(()=>document.getElementById('grade1-duck')&&document.getElementById('grade1-special'));
 await f.locator('#jump').click();await game.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));await f.waitForFunction(()=>!document.getElementById('special').disabled);await f.locator('#special').click();await f.waitForFunction(()=>document.getElementById('special').dataset.state==='active');
 await game.waitForFunction(()=>window.__heroDraw?.y>=93);await game.locator('canvas').focus();await page.keyboard.down('ArrowDown');await game.waitForFunction(()=>window.__heroDraw?.h<30);await page.keyboard.up('ArrowDown');await game.waitForFunction(()=>window.__heroDraw?.h>40);check(label+' 통수정 후 실제 게임 시작·숙이기·특수 능력');
 await f.locator('#expand-game').click();await f.waitForFunction(()=>document.getElementById('preview-panel').classList.contains('expanded-game'));await shot(page,label+'-크게보기.png');await f.locator('#expand-game').click();
 if(await f.locator('#chat-tab').isVisible())await f.locator('#chat-tab').click();
}
async function mainFlow(browser,width,height){
 const {context,page,f,mock}=await setup(browser,width,height),size=width+'x'+height;
 try{
  await stage(f,0);await applyChoice(f,'고양이',true);
  for(const [n,label,alternative,name,draft]of[[1,'우주','바닷가','배경',false],[2,'상자','바위','장애물',true],[5,'사과','딸기','선물',true]]){
   await stage(f,n);await applyChoice(f,label,draft);const before=await state(f),article=button(f,'다른 '+name+' 고르기').locator('..');
   assert.deepEqual(await article.locator('button').allTextContents(),['다른 '+name+' 고르기','다시 그리기','다음 단계 →']);
   await button(f,'다른 '+name+' 고르기').click();assert.equal(await button(f,alternative).isEnabled(),true);assert.equal((await state(f)).html,before.html);await applyChoice(f,alternative,draft);assert.notEqual((await state(f)).html,before.html);check(size+' '+name+' 다시 고르기·이전 게임 유지·재확정');
  }
  await stage(f,6);await applyChoice(f,'잠깐 무적');
  const calls=mock.calls.length;await custom(f,'날 수 있게 해 줘');const modified=await state(f);assert.equal(modified.freeMode,true);assert.equal(modified.project,'null');assert.deepEqual(mock.calls.slice(calls).map(v=>v.mode||'html'),['route','html']);assert.equal(modified.freeEditsUsed,0);assert(await f.getByText('자유롭게 고친 뒤에는 앞 단계를 다시 고를 수 없어요',{exact:true}).count());
  const oldEnabled=await f.locator('.step-message button').evaluateAll(nodes=>nodes.filter(n=>!n.disabled).map(n=>n.textContent));assert.deepEqual(oldEnabled,[]);check(size+' unsupported 라우터 → 통수정 1회·자유 모드·앞 단계 잠금');
  await button(f,'완성하기 ✓').click();await f.locator('.free-edit-message textarea').last().waitFor();await ready(f);assert.equal(mock.writes.length,1);assert.equal(mock.writes[0].method,'POST');assert.equal(mock.item.html,(await state(f)).html);assert.equal(await f.getByText('게시판에 올렸어요! 제목: 우주를 달리는 고양이',{exact:true}).count(),1);assert.equal(await f.locator('.free-edit-count').last().textContent(),'남은 고치기 10번');check(size+' 완료 자동 게시·AI 제목·자유 입력 10번');
  await settledConversation(f);await f.locator('.free-edit-count').last().scrollIntoViewIfNeeded();await f.locator('.free-edit-message .actions').last().scrollIntoViewIfNeeded();await settledConversation(f);await shot(page,'6차-'+size+'-자유고치기.png');if(process.argv.includes('--capture-only'))return;await controlCheck(f,page,'6차-'+size);
  const beforeFail=await state(f);mock.failWhole=true;await freeRequest(f,'실패하는 요청');assert.equal((await state(f)).html,beforeFail.html);assert.equal((await state(f)).freeEditsUsed,0);assert.equal(mock.writes.length,1);mock.failWhole=false;check(size+' 통수정 실패 시 횟수·게임·게시물 유지');
  let n=mock.calls.length;await freeRequest(f,'하늘을 분홍색으로');assert.deepEqual(mock.calls.slice(n).map(x=>x.mode||'html'),['html','title']);assert.equal((await state(f)).freeEditsUsed,1);assert.equal(mock.writes.at(-1).method,'PATCH');assert.equal(mock.item.revision,2);assert.equal(mock.sessions.at(-1).workId,mock.item.id);assert.equal(mock.sessions.at(-1).editSecret,mock.owner.editSecret);check(size+' 자유 고치기 전체 HTML만·같은 게시물 소유권 업데이트');
  const forbidden=await f.evaluate(async id=>(await fetch('/api/board/'+id+'?room=999999',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'침입',html:'invalid',editSecret:'f'.repeat(64),expectedRevision:2})})).status,mock.item.id);assert.equal(forbidden,403);assert.equal(mock.item.revision,2);check(size+' 모의 DB 다른 소유권 수정 거절');
  await page.reload();await page.waitForFunction(()=>!document.getElementById('next').disabled);for(let i=0;i<4;i++)await page.locator('#next').click();const resumed=await(await page.locator('#practice').elementHandle()).contentFrame();await resumed.locator('.free-edit-count').waitFor();assert.equal((await state(resumed)).freeEditsUsed,1);assert.equal((await state(resumed)).freeMode,true);assert.equal(mock.writes.length,2);check(size+' 이어하기 횟수·자유 모드 유지·중복 자동 게시 없음');
  if(width===1280){
   const saved=await state(resumed),writes=mock.writes.length;await resumed.evaluate(()=>{window.__saveBeforeFailure=saveClassroomPractice;window.saveClassroomPractice=()=>false;});await freeRequest(resumed,'저장 실패 확인');await resumed.evaluate(()=>window.saveClassroomPractice=window.__saveBeforeFailure);assert.equal((await state(resumed)).html,saved.html);assert.equal((await state(resumed)).freeEditsUsed,1);assert.equal(mock.writes.length,writes);check('통수정 성공 후 로컬 저장 실패: 게임·카운트·게시물 유지');
   for(let i=2;i<=9;i++){await freeRequest(resumed,'배경 장식 '+i);assert.equal((await state(resumed)).freeEditsUsed,i);}
   const second=await context.newPage();await second.goto(`http://127.0.0.1:${port}/lesson?room=999999`);await second.waitForFunction(()=>!document.getElementById('next').disabled);for(let i=0;i<4;i++)await second.locator('#next').click();const other=await(await second.locator('#practice').elementHandle()).contentFrame();await other.locator('.free-edit-message textarea').waitFor();assert.equal((await state(other)).freeEditsUsed,9);
   mock.wholeDelay=300;const count=mock.calls.filter(x=>!x.mode).length;await Promise.all([freeRequest(resumed,'마지막 수정 A'),freeRequest(other,'마지막 수정 B')]);await ready(resumed);await ready(other);assert.equal(mock.calls.filter(x=>!x.mode).length,count+1);const a=await state(resumed),b=await state(other);assert.equal(Math.max(a.freeEditsUsed,b.freeEditsUsed),10);const stale=a.freeEditsUsed<10?resumed:other;await freeRequest(stale,'한도 뒤 재시도');assert.equal((await state(stale)).freeEditsUsed,10);assert.equal(mock.calls.filter(x=>!x.mode).length,count+1);mock.wholeDelay=0;await second.close();check('9회 사용한 두 탭 동시 요청: 실제 수정 1회만·공유 10회 한도·오래된 탭 재시도 차단');
   assert.equal(mock.writes.length,11);assert.equal(new Set(mock.writes.map(x=>x.id)).size,1);assert(await resumed.getByText('오늘은 여기까지! 게임을 즐겨 봐요.',{exact:true}).count());assert.equal(await resumed.locator('.free-edit-message textarea:not(:disabled)').count(),0);check('10회 한도·성공마다 같은 게시물 업데이트·입력 종료');await shot(page,'6차-1280x900-10회완료.png');
  }
  if(await resumed.locator('#preview-tab').isVisible())await resumed.locator('#preview-tab').click();
  const [download]=await Promise.all([page.waitForEvent('download'),resumed.locator('#download').click()]),file=path.join(out,'6차-'+size+'-내려받은게임.html');await download.saveAs(file);assert.equal(fs.readFileSync(file,'utf8'),(await state(resumed)).html);const exported=await context.newPage();await exported.goto(pathToFileURL(file).href);await exported.waitForFunction(()=>document.getElementById('grade1-duck')&&document.querySelector('canvas'));check(size+' 자유모드 내려받은 HTML 단독 실행');await exported.close();
  const board=await context.newPage();await board.goto(`http://127.0.0.1:${port}/board?room=999999&work=${mock.item.id}`);await board.locator('#expand-game').waitFor({state:'visible'});const frame=await(await board.locator('#play iframe').elementHandle()).contentFrame();await frame.waitForFunction(()=>document.querySelector('canvas'));await frame.evaluate(()=>window.__expandToken=37);await board.locator('#expand-game').click();await board.waitForFunction(()=>document.getElementById('viewer-game').classList.contains('expanded-game'));assert.equal(await frame.evaluate(()=>window.__expandToken),37);await shot(board,'6차-'+size+'-게시물크게보기.png');await frame.locator('canvas').focus();await board.keyboard.press('Escape');await board.waitForFunction(()=>!document.getElementById('viewer-game').classList.contains('expanded-game'));assert.equal(await board.locator('#viewer').evaluate(n=>n.open),true);assert.equal(await frame.evaluate(()=>window.__expandToken),37);await board.locator('#close').click();assert.equal(await board.locator('#viewer').evaluate(n=>n.open),false);check(size+' 게시물 크게 보기·게임 유지·iframe Esc 축소·닫기');await board.close();
 }finally{await context.close();}
}
async function edgeCases(browser){
 const {context,page,f,mock}=await setup(browser);
 try{
  await stage(f,0);await applyChoice(f,'고양이',true);
  mock.titleDelay=500;await f.evaluate(()=>openGameShare(html));const input=f.locator('.game-share-dialog input');await input.fill('내가 지은 이름');await f.waitForFunction(()=>!document.querySelector('.game-share-dialog button[type=submit]').disabled);assert.equal(await input.inputValue(),'내가 지은 이름');await f.locator('.game-share-dialog button[type=submit]').click();await f.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(mock.item.title,'내가 지은 이름');check('수동 저장: AI 제목 대기 중 학생 입력 보존·학생 제목 게시');
  mock.titleDelay=0;mock.failTitle=true;await f.evaluate(()=>openGameShare(html));await f.waitForFunction(()=>!document.querySelector('.game-share-dialog button[type=submit]').disabled);assert.equal(await input.inputValue(),'나의 고양이 게임');await f.locator('.game-share-dialog').getByRole('button',{name:'취소',exact:true}).click();check('AI 제목 실패 시 캐릭터 이름으로 fallback·편집 가능');
  mock.failTitle=false;await f.evaluate(()=>openGameShare(html));await f.waitForFunction(()=>!document.querySelector('.game-share-dialog button[type=submit]').disabled);assert.equal(await input.inputValue(),'우주를 달리는 고양이');assert.equal(await input.isEditable(),true);await f.locator('.game-share-dialog').getByRole('button',{name:'취소',exact:true}).click();check('기존 게시판 저장 창: AI 제목 미리 채움·학생 편집 가능');
  mock.route='broken';await custom(f,'점점 빨라지게');assert.equal((await state(f)).freeMode,true);check('라우터 처리 실패도 전체 HTML fallback 성공');
  const writes=mock.writes.length;mock.failPublish=true;await button(f,'완성하기 ✓').click();await ready(f);assert.equal(mock.writes.length,writes);assert(await button(f,'게시판에 다시 올리기').isVisible());mock.failPublish=false;await button(f,'게시판에 다시 올리기').click();await ready(f);assert.equal(mock.writes.length,writes+1);assert.equal(mock.writes.at(-1).method,'PATCH');assert.equal((await state(f)).freeEditsUsed,0);check('자동 게시 실패 후 재시도: 기존 소유 게시물 업데이트·횟수 유지');
 }finally{await context.close();}
 const failedSlot=await setup(browser);try{failedSlot.mock.route='slotfail';await custom(failedSlot.f,'주인공 색 바꿔 줘');assert.deepEqual(failedSlot.mock.calls.map(x=>x.mode||'html'),['route','slot','slot','html']);assert.equal((await state(failedSlot.f)).freeMode,true);check('칸 처리 두 번 실패 뒤 전체 HTML fallback 성공');}finally{await failedSlot.context.close();}
 const progressive=await setup(browser);try{progressive.mock.route='config';await custom(progressive.f,'점점 빨라지게');assert.deepEqual(progressive.mock.calls.map(x=>x.mode||'html'),['route','html']);assert.equal((await state(progressive.f)).freeMode,true);const saved=await progressive.f.evaluate(()=>JSON.parse(new DOMParser().parseFromString(html,'text/html').querySelector('#sherpa-free-project').textContent));assert.equal(saved.config.speedMultiplier,1);check('점진 요청의 잘못된 상수 설정 응답을 적용하지 않고 전체 HTML로 수정');}finally{await progressive.context.close();}
 const preview=await setup(browser,1280,900,false);
 try{await stage(preview.f,8);await button(preview.f,'이대로 완성하기 ✓').click();await preview.f.locator('.free-edit-message textarea').waitFor();assert.equal(preview.mock.writes.length,0);assert.equal(preview.mock.calls.length,0);await freeRequest(preview.f,'점수 색 바꾸기');assert.equal((await state(preview.f)).freeEditsUsed,1);assert.deepEqual(preview.mock.calls.map(x=>x.mode||'html'),['html']);assert.equal(preview.mock.writes.length,0);check('둘러보기 완료·자유 고치기는 게시·제목 호출 없음');}finally{await preview.context.close();}
}
(async()=>{await new Promise(r=>server.listen(port,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{for(const size of[[1280,900],[1024,768],[768,1024]])await mainFlow(browser,...size);if(!process.argv.includes('--capture-only'))await edgeCases(browser);assert.deepEqual(report.external,[]);assert.deepEqual(report.errors,[]);check('브라우저 예외·외부 요청·실제 AI·실제 DB 0건');report.ok=true;}catch(error){report.failure={message:error.message,stack:error.stack};throw error;}finally{report.count=report.checks.length;fs.writeFileSync(path.join(out,process.argv.includes('--capture-only')?'6차-화면검증.json':'6차-통합검증.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);process.exitCode=1;});
