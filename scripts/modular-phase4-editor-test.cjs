'use strict';
// Isolated editor interaction tests: local assets only, with no AI or database access.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(path.resolve(__dirname, '../../../70_검수/node_modules/playwright'));
const repo = path.resolve(__dirname, '..');
const out = process.env.MODULAR_CAPTURE_DIR || path.resolve(__dirname, '../../../85_공룡3_모듈화/4차캡처');
const js = fs.readFileSync(path.join(repo, 'assets/practice/grade1-pixel.js'), 'utf8');
const css = fs.readFileSync(path.join(repo, 'assets/practice/grade1-pixel.css'), 'utf8');
const report = {scope:'Isolated editor, local synthetic artwork; no AI, database or external requests',checks:[],captures:[],errors:[]};
fs.mkdirSync(out, {recursive:true});
const check = (name, details) => { report.checks.push({name,pass:true,...(details ? {details} : {})}); console.log('PASS '+name); };
const art = (w,h) => ({palette:['#172c48','#28a853','#ffffff'], pixels:Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>y>=4&&y<h-3&&x>=5&&x<w-5?(x===5||x===w-6||y===4||y===h-4?'0':y>8&&y<12&&x>w-14&&x<w-10?'2':'1'):'.').join(''))});
async function open(page, options) {
  await page.locator('.grade1-pixel-editor').waitFor({state:'detached'});
  await page.evaluate(options => {
    window.__result=null;window.__cancelled=0;window.__retried=null;
    grade1Pixel.open({...options,onApply:value=>{window.__result=value;},onCancel:()=>{window.__cancelled++;},...(options.retry?{onRetry:value=>{window.__retried=value;}}:{})});
  },options);
  await page.locator('.grade1-pixel-editor').waitFor({state:'visible'});
}
async function close(page) { await page.keyboard.press('Escape'); await page.locator('.grade1-pixel-editor').waitFor({state:'detached'}); }
async function at(page,x,y) {
  return page.locator('canvas').evaluate((canvas,{x,y})=>{const r=canvas.getBoundingClientRect();return{x:r.x+(x+.5)*r.width/(canvas.width/20),y:r.y+(y+.5)*r.height/(canvas.height/20)};},{x,y});
}
async function rgb(page,x,y) { return page.locator('canvas').evaluate((canvas,{x,y})=>Array.from(canvas.getContext('2d').getImageData(x*20+10,y*20+10,1,1).data),{x,y}); }
async function image(page) { return page.locator('canvas').evaluate(canvas=>canvas.toDataURL()); }
async function stroke(page,context,from,to,touch) {
  const a=await at(page,...from), b=await at(page,...to);
  if(touch){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);await page.mouse.up();}
}
async function main() {
  const browser=await chromium.launch({headless:true});
  try {
    for(const[width,height]of[[1280,900],[1024,768],[768,1024]]){
      const touch=width!==1280, context=await browser.newContext({viewport:{width,height},hasTouch:touch});
      await context.route('**/*',route=>route.abort());
      const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
      await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><body style="margin:0;font:16px system-ui,sans-serif"></body></html>');
      await page.addStyleTag({content:css});await page.addScriptTag({content:js});
      await open(page,{draft:art(44,47),retry:true});
      const canvas=page.locator('canvas'), box=await canvas.boundingBox();
      assert.equal(await canvas.getAttribute('aria-label'),'44칸 곱하기 47칸 그림판. 방향키로 이동하고 스페이스바로 칠해요.');
      if(width===768)assert(box.width/44>=9, 'Portrait tablet cells must be at least 9 CSS px');
      assert.equal(await page.locator('[data-brush="3"]').getAttribute('aria-pressed'),'true');
      check(`44×47 크기·중간 붓 기본·태블릿 칸 크기 ${width}×${height}`,{cellWidth:box.width/44,cellHeight:box.height/47});
      await page.locator('.pixel-palette button').nth(2).click();
      const before=await image(page);
      await stroke(page,context,[12,20],[23,20],touch);
      for(let x=11;x<=24;x++)for(let y=19;y<=21;y++)assert.deepEqual(await rgb(page,x,y),[255,255,255,255]);
      assert.deepEqual(await rgb(page,18,18),[40,168,83,255]);
      await page.locator('.pixel-undo').click();assert.equal(await image(page),before);assert.equal(await page.locator('.pixel-undo').isDisabled(),true);
      check(`3×3 ${touch?'터치':'마우스'} 연속 긋기·틈 없음·한 번 긋기 전체 되돌리기 ${width}×${height}`);
      await page.locator('[data-brush="5"]').click();await page.locator('.pixel-eraser').click();
      await stroke(page,context,[20,22],[20,22],touch);
      for(let x=18;x<=22;x++)for(let y=20;y<=24;y++)assert.notDeepEqual(await rgb(page,x,y),[40,168,83,255]);
      assert.deepEqual(await rgb(page,17,22),[40,168,83,255]);await page.locator('.pixel-undo').click();assert.equal(await image(page),before);
      check(`5×5 지우개·동일 붓 크기·되돌리기 ${width}×${height}`);
      await page.locator('[data-brush="1"]').click();await page.locator('.pixel-palette button').nth(2).click();await stroke(page,context,[20,22],[20,22],touch);
      assert.deepEqual(await rgb(page,20,22),[255,255,255,255]);assert.deepEqual(await rgb(page,19,22),[40,168,83,255]);
      const capture=path.join(out,`phase4-editor-${width}x${height}.png`);await page.screenshot({path:capture,fullPage:true});report.captures.push(capture);
      await page.locator('.pixel-apply').click();const result=await page.evaluate(()=>window.__result);assert.equal(result.pixels.length,47);assert.equal(result.pixels[0].length,44);assert.equal(result.pixels[22][20],'2');
      check(`가는 붓 1칸·확인 비트맵 반환 ${width}×${height}`);
      await open(page,{width:44,height:47});assert.equal(await page.locator('.pixel-clear').isDisabled(),true);await stroke(page,context,[1,1],[1,1],touch);await page.locator('.pixel-apply').click();const direct=await page.evaluate(()=>window.__result);assert.equal(direct.pixels.length,47);assert.equal(direct.pixels[0].length,44);assert.equal(direct.pixels.join('').replace(/\./g,'').length,9);check(`직접 그리기 44×47 빈 칸·비트맵 반환 ${width}×${height}`);
      for(const[w,h]of[[16,16],[24,24]]){await open(page,{draft:art(w,h),slot:w===24?'item':'hero'});await page.locator('.pixel-apply').click();const returned=await page.evaluate(()=>window.__result);assert.equal(returned.pixels.length,h);assert.equal(returned.pixels[0].length,w);check(`${w}×${h} 작품 재편집·크기 보존 ${width}×${height}`);}
      await open(page,{initial:'0'.repeat(256)});await stroke(page,context,[5,5],[5,5],touch);await page.locator('.pixel-apply').click();const legacy=await page.evaluate(()=>window.__result);assert.equal(typeof legacy,'string');assert.equal(legacy.length,256);check(`구형 직접 그리기 16×16 문자열 호환 ${width}×${height}`);
      const twelve={palette:Array.from({length:12},(_,i)=>'#'+(0x102030+i*1024).toString(16)),pixels:Array(47).fill('0123456789ab'+'.'.repeat(32))};
      await open(page,{draft:twelve,retry:true});assert.equal(await page.locator('.pixel-palette button').count(),21);await page.locator('.pixel-palette button').nth(20).click();await page.locator('[data-brush="1"]').click();await stroke(page,context,[20,22],[20,22],touch);await page.locator('.pixel-apply').click();const extended=await page.evaluate(()=>window.__result);assert.equal(extended.palette.length,21);assert.deepEqual(extended.palette.slice(0,12),twelve.palette);assert.equal(extended.pixels[22][20],'k');await open(page,{draft:extended});await page.locator('.pixel-apply').click();assert.deepEqual(await page.evaluate(()=>window.__result),extended);check(`AI 12색 앞·기본색 뒤·21색 재편집 보존 ${width}×${height}`);
      await open(page,{draft:art(44,47),description:'직접 그린 그림은 손보기 창에서 고쳐 봐요'});assert.equal(await page.locator('h2').textContent(),'내 캐릭터 그리기');assert.equal(await page.locator('.pixel-cancel').textContent(),'취소');await page.locator('.pixel-cancel').click();await page.waitForFunction(()=>window.__cancelled===1);check(`직접 그린 그림 손보기 안내·취소 ${width}×${height}`);
      await open(page,{draft:art(44,47),retry:true});await page.locator('.pixel-cancel').click();await page.waitForFunction(()=>window.__retried!==null);assert.equal(await page.evaluate(()=>window.__cancelled),0);await open(page,{draft:art(44,47),retry:true});await close(page);await page.waitForFunction(()=>window.__cancelled===1);check(`다시 그려줘·Esc 취소 분리 ${width}×${height}`);
      await context.close();
    }
    assert.deepEqual(report.errors,[]);report.ok=true;
  }catch(error){report.failure={message:error.message,stack:error.stack};throw error;}
  finally{fs.writeFileSync(path.join(out,'4차-편집기검증.json'),JSON.stringify(report,null,2));await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
