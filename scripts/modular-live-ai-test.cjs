'use strict';
// Explicitly opt-in paid local test; never calls production classroom APIs.
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
const out = path.resolve(__dirname,'../../../85_공룡3_모듈화/2차캡처');
const ledgerPath = path.join(out,'실제AI기록.json');
if (process.env.DINO3_LIVE_AI !== '1') throw Error('Set DINO3_LIVE_AI=1 to authorize this paid test run.');
fs.mkdirSync(out,{recursive:true});
const report = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath,'utf8')) : {
  scope:'Local Wrangler http://127.0.0.1:19186; actual OpenRouter; maximum 25 attempts across runs; no classroom DB',
  model:'anthropic/claude-haiku-5.5',maxTokens:4000,reasoning:false,calls:[],cases:[],errors:[]
};
const save = () => fs.writeFileSync(ledgerPath,JSON.stringify(report,null,2),'utf8');
const repeatCases = new Set((process.env.DINO3_LIVE_CASES || '').split(',').filter(Boolean));
const paidAttempts = () => report.calls.filter(call=>call.upstreamAttempt!==false).length;
let activeCase = '', browser;
const requestEntries = new Map();
function parseSSE(text) {
  let raw='',usage=null,finish='';
  for(const line of text.split(/\r?\n/)) {
    if(!line.startsWith('data:') || line.slice(5).trim()==='[DONE]') continue;
    try {const value=JSON.parse(line.slice(5));if(value.usage)usage=value.usage;const c=value.choices?.[0];if(typeof c?.delta?.content==='string')raw+=c.delta.content;if(c?.finish_reason)finish=c.finish_reason;}catch{}
  }
  return {raw,usage,finish};
}
(async()=>{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(['data:','blob:','about:','file:'].includes(url.protocol))return route.continue();
    if(url.hostname!=='127.0.0.1'||url.port!=='19186')return route.abort();
    if(url.pathname.startsWith('/api/')&&url.pathname!=='/api/game')return route.abort();
    if(url.pathname==='/api/game') {
      if(paidAttempts()>=25) {report.errors.push('25-call hard cap prevented another request');save();return route.abort();}
      const entry={number:report.calls.length+1,case:activeCase,started:new Date().toISOString(),startMs:Date.now(),trace:req.headers()['x-dino-local-trace'],upstreamAttempt:true,input:JSON.parse(req.postData())};
      report.calls.push(entry);requestEntries.set(req,entry);save();
    }
    return route.continue();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>{report.errors.push(error.message);save();});
  await page.exposeFunction('__recordModelResponse',data=>{
    const entry=report.calls.find(c=>c.trace===data.trace);if(!entry)throw Error('Missing local trace');
    Object.assign(entry,parseSSE(data.text),{status:data.status,ttfbMs:data.ttfbMs,elapsedMs:data.elapsedMs,capture:'browser-fetch-clone'});
    if(data.status!==200)entry.serverError=data.text;
    delete entry.startMs;save();
    console.log(JSON.stringify({call:entry.number,case:entry.case,status:entry.status,input:entry.usage?.prompt_tokens,output:entry.usage?.completion_tokens,cost:entry.usage?.cost,ms:entry.elapsedMs}));
  });
  await page.addInitScript(()=>{
    const originalFetch=window.fetch.bind(window);window.__pendingModelCaptures=[];
    window.fetch=async(input,init)=>{
      if(new URL(input,location.href).pathname!=='/api/game')return originalFetch(input,init);
      const trace=crypto.randomUUID(),started=performance.now();
      const response=await originalFetch(input,{...init,headers:{...init?.headers,'X-Dino-Local-Trace':trace}});
      const ttfbMs=performance.now()-started;
      const pending=response.clone().text().then(text=>window.__recordModelResponse({trace,text,status:response.status,ttfbMs:Math.round(ttfbMs),elapsedMs:Math.round(performance.now()-started)}));
      window.__pendingModelCaptures.push(pending);return response;
    };
  });
  await page.goto('http://127.0.0.1:19186/practice/index.html?course=1');
  await page.waitForFunction(()=>typeof modularProject!=='undefined'&&!!modularProject&&!!window.SherpaSlotSafety);
  const lastHtml=path.join(out,'실제AI-최종게임.html');
  if(fs.existsSync(lastHtml))await page.evaluate(value=>preview(value),fs.readFileSync(lastHtml,'utf8'));
  async function runCase(label,action,expectedSlot) {
    if(repeatCases.size&&!repeatCases.has(label))return;
    if(!repeatCases.has(label)&&report.cases.some(c=>c.name===label&&c.pass))return;
    if(paidAttempts()>=25) {report.cases.push({name:label,pass:false,reason:'25-call cap'});save();return;}
    activeCase=label;const before=await page.evaluate(()=>JSON.stringify(modularProject));const first=report.calls.length;
    await action();await page.waitForFunction(()=>!working,{},{timeout:195000});await page.evaluate(()=>Promise.all(window.__pendingModelCaptures));
    const state=await page.evaluate(()=>({project:modularProject,html,error:document.querySelector('#conversation article:last-of-type .error')?.textContent||'',status:document.getElementById('status').textContent}));
    const calls=report.calls.slice(first);
    const expectedUnsupported=['캐릭터 없애줘','다른 게임으로'].includes(label);
    const pass=expectedUnsupported?state.error==='그건 이 게임에서 바꿀 수 없어요. 다른 걸 골라 봐요.'&&JSON.stringify(state.project)===before:
      !state.error&&JSON.stringify(state.project)!==before&&(!expectedSlot||state.project.slots[expectedSlot].mode==='code');
    const result={name:label,pass,calls:calls.map(c=>c.number),error:state.error};
    if(expectedSlot)result.slot=state.project.slots[expectedSlot];
    if(label==='장애물 크게')result.obstacleStyle=state.project.slots.obstacle.style;
    if(label==='점프 소리 바꿔줘')result.soundPreset=state.project.config.soundPreset;
    report.cases.push(result);save();
    await page.locator('#conversation article').last().evaluate(el=>el.scrollIntoView({behavior:'instant',block:'end'}));
    await page.screenshot({path:path.join(out,`실제AI-${label.replace(/[^가-힣a-zA-Z0-9]/g,'_')}.png`)});
    console.log((pass?'PASS ':'FAIL ')+label+(state.error?' '+state.error:''));
    if(calls.some(c=>c.status!==200))throw Error('Local/upstream HTTP failure; stop before additional paid attempts.');
    if(pass&&!expectedUnsupported)fs.writeFileSync(path.join(out,'실제AI-최종게임.html'),state.html,'utf8');
  }
  const selected=async (stepIndex,label)=>{
    await page.evaluate(s=>{step=s;next();},stepIndex);
    await page.getByRole('button',{name:label,exact:true}).last().click();
  };
  for(const [stepIndex,label,slot]of [[0,'고양이','hero'],[0,'로봇','hero']])await runCase(label,()=>selected(stepIndex,label),slot);
  await runCase('로봇 다시 그리기',async()=>{
    await page.getByRole('button',{name:'다시 그리기',exact:true}).last().click();
  },'hero');
  for(const [stepIndex,label,slot]of [[1,'바닷가','background'],[1,'우주','background'],[2,'바위','obstacle'],[2,'상자','obstacle'],[5,'사과','item'],[5,'하트','item'],[5,'별','item']])await runCase(label,()=>selected(stepIndex,label),slot);
  for(const text of ['무지개 배경','장애물 크게','캐릭터 없애줘','다른 게임으로','점프 소리 바꿔줘'])await runCase(text,async()=>{
    await page.evaluate(()=>{step=8;customPicker();});
    await page.getByRole('button',{name:'직접 적기',exact:true}).last().click();
    await page.getByRole('textbox',{name:'바꾸고 싶은 내용'}).last().fill(text);
    await page.getByRole('button',{name:'이렇게 바꾸기 ✨',exact:true}).last().click();
  },text==='무지개 배경'?'background':text==='장애물 크게'?'obstacle':undefined);
  await page.evaluate(()=>Promise.all(window.__pendingModelCaptures));report.finished=new Date().toISOString();save();
})().catch(error=>{report.errors.push(error.stack);save();console.error(error.message);process.exitCode=1;}).finally(async()=>{await browser?.close();});
