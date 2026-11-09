'use strict';
// Offline replay only: original recorded responses, no network or AI calls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),root=path.resolve(repo,'../../85_공룡3_모듈화');
const out=process.env.MODULAR_CAPTURE_DIR||path.join(root,'선물기준캡처');
function load(code){const ctx={window:{},console:{info(){}}};vm.runInNewContext(code,ctx);return ctx.window.SherpaPixel;}
const before=load(execFileSync('git',['show','dd59ba1:assets/practice/modular/pixel.js'],{cwd:repo,encoding:'utf8',windowsHide:true}));
const after=load(fs.readFileSync(path.join(repo,'assets/practice/modular/pixel.js'),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={scope:'saved responses only; zero AI calls',sources:[],responses:[]};
for(const folder of ['3차캡처','보정캡처']){
 const file=path.join(root,folder,'실제AI기록.json'),sha256=hash(file),ledger=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const c of ledger.calls.filter(c=>c.input.mode==='pixel'&&c.raw)){
  const input=JSON.parse(c.raw.trim().replace(/^```json\s*\r?\n([\s\S]*?)\r?\n```$/i,'$1'));
  const old=before.validatePixel(c.input.slot,input),next=after.validatePixel(c.input.slot,input);
  assert.equal(JSON.stringify(old.pixel),JSON.stringify(next.pixel),'repair output must not change');
  assert.equal(old.painted,next.painted);
  if(c.input.slot!=='item'||old.ok)assert.equal(JSON.stringify(old),JSON.stringify(next));
  report.responses.push({source:folder,number:c.number,name:c.case,slot:c.input.slot,painted:next.painted,before:old.ok,after:next.ok});
 }
 assert.equal(hash(file),sha256);report.sources.push({file,sha256});
}
assert.equal(report.responses.length,28);
for(const [source,number,painted] of [['보정캡처',9,27],['3차캡처',15,32]]){
 const r=report.responses.find(r=>r.source===source&&r.number===number);
 assert.equal(r.slot,'item');assert.equal(r.painted,painted);assert.equal(r.before,false);assert.equal(r.after,true);
}
report.totals={count:28,before:report.responses.filter(r=>r.before).length,after:report.responses.filter(r=>r.after).length};
assert.equal(report.totals.before,25);assert.equal(report.totals.after,27);
assert(report.responses.filter(r=>!r.after).every(r=>r.painted===0));
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'선물기준-재검증.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report.totals));console.log('PASS 28 saved drawings; hearts 27/32 accepted; pixels and source hashes unchanged');
