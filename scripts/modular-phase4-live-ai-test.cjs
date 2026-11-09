'use strict';
// Explicit paid opt-in; captures the actual application SSE and validation.
// Only /api/game can leave this browser. No classroom or board endpoints.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
if(process.env.DINO3_LIVE_AI!=='1')throw Error('DINO3_LIVE_AI=1 required');
const out=path.resolve(__dirname,'../../../85_공룡3_모듈화/4차캡처');fs.mkdirSync(out,{recursive:true});
const origin=process.env.DINO3_LIVE_ORIGIN||'http://127.0.0.1:19186';
const production=origin.startsWith('https:');
const ledger=path.join(out,production?'운영AI기록.json':'실제AI기록.json');
const report=fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger,'utf8')):{scope:origin+' /api/game only; no DB',calls:[],cases:[],errors:[]};
const save=()=>fs.writeFileSync(ledger,JSON.stringify(report,null,2),'utf8');
const selected=new Set((process.env.DINO3_LIVE_CASES||'').split(',').filter(Boolean));
const cases=production?[[0,'고양이','hero']]:[[0,'고양이','hero'],[0,'판다','hero'],[0,'로봇','hero'],[0,'토끼','hero'],[0,'외계인','hero'],[0,'개구리','hero'],[2,'바위','obstacle'],[2,'상자','obstacle'],[2,'버섯','obstacle'],[5,'사과','item'],[5,'하트','item'],[5,'딸기','item']];
if(!production&&selected.size)for(const[name,slot]of[['캐릭터 색 파랗게','hero'],['장애물 더 뾰족하게','obstacle']])if(selected.has(name))cases.push([8,name,slot]);
let activeCase='',browser;
function parse(text){let raw='',usage=null,finish='';for(const line of text.split(/\r?\n/)){if(!line.startsWith('data:')||line.slice(5).trim()==='[DONE]')continue;const v=JSON.parse(line.slice(5));if(v.usage)usage=v.usage;const c=v.choices?.[0];if(typeof c?.delta?.content==='string')raw+=c.delta.content;if(c?.finish_reason)finish=c.finish_reason;}return{raw,usage,finish};}
(async()=>{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
 await context.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url());
  if(['data:','blob:','about:','file:'].includes(u.protocol))return route.continue();
  if(u.origin!==origin||u.pathname.startsWith('/api/')&&u.pathname!=='/api/game')return route.abort();
  if(u.pathname==='/api/game'){
   if(report.calls.length>=(production?2:40))return route.abort();
   report.calls.push({number:report.calls.length+1,case:activeCase,started:new Date().toISOString(),trace:req.headers()['x-dino-local-trace'],input:req.postDataJSON()});save();
  }
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>{report.errors.push(e.message);save();});
 await page.exposeFunction('__recordModelResponse',data=>{
  const entry=report.calls.find(c=>c.trace===data.trace);assert(entry,'missing trace');
  Object.assign(entry,data.captureError?{captureError:data.captureError}:data.status===200?parse(data.text):{serverError:data.text},{status:data.status,ttfbMs:data.ttfbMs,elapsedMs:data.elapsedMs});save();
  console.log(JSON.stringify({call:entry.number,case:entry.case,status:entry.status,input:entry.usage?.prompt_tokens,output:entry.usage?.completion_tokens,cost:entry.usage?.cost,ms:entry.elapsedMs}));
 });
 await page.addInitScript(()=>{
  const original=window.fetch.bind(window);window.__pendingModelCaptures=[];
  window.fetch=async(input,init)=>{
   if(new URL(input,location.href).pathname!=='/api/game')return original(input,init);
   const trace=crypto.randomUUID(),start=performance.now(),response=await original(input,{...init,headers:{...init?.headers,'X-Dino-Local-Trace':trace}}),ttfbMs=performance.now()-start;
   window.__pendingModelCaptures.push(response.clone().text().then(text=>window.__recordModelResponse({trace,text,status:response.status,ttfbMs:Math.round(ttfbMs),elapsedMs:Math.round(performance.now()-start)})).catch(e=>window.__recordModelResponse({trace,captureError:e.message,status:response.status,elapsedMs:Math.round(performance.now()-start)})));
   return response;
  };
 });
 await page.goto(origin+'/practice/index.html?course=1');
 await page.waitForFunction(()=>typeof modularProject!=='undefined'&&modularProject?.authoringVersion===4&&!!window.SherpaCodeBitmap);
 const finalPath=path.join(out,production?'운영AI-게임.html':'실제AI-최종게임.html');
 if(!production&&fs.existsSync(finalPath))await page.evaluate(h=>preview(h),fs.readFileSync(finalPath,'utf8'));
 for(const[index,name,slot]of cases){
  if(selected.size&&!selected.has(name)||report.cases.some(c=>c.name===name))continue;
  activeCase=name;const first=report.calls.length,before=await page.evaluate(()=>html);
  await page.evaluate(s=>{step=s;next();},index);
  if(index===8){
   await page.getByRole('button',{name:'직접 적기',exact:true}).last().click();
   await page.getByRole('textbox',{name:'바꾸고 싶은 내용'}).last().fill(name);
   await page.getByRole('button',{name:'이렇게 바꾸기 ✨',exact:true}).last().click();
  }else await page.getByRole('button',{name,exact:true}).last().click();
  await page.waitForFunction(()=>!!document.querySelector('dialog.grade1-pixel-editor[open]')||!working,null,{timeout:195000});
  await page.evaluate(()=>Promise.all(window.__pendingModelCaptures));
  const dialog=page.locator('dialog.grade1-pixel-editor[open]');
  if(!await dialog.count()){
   report.cases.push({name,slot,pass:false,calls:report.calls.slice(first).map(c=>c.number),error:await page.locator('#conversation .error').last().textContent(),preserved:before===await page.evaluate(()=>html)});save();console.log('FAIL '+name);continue;
  }
  assert.equal(before,await page.evaluate(()=>html));
  const response=report.calls.slice(first).filter(c=>c.input.mode==='slot').at(-1);assert(response?.raw,'missing source');
  const result=await page.evaluate(async({slot,raw})=>{const candidate=SherpaSlotAI.parseSlot(slot,raw);return {...await SherpaCodeBitmap.render(slot,candidate.code),code:candidate.code};},{slot,raw:response.raw});assert(result.ok,result.error);
  const capture='실제AI-'+name+'.png';await page.screenshot({path:path.join(out,production?'운영AI-편집기.png':capture)});
  report.cases.push({name,slot,pass:true,calls:report.calls.slice(first).map(c=>c.number),capture,checked:result,beforeConfirmationUnchanged:true});save();
  await dialog.locator('.pixel-apply').click();await page.waitForFunction(()=>!working);
  const state=await page.evaluate(()=>({html,project:modularProject}));assert.equal(state.project.slots[slot].mode,'pixel');assert.equal(state.project.slots[slot].code,result.code);
  fs.writeFileSync(finalPath,state.html,'utf8');console.log('PASS '+name);
 }
 report.finished=new Date().toISOString();save();
})().catch(e=>{report.errors.push(e.stack);save();console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
