'use strict';
// Paid opt-in, persistent cap across reruns. Only the isolated local gateway
// reaches OpenRouter; classroom/board endpoints are blocked, never queried.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
if(process.env.DINO3_LIVE_AI!=='1')throw Error('DINO3_LIVE_AI=1 required');
const out=path.resolve(__dirname,'../../../85_공룡3_모듈화/보정캡처');
fs.mkdirSync(out,{recursive:true});
const ledger=path.join(out,'실제AI기록.json');
const report=fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger,'utf8')):{scope:'localhost Wrangler; no classroom/board/DB; maximum 12 upstream attempts across runs',model:'anthropic/claude-haiku-5.5',pixelMaxTokens:1000,calls:[],cases:[],errors:[]};
const save=()=>fs.writeFileSync(ledger,JSON.stringify(report,null,2),'utf8');
let activeCase='',browser;
const selectedCases=new Set((process.env.DINO3_LIVE_CASES||'').split(',').filter(Boolean));
const wanted=name=>!selectedCases.size||selectedCases.has(name);
const parse=text=>{let raw='',usage=null,finish='';for(const line of text.split(/\r?\n/)){if(!line.startsWith('data:')||line.slice(5).trim()==='[DONE]')continue;const v=JSON.parse(line.slice(5));if(v.usage)usage=v.usage;const c=v.choices?.[0];if(typeof c?.delta?.content==='string')raw+=c.delta.content;if(c?.finish_reason)finish=c.finish_reason;}return{raw,usage,finish};};
(async()=>{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
 await context.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url());
  if(['data:','blob:','about:','file:'].includes(u.protocol))return route.continue();
  if(u.hostname!=='127.0.0.1'||u.port!=='19186')return route.abort();
  if(u.pathname.startsWith('/api/')&&u.pathname!=='/api/game')return route.abort();
  if(u.pathname==='/api/game'){
   if(report.calls.length>=12){report.errors.push('12-call hard cap prevented a request');save();return route.abort();}
   report.calls.push({number:report.calls.length+1,case:activeCase,started:new Date().toISOString(),trace:req.headers()['x-dino-local-trace'],input:req.postDataJSON()});save();
  }
  return route.continue();
 });
 const page=await context.newPage();
 page.on('pageerror',e=>{report.errors.push(e.message);save();});
 await page.exposeFunction('__recordModelResponse',data=>{
  const entry=report.calls.find(c=>c.trace===data.trace);assert(entry,'missing trace');
  Object.assign(entry,data.captureError?{captureError:data.captureError}:data.status===200?parse(data.text):{serverError:data.text},{status:data.status,ttfbMs:data.ttfbMs,elapsedMs:data.elapsedMs});
  save();console.log(JSON.stringify({call:entry.number,case:entry.case,mode:entry.input.mode,status:entry.status,input:entry.usage?.prompt_tokens,output:entry.usage?.completion_tokens,cost:entry.usage?.cost,ms:entry.elapsedMs}));
 });
 await page.addInitScript(()=>{
  const fetchOriginal=window.fetch.bind(window);window.__pendingModelCaptures=[];
  window.fetch=async(input,init)=>{
   if(new URL(input,location.href).pathname!=='/api/game')return fetchOriginal(input,init);
   const trace=crypto.randomUUID(),start=performance.now();
   const response=await fetchOriginal(input,{...init,headers:{...init?.headers,'X-Dino-Local-Trace':trace}}),ttfbMs=performance.now()-start;
   window.__pendingModelCaptures.push(response.clone().text().then(text=>window.__recordModelResponse({trace,text,status:response.status,ttfbMs:Math.round(ttfbMs),elapsedMs:Math.round(performance.now()-start)})).catch(e=>window.__recordModelResponse({trace,captureError:e.message,status:response.status,ttfbMs:Math.round(ttfbMs),elapsedMs:Math.round(performance.now()-start)})));
   return response;
  };
 });
 await page.goto('http://127.0.0.1:19186/practice/index.html?course=1');
 await page.waitForFunction(()=>typeof modularProject!=='undefined'&&modularProject?.authoringVersion===3&&!!window.SherpaPixel);
 const finalPath=path.join(out,'실제AI-최종게임.html');
 if(fs.existsSync(finalPath))await page.evaluate(h=>preview(h),fs.readFileSync(finalPath,'utf8'));
 const state=()=>page.evaluate(()=>({html,project:modularProject,error:document.querySelector('#conversation article:last-of-type .error')?.textContent||''}));
 const waitDraft=()=>page.waitForFunction(()=>!!document.querySelector('dialog.grade1-pixel-editor[open]')||!working,null,{timeout:195000});
 async function recordDraft(name,slot,first,before){
  await waitDraft();await page.evaluate(()=>Promise.all(window.__pendingModelCaptures));
  const dialog=page.locator('dialog.grade1-pixel-editor[open]');
  if(!await dialog.count()){
   const s=await state();report.cases.push({name,pass:false,calls:report.calls.slice(first).map(c=>c.number),error:s.error,preserved:JSON.stringify(s.project)===JSON.stringify(before.project)});save();console.log('FAIL '+name+' '+s.error);return false;
  }
  const unchanged=await state();assert.equal(unchanged.html,before.html,'draft must not change game');
  const pixelCall=report.calls.slice(first).filter(c=>c.input.mode==='pixel').at(-1);assert(pixelCall,'pixel call required');
  const checked=await page.evaluate(({slot,raw})=>{const value=JSON.parse(raw.trim().replace(/^```json\s*\r?\n([\s\S]*?)\r?\n```$/i,'$1'));return SherpaPixel.validatePixel(slot,value);},{slot,raw:pixelCall.raw});
  assert(checked.ok,JSON.stringify(checked));
  const capture='실제AI-'+name.replace(/[^가-힣a-zA-Z0-9]/g,'_')+'.png';await page.screenshot({path:path.join(out,capture)});
  report.cases.push({name,slot,pass:true,calls:report.calls.slice(first).map(c=>c.number),capture,checked,beforeConfirmationUnchanged:true});save();console.log('PASS '+name);return true;
 }
 async function confirm(slot){
  const label={hero:'이 캐릭터로 달리기 ✓',obstacle:'이 장애물로 정하기 ✓',item:'이 선물로 정하기 ✓'}[slot];
  await page.getByRole('button',{name:label,exact:true}).click();await page.waitForFunction(()=>!working);
  const s=await state();assert.equal(s.project.slots[slot].mode,'pixel');assert(!s.error,s.error);fs.writeFileSync(finalPath,s.html,'utf8');
 }
 async function select(stepIndex,label,slot,redraw=false){
  if(!wanted(label)||report.cases.some(c=>c.name===label))return;
  if(report.calls.length>=12)return;
  activeCase=label;const before=await state(),first=report.calls.length;
  await page.evaluate(s=>{step=s;next();},stepIndex);await page.getByRole('button',{name:label,exact:true}).last().click();
  if(!await recordDraft(label,slot,first,before))return;
  // Exercise the actual left-hand editor button twice, with no intervening commit.
  if(redraw){
   for(let i=1;i<=Number(process.env.DINO3_LIVE_REDRAWS||1);i++){
    if(report.calls.length>=12)break;
    activeCase=label+' 다시 그려줘 '+i;const n=report.calls.length;
    await page.getByRole('button',{name:'다시 그려줘',exact:true}).click();
    if(!await recordDraft(activeCase,slot,n,before))return;
    if(slot==='hero')assert(report.calls.slice(n).filter(c=>c.input.mode==='pixel').every(c=>!Object.hasOwn(c.input,'current')),'fresh hero redraw must omit current');
   }
  }
  await confirm(slot);
 }
 for(const[stepIndex,label,slot]of[[0,'로봇','hero'],[0,'외계인','hero'],[0,'개구리','hero'],[0,'판다','hero'],[2,'상자','obstacle'],[2,'얼음','obstacle'],[5,'하트','item'],[5,'딸기','item']]){
  await select(stepIndex,label,slot,label===(process.env.DINO3_LIVE_REDRAW_TARGET||'로봇'));
  if(report.calls.some(c=>c.status&&c.status!==200))throw Error('HTTP failure, stop paid validation');
 }
 for(const[request,slot]of[['장애물 더 뾰족하게','obstacle']]){
  if(!wanted(request)||report.cases.some(c=>c.name===request)||report.calls.length>=12)continue;
  activeCase=request;const before=await state(),first=report.calls.length;
  await page.evaluate(()=>{step=8;customPicker();});await page.getByRole('button',{name:'직접 적기',exact:true}).last().click();
  await page.getByRole('textbox',{name:'바꾸고 싶은 내용'}).last().fill(request);await page.getByRole('button',{name:'이렇게 바꾸기 ✨',exact:true}).last().click();
  if(await recordDraft(request,slot,first,before)){
   const calls=report.calls.slice(first);assert.equal(calls[0].input.mode,'route');assert(calls.filter(c=>c.input.mode==='pixel').every(c=>!!c.input.current),'route edits send current art');await confirm(slot);
  }
 }
 await page.evaluate(()=>Promise.all(window.__pendingModelCaptures));
 if(fs.existsSync(finalPath)){
  const file=await context.newPage();await file.goto(pathToFileURL(finalPath).href);await file.waitForFunction(()=>!!document.querySelector('canvas'));
  await file.keyboard.press('Space');await file.waitForTimeout(250);await file.screenshot({path:path.join(out,'실제AI-file-game.png')});await file.close();
 }
 report.finished=new Date().toISOString();report.passed=report.cases.length===10&&report.cases.every(c=>c.pass);save();
 if(!report.passed)process.exitCode=1;
})().catch(e=>{report.errors.push(e.stack);save();console.error(e.message);process.exitCode=1;}).finally(async()=>{await browser?.close();});
