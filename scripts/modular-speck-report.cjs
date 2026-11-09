'use strict';
// Saved responses only. No AI calls; browser external requests are blocked.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium}=require(path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
const repo=path.resolve(__dirname,'..'),root=path.resolve(repo,'../../85_공룡3_모듈화'),out=path.join(root,'점제거캡처');fs.mkdirSync(out,{recursive:true});
let corrections=[];
function load(code){const ctx={window:{},console:{info:(label,data)=>corrections.push(data)}};vm.runInNewContext(code,ctx);return ctx.window.SherpaPixel;}
const before=load(execFileSync('git',['show','76e67b0:assets/practice/modular/pixel.js'],{cwd:repo,encoding:'utf8',windowsHide:true}));
const after=load(fs.readFileSync(path.join(repo,'assets/practice/modular/pixel.js'),'utf8'));
function bounds(pixel) {
 const cells=pixel.pixels.flatMap((row,y)=>[...row].flatMap((c,x)=>c==='.'?[]:[{x,y}]));
 if(!cells.length)return {width:0,height:0};
 return {width:Math.max(...cells.map(c=>c.x))-Math.min(...cells.map(c=>c.x))+1,height:Math.max(...cells.map(c=>c.y))-Math.min(...cells.map(c=>c.y))+1};
}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={scope:'offline replay of both original ledgers; zero AI calls',sources:[],responses:[]};
for(const folder of ['3차캡처','보정캡처']){
 const file=path.join(root,folder,'실제AI기록.json'),sourceSha256=hash(file),ledger=JSON.parse(fs.readFileSync(file,'utf8'));
 const records=ledger.calls.filter(c=>c.input.mode==='pixel'&&c.raw);
 for(const c of records){
  assert(c.raw,'pixel response must be recorded');
  const original=JSON.parse(c.raw.trim().replace(/^```json\s*\r?\n([\s\S]*?)\r?\n```$/i,'$1'));
  const old=before.validatePixel(c.input.slot,original);corrections=[];
  const next=after.validatePixel(c.input.slot,original),enlargement=corrections.find(c=>c.enlargement)?.enlargement;
  const changedCells=[];
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
   const a=old.pixel.pixels[y][x],b=next.pixel.pixels[y][x];
   if(a!==b)changedCells.push({x:x+1,y:y+1,before:a,after:b});
  }
  if(c.input.slot==='hero')assert.equal(JSON.stringify(next),JSON.stringify(old));
  if(enlargement)assert.equal(next.painted,enlargement.paintedBefore*enlargement.scale**2);
  const savedCorrections=[...corrections];
  assert.equal(JSON.stringify(next.pixel),JSON.stringify(after.validatePixel(c.input.slot,next.pixel).pixel));
  corrections=savedCorrections;
  report.responses.push({source:folder,number:c.number,name:c.case,slot:c.input.slot,mode:'pixel',before:old,after:next,corrections:[...corrections],enlargement,changedCells,boundsBefore:bounds(old.pixel),boundsAfter:bounds(next.pixel)});
 }
 report.sources.push({file,sourceSha256,pixels:records.length,withoutRaw:ledger.calls.filter(c=>!c.raw).map(c=>({number:c.number,name:c.case,mode:c.input.mode,error:c.error}))});
}
function totals(records){return {pixels:records.length,beforePassed:records.filter(r=>r.before.ok).length,afterPassed:records.filter(r=>r.after.ok).length,enlarged:records.filter(r=>r.enlargement).length,unchanged:records.filter(r=>!r.changedCells.length).length,changedAlreadyPassed:records.filter(r=>r.before.ok&&r.changedCells.length).length};}
assert.equal(report.responses.length,28);
report.totals=totals(report.responses);for(const s of report.sources)s.totals=totals(report.responses.filter(r=>s.file.includes(r.source+path.sep)));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>밑그림 점 제거·확대 전후</title><style>body{margin:24px;background:#edf2f7;color:#172c48;font:16px 'Malgun Gothic',sans-serif}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{background:white;padding:12px;border-radius:12px}h2{font-size:15px;margin:0 0 12px}.pair{display:flex;gap:12px}figure{margin:0}canvas{width:144px;height:144px;image-rendering:pixelated}figcaption,p{font-size:13px}</style><h1>기록된 실제 AI 밑그림 전체 · 점 제거·확대 전후</h1><p>기존 확대 → 점 제거 후 확대 · 자홍 테두리: 변경된 칸 | ${report.totals.beforePassed}/${report.totals.pixels} → ${report.totals.afterPassed}/${report.totals.pixels} 통과 | 실제 AI 호출 0회</p><div class="grid">${report.responses.map((r,i)=>`<article class="card" style="${!r.before.ok&&r.before.painted?'outline:3px solid #d88b00':''}"><h2>${escape(r.source)} #${r.number} ${escape(r.name)}</h2><div class="pair">${['before','after'].map((key,j)=>`<figure><canvas id="${key}${i}" width="144" height="144"></canvas><figcaption>${j?'점 제거 후':'점 제거 전'} ${r[key].painted}칸 · ${r[key].ok?'통과':'거절'}</figcaption></figure>`).join('')}</div><p>${r.enlargement?`${r.enlargement.width}×${r.enlargement.height} → ${r.enlargement.scale}배 · ${r.slot==='item'?'가운데':'가운데·바닥'}`:(r.changedCells.length?'점 제거 · 확대 없음':'기존 그림 유지')} · 상자 ${r.boundsAfter.width}×${r.boundsAfter.height}<br>변경 ${r.changedCells.length}칸${r.before.ok&&r.changedCells.length?' (기존 통과 그림 변경)':''}</p></article>`).join('')}</div><script>const records=${JSON.stringify(report.responses).replace(/</g,'\\u003c')};records.forEach((r,i)=>{for(const key of ['before','after']){const ctx=document.getElementById(key+i).getContext('2d'),p=r[key].pixel;p.pixels.forEach((row,y)=>[...row].forEach((ch,x)=>{ctx.fillStyle=ch==='.'?((x+y)%2?'#e2e8f0':'#f8fafc'):p.palette['0123456789ab'.indexOf(ch)];ctx.fillRect(x*9,y*9,9,9);if(r.changedCells.some(c=>c.x===x+1&&c.y===y+1)){ctx.strokeStyle='#d000bc';ctx.lineWidth=1;ctx.strokeRect(x*9+.5,y*9+.5,8,8);}}));}});</script></html>`;
(async()=>{const file=path.join(out,'전체밑그림-점제거전후.html');fs.writeFileSync(file,html);const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());await page.goto(pathToFileURL(file).href);await page.screenshot({path:path.join(out,'전체밑그림-점제거전후.png'),fullPage:true});}finally{await browser.close();}for(const s of report.sources)assert.equal(hash(s.file),s.sourceSha256);fs.writeFileSync(path.join(out,'점제거-재검증.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({totals:report.totals,sources:report.sources,changed:report.responses.filter(r=>r.changedCells.length).map(r=>({source:r.source,name:r.name,before:r.before.painted,after:r.after.painted,scale:r.enlargement?.scale,changedCells:r.changedCells.length,ok:r.after.ok}))},null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
