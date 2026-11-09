'use strict';
// Replays existing local evidence only. No model, classroom, board or DB calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
const repo=path.resolve(__dirname,'..'),dir=path.join(repo,'assets/practice/modular');
const out=process.env.MODULAR_CAPTURE_DIR||path.resolve(repo,'../../85_공룡3_모듈화/4차캡처');
const ledgerPath=path.join(out,'실제AI기록.json'),ledgerSource=fs.readFileSync(ledgerPath,'utf8'),ledger=JSON.parse(ledgerSource);
const hash=source=>crypto.createHash('sha256').update(source).digest('hex');
const expected=['고양이','판다','로봇','토끼','외계인','개구리','바위','상자','버섯','사과','하트','딸기'];
if(expected.some(name=>!ledger.cases?.some(entry=>entry.name===name)))throw Error('12개 최종 사례가 모두 기록된 뒤 실행해 주세요.');
const report={scope:'Existing local ledger replay only; zero external API calls; original ledger never written',ledgerSha256:hash(ledgerSource),created:new Date().toISOString(),calls:[],cases:[],blockedRequests:[],pageErrors:[]};
const pageHtml='<!doctype html><script src="/vendor/acorn.js"></script><script src="/safety.js"></script><script src="/pixel.js"></script><script src="/code-bitmap.js"></script><script src="/ai.js"></script>';
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pageHtml);return;}
  const name=url.pathname.slice(1),allowed=['vendor/acorn.js','safety.js','pixel.js','code-bitmap.js','ai.js'];
  if(!allowed.includes(name)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(fs.readFileSync(path.join(dir,name)));
});
const errorLabel=error=>({'not-allowed':'정적 안전 검사: 허용하지 않은 코드 문법 또는 API','function-contract':'정적 안전 검사: 함수 계약 불일치','source':'정적 안전 검사: 코드 길이 또는 형식 오류','drawing-overflow':'실행 검사: 캐릭터 자세 영역 밖 그림','empty-drawing':'실행 검사: 비어 있거나 너무 작은 그림','timeout':'실행 검사 시간 제한'}[error]||error);
const sum=(rows,key)=>rows.reduce((n,row)=>n+(Number.isFinite(row[key])?row[key]:0),0);
function usageRows(calls){return calls.map(call=>({number:call.number,name:call.case,retry:!!call.input?.retry,mode:call.input?.mode,slot:call.input?.slot,inputTokens:call.usage?.prompt_tokens??null,outputTokens:call.usage?.completion_tokens??null,costUsd:call.usage?.cost??null,elapsedMs:call.elapsedMs??null,ttfbMs:call.ttfbMs??null,status:call.status??null}));}
function summarize(rows){return {calls:rows.length,inputTokens:sum(rows,'inputTokens'),outputTokens:sum(rows,'outputTokens'),costUsd:Number(sum(rows,'costUsd').toFixed(10)),responseElapsedMs:sum(rows,'elapsedMs'),missingUsage:rows.filter(r=>r.inputTokens===null||r.outputTokens===null||r.costUsd===null).map(r=>r.number),missingElapsed:rows.filter(r=>r.elapsedMs===null).map(r=>r.number)};}
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try {
    browser=await chromium.launch({headless:true});const origin='http://127.0.0.1:'+server.address().port;
    const context=await browser.newContext({viewport:{width:1664,height:1200},deviceScaleFactor:1});
    await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin||['file:','data:','blob:','about:'].includes(url.protocol))return route.continue();report.blockedRequests.push(url.href);return route.abort();});
    const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));await page.goto(origin);
    for(const call of ledger.calls){
      const record={number:call.number,name:call.case,mode:call.input?.mode,slot:call.input?.slot,retry:!!call.input?.retry,status:call.status??null};
      if(typeof call.raw!=='string'){record.verdict='unknown';record.error='원시 응답 누락';}
      else if(call.input?.mode!=='slot'||!['hero','obstacle','item'].includes(call.input.slot)){record.verdict='other';record.error='이 보고서의 3개 그림 칸 외 응답';}
      else {
        const result=await page.evaluate(async({slot,raw})=>{try{const parsed=SherpaSlotAI.parseSlot(slot,raw),checked=await SherpaCodeBitmap.render(slot,parsed.code);return {code:parsed.code,...checked};}catch(error){return {ok:false,error:error.message,parseFailure:true};}},{slot:call.input.slot,raw:call.raw});
        record.checked=result;record.verdict=result.ok?'accepted':'rejected';if(!result.ok){record.error=result.error;record.reason=errorLabel(result.error);}
      }
      report.calls.push(record);
    }
    for(const name of expected){
      const entry=ledger.cases.filter(c=>c.name===name).at(-1),finalNumber=entry.calls?.at(-1),final=report.calls.find(c=>c.number===finalNumber);
      const current=entry.checked?.pixel||final?.checked?.pixel;
      const record={name,slot:entry.slot,uiAccepted:entry.pass,callNumbers:entry.calls||[],finalCall:finalNumber,checked:final?.checked||null,pixel:current||null,originalFinalPixelAvailable:!!entry.checked?.pixel};
      if(entry.checked?.pixel&&final?.checked?.pixel)record.replayedPixelsMatchOriginal=JSON.stringify(entry.checked.pixel)===JSON.stringify(final.checked.pixel);
      report.cases.push(record);
    }
    const rows=usageRows(ledger.calls),totals=summarize(rows),baselineTotals=summarize(rows.filter(row=>expected.includes(row.name)));
    report.totals={...totals,acceptedResponses:report.calls.filter(c=>c.verdict==='accepted').length,rejectedResponses:report.calls.filter(c=>c.verdict==='rejected').length,unknownResponses:report.calls.filter(c=>c.verdict==='unknown').length,acceptedCases:report.cases.filter(c=>c.uiAccepted&&c.checked?.ok).length};
    report.baselineTotals=baselineTotals;
    const costReport={scope:'Recorded SSE usage.cost; elapsed times are request-to-response-completion, summed across retries',ledgerSha256:report.ledgerSha256,totals,baselineTotals,cases:[...new Set(rows.map(row=>row.name))].map(name=>({name,...summarize(rows.filter(r=>r.name===name)),callNumbers:rows.filter(r=>r.name===name).map(r=>r.number)})),calls:rows};
    const safeData=JSON.stringify(report.cases).replace(/</g,'\\u003c'),money=baselineTotals.costUsd.toFixed(7);
    const gallery=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>공룡3 4차 실제 AI 12개 그림</title><style>
