'use strict';
// Real browser editor checks using only local fixtures; no game, classroom, DB or AI requests.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || path.resolve(__dirname, '../../../70_검수/node_modules/playwright'));
const assets = path.resolve(__dirname, '../assets/practice');
const out = path.resolve(__dirname, '../../../85_공룡3_모듈화/3차캡처');
const report = {scope:'localhost editor fixtures, Chromium PC and emulated touch viewports; no external APIs',checks:[],errors:[],captures:[]};
const draft = {
  palette:['#f28c28','#3b2a1a','#ed5147','#ffffff','#556677','#28a853','#ffca35','#8899aa'],
  pixels:Array.from({length:16},(_,y)=>Array.from({length:16},(_,x)=>y>=2&&y<14&&x>=3&&x<13?String((x+y)%8):'.').join(''))
};
function check(name){report.checks.push({name,pass:true});console.log('PASS '+name);}
const routes = {
  '/':['text/html; charset=utf-8','<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/grade1-pixel.css"></head><body style="font-family:Arial,sans-serif"><script src="/grade1-pixel.js"></script></body></html>'],
  '/grade1-pixel.css':['text/css; charset=utf-8',fs.readFileSync(path.join(assets,'grade1-pixel.css'))],
  '/grade1-pixel.js':['text/javascript; charset=utf-8',fs.readFileSync(path.join(assets,'grade1-pixel.js'))]
};
const server=http.createServer((req,res)=>{const r=routes[new URL(req.url,'http://localhost').pathname];res.writeHead(r?200:404,{'Content-Type':r?.[0]||'text/plain'});res.end(r?.[1]||'Not found');});
async function open(page,slot='hero',behavior='normal'){
  await page.evaluate(({draft,slot,behavior})=>{
    window.editorEvents={applied:[],retried:[],cancelled:0};
    window.editorSeed=JSON.stringify(draft);
    window.grade1Pixel.open({draft,slot,onApply:async value=>{
      if(behavior==='reject')throw Error('fixture save failure');
      if(behavior==='slow')await new Promise(resolve=>setTimeout(resolve,250));
      window.editorEvents.applied.push(value);
    },onRetry:value=>window.editorEvents.retried.push(value),onCancel:()=>window.editorEvents.cancelled++});
  },{draft,slot,behavior});
  await page.locator('dialog').waitFor({state:'visible'});
}
async function events(page){return page.evaluate(()=>window.editorEvents);}
async function clickCell(page,x,y,touch){const r=await page.locator('canvas').boundingBox();const point={x:r.x+(x+.5)*r.width/16,y:r.y+(y+.5)*r.height/16};if(touch)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);}
async function closed(page){await page.locator('dialog').waitFor({state:'detached'});}
(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    for(const[width,height]of[[1280,900],[1024,768],[768,1024]]){
      const touch=width!==1280,ctx=await browser.newContext({viewport:{width,height},hasTouch:touch});
      await ctx.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
      const page=await ctx.newPage();page.on('pageerror',error=>report.errors.push(error.message));
      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.evaluate(()=>{window.direct=[];window.grade1Pixel.open({onApply:value=>window.direct.push(value)});});
      assert.equal(await page.locator('h2').textContent(),'내 캐릭터 그리기');assert.equal(await page.locator('.pixel-palette button').count(),9);assert.equal(await page.locator('.pixel-close').count(),0);
      assert.equal(await page.locator('.pixel-clear').isDisabled(),true);check(`직접 그리기 기존 빈 캔버스·팔레트·문구 ${width}×${height}`);
      await clickCell(page,0,0,touch);await page.locator('.pixel-apply').click();await closed(page);
      assert.equal((await page.evaluate(()=>window.direct))[0],'1'+'0'.repeat(255));check(`직접 그리기 기존 256문자 데이터 ${width}×${height}`);
      await open(page);
      const swatches=await page.locator('.pixel-palette button').evaluateAll(buttons=>buttons.map(button=>button.style.backgroundColor));
      assert.equal(swatches.length,12);assert.equal(swatches[0],'rgb(242, 140, 40)');assert.equal(swatches[7],'rgb(136, 153, 170)');assert.equal(swatches[8],'rgb(23, 44, 72)');
      assert.equal(await page.locator('h2').textContent(),'AI가 그린 밑그림이에요');assert.equal(await page.locator('.pixel-apply').textContent(),'이 캐릭터로 달리기 ✓');assert.equal(await page.locator('p').first().textContent(),'마음에 안 드는 칸을 고쳐 봐요. 다 되면 아래 버튼을 눌러요.');
      assert.equal(await page.locator('.pixel-cancel').textContent(),'다시 그려줘');assert.equal(await page.locator('.pixel-undo').isDisabled(),true);
      assert.deepEqual((await events(page)).applied,[]);check(`AI 밑그림·색 우선순위·최대 12색·확인 전 미반영 ${width}×${height}`);
      const layout=await page.locator('dialog').evaluate(node=>{const r=node.getBoundingClientRect();const c=node.querySelector('canvas').getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,scroll:node.scrollWidth,width:node.clientWidth,canvas:c.width,touchAction:getComputedStyle(node.querySelector('canvas')).touchAction,minButtons:Math.min(...[...node.querySelectorAll('button')].map(button=>button.getBoundingClientRect().height))};});
      assert(layout.left>=0&&layout.right<=width&&layout.top>=0&&layout.bottom<=height);assert(layout.scroll<=layout.width);assert.equal(layout.touchAction,'none');if(touch){assert(layout.canvas/16>=19);assert(layout.minButtons>=44);}check(`창·그림판·도구 화면 내 배치와 터치 크기 ${width}×${height}`);
      const capture=`editor-seeded-${width}x${height}.png`;await page.screenshot({path:path.join(out,capture)});report.captures.push(capture);
      await page.locator('.pixel-palette button').nth(11).click();
      const r=await page.locator('canvas').boundingBox();
      const start={x:r.x+r.width/32,y:r.y+r.height/32},end={x:r.x+r.width*31/32,y:start.y};
      if(touch){const session=await ctx.newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}
      else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y);await page.mouse.up();}
      await page.locator('.pixel-eraser').click();await clickCell(page,0,0,touch);
      await page.locator('.pixel-undo').click();
      await page.locator('.pixel-clear').click();assert.equal(await page.locator('.pixel-clear').isDisabled(),true);
      await page.locator('.pixel-apply').click();assert.equal(await page.locator('.pixel-message').textContent(),'잘 안 됐어요. 다시 해봐요.');assert.deepEqual((await events(page)).applied,[]);
      await page.locator('.pixel-undo').click();await page.locator('.pixel-apply').click();await closed(page);
      const applied=(await events(page)).applied;assert.equal(applied.length,1);assert.equal(applied[0].palette.length,12);assert.equal(applied[0].pixels[0],'b'.repeat(16));assert.deepEqual(applied[0].pixels.slice(1),draft.pixels.slice(1));assert.equal((await events(page)).cancelled,0);check(`칠하기·연속 획·지우개·되돌리기·전체 지우기·12번째 색 저장 ${width}×${height}`);
      await open(page,'obstacle');assert.equal(await page.locator('h2').textContent(),'AI가 그린 장애물이에요');assert.equal(await page.locator('.pixel-apply').textContent(),'이 장애물로 정하기 ✓');await clickCell(page,0,0,touch);await page.locator('.pixel-cancel').click();await closed(page);
      const retry=await events(page);assert.equal(retry.retried.length,1);assert.equal(retry.retried[0].pixels[0][0],'0');assert.equal(retry.cancelled,0);assert.equal(retry.applied.length,0);check(`장애물 문구·다시 그려줘 편집 결과 전달·미반영 ${width}×${height}`);
      await open(page,'item');assert.equal(await page.locator('h2').textContent(),'AI가 그린 선물이에요');assert.equal(await page.locator('.pixel-apply').textContent(),'이 선물로 정하기 ✓');await page.locator('.pixel-close').click();await closed(page);assert.equal((await events(page)).cancelled,1);assert.equal((await events(page)).applied.length,0);check(`선물 문구·닫기 X 취소 ${width}×${height}`);
      await open(page);await page.keyboard.press('Escape');await closed(page);assert.equal((await events(page)).cancelled,1);assert.equal((await events(page)).applied.length,0);check(`Esc 취소 ${width}×${height}`);
      await open(page);await page.mouse.click(2,2);await closed(page);assert.equal((await events(page)).cancelled,1);assert.equal((await events(page)).applied.length,0);check(`바깥 클릭 취소 ${width}×${height}`);
      await open(page,'hero','reject');await page.locator('.pixel-apply').click();assert.equal(await page.locator('.pixel-message').textContent(),'fixture save failure');assert(await page.locator('dialog').isVisible());assert.equal(await page.locator('.pixel-apply').isDisabled(),false);await page.locator('.pixel-close').click();await closed(page);check(`비동기 저장 실패 시 창 유지·재시도 가능 ${width}×${height}`);
      await open(page,'hero','slow');await page.locator('.pixel-apply').click();assert.equal(await page.locator('.pixel-apply').isDisabled(),true);await page.keyboard.press('Escape');assert(await page.locator('dialog').isVisible());await closed(page);assert.equal((await events(page)).applied.length,1);assert.equal((await events(page)).cancelled,0);check(`확인 중 중복 저장·취소 차단 및 완료 후 닫힘 ${width}×${height}`);
      await ctx.close();
    }
    assert.deepEqual(report.errors,[]);check('브라우저 실행 오류 없음');
    console.log(JSON.stringify({passed:report.checks.length,captures:report.captures}));
  }catch(error){report.failure=error.stack;throw error;}
  finally{fs.writeFileSync(path.join(out,'editor-verification.json'),JSON.stringify(report,null,2));await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
