'use strict';
// Explicit paid opt-in. A persistent ledger caps all local calls at fifteen.
// No classroom or board endpoints can leave this test browser.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
if(process.env.DINO3_LIVE_AI!=='1')throw Error('DINO3_LIVE_AI=1 required');
const out=path.resolve(__dirname,'../../../85_공룡3_모듈화/6차캡처');fs.mkdirSync(out,{recursive:true});
const origin=process.env.DINO3_LIVE_ORIGIN||'http://127.0.0.1:19186',production=origin.startsWith('https:');
const ledger=path.join(out,production?'운영AI기록.json':'실제AI기록.json');
const report=fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger,'utf8')):{scope:origin+' /api/game only; no DB',calls:[],cases:[],errors:[]};
const save=()=>fs.writeFileSync(ledger,JSON.stringify(report,null,2),'utf8');
const selected=new Set((process.env.DINO3_LIVE_CASES||'title').split(',').filter(Boolean));
let activeCase='',browser;
function parse(text){let raw='',usage=null,finish='',streamError=null;for(const line of text.split(/\r?\n/)){if(!line.startsWith('data:')||line.slice(5).trim()==='[DONE]')continue;let v;try{v=JSON.parse(line.slice(5))}catch{continue}if(v.error)streamError=v.error;if(v.usage)usage=v.usage;const c=v.choices?.[0];if(typeof c?.delta?.content==='string')raw+=c.delta.content;if(c?.finish_reason)finish=c.finish_reason;}return{raw,usage,finish,...(streamError?{streamError}:{})};}
(async()=>{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
 await context.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url());
  if(['data:','blob:','about:','file:'].includes(u.protocol))return route.continue();
  if(u.origin!==origin||u.pathname.startsWith('/api/')&&u.pathname!=='/api/game')return route.abort();
  if(u.pathname==='/api/game'){
   const data=req.postDataJSON();
   if(data.mode==='route'&&['9단계-날 수 있게 해 줘','9단계-점점 빨라지게'].includes(activeCase)){
    const previous=report.calls.findLast(c=>c.case===activeCase&&c.input.mode==='route'&&c.status===200&&c.finish==='stop'&&c.raw);
    if(previous){report.replays??=[];report.replays.push({case:activeCase,originalCall:previous.number,reason:'Reuse this same request\'s completed real router result; no new upstream call'});save();return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({choices:[{delta:{content:previous.raw},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'});}
   }
   if(report.calls.length>=(production?1:15))return route.abort();
   report.calls.push({number:report.calls.length+1,case:activeCase,started:new Date().toISOString(),trace:req.headers()['x-dino-local-trace'],input:{mode:data.mode||'full',summary:data.summary,request:data.request,prompt:data.prompt,htmlChars:data.baseHtml?.length}});save();
  }
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>{report.errors.push({case:activeCase,error:e.message});save();});
 page.on('console',msg=>{if(['error','warning'].includes(msg.type())){report.console??=[];report.console.push({case:activeCase,type:msg.type(),text:msg.text().slice(0,2000)});save();}});
 await page.exposeFunction('__recordModelResponse',data=>{
  const entry=report.calls.find(c=>c.trace===data.trace);if(!entry)return;
  Object.assign(entry,data.status===200?parse(data.text||''):{serverError:data.text},data.captureError?{captureError:data.captureError}:{},{status:data.status,ttfbMs:data.ttfbMs,elapsedMs:data.elapsedMs,partial:!!data.partial});save();
 });
 await page.addInitScript(()=>{
  const original=window.fetch.bind(window);window.__pendingModelCaptures=[];
  window.fetch=async(input,init)=>{
   if(new URL(typeof input==='string'?input:input.url,location.href).pathname!=='/api/game')return original(input,init);
   const trace=crypto.randomUUID(),start=performance.now(),response=await original(input,{...init,headers:{...init?.headers,'X-Dino-Local-Trace':trace}}),ttfbMs=performance.now()-start;
   window.__pendingModelCaptures.push((async()=>{let text='',last=0;const reader=response.clone().body.getReader(),decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;text+=decoder.decode(part.value,{stream:true});if(performance.now()-last>2000){last=performance.now();await window.__recordModelResponse({trace,text,partial:true,status:response.status,ttfbMs:Math.round(ttfbMs),elapsedMs:Math.round(performance.now()-start)});}}text+=decoder.decode();await window.__recordModelResponse({trace,text,status:response.status,ttfbMs:Math.round(ttfbMs),elapsedMs:Math.round(performance.now()-start)});}catch(e){await window.__recordModelResponse({trace,text,captureError:e.message,status:response.status,ttfbMs:Math.round(ttfbMs),elapsedMs:Math.round(performance.now()-start)});}finally{reader.releaseLock();}})());
   return response;
  };
 });
 await page.goto(origin+'/practice/index.html?course=1');
 await page.waitForFunction(()=>typeof html==='string'&&html.length>0&&window.SherpaProject&&window.requestClassroomGameTitle);
 if(selected.has('title'))for(const [name,summary] of (production?[['고양이','캐릭터: 고양이\n배경: 우주\n장애물: 바위\n선물: 별\n능력: 두 번 점프\n9단계 요청: 하늘을 날기']]:[['고양이','캐릭터: 고양이\n배경: 우주\n장애물: 바위\n선물: 별\n능력: 두 번 점프'],['로봇','캐릭터: 로봇\n배경: 숲속\n장애물: 상자\n선물: 사과\n능력: 잠깐 무적'],['개구리','캐릭터: 개구리\n배경: 무지개 나라\n장애물: 버섯\n선물: 하트\n능력: 높이 점프']])){
  activeCase='제목-'+name;if(report.cases.some(c=>c.name===activeCase&&c.pass))continue;
  const first=report.calls.length,title=await page.evaluate(({summary,name})=>requestClassroomGameTitle(summary,name),{summary,name});await page.evaluate(()=>Promise.all(window.__pendingModelCaptures));
  const call=report.calls[first];assert(call?.status===200,JSON.stringify(call));assert(title!==`나의 ${name} 게임`,'unexpected fallback');assert([...title].length<=15);assert(!/[^가-힣a-zA-Z0-9 ]/.test(title));
  report.cases.push({name:activeCase,pass:true,title,calls:[call.number]});save();console.log('PASS '+activeCase+' '+title);
 }
 if(!production&&selected.has('edits')){
  for(const request of ['날 수 있게 해 줘','100점마다 폭죽','점점 빨라지게']){
   activeCase='9단계-'+request;if(report.cases.some(c=>c.name===activeCase&&c.pass))continue;
   await page.evaluate(()=>{practiceCompleted=false;freeMode=false;freeEditsUsed=0;step=8;const p=SherpaProject.withConfig(SherpaProject.createProject(),{initialLives:9,itemsEnabled:true,abilityId:'invincible'});preview(SherpaProject.buildGameHtml(p));customForm('✏️','직접 적기','100점이 되면 축하 꽃가루가 나오게 해 줘.');});
   const first=report.calls.length,before=await page.evaluate(()=>html);
   await page.getByRole('textbox',{name:'바꾸고 싶은 내용'}).last().fill(request);await page.getByRole('button',{name:'이렇게 바꾸기 ✨',exact:true}).last().click();
   await page.waitForFunction(()=>working);
   await page.waitForFunction(()=>!working,null,{timeout:195000});await page.evaluate(()=>Promise.all(window.__pendingModelCaptures));
   const state=await page.evaluate(()=>({html,freeMode,project:modularProject,error:document.querySelector('#conversation article:last-child .error')?.textContent}));
   const calls=report.calls.slice(first),routerReplay=report.replays?.findLast(c=>c.case===activeCase)?.originalCall;assert(calls.some(c=>c.input.mode==='route')||routerReplay,'router not invoked');assert(calls.some(c=>c.input.mode==='full'),'full editor not invoked');assert(state.freeMode&&!state.project&&state.html!==before,state.error||'not free-mode success');
   fs.writeFileSync(path.join(out,activeCase+'.html'),state.html,'utf8');await page.screenshot({path:path.join(out,activeCase+'.png')});
   report.cases.push({name:activeCase,pass:true,calls:calls.map(c=>c.number),routerReplay,freeMode:true,htmlChars:state.html.length});save();console.log('PASS '+activeCase);
  }
  await page.evaluate(()=>complete());await page.waitForFunction(()=>!working);
  for(const request of ['점프할 때 노란 별빛이 나오게 해 줘','게임 배경에 작은 구름을 하나 더 그려 줘']){
   activeCase='자유-'+request;if(report.cases.some(c=>c.name===activeCase&&c.pass))continue;
   const first=report.calls.length,before=await page.evaluate(()=>({html,freeEditsUsed}));
   await page.getByRole('textbox',{name:'바꾸고 싶은 내용'}).last().fill(request);await page.getByRole('button',{name:'이렇게 바꾸기 ✨',exact:true}).last().click();
   await page.waitForFunction(()=>working);
   await page.waitForFunction(()=>!working,null,{timeout:195000});await page.evaluate(()=>Promise.all(window.__pendingModelCaptures));
   const state=await page.evaluate(()=>({html,freeEditsUsed,error:document.querySelector('#conversation article:last-child .error')?.textContent}));
   const calls=report.calls.slice(first);assert(calls.every(c=>c.input.mode==='full'),'free mode routed');assert.equal(state.freeEditsUsed,before.freeEditsUsed+1,state.error);assert.notEqual(state.html,before.html);
   fs.writeFileSync(path.join(out,activeCase+'.html'),state.html,'utf8');await page.screenshot({path:path.join(out,activeCase+'.png')});
   report.cases.push({name:activeCase,pass:true,calls:calls.map(c=>c.number),freeEditsUsed:state.freeEditsUsed});save();console.log('PASS '+activeCase);
  }
 }
 report.finished=new Date().toISOString();save();
})().catch(e=>{report.errors.push({case:activeCase,error:e.stack});save();console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
