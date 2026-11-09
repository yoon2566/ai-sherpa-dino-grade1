'use strict';
// Reuses saved real responses. It never calls an AI provider or classroom API.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
const out=path.resolve(__dirname,'../../../85_공룡3_모듈화/2차캡처');
const ledger=JSON.parse(fs.readFileSync(path.join(out,'실제AI기록.json'),'utf8'));
const exported=path.join(out,'실제AI-최종게임.html');
const report={scope:'saved actual AI outputs only; no new AI/network calls',checks:[],captures:[],errors:[],network:[],drawings:[]};
const check=(name,details)=>{report.checks.push({name,pass:true,details});console.log('PASS '+name);};
async function shot(page,name,options={}){await page.screenshot({path:path.join(out,name),...options});report.captures.push(name);}
async function context(browser,viewport){const c=await browser.newContext({viewport,hasTouch:viewport.width!==1280});await c.route('**/*',route=>{if(['file:','data:','about:','blob:'].includes(new URL(route.request().url()).protocol))return route.continue();report.network.push(route.request().url());return route.abort();});c.on('page',p=>p.on('pageerror',e=>report.errors.push(e.message)));return c;}
async function fileInputs(browser){
  for(const[width,height]of[[1280,900],[1024,768],[768,1024]]){
    const ctx=await context(browser,{width,height});
    await ctx.addInitScript(()=>{const rect=CanvasRenderingContext2D.prototype.rect;CanvasRenderingContext2D.prototype.rect=function(x,y,w,h){if(x===0&&y===0&&((w===44&&h===47)||(w===59&&h===25))){const m=this.getTransform();window.__actualHeroBounds={x:m.e,y:m.f,w:w*m.a,h:h*m.d};}return rect.call(this,x,y,w,h);};});
    const p=await ctx.newPage();await p.goto(pathToFileURL(exported).href);await p.waitForFunction(()=>window.__actualHeroBounds?.h===47);assert.match(await p.locator('#status').textContent(),/시작 전/);
    const bounds=await p.locator('canvas').evaluate(c=>{const r=c.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,innerWidth,innerHeight};});assert(bounds.x>=0&&bounds.y>=0&&bounds.right<=width&&bounds.bottom<=height);check(`실제 AI 단일 HTML file:// 로드·전체 캔버스 ${width}×${height}`,bounds);await shot(p,`실제AI-file-${width}x${height}-ready.png`);
    if(width===1280)await p.locator('canvas').click({position:{x:150,y:60}});else await p.locator('canvas').tap({position:{x:150,y:60}});await p.waitForFunction(()=>document.getElementById('status').textContent.includes('진행 중'));await p.waitForFunction(()=>window.__actualHeroBounds?.x===24&&window.__actualHeroBounds?.y===93);
    if(width===1280){await p.keyboard.down('Space');await p.waitForFunction(()=>window.__actualHeroBounds.y<85);await shot(p,`실제AI-file-${width}x${height}-jump.png`);await p.keyboard.up('Space');await p.waitForFunction(()=>window.__actualHeroBounds.y===93);await p.keyboard.down('ArrowDown');await p.waitForFunction(()=>window.__actualHeroBounds.h===25);await shot(p,`실제AI-file-${width}x${height}-duck.png`);await p.keyboard.up('ArrowDown');await p.waitForFunction(()=>window.__actualHeroBounds.h===47);}
    else{await p.locator('canvas').tap({position:{x:150,y:60}});await p.waitForFunction(()=>window.__actualHeroBounds.y<85);await shot(p,`실제AI-file-${width}x${height}-jump.png`);await p.waitForFunction(()=>window.__actualHeroBounds.y===93);const b=await p.locator('#grade1-duck').boundingBox(),cdp=await ctx.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await p.waitForFunction(()=>window.__actualHeroBounds.h===25);assert.equal(await p.locator('#grade1-duck').getAttribute('aria-pressed'),'true');await shot(p,`실제AI-file-${width}x${height}-duck.png`);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForFunction(()=>window.__actualHeroBounds.h===47);assert.equal(await p.locator('#grade1-duck').getAttribute('aria-pressed'),'false');}
    await p.locator('#soundBtn').click();assert.equal(await p.locator('#soundBtn').getAttribute('aria-pressed'),'false');await p.locator('#soundBtn').click();assert.equal(await p.locator('#soundBtn').getAttribute('aria-pressed'),'true');check(`실제 AI 게임 시작·점프·숙이기·음소거 ${width}×${height}`);
    await shot(p,`실제AI-file-${width}x${height}-playing.png`);await ctx.close();
  }
}
async function artwork(browser){
  const names=['고양이','로봇','로봇 다시 그리기','바닷가','우주','바위','상자','사과','하트','별','무지개 배경'];
  const slots={고양이:'hero',로봇:'hero','로봇 다시 그리기':'hero',바닷가:'background',우주:'background',바위:'obstacle',상자:'obstacle',사과:'item',하트:'item',별:'item','무지개 배경':'background'};
  const samples=names.map(name=>{const c=ledger.cases.findLast(c=>c.name===name);assert(c?.pass&&c.slot?.code,name+' latest saved result must pass');return{name,slot:slots[name],code:c.slot.code,calls:c.calls};});
  const ctx=await context(browser,{width:1440,height:1050}),p=await ctx.newPage();
  await p.setContent('<!doctype html><meta charset="utf-8"><title>실제 AI 그림 검수</title><style>body{font:16px Arial,sans-serif;background:#ecf1f6;padding:20px;margin:0;color:#152b48}h1{font-size:24px}section{background:white;padding:18px;margin-bottom:16px;border-radius:12px}h2{font-size:18px;margin:0 0 12px}.row{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap}figure{margin:0;text-align:center}canvas{background:repeating-conic-gradient(#eee 0% 25%,#fff 0% 50%) 50%/16px 16px;image-rendering:pixelated;border:1px solid #aaa}figcaption{font-size:13px;padding:5px}.note{font-size:13px;color:#586579}</style><h1>저장된 실제 AI 응답 — 추가 호출 없는 그림 검수</h1><p class="note">각 칸의 실제 크기로 그린 뒤 확대 표시합니다. 빨간 선은 엔진의 groundY이며, 캐릭터는 지정된 영역으로 클리핑합니다.</p><main></main>');
  await p.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../assets/practice/modular/vendor/acorn.js'),'utf8')});await p.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../assets/practice/modular/safety.js'),'utf8')});
  report.drawings=await p.evaluate(samples=>{
    const result=[];
    for(const sample of samples){
      const safe=SherpaSlotSafety.validateStatic(sample.slot,sample.code);if(!safe.ok)throw Error(sample.name+': '+safe.error);
      const fn=new Function('"use strict";\n'+sample.code+'\nreturn '+SherpaSlotSafety.names[sample.slot]+';')();
      const section=document.createElement('section'),heading=document.createElement('h2'),row=document.createElement('div');heading.textContent=sample.name;row.className='row';section.append(heading,row);document.querySelector('main').append(section);
      const cases=sample.slot==='hero'?['stand','run','jump','duck','dead'].map(pose=>({pose,t:250,frame:2,w:pose==='duck'?59:44,h:pose==='duck'?25:47})):sample.slot==='background'?[{t:250,w:600,h:150,groundY:139,scroll:40,night:0},{t:1900,w:600,h:214,groundY:203,scroll:120,night:1}]:sample.slot==='obstacle'?[{t:250,w:17,h:35,kind:'shard',index:0},{t:250,w:25,h:50,kind:'crag',index:1},{t:250,w:46,h:40,kind:'drifter',index:2}]:[{t:250,w:16,h:16}];
      const metrics=[];
      for(const v of cases){
        const figure=document.createElement('figure'),c=document.createElement('canvas'),label=document.createElement('figcaption');c.width=v.w;c.height=v.h;const scale=sample.slot==='background'?1:sample.slot==='item'?6:3;c.style.width=v.w*scale+'px';c.style.height=v.h*scale+'px';const pen=c.getContext('2d');pen.save();pen.beginPath();pen.rect(0,0,v.w,v.h);pen.clip();fn(SherpaSlotSafety.drawingContext(pen),Object.freeze(v));pen.restore();
        const data=pen.getImageData(0,0,v.w,v.h).data;let visible=0;for(let i=3;i<data.length;i+=4)if(data[i]>=32)visible++;
        let outside=0,total=visible;
        if(sample.slot==='hero'){const margin=64,pad=document.createElement('canvas');pad.width=v.w+margin*2;pad.height=v.h+margin*2;const pc=pad.getContext('2d');pc.translate(margin,margin);fn(SherpaSlotSafety.drawingContext(pc),Object.freeze(v));const all=pc.getImageData(0,0,pad.width,pad.height).data;total=0;for(let y=0;y<pad.height;y++)for(let x=0;x<pad.width;x++)if(all[(y*pad.width+x)*4+3]>=32){total++;if(x<margin||x>=margin+v.w||y<margin||y>=margin+v.h)outside++;}}
        if(sample.slot==='background'){pen.strokeStyle='#ff3333';pen.lineWidth=1;pen.setLineDash([5,5]);pen.beginPath();pen.moveTo(0,v.groundY+.5);pen.lineTo(v.w,v.groundY+.5);pen.stroke();}
        const title=v.pose||v.kind||(sample.slot==='background'?(v.night?'night / headroom':'day'):'16×16');label.textContent=title+' · 불투명 '+Math.round(visible/(v.w*v.h)*100)+'%'+(outside?' · 영역 밖 '+Math.round(outside/total*100)+'%':'');figure.append(c,label);row.append(figure);metrics.push({title,visiblePixels:visible,ratio:visible/(v.w*v.h),outsidePixels:outside,totalUnclippedPixels:total,clippedFraction:outside/total});
      }
      result.push({name:sample.name,slot:sample.slot,calls:sample.calls,samples:metrics});
    }
    return result;
  },samples);
  await shot(p,'실제AI-그림검수-전체.png',{fullPage:true});
  const sections=p.locator('section');for(let i=0;i<samples.length;i++){const filename='실제AI-그림검수-'+samples[i].name.replaceAll(' ','_')+'.png';await sections.nth(i).screenshot({path:path.join(out,filename)});report.captures.push(filename);}
  check('실제 응답 11종: 전체 자세·크기·주야간 렌더링',report.drawings.map(x=>({name:x.name,samples:x.samples.length})));await ctx.close();
}
(async()=>{const browser=await chromium.launch({headless:true});try{await fileInputs(browser);await artwork(browser);assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);check('추가 AI 호출·외부 요청·JS 예외 없음');report.ok=true;}catch(error){report.failure={message:error.message,stack:error.stack};throw error;}finally{await browser.close();fs.writeFileSync(path.join(out,'실제AI-내려받기검증.json'),JSON.stringify(report,null,2));}})().catch(error=>{console.error(error);process.exitCode=1;});
