'use strict';
// Focused local Chromium checks. Every external request is blocked; the API is in memory.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
const assets=path.resolve(__dirname,'../assets'),out=path.resolve(__dirname,'../../../90_공룡_저학년/evidence'),port=19490;
fs.mkdirSync(out,{recursive:true});
const report={scope:'Local static assets + Chromium + in-memory board; no external AI or database calls',checks:[],captures:[],layouts:[],errors:[],external:[]};
const check=(name,details)=>{report.checks.push({name,pass:true,...(details?{details}:{})});console.log('PASS '+name);};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');let rel=decodeURIComponent(url.pathname).replace(/^\//,'');if(rel==='lesson'||rel==='board')rel+='.html';if(!rel||rel.endsWith('/'))rel+='index.html';const file=path.resolve(assets,rel);if(!file.startsWith(assets+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
const sse=raw=>'data: '+JSON.stringify({choices:[{delta:{content:raw},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n';
async function setup(browser,width=1280,height=900,room=true){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<=1024});
 const mock={calls:[],writes:[],attempts:[],sessions:[],item:null,owner:null,failPublish:false,writeDelay:0};
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),p=url.pathname,method=request.method();
  if(['data:','blob:','about:'].includes(url.protocol))return route.continue();
  if(url.hostname!=='127.0.0.1'||Number(url.port)!==port){report.external.push(url.origin+p);return route.abort();}
  const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(p==='/api/classroom/999999')return json({name:'로컬 저장 검증',code:'999999',openPages:[1,2,3,4,5,6],canManage:false,boardVisibility:'class'});
  if(p==='/api/classroom/config')return json({authenticated:false});
  if(p==='/api/game'){
   const body=request.postDataJSON();mock.calls.push(body);
   if(body.mode==='title')return route.fulfill({contentType:'text/event-stream',body:sse('우주를 달리는 공룡')});
   assert.equal(typeof body.baseHtml,'string');assert(body.baseHtml.includes('<html'));
   const game=body.baseHtml.replace('</body>','<span hidden data-resave-fixture="'+mock.calls.length+'">바뀐 게임</span></body>');
   return route.fulfill({contentType:'text/event-stream',body:sse('```html\n'+game+'\n```')});
  }
  if(p==='/api/board/session'){
   const body=request.postDataJSON();mock.sessions.push(body);
   if(mock.item&&(body.workId!==mock.item.id||body.editSecret!==mock.owner.editSecret))return json({code:'ALREADY_POSTED'},403);
   return json({registered:!!mock.item,...(mock.item?{item:mock.item}:{})});
  }
  if(p==='/api/board/hearts')return json({items:[]});
  if(p==='/api/board'&&method==='GET')return json({items:mock.item?[mock.item]:[],nextCursor:null});
  if(p==='/api/board'&&method==='POST'||p==='/api/board/'+'a'.repeat(32)&&method==='PATCH'){
   const body=request.postDataJSON();mock.attempts.push({method,title:body.title});
   if(mock.writeDelay)await new Promise(resolve=>setTimeout(resolve,mock.writeDelay));
   if(mock.failPublish)return json({error:'모의 저장 실패. 다시 눌러 주세요.'},503);
   if(method==='POST'){
    if(mock.item)return json({code:'ALREADY_POSTED'},403);
    assert(/^[a-f0-9]{32}$/.test(body.workKey));assert(/^[a-f0-9]{64}$/.test(body.editSecret));
    mock.owner={workKey:body.workKey,editSecret:body.editSecret};
    mock.item={id:'a'.repeat(32),revision:1,title:body.title,html:body.html,author:'가상 학생',created_at:Date.now(),bytes:Buffer.byteLength(body.html)};
    mock.writes.push({method,id:mock.item.id,revision:1,title:body.title});return json({item:mock.item});
   }
   if(!mock.item||body.editSecret!==mock.owner.editSecret)return json({error:'ownership'},403);
   if(mock.item.title===body.title&&mock.item.html===body.html){mock.writes.push({method,id:mock.item.id,revision:mock.item.revision,title:body.title,duplicate:true});return json({item:mock.item,duplicate:true});}
   if(body.expectedRevision!==mock.item.revision)return json({item:mock.item},409);
   Object.assign(mock.item,{title:body.title,html:body.html,revision:mock.item.revision+1});mock.writes.push({method,id:mock.item.id,revision:mock.item.revision,title:body.title});return json({item:mock.item,updated:true});
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
const state=f=>f.evaluate(()=>({html,freeEditsUsed,freeMode,practiceCompleted}));
const form=f=>f.locator('.free-edit-message,.free-edit-finished').last();
const saveButton=f=>form(f).locator('.free-resave-button');
const saveStatus=f=>form(f).locator('.free-save-status');
async function complete(f){await f.evaluate(()=>{step=8;next();});await f.getByRole('button',{name:'이대로 완성하기 ✓',exact:true}).last().click();await f.locator('.free-edit-message').last().waitFor();await ready(f);if(await f.locator('#chat-tab').isVisible())await f.locator('#chat-tab').click();}
async function save(f){await saveButton(f).click();await ready(f);}
async function shot(page,name){await page.screenshot({path:path.join(out,name)});report.captures.push(name);}
async function layout(f,page,label){
 await form(f).locator('.actions').scrollIntoViewIfNeeded();await f.evaluate(()=>new Promise(resolve=>{let last=-1,stable=0;const c=document.getElementById('conversation');function frame(){const next=c.scrollTop;stable=Math.abs(next-last)<.5?stable+1:0;last=next;if(stable>=8)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));
 const measured=await form(f).evaluate(element=>{const actions=element.querySelector('.actions'),buttons=[...actions.querySelectorAll('button')];return {frame:{width:innerWidth,height:innerHeight},scroll:{width:document.documentElement.scrollWidth,client:document.documentElement.clientWidth},buttons:buttons.map(button=>{const r=button.getBoundingClientRect();return {text:button.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,scrollWidth:button.scrollWidth,clientWidth:button.clientWidth};})};});
 assert.equal(measured.buttons.length,3);assert.deepEqual(measured.buttons.map(b=>b.text),['🎤 말로 적기','이렇게 바꾸기 ✨','다시 저장하기']);
 assert(measured.buttons.every(b=>b.width>0&&b.height>0&&b.x>=-1&&b.right<=measured.frame.width+1),JSON.stringify(measured));
 assert(measured.buttons.every(b=>b.scrollWidth<=b.clientWidth+2),'button label is clipped');assert(measured.scroll.width<=measured.scroll.client+1,'horizontal document overflow');
 for(let i=0;i<measured.buttons.length;i++)for(let j=i+1;j<measured.buttons.length;j++){const a=measured.buttons[i],b=measured.buttons[j];assert(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1,'buttons overlap');}
 assert.equal(await saveStatus(f).getAttribute('role'),'status');report.layouts.push({size:label,...measured});await shot(page,'다시저장-'+label+'.png');check(label+' 저장 버튼 순서·가로 넘침·글자 잘림·겹침 없음');
}
async function mainFlow(browser,width,height){
 const {context,page,f,mock}=await setup(browser,width,height),size=width+'x'+height;
 try{
  await complete(f);assert.equal(mock.writes.length,1);assert.equal(mock.writes[0].method,'POST');await layout(f,page,size);
  const initial=await state(f),id=mock.item.id,title=mock.item.title,calls=mock.calls.length,writes=mock.writes.length,revision=mock.item.revision;
  await save(f);assert.equal(await saveStatus(f).textContent(),'기존 게시물에 다시 저장했어요.');assert.equal(mock.writes.length,writes+1);assert.equal(mock.writes.at(-1).method,'PATCH');assert.equal(mock.item.id,id);assert.equal(mock.item.title,title);assert.equal(mock.item.revision,revision);assert.equal(mock.calls.length,calls);assert.deepEqual(await state(f),initial);check(size+' 다시 저장은 같은 게시물 PATCH·제목·게임·횟수 유지·AI 호출 없음');
  if(width!==1280)return;
  await form(f).getByRole('textbox',{name:'바꾸고 싶은 내용'}).fill('배경에 반짝이는 별을 더해 줘.');await form(f).getByRole('button',{name:'이렇게 바꾸기 ✨',exact:true}).click();await ready(f);
  const changed=await state(f);assert.equal(changed.freeEditsUsed,1);assert.notEqual(changed.html,initial.html);assert.equal(mock.item.html,changed.html);assert.equal(mock.item.id,id);const changedTitle=mock.item.title,afterChangeCalls=mock.calls.length;
  await save(f);assert.equal(mock.item.html,changed.html);assert.equal(mock.item.title,changedTitle);assert.equal((await state(f)).freeEditsUsed,1);assert.equal(mock.calls.length,afterChangeCalls);check('자유 고치기 후 현재 게임 저장·기존 글 유지·추가 고치기 횟수 소모 없음');
  mock.writeDelay=350;const beforeRapid=mock.attempts.length;
  await saveButton(f).evaluate(button=>{button.click();button.click();button.click();});await f.waitForFunction(()=>document.querySelector('.free-edit-message:last-child .free-resave-button')?.textContent==='저장 중…');
  assert.equal(await saveButton(f).isDisabled(),true);assert.equal(await form(f).locator('textarea').isDisabled(),true);assert.equal(await form(f).getByRole('button',{name:'이렇게 바꾸기 ✨',exact:true}).isDisabled(),true);assert.equal(await f.evaluate(()=>working),true);await ready(f);assert.equal(mock.attempts.length,beforeRapid+1);assert.equal(await saveButton(f).isEnabled(),true);mock.writeDelay=0;check('빠른 연속 클릭은 1회 PATCH·저장 중 폼 잠금·완료 후 복구');
  mock.failPublish=true;const beforeFailure=mock.writes.length;await save(f);assert.equal(mock.writes.length,beforeFailure);assert.match(await saveStatus(f).textContent(),/모의 저장 실패/);assert.equal(await saveButton(f).isEnabled(),true);assert.equal(await form(f).locator('textarea').isEnabled(),true);assert.equal((await state(f)).freeEditsUsed,1);
  mock.failPublish=false;await save(f);assert.equal(mock.writes.length,beforeFailure+1);assert.equal(mock.writes.at(-1).method,'PATCH');assert.equal(mock.item.id,id);check('저장 실패 뒤 같은 버튼으로 재시도·새 게시물 없음');
  const beforeStale=mock.attempts.length;await f.evaluate(()=>{const key='sherpa-room-999999:sherpa-grade1-practice-v1';window.__resaveStored=localStorage.getItem(key);const value=JSON.parse(window.__resaveStored);value.html=value.html.replace('</body>','<span hidden>다른 화면 수정</span></body>');localStorage.setItem(key,JSON.stringify(value));});
  await save(f);assert.match(await saveStatus(f).textContent(),/다른 화면에서 게임이 바뀌었어요/);assert.equal(mock.attempts.length,beforeStale);assert.equal(mock.item.html,changed.html);await f.evaluate(()=>localStorage.setItem('sherpa-room-999999:sherpa-grade1-practice-v1',window.__resaveStored));check('오래된 화면의 재저장은 최신 로컬 게임과 불일치하면 게시 요청 없이 차단');
  await f.evaluate(()=>{window.__resaveLockHeld=false;window.__resaveLock=navigator.locks.request('sherpa-free-edit-999999',()=>new Promise(resolve=>{window.__releaseResaveLock=resolve;window.__resaveLockHeld=true;}));});await f.waitForFunction(()=>window.__resaveLockHeld);const beforeLock=mock.attempts.length;
  await save(f);assert.match(await saveStatus(f).textContent(),/다른 화면에서 고치는 중이에요/);assert.equal(mock.attempts.length,beforeLock);assert.equal(await saveButton(f).isEnabled(),true);await f.evaluate(async()=>{window.__releaseResaveLock();await window.__resaveLock;});check('다른 화면 수정 잠금 중에는 게시 요청 없이 안내·버튼 복구');
  await f.evaluate(()=>{freeEditsUsed=10;rememberPractice();freeForm();});await ready(f);assert.equal(await f.locator('.free-edit-finished').count(),1);assert.equal(await saveButton(f).isEnabled(),true);const beforeFinished=mock.calls.length;await save(f);assert.equal(mock.calls.length,beforeFinished);assert.equal((await state(f)).freeEditsUsed,10);assert.equal(mock.item.id,id);assert.equal(await saveStatus(f).textContent(),'기존 게시물에 다시 저장했어요.');await shot(page,'다시저장-10회완료.png');check('10회 고치기 완료 후에도 다시 저장 가능·횟수 유지');
 }finally{await context.close();}
}
async function edgeCases(browser){
 const first=await setup(browser);
 try{first.mock.failPublish=true;await complete(first.f);assert.equal(first.mock.item,null);assert.equal(first.mock.writes.length,0);first.mock.failPublish=false;await save(first.f);assert.equal(first.mock.writes.length,1);assert.equal(first.mock.writes[0].method,'POST');const id=first.mock.item.id;await save(first.f);assert.equal(first.mock.writes.length,2);assert.equal(first.mock.writes[1].method,'PATCH');assert.equal(first.mock.item.id,id);check('최초 자동 게시 실패 후 재저장으로 첫 게시 복구·이후 같은 글 PATCH');}finally{await first.context.close();}
 const preview=await setup(browser,390,844,false);
 try{await complete(preview.f);assert.equal(await saveButton(preview.f).isDisabled(),true);assert.equal(preview.mock.writes.length,0);assert.equal(preview.mock.calls.length,0);await saveButton(preview.f).evaluate(button=>button.click());assert.equal(preview.mock.writes.length,0);await shot(preview.page,'다시저장-둘러보기.png');check('둘러보기 저장 버튼 비활성·게시 및 AI 호출 없음');}finally{await preview.context.close();}
}
(async()=>{await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});try{for(const size of [[1920,900],[1280,900],[1024,768],[768,1024],[390,844],[360,800]])await mainFlow(browser,...size);await edgeCases(browser);assert.deepEqual(report.external,[]);assert.deepEqual(report.errors,[]);check('브라우저 예외 및 외부 요청 0건');report.ok=true;}catch(error){report.failure={message:error.message,stack:error.stack};throw error;}finally{report.count=report.checks.length;fs.writeFileSync(path.join(out,'다시저장-브라우저검증.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
