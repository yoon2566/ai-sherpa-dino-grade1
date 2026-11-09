'use strict';
// Replays saved responses only. Browser is file-only; no AI, classroom or DB calls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium}=require(path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
const repo=path.resolve(__dirname,'..'),out=path.resolve(repo,'../../85_공룡3_모듈화/보정캡처');fs.mkdirSync(out,{recursive:true});
const input=path.resolve(out,'../3차캡처/실제AI기록.json'),source=fs.readFileSync(input,'utf8'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
let corrections=[];
function load(code){const ctx={window:{},console:{info:(label,data)=>corrections.push(data)}};vm.runInNewContext(code,ctx);return ctx.window.SherpaPixel;}
const before=load(execFileSync('git',['show','9532eb2:assets/practice/modular/pixel.js'],{cwd:repo,encoding:'utf8',windowsHide:true}));
const after=load(fs.readFileSync(path.join(repo,'assets/practice/modular/pixel.js'),'utf8'));
function replay(ledger){return ledger.calls.filter(c=>c.raw).map(c=>{
 const result={number:c.number,name:c.case,mode:c.input.mode,slot:c.input.slot,usage:c.usage,elapsedMs:c.elapsedMs,raw:c.raw};
 try {result.original=JSON.parse(c.raw.trim().replace(/^```json\s*\r?\n([\s\S]*?)\r?\n```$/i,'$1'));if(c.input.mode==='pixel'){corrections=[];result.before=before.validatePixel(c.input.slot,result.original);result.after=after.validatePixel(c.input.slot,result.original);result.corrections=corrections;}}
 catch(e){result.parseError=e.message;}return result;
});}
const report={scope:'offline replay; original ledger unchanged; zero AI calls',sourceSha256:hash(source),responses:replay(JSON.parse(source))};
const pixels=report.responses.filter(c=>c.mode==='pixel');
report.totals={responses:report.responses.length,routers:report.responses.filter(c=>c.mode==='route').length,pixels:pixels.length,beforePassed:pixels.filter(c=>c.before?.ok).length,afterPassed:pixels.filter(c=>c.after?.ok).length};
assert.equal(report.totals.responses,19);assert.equal(report.totals.pixels,17);assert.equal(report.totals.beforePassed,9);assert.equal(report.totals.afterPassed,15);
const live=JSON.parse(fs.readFileSync(path.join(out,'실제AI기록.json'),'utf8'));
report.live=replay(live);report.liveTotals={attempts:live.calls.length,input:0,output:0,cost:0,elapsedMs:0,missingUsage:0};
for(const c of live.calls){if(c.usage){report.liveTotals.input+=c.usage.prompt_tokens;report.liveTotals.output+=c.usage.completion_tokens;report.liveTotals.cost+=c.usage.cost;}else report.liveTotals.missingUsage++;report.liveTotals.elapsedMs+=c.elapsedMs||0;}
assert(live.calls.length<=12);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function gallery(records,title,subtitle,name){
 const data=records.filter(c=>c.mode==='pixel');
 const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>${escape(title)}</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#eaf0f5;color:#172c48;font-family:Arial,"Malgun Gothic",sans-serif}h1{margin:0 0 8px;font-size:27px}p{margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.card{padding:14px;background:white;border-radius:12px}h2{margin:0 0 10px;font-size:19px}.pair{display:flex;gap:18px;justify-content:center}figure{margin:0;text-align:center}figcaption{font-size:13px;height:37px}canvas{display:block;border:1px solid #acbacb;width:176px;height:176px;image-rendering:pixelated}.note{margin-top:10px;font-size:12px;min-height:34px;word-break:break-all}.bad{color:#bc3441}.ok{color:#13713c}</style><h1>${escape(title)}</h1><p>${escape(subtitle)}</p><div class="grid">${data.map((c,i)=>`<div class="card"><h2>#${c.number} ${escape(c.name)}</h2><div class="pair"><figure><figcaption>보정 전 · <span class="${c.before?.ok?'ok':'bad'}">${c.before?.ok?'통과':'거절'}</span></figcaption><canvas id="b${i}" width="176" height="176"></canvas></figure><figure><figcaption>보정 후 · <span class="${c.after?.ok?'ok':'bad'}">${c.after?.ok?'통과':'거절'}</span> · ${c.after?.painted??'?'}칸<br>연결 ${Math.round((c.after?.connectedRatio||0)*100)}%</figcaption><canvas id="a${i}" width="176" height="176"></canvas></figure></div><div class="note">${escape(c.corrections.length?JSON.stringify(c.corrections[0]):'보정 없음')}${c.after?.ok?'':' · '+escape(c.after?.error||'')}</div></div>`).join('')}</div><script>const records=${JSON.stringify(data).replace(/</g,'\\u003c')};function draw(id,p){const c=document.getElementById(id),ctx=c.getContext('2d'),rows=p?.pixels||[],n=Math.max(16,rows.length,...rows.map(r=>typeof r==='string'?Array.from(r).length:0)),s=176/n;for(let y=0;y<n;y++)for(let x=0;x<n;x++){ctx.fillStyle=(x+y)%2?'#e7ebef':'#f9fafb';ctx.fillRect(x*s,y*s,s,s);}rows.forEach((row,y)=>{if(typeof row!=='string')return;Array.from(row).forEach((ch,x)=>{if(ch==='.')return;const index='0123456789ab'.indexOf(ch),color=p.palette?.[index];ctx.fillStyle=/^#[0-9a-f]{6}$/i.test(color||'')?color:'#ff00d4';ctx.fillRect(x*s,y*s,s,s);});});}records.forEach((r,i)=>{draw('b'+i,r.original);draw('a'+i,r.after?.pixel);});</script></html>`;
 fs.writeFileSync(path.join(out,name+'.html'),html);return path.join(out,name+'.html');
}
(async()=>{
 const browser=await chromium.launch({headless:true});try{const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());const page=await context.newPage();
 for(const [records,title,subtitle,name]of [[report.responses,'기존 실제 AI 밑그림 · 자동 보정 전후','원시 응답 19개 = 밑그림 17개 + 라우터 2개 | 통과 9/17 (52.9%) → 15/17 (88.2%) | 분홍색은 원본의 없는 색·모르는 글자','기존17장-전후비교'],[report.live,'새 실제 AI 밑그림 · 자동 보정 결과','최대 12회 준수 | 실패 원본과 자동 재요청도 모두 포함 | 9단계는 라우터 뒤 한도 차단','실제AI-전체밑그림']]){
  await page.goto(pathToFileURL(gallery(records,title,subtitle,name)).href);await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
 }
 }finally{await browser.close();}
 assert.equal(hash(fs.readFileSync(input,'utf8')),report.sourceSha256);fs.writeFileSync(path.join(out,'보정-재검증.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({totals:report.totals,live:report.liveTotals},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