*{box-sizing:border-box}body{margin:0;background:#f1f5f9;color:#172c48;font:15px/1.45 "Malgun Gothic",system-ui,sans-serif}header{padding:22px 28px 18px;background:#fff;border-bottom:1px solid #d5dfea}h1{margin:0 0 7px;font-size:27px}p{margin:4px 0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:18px 22px}.card{padding:15px;background:#fff;border:2px solid #d2dde8;border-radius:12px;min-height:385px}.card.accepted{border-color:#45886c}.card.rejected{border-color:#ce5264}h2{font-size:21px;margin:0 0 4px}.status{font-weight:700;margin-bottom:10px}.accepted .status{color:#22774c}.rejected .status{color:#b13047}.pictures{display:flex;justify-content:center;gap:13px;margin:6px 0 12px}.picture{min-width:170px;text-align:center;font-size:13px;color:#48627a}.canvas-wrap{height:192px;display:flex;align-items:center;justify-content:center;margin-top:6px}canvas{image-rendering:pixelated;border:1px solid #c7d3df;background:#fff}.metrics{font-size:13px;line-height:1.65}.note{font-size:13px;color:#526981}footer{padding:0 28px 22px;font-size:13px}</style>
<header><h1>공룡3 4차 · 실제 AI 12개 그림</h1><p>코드 그림 → 비트맵 · 캐릭터/장애물 44×47, 선물 24×24 · 왼쪽 흰 배경 / 오른쪽 투명 체크 배경</p><p>기준 12개 / ${baselineTotals.calls}회 응답(자동 재요청 포함) · 입력 ${baselineTotals.inputTokens.toLocaleString('en-US')} / 출력 ${baselineTotals.outputTokens.toLocaleString('en-US')} 토큰 · $${money} · 응답 시간 합계 ${(baselineTotals.responseElapsedMs/1000).toFixed(3)}초</p><p class="note">초록 테두리는 형식·면적·연결 검사 통과입니다. 대상이 알아보이는지는 이 그림을 보고 별도로 판단합니다.</p></header><main class="grid" id="grid"></main><footer>원시 기록을 수정하지 않은 로컬 재검사. 추가 AI 호출 없음. 각 그림은 원래 가로·세로 비율의 정수 배율로 표시했습니다.</footer><script>
const records=${safeData};const symbols='0123456789abcdefghijklmnopqrstuvwxyz';
for(const r of records){const accepted=r.uiAccepted&&r.checked?.ok,card=document.createElement('section');card.className='card '+(accepted?'accepted':'rejected');const h=document.createElement('h2');h.textContent=r.name;card.append(h);const status=document.createElement('div');status.className='status';status.textContent=(accepted?'검사 통과':'검사 미통과')+' · 응답 #'+r.callNumbers.join(', #');card.append(status);
if(r.pixel){const w=r.pixel.pixels[0].length,h=r.pixel.pixels.length,scale=w===24?7:4,pictures=document.createElement('div');pictures.className='pictures';for(const checker of [false,true]){const holder=document.createElement('div');holder.className='picture';holder.textContent=checker?'투명 영역 확인':'그림 확인';const wrap=document.createElement('div');wrap.className='canvas-wrap';const canvas=document.createElement('canvas');canvas.width=w*scale;canvas.height=h*scale;const ctx=canvas.getContext('2d');for(let y=0;y<h;y++)for(let x=0;x<w;x++){const ch=r.pixel.pixels[y][x];ctx.fillStyle=ch==='.'?(checker&&(x+y)%2?'#e5ecf3':'#ffffff'):r.pixel.palette[symbols.indexOf(ch)];ctx.fillRect(x*scale,y*scale,scale,scale);}wrap.append(canvas);holder.append(wrap);pictures.append(holder);}card.append(pictures);const m=document.createElement('div');m.className='metrics';m.textContent=w+'×'+h+' · '+r.pixel.palette.length+'색 · 칠한 칸 '+r.checked.painted+'개 · 불투명 '+(100*r.checked.opaqueRatio).toFixed(1)+'%';card.append(m);const c=document.createElement('div');c.className='metrics';c.textContent='큰 덩어리 '+(100*r.checked.connectedRatio).toFixed(1)+'% · 작은 조각 '+r.checked.removedSmallCells+'칸 제거';card.append(c);}else{const missing=document.createElement('p');missing.textContent=r.checked?.error||'확인할 그림이 없습니다.';card.append(missing);}grid.append(card);}
window.galleryReady=true;</script></html>`;
    fs.mkdirSync(out,{recursive:true});const galleryPath=path.join(out,'실제AI-12개그림.html');fs.writeFileSync(galleryPath,gallery,'utf8');
    await page.goto(pathToFileURL(galleryPath).href);await page.waitForFunction(()=>window.galleryReady&&document.querySelectorAll('.card').length===12);await page.screenshot({path:path.join(out,'실제AI-12개그림.png'),fullPage:true});
    report.ledgerSha256AtEnd=hash(fs.readFileSync(ledgerPath,'utf8'));
    report.ledgerUnchanged=report.ledgerSha256AtEnd===report.ledgerSha256;
    if(!report.ledgerUnchanged)report.snapshotNote='원시 기록이 외부 수집기로 추가 갱신되었습니다. 보고서는 시작 시점 SHA의 읽기 전용 스냅샷이며 최종 수집 후 재실행이 필요합니다.';
    if(report.pageErrors.length)throw Error('보고서 렌더 예외: '+report.pageErrors.join('; '));
    fs.writeFileSync(path.join(out,'실제AI-검사요약.json'),JSON.stringify(report,null,2)+'\n','utf8');
    fs.writeFileSync(path.join(out,'실제AI-비용요약.json'),JSON.stringify(costReport,null,2)+'\n','utf8');
    console.log(JSON.stringify({totals:report.totals,rejected:report.calls.filter(c=>c.verdict==='rejected').map(c=>({number:c.number,name:c.name,error:c.error,reason:c.reason})),pixelReplayMatches:report.cases.every(c=>c.replayedPixelsMatchOriginal),ledgerUnchanged:report.ledgerUnchanged,gallery:galleryPath},null,2));
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
