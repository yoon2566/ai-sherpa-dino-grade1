'use strict';
// Offline replay of the saved real-AI outputs. Never sends an AI or DB request.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),mod=path.join(root,'assets/practice/modular');
const acorn=require(path.join(mod,'vendor/acorn.js'));
const out=path.resolve(root,'../../85_공룡3_모듈화/6차캡처');
const names=['9단계-날 수 있게 해 줘','9단계-100점마다 폭죽','9단계-점점 빨라지게','자유-점프할 때 노란 별빛이 나오게 해 줘','자유-게임 배경에 작은 구름을 하나 더 그려 줘'];
const report={scope:'Offline actual-AI HTML replay; all network blocked',files:[],checks:[],errors:[],requests:[],missing:[]};
const check=(name,details)=>{report.checks.push({name,pass:true,details});console.log('PASS '+name);};
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function instrument(html){
 let found=false;
 const content=html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi,(whole,open,code,close)=>{
  if(/type\s*=\s*["']application\/json["']/i.test(open))return whole;
  let ast;try{ast=acorn.parse(code,{ecmaVersion:'latest'});}catch(error){throw Error('inline script parse failed: '+error.message);}
  const expression=ast.body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&['ArrowFunctionExpression','FunctionExpression'].includes(n.expression.callee.type)&&n.expression.callee.body.body?.some(x=>x.type==='FunctionDeclaration'&&x.id?.name==='tick'));
  if(!expression)return whole;
  const body=expression.expression.callee.body,variables=[];
  for(const statement of body.body)if(statement.type==='VariableDeclaration')for(const d of statement.declarations)if(d.id.type==='Identifier'&&/fly|flight|fire|spark|burst|particle|confetti|cloud|accel|speed|star|celebrat/i.test(d.id.name))variables.push(d.id.name);
  const probe='\nwindow.__sherpaReplayProbe=()=>({'+variables.map(n=>JSON.stringify(n)+':'+n).join(',')+'});\n';
  found=true;return open+code.slice(0,body.end-1)+probe+code.slice(body.end-1)+close;
 });
 assert(found,'runner closure not found for local observation');
 const setup='<script>window.__SHERPA_TEST__=true;let seed=87439;Math.random=()=>((seed=(seed*16807)%2147483647)-1)/2147483646;window.__replayPaint={};window.__replayRects=[];for(const name of ["fillRect","arc","fill","stroke","lineTo"]){const original=CanvasRenderingContext2D.prototype[name];CanvasRenderingContext2D.prototype[name]=function(...args){window.__replayPaint[name]=(window.__replayPaint[name]||0)+1;if(name==="fillRect"&&window.__replayRects.length<3000)window.__replayRects.push({args,color:this.fillStyle});return original.apply(this,args)}}<\/script>';
 return content.replace(/<head(?:\s[^>]*)?>/i,match=>match+setup);
}
async function main(){
 const files=names.filter(name=>{const exists=fs.existsSync(path.join(out,name+'.html'));if(!exists)report.missing.push(name);return exists;});
 assert(files.length>0,'No saved real-AI HTML yet');
 if(!process.argv.includes('--allow-partial'))assert.deepEqual(report.missing,[],'All five real-AI outputs are required');
 const browser=await chromium.launch({headless:true});
 try{
  for(const name of files){
   const html=fs.readFileSync(path.join(out,name+'.html'),'utf8'),item={name,sha256:hash(html),bytes:Buffer.byteLength(html),sourceChecks:{}};report.files.push(item);
   assert(!/__SHERPA_IMAGE_ASSET_\d+__/.test(html),'unrestored image token');
   assert.equal((html.match(/\bid\s*=\s*["']sherpa-free-project["']/g)||[]).length,1,'free metadata count');
   for(const marker of ['DUCK','SPECIAL','PARENT'])assert(html.includes('/* GRADE1_'+marker+'_START */'),marker+' control missing');
   item.sourceChecks={imageTokensRestored:true,oneFreeProject:true,controlBlocks:true};
   const context=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true});
   await context.route('**/*',route=>{report.requests.push(route.request().url());return route.abort();});
   const page=await context.newPage();page.on('pageerror',error=>report.errors.push({name,error:error.message}));
   await page.setContent(instrument(html));await page.waitForFunction(()=>window.__sherpaTest&&window.__sherpaReplayProbe,{timeout:5000});
   const call=(method,arg)=>page.evaluate(({method,arg})=>window.__sherpaTest[method](arg),{method,arg});
   const probe=()=>page.evaluate(()=>{const v=window.__sherpaReplayProbe(),out={};for(const [k,x]of Object.entries(v))out[k]=Array.isArray(x)?{length:x.length,sample:x.slice(0,3)}:x;return out;});
   await call('restart');await call('fixture',{phase:'running',runningMs:1000,obstacles:[],collectibles:[]});
   assert.equal(await page.locator('#grade1-duck').count(),1);assert.equal(await page.locator('#grade1-special').count(),1);
   const duck=await page.locator('#grade1-duck').boundingBox();assert(duck,'duck button not visible');await page.mouse.move(duck.x+duck.width/2,duck.y+duck.height/2);await page.mouse.down();assert.equal((await call('snapshot')).player.low,true,'duck pointer press failed');await page.mouse.up();assert.equal((await call('snapshot')).player.low,false,'duck pointer release failed');
   await page.locator('#grade1-special').click();const active=await call('snapshot');assert.equal(active.abilityState,'active','original invincibility button lost');
   check(name+' 원본 실행·숙이기·특수 능력', {abilityState:active.abilityState});
   await call('restart');await call('fixture',{phase:'running',runningMs:1000,obstacles:[],collectibles:[]});
   if(name.includes('날 수')){
    const flight=await page.evaluate(()=>{const t=window.__sherpaTest;t.jump();t.step(12);const before=t.snapshot();t.jump();const after=t.snapshot();let minY=after.player.y,airFrames=0;for(let i=0;i<120;i++){if(i%12===0)t.jump();const s=t.step();minY=Math.min(minY,s.player.y);if(s.player.air)airFrames++;}return{before,after,minY,airFrames,probe:window.__sherpaReplayProbe()};});
    assert(flight.after.player.v<flight.before.player.v,'airborne second jump does not add lift');assert(flight.airFrames>70,'repeated flying does not sustain airtime');
    item.feature=flight;check(name+' 공중 재입력 상승·지속 비행',{beforeV:flight.before.player.v,afterV:flight.after.player.v,minY:flight.minY,airFrames:flight.airFrames});
   }else if(name.includes('100점마다')){
    const measurements=[];
    for(const score of [100,200]){
     await call('fixture',{phase:'running',runningMs:1000,player:{x:24},speed:6,distance:score/.025-6,obstacles:[],collectibles:[]});
     await page.evaluate(()=>{window.__replayPaint={};window.__replayRects=[];});await call('step',2);
     const visible=await page.evaluate(()=>{const effects=window.__sherpaReplayProbe().fireworks||[],parts=effects.flatMap(f=>f.parts||[]);return{particles:parts.length,drawn:parts.filter(p=>window.__replayRects.some(r=>r.args[0]===Math.round(p.x)&&r.args[1]===Math.round(p.y)&&r.args[2]===2&&r.args[3]===2&&r.color===p.color)).length};});
     assert(visible.particles>0&&visible.drawn===visible.particles,'firework particles not drawn to canvas');
     measurements.push({score:(await call('snapshot')).score,probe:await probe(),paint:await page.evaluate(()=>window.__replayPaint),visible});
     await call('step',12);await page.screenshot({path:path.join(out,'재생-'+name+'-'+score+'점.png')});
     await call('step',168);
    }
    const particleCount=m=>Object.entries(m.probe).filter(([k,v])=>/fire|spark|burst|particle|confetti|celebrat/i.test(k)&&v&&typeof v==='object'&&Number.isFinite(v.length)).reduce((sum,[,v])=>sum+v.length,0);
    assert(measurements.every(m=>particleCount(m)>0),'100 and 200 point fireworks have no active particles');
    item.feature=measurements;check(name+' 100점·200점 실제 폭죽 생성',measurements);
   }else if(name.includes('점점 빨라')){
    await call('fixture',{phase:'running',runningMs:5000,player:{x:-1000},speed:6,obstacles:[],collectibles:[]});
    const speed0=(await call('snapshot')).speed,speed300=(await call('step',300)).speed,speed600=(await call('step',300)).speed;
    assert(speed300>speed0&&speed600>speed300,'speed does not progressively rise');item.feature={speed0,speed300,speed600,probe:await probe()};check(name+' 0·5·10초 속도 증가',item.feature);
   }else if(name.includes('별빛')){
    await page.evaluate(()=>{window.__replayRects=[];});await call('jump');await call('step',4);item.feature={snapshot:await call('snapshot'),probe:await probe()};
    const sparks=Object.entries(item.feature.probe).filter(([k,v])=>/spark|star|particle/i.test(k)&&v&&typeof v==='object'&&v.length>0);
    assert(sparks.length>0,'jump sparkle has no active particles');
    item.feature.visible=await page.evaluate(()=>{const sparks=window.__sherpaReplayProbe().starSparks||[];return{particles:sparks.length,drawn:sparks.filter(s=>window.__replayRects.some(r=>r.args[0]===Math.round(s.x)-1&&r.args[1]===Math.round(s.y)-1&&r.args[2]===2&&r.args[3]===2&&r.color==='#fff7b8')).length};});
    assert(item.feature.visible.particles>0&&item.feature.visible.drawn===item.feature.visible.particles,'yellow sparkle centers not drawn');check(name+' 점프 시 노란 별빛 생성·화면 그리기',item.feature.visible);
   }else{
    item.feature={snapshot:await call('snapshot'),probe:await probe()};const clouds=Object.entries(item.feature.probe).filter(([k,v])=>/cloud/i.test(k)&&v&&typeof v==='object'&&v.length>0);
    assert(clouds.length>0,'cloud objects missing');
    const previous=report.files.find(f=>f.name===names[3]);assert(previous,'previous star-light output must be replayed first');
    assert.equal(item.feature.probe.clouds.length,previous.feature.probe.clouds.length+1,'exactly one extra cloud required');
    item.feature.drawnExtraCloud=await page.evaluate(()=>{const c=window.__sherpaReplayProbe().clouds.at(-1),x=Math.round(c.x);return [[x+4,c.y+5,32,2],[x+10,c.y+2,15,3],[x,c.y+7,43,1]].every(args=>window.__replayRects.some(r=>r.color==='#e5e6de'&&args.every((v,i)=>v===r.args[i])));});
    assert(item.feature.drawnExtraCloud,'added cloud not painted');await call('jump');await call('step',4);item.feature.preservedStarSparks=(await probe()).starSparks.length;assert(item.feature.preservedStarSparks>0,'previous star-light edit was lost');
    check(name+' 구름 정확히 1개 추가·그리기·앞선 별빛 보존',{previousClouds:previous.feature.probe.clouds.length,clouds:item.feature.probe.clouds.length,drawnExtraCloud:item.feature.drawnExtraCloud,preservedStarSparks:item.feature.preservedStarSparks});
   }
   await page.screenshot({path:path.join(out,'재생-'+name+'.png')});
   if(name.startsWith('자유-')){
    await call('restart');await call('fixture',{phase:'running',runningMs:5000,player:{x:-1000},speed:6,obstacles:[],collectibles:[]});const speed=(await call('step',300)).speed;
    assert(Math.abs(speed-7.2)<1e-6,'previous progressive acceleration lost');check(name+' 앞선 가속 변경 보존',{initial:6,after5Seconds:speed});
   }
   await context.close();
  }
  assert.deepEqual(report.errors,[],'runtime errors');assert.deepEqual(report.requests,[],'external requests');report.ok=report.missing.length===0;report.partial=report.missing.length>0;
 }finally{await browser.close();}
}
main().catch(error=>{report.failure=error.message;console.error(error);process.exitCode=1;}).finally(()=>{fs.writeFileSync(path.join(out,'6차-실제AI재생검증.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok||false,partial:report.partial||false,files:report.files.length,checks:report.checks.length,missing:report.missing,failure:report.failure}));});
