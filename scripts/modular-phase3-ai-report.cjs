'use strict';
// Offline evidence audit only. Never sends API requests or changes the live ledger.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {pathToFileURL,fileURLToPath}=require('node:url');
const {chromium}=require(path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
const repo=path.resolve(__dirname,'..'),out=path.resolve(repo,'../../85_공룡3_모듈화/3차캡처');
const ledgerPath=path.join(out,'실제AI기록.json'),ledgerSource=fs.readFileSync(ledgerPath,'utf8'),ledger=JSON.parse(ledgerSource);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(repo,'assets/practice/modular/pixel.js'),'utf8'),sandbox);const pixel=sandbox.window.SherpaPixel;
const report={scope:'Existing raw responses and final local HTML only; zero external API calls; original ledger untouched',ledgerSha256:hash(ledgerSource),calls:[],coverage:[],gameChecks:[],blockedRequests:[],runtimeErrors:[],captures:[]};
function diagnostics(value){
  const palette=Array.isArray(value?.palette)?value.palette:[],rows=Array.isArray(value?.pixels)?value.pixels:[];
  const occupied=new Set(),invalidCells=[],rowLengths=rows.map(row=>typeof row==='string'?row.length:null);
  for(let y=0;y<rows.length;y++){
    if(typeof rows[y]!=='string')continue;
    for(let x=0;x<rows[y].length;x++){
      const ch=rows[y][x];if(ch==='.')continue;
      if(!/^[0-7]$/.test(ch)||Number(ch)>=palette.length||!/^#[0-9a-f]{6}$/i.test(palette[Number(ch)]||''))invalidCells.push({x,y,char:ch});
      else occupied.add(x+','+y);
    }
  }
  const seen=new Set();let largest=0;
  for(const cell of occupied){if(seen.has(cell))continue;const queue=[cell];seen.add(cell);for(let i=0;i<queue.length;i++){const[x,y]=queue[i].split(',').map(Number);for(const next of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].map(p=>p.join(','))){if(occupied.has(next)&&!seen.has(next)){seen.add(next);queue.push(next);}}}largest=Math.max(largest,queue.length);}
  return {rowCount:rows.length,rowLengths,invalidRows:rowLengths.map((length,index)=>({row:index+1,length})).filter(row=>row.length!==16),paletteCount:palette.length,invalidCells,paintedRaw:occupied.size,largestComponentRaw:largest,connectedRatioRaw:occupied.size?largest/occupied.size:0,dimensionsValid:rows.length===16&&rowLengths.every(n=>n===16),lastRowPainted:typeof rows[15]==='string'&&/[^.]/.test(rows[15]),note:'Malformed drawings are measured at original row/column positions; never padded, truncated or accepted.'};
}
for(const call of ledger.calls){
  const record={number:call.number,name:call.case,mode:call.input.mode,slot:call.input.slot??null,hasRaw:typeof call.raw==='string',status:call.status??null,originalCaseRecorded:ledger.cases.some(c=>c.calls?.includes(call.number)),notes:[]};
  if(!record.hasRaw){record.verdict='unknown';record.notes.push('원시 응답·usage·완료 시간 누락. 성공/실패와 실제 과금 여부를 판정하지 않음.');}
  else {
    try{record.data=JSON.parse(call.raw.trim().replace(/^```json\s*\r?\n([\s\S]*?)\r?\n```$/i,'$1'));}
    catch(error){record.parseError=error.message;record.verdict='rejected';}
    if(record.data&&record.mode==='pixel'){record.strict=JSON.parse(JSON.stringify(pixel.validatePixel(record.slot,record.data)));record.diagnostics=diagnostics(record.data);record.verdict=record.strict.ok?'accepted':'rejected';}
    else if(record.data){record.verdict='route-only';record.notes.push('라우터 응답이며 밑그림이 아님.');}
  }
  if(record.number===11)record.notes.push('원시 응답은 존재하지만 당시 cases 행은 누락됨. 이 보고서에서 엄격 검사 결과만 복원하며, UI에서 취소/저장한 여부를 추정하지 않음.');
  if(record.number===20)record.notes.push('20회 상한에 도달하여 후속 pixel 요청은 차단됨. 장애물 손보기 검증은 미완료.');
  report.calls.push(record);
}
const expected=['고양이','로봇','토끼','외계인','바위','상자','선인장','사과','하트','별','다시 그려줘 1','다시 그려줘 2','캐릭터 색 파랗게','장애물 더 뾰족하게'];
for(const name of expected){
  const matches=report.calls.filter(c=>name.startsWith('다시 그려줘')?c.name.endsWith(name):c.name===name),original=ledger.cases.filter(c=>name.startsWith('다시 그려줘')?c.name.endsWith(name):c.name===name);
  let status=matches.some(c=>c.verdict==='accepted')?'accepted':matches.some(c=>c.verdict==='rejected')?'rejected':matches.length?'incomplete':'not-run';
  if(matches.some(c=>c.verdict==='unknown'))status=matches.some(c=>c.verdict==='accepted')?'accepted-with-missing-attempt':'incomplete';
  report.coverage.push({name,calls:matches.map(c=>c.number),status,editorConfirmedByOriginalRecord:original.some(c=>c.pass),notes:name==='상자'?['#10 원시 누락; #11 원시는 엄격검사 거절. 당시 cases 행 누락.']:name==='다시 그려줘 2'?['실제 AI 재생성은 1회만 실시. 두 번째는 미실시.']:name==='장애물 더 뾰족하게'?['#20 라우터만 완료; 후속 그림 요청은 20회 상한으로 차단.']:[]});
}
report.totals={reservedAttempts:ledger.calls.length,rawResponses:report.calls.filter(c=>c.hasRaw).length,pixelRawResponses:report.calls.filter(c=>c.hasRaw&&c.mode==='pixel').length,pixelAccepted:report.calls.filter(c=>c.verdict==='accepted').length,pixelRejected:report.calls.filter(c=>c.mode==='pixel'&&c.verdict==='rejected').length,missingRaw:report.calls.filter(c=>!c.hasRaw).map(c=>c.number),routeOnly:report.calls.filter(c=>c.mode==='route').map(c=>c.number)};
const escaped=JSON.stringify(report.calls).replace(/</g,'\\u003c');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>공룡3 실제 AI 전체 밑그림</title><style>
*{box-sizing:border-box}body{margin:0;background:#f3f5f8;color:#172c48;font:15px/1.45 system-ui,sans-serif}header{padding:24px 28px;background:white;border-bottom:1px solid #ccd5df}h1{font-size:26px;margin:0 0 8px}p{margin:5px 0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:20px}.card{background:white;border:2px solid #d4dde5;border-radius:12px;padding:14px;min-height:410px;overflow:hidden}.card.accepted{border-color:#16854a}.card.rejected{border-color:#cf3757}.card.unknown,.card.route-only{border-color:#b48b32}h2{font-size:19px;margin:0 0 5px}.verdict{font-weight:800;margin-bottom:8px}.accepted .verdict{color:#16854a}.rejected .verdict{color:#c12445}.unknown .verdict,.route-only .verdict{color:#916b17}canvas{display:block;max-width:100%;margin:0 auto 8px;border:1px solid #adbccc;image-rendering:pixelated}.metric{font-size:13px;word-break:keep-all}.note{font-size:12px;color:#76520b;margin-top:5px}.raw{white-space:pre-wrap;font:13px monospace;overflow-wrap:anywhere;background:#f5f6f8;border-radius:8px;padding:12px;min-height:180px}.legend{color:#67324a}.route-only .raw{min-height:250px}details{font-size:12px}footer{padding:0 28px 22px}</style>
<header><h1>공룡3 모듈화 3차 · 실제 AI 전체 밑그림</h1><p>원시 응답 19개 / 예약된 요청 20회. 초록은 엄격검사 통과, 빨강은 거절, 노랑은 원시 누락 또는 라우터입니다.</p><p class="legend">분홍 칸·× = 누락/잘못된 칸. 붉은 테두리 = 16×16 바깥. 실패 그림도 원래 줄과 칸 위치 그대로 표시하며 고치거나 통과시켜 보이지 않습니다.</p><p>상자 #10 응답 누락 · #11 거절 원시 복원 · 다시 그려줘 두 번째 미실시 · 장애물 9단계는 라우터만 완료</p></header><main class="grid" id="grid"></main><footer>기존 기록만 로컬 재검사했습니다. 추가 AI/API 호출 없음. 회색 체크무늬는 투명입니다.</footer>
<script>const records=${escaped};const labels={accepted:'검사 통과',rejected:'검사 거절',unknown:'원시 누락 · 판정 불가','route-only':'라우터 응답 · 그림 아님'};const grid=document.getElementById('grid');
for(const r of records){const card=document.createElement('section');card.className='card '+r.verdict;const heading=document.createElement('h2');heading.textContent='#'+r.number+' '+r.name;card.append(heading);const status=document.createElement('div');status.className='verdict';status.textContent=labels[r.verdict];card.append(status);
if(r.data&&r.mode==='pixel'&&Array.isArray(r.data.pixels)){const rows=r.data.pixels,palette=r.data.palette||[],w=Math.max(16,...rows.map(row=>typeof row==='string'?row.length:0)),h=Math.max(16,rows.length),cell=Math.min(16,Math.floor(282/Math.max(w,h))),canvas=document.createElement('canvas');canvas.width=w*cell;canvas.height=h*cell;const ctx=canvas.getContext('2d');for(let y=0;y<h;y++)for(let x=0;x<w;x++){const char=typeof rows[y]==='string'?rows[y][x]:undefined,index=/^[0-7]$/.test(char||'')?Number(char):-1,valid=index>=0&&/^#[0-9a-f]{6}$/i.test(palette[index]||'');ctx.fillStyle=char==='.'?((x+y)%2?'#e8eef3':'#ffffff'):valid?palette[index]:'#ffc1df';ctx.fillRect(x*cell,y*cell,cell,cell);if(char!=='.'&&!valid){ctx.strokeStyle='#ce2475';ctx.beginPath();ctx.moveTo(x*cell+3,y*cell+3);ctx.lineTo((x+1)*cell-3,(y+1)*cell-3);ctx.moveTo((x+1)*cell-3,y*cell+3);ctx.lineTo(x*cell+3,(y+1)*cell-3);ctx.stroke();}ctx.strokeStyle=x>=16||y>=16?'#da2548':'#b8c5d1';ctx.lineWidth=x>=16||y>=16?2:0.5;ctx.strokeRect(x*cell,y*cell,cell,cell);}ctx.strokeStyle='#922144';ctx.lineWidth=2;ctx.strokeRect(1,1,16*cell-2,16*cell-2);card.append(canvas);
const d=r.diagnostics,m=document.createElement('div');m.className='metric';m.textContent=d.rowCount+'줄 / 폭 '+[...new Set(d.rowLengths)].join(',')+'칸 / '+d.paletteCount+'색 / 칠함 '+d.paintedRaw+'칸 / 최대 연결 '+(d.connectedRatioRaw*100).toFixed(1)+'%';card.append(m);if(!r.strict.ok){const reason=document.createElement('div');reason.className='metric';reason.textContent=r.strict.error+(d.invalidRows.length?' (길이 오류: '+d.invalidRows.map(v=>v.row+'행 '+v.length+'칸').join(', ')+')':'');card.append(reason);}}
else{const pre=document.createElement('div');pre.className='raw';pre.textContent=r.hasRaw?JSON.stringify(r.data,null,2):'응답 원문이 기록되지 않았습니다. 그림·검사·토큰·비용·시간을 복원하지 않았습니다.';card.append(pre);}
for(const note of r.notes){const p=document.createElement('p');p.className='note';p.textContent=note;card.append(p);}grid.append(card);}
</script></html>`;
const sheetPath=path.join(out,'실제AI-전체밑그림.html');fs.writeFileSync(sheetPath,html,'utf8');
function check(name,fn){fn();report.gameChecks.push({name,pass:true});console.log('PASS '+name);}
async function rebuildActualGame(){
  const sourceName='실제AI-최종게임.html',builtName='실제AI-최종엔진게임.html',sourcePath=path.join(out,sourceName),source=fs.readFileSync(sourcePath,'utf8');
  const readMeta=html=>JSON.parse(html.match(/<script\b[^>]*\bid="sherpa-project"[^>]*>([\s\S]*?)<\/script>/i)[1]);
  const metadata=readMeta(source),moduleDir=path.join(repo,'assets/practice/modular');
  const builder={TextEncoder,URL,document:{currentScript:{src:pathToFileURL(path.join(moduleDir,'project.js')).href}},fetch:async url=>{
    assert.equal(url.protocol,'file:','builder accepts only local files');const filename=fileURLToPath(url);assert.equal(path.dirname(filename),moduleDir);assert(['shell.html','defaults.js','engine.js'].includes(path.basename(filename)));return {ok:true,text:async()=>fs.readFileSync(filename,'utf8')};
  }};
  builder.window=builder;vm.createContext(builder);
  for(const name of ['vendor/acorn.js','safety.js','pixel.js','project.js'])vm.runInContext(fs.readFileSync(path.join(moduleDir,name),'utf8'),builder,{filename:name});
  await builder.SherpaProject.init();const built=builder.SherpaProject.buildGameHtml(metadata);assert.deepEqual(readMeta(built),metadata,'local rebuild must preserve all original artwork and config');
  fs.writeFileSync(path.join(out,builtName),built,'utf8');
  report.artifacts={original:{file:sourceName,sha256:hash(source),preserved:true},verified:{file:builtName,sha256:hash(built),engineSha256:hash(fs.readFileSync(path.join(moduleDir,'engine.js'),'utf8')),metadataIdentical:true},note:'Original actual-AI HTML remains unchanged. Verified HTML is rebuilt locally from the identical metadata with the current project builder and engine; no AI calls.'};
  return path.join(out,builtName);
}
async function main(){
  const actualGamePath=await rebuildActualGame();
  const browser=await chromium.launch({headless:true});
  try{
    const ctx=await browser.newContext({viewport:{width:1600,height:1100}});
    await ctx.route('**/*',route=>{const protocol=new URL(route.request().url()).protocol;if(['file:','data:','blob:','about:'].includes(protocol))return route.continue();report.blockedRequests.push(route.request().url());return route.abort();});
    ctx.on('page',p=>p.on('pageerror',e=>report.runtimeErrors.push(e.message)));
    const sheet=await ctx.newPage();await sheet.goto(pathToFileURL(sheetPath).href);await sheet.waitForFunction(()=>document.querySelectorAll('.card').length===20);await sheet.screenshot({path:path.join(out,'실제AI-전체밑그림.png'),fullPage:true});report.captures.push('실제AI-전체밑그림.png');await sheet.close();
    const page=await ctx.newPage();await page.setViewportSize({width:1280,height:900});await page.addInitScript(()=>{window.__SHERPA_TEST__=true;window.__actualDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(args.length===9&&args[0].width===16&&args[0].height===16)window.__actualDraws.push(args.slice(1));return draw.apply(this,args);};});
    await page.goto(pathToFileURL(actualGamePath).href);await page.waitForFunction(()=>!!window.__sherpaTest);const meta=await page.evaluate(()=>JSON.parse(document.getElementById('sherpa-project').textContent));
    const finalCalls={hero:19,obstacle:13,item:17},symbols='0123456789ab';
    const colorGrid=p=>p.pixels.flatMap(row=>[...row].map(ch=>ch==='.'?null:p.palette[symbols.indexOf(ch)].toLowerCase()));
    for(const[slot,number]of Object.entries(finalCalls)){const key=slot==='hero'?'pixel':slot;check('실제 최종 '+slot+' 그림은 #'+number+' 밑그림 색과 동일',()=>{assert.equal(meta.slots[slot].mode,'pixel');assert.deepEqual(colorGrid(meta.assets[key]),colorGrid(report.calls.find(c=>c.number===number).data));});}
    const call=(method,arg)=>page.evaluate(({method,arg})=>window.__sherpaTest[method](arg),{method,arg});await call('restart');const standing=await call('snapshot');await call('down');const ducked=await call('snapshot');
    check('실제 토끼 캐릭터 숙이기와 칠한 칸 충돌 수',()=>{assert.equal(standing.heroBoxes.length,pixel.measure(meta.assets.pixel).painted);assert.equal(ducked.heroBoxes.length,standing.heroBoxes.length);assert(Math.abs(ducked.heroBoxes[0][3]/standing.heroBoxes[0][3]-25/47)<1e-9);});await call('up');await call('jump');const jumped=await call('step',5);check('실제 캐릭터 점프',()=>assert(jumped.player.y<93));await call('restart');
    for(const kind of ['shard','crag','drifter']){const s=await call('fixture',{speed:0,obstacles:[{kind,x:230}]});check('실제 선인장 '+kind+' 비율·바닥·마스크',()=>{assert.equal(s.obstacleBoxes[0].length,pixel.measure(meta.assets.obstacle).painted);assert(Math.abs(Math.max(...s.obstacleBoxes[0].map(b=>b[1]+b[3]))-(s.obstacleBounds[0].y+s.obstacleBounds[0].h))<1e-9);assert.equal(s.obstacleBoxes[0][0][2],s.obstacleBoxes[0][0][3]);});await page.screenshot({path:path.join(out,'실제AI-최종게임-'+kind+'.png')});report.captures.push('실제AI-최종게임-'+kind+'.png');}
    await call('restart');await call('fixture',{runningMs:4000,speed:0,lives:5,obstacles:[{kind:'crag',x:32}]});const hit=await call('step');check('실제 캐릭터와 실제 선인장 충돌·목숨 1 차감',()=>assert.equal(hit.lives,4));
    await call('restart');const boxes=(await call('snapshot')).heroBoxes;await call('fixture',{speed:0,collectibles:[{x:boxes[0][0],y:boxes[0][1]}]});const gift=await call('step');check('실제 별 선물 획득 1회·10점',()=>{assert.equal(gift.itemCount,1);assert.equal(gift.itemBonus,10);assert.equal(gift.collectibles.length,0);});
    const hud=await page.evaluate(()=>window.__actualDraws.some(a=>a[4]===10&&a[5]===27&&a[6]===14&&a[7]===14));check('상단 아이콘이 실제 선물 시트를 14×14로 그림',()=>assert(hud));await page.screenshot({path:path.join(out,'실제AI-최종게임-선물획득.png')});report.captures.push('실제AI-최종게임-선물획득.png');
    check('원시 ledger/실제AI HTML 보존·외부 요청/런타임 예외 0',()=>{assert.equal(hash(fs.readFileSync(ledgerPath,'utf8')),report.ledgerSha256);assert.equal(hash(fs.readFileSync(path.join(out,report.artifacts.original.file),'utf8')),report.artifacts.original.sha256);assert.deepEqual(report.blockedRequests,[]);assert.deepEqual(report.runtimeErrors,[]);});report.gameChecksPassed=report.gameChecks.length;report.localEvidenceAuditPassed=true;
  }finally{await browser.close();fs.writeFileSync(path.join(out,'실제AI-검사요약.json'),JSON.stringify(report,null,2),'utf8');}
  console.log(JSON.stringify({totals:report.totals,gameChecks:report.gameChecksPassed,captures:report.captures},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
