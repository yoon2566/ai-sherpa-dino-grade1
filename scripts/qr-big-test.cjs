'use strict';
// Local static assets + in-memory classroom only. No Worker, database or deployment.
// Test-only dependencies: npm install --no-save --package-lock=false --ignore-scripts jsqr@1.4.0 pngjs@7.0.0
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require(path.resolve(__dirname, '../../../70_검수/node_modules/playwright'));
const jsQR = require('jsqr');
const {PNG} = require('pngjs');
const repo = path.resolve(__dirname, '..');
const assets = path.join(repo, 'assets');
const out = process.env.QR_CAPTURE_DIR || path.resolve(__dirname, '../../../85_공룡3_모듈화/QR');
const code = '307426';
const vendorPath = '/vendor/qrcode-generator-2.0.4.js';
const report = {scope:'Local static server and in-memory classroom only; no live APIs, KV, D1, R2 or deployment', checks:[], errors:[], blockedRequests:[], mockRequests:[], captures:[], decoded:[]};
const state = {code, name:'우리 반 공룡게임', openPages:[1,2,3,4,5,6], revision:1};
fs.mkdirSync(out, {recursive:true});
function pass(name, details) {
  report.checks.push({name, pass:true, ...(details === undefined ? {} : {details})});
  console.log('PASS '+name);
}
function json(res, status, body) {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
const server = http.createServer(async(req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname === '/api/classroom/'+code) {
      const teacher = /(?:^|;\s*)qr_test_teacher=1(?:;|$)/.test(req.headers.cookie || '');
      if(req.method === 'PATCH') {
        if(!teacher)return json(res,403,{error:'Mock teacher only'});
        let raw = '';for await (const chunk of req)raw += chunk;
        const body = JSON.parse(raw);report.mockRequests.push({method:'PATCH',path:pathname,body});
        if(body.lockAll === true)state.openPages=[];
        else if(Number.isInteger(body.page) && typeof body.open === 'boolean')state.openPages=body.open ? [...new Set([...state.openPages,body.page])].sort() : state.openPages.filter(n=>n!==body.page);
        else if(Number.isInteger(body.maxPage))state.openPages=Array.from({length:body.maxPage},(_,i)=>i+1);
        else return json(res,400,{error:'Unsupported mock payload'});
        state.revision++;
      } else if(req.method !== 'GET')return json(res,405,{error:'Unsupported mock method'});
      return json(res,200,{...state,canManage:teacher,totalPages:6,maxPage:Math.max(0,...state.openPages)});
    }
    if(pathname.startsWith('/api/'))return json(res,503,{error:'Only the in-memory test classroom API is available'});
    if(pathname === '/favicon.ico'){res.writeHead(204);return res.end();}
    let rel=pathname.slice(1);if(!rel)rel='index.html';if(rel==='lesson')rel='lesson.html';if(rel==='classes')rel='index.html';if(rel==='board')rel='board.html';
    const file=path.resolve(assets,rel);
    if(!file.startsWith(assets+path.sep)){res.writeHead(403);return res.end();}
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.ttf':'font/ttf','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(fs.readFileSync(file));
  }catch(error){json(res,500,{error:error.message});}
});
let browser,origin;
async function context(teacher=false,options={}) {
  const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,...options});
  await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin});
  if(teacher)await ctx.addCookies([{name:'qr_test_teacher',value:'1',url:origin}]);
  await ctx.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin || ['about:','blob:','data:'].includes(url.protocol))return route.continue();
    report.blockedRequests.push(url.origin+url.pathname);return route.abort('blockedbyclient');
  });
  ctx.on('page',p=>p.on('pageerror',error=>report.errors.push(error.message)));
  return ctx;
}
async function loaded(page,teacher) {
  await page.goto(origin+'/lesson?room='+code+(teacher?'&role=teacher':''));
  await page.waitForFunction(()=>document.getElementById('room-code').textContent==='코드 307426');
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(expected=>document.getElementById('teacher-tools').hidden!==expected,teacher);
}
async function openQR(page) {
  await page.locator('#show-room-qr').click();
  await page.waitForFunction(()=>document.getElementById('room-qr-dialog').open && !!document.querySelector('#room-qr-image svg'));
}
async function closeQR(page,method) {
  if(method==='button')await page.locator('#close-room-qr').click();
  else if(method==='outside')await page.mouse.click(3,3);
  else await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.getElementById('room-qr-dialog').open);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'show-room-qr');
}
async function screenshot(page,name) {
  await page.screenshot({path:path.join(out,name),fullPage:true});report.captures.push(name);
}
async function decodeVisibleQR(page,label) {
  const bytes=await page.locator('#room-qr-image svg').screenshot();
  const png=PNG.sync.read(bytes);
  const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height,{inversionAttempts:'dontInvert'});
  assert.ok(decoded,'Independent jsQR decoder failed for '+label);
  assert.equal(decoded.data,origin+'/lesson?room='+code);
  assert.equal(new URL(decoded.data).searchParams.has('role'),false);
  const count=decoded.version*4+17,total=count+8;
  const dark=(x,y)=>{const px=Math.min(png.width-1,Math.floor((x+4+.5)*png.width/total)),py=Math.min(png.height-1,Math.floor((y+4+.5)*png.height/total));return png.data[(py*png.width+px)*4]<128;};
  let format=0;
  for(let i=0;i<15;i++)if(dark(8,i<6?i:i<8?i+1:count-15+i))format|=1<<i;
  const level=(format^0x5412)>>13;
  assert.equal(level,0,'Decoded QR format bits must specify error correction M');
  const border=Math.max(1,Math.floor(4*png.width/total)-1);
  for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++)if(x<border||y<border||x>=png.width-border||y>=png.height-border){
    const n=(y*png.width+x)*4;assert.ok(png.data[n]>250&&png.data[n+1]>250&&png.data[n+2]>250,'QR four-module quiet zone must be white');
  }
  report.decoded.push({label,width:png.width,height:png.height,url:decoded.data,version:decoded.version,errorCorrection:'M',quietZoneModules:4});
  return decoded.data;
}
async function focusCard(page) {
  await page.locator('.room-qr-card').evaluate(card=>{card.tabIndex=-1;card.focus();});
}
async function clickAndRefresh(page,id,payload) {
  const count=report.mockRequests.length;
  await page.locator('#'+id).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('#teacher-tools button')].every(b=>!b.disabled));
  assert.equal(report.mockRequests.length,count+1);
  assert.deepEqual(report.mockRequests.at(-1).body,payload);
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='http://127.0.0.1:'+server.address().port;report.origin=origin;
  const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
  const teacherContext=await context(true);
  const teacher=await teacherContext.newPage();let libraryLoads=0;
  teacher.on('request',req=>{if(new URL(req.url()).pathname===vendorPath)libraryLoads++;});
  await loaded(teacher,true);
  assert.equal(await teacher.locator('#show-room-qr').isVisible(),true);
  assert.equal(libraryLoads,0);
  pass('Teacher button visible; QR library not requested before click');

  const studentContext=await context(false);
  const student=await studentContext.newPage();let studentLibraryLoads=0;
  student.on('request',req=>{if(new URL(req.url()).pathname===vendorPath)studentLibraryLoads++;});
  await loaded(student,false);
  assert.equal(await student.locator('#show-room-qr').isVisible(),false);
  assert.equal(await student.locator('#teacher-tools').isVisible(),false);
  assert.equal(studentLibraryLoads,0);
  pass('Student direct entry retains student view and has no QR button/library');

  for(const size of [{width:1280,height:800},{width:1920,height:1080},{width:768,height:1024},{width:390,height:844}]) {
    await teacher.setViewportSize(size);
    const header=await teacher.evaluate(()=>{
      const a=document.getElementById('show-room-qr'),b=document.getElementById('room-code');
      const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),as=getComputedStyle(a),bs=getComputedStyle(b);
      return {qr:{x:ar.x,y:ar.y,width:ar.width,height:ar.height},code:{x:br.x,y:br.y,width:br.width,height:br.height},gap:br.left-ar.right,buttonStyle:{border:as.border,borderRadius:as.borderRadius,fontSize:as.fontSize,background:as.backgroundColor},chipStyle:{border:bs.border,borderRadius:bs.borderRadius,fontSize:bs.fontSize,background:bs.backgroundColor},scrollWidth:document.documentElement.scrollWidth,innerWidth};
    });
    assert.ok(Math.abs(header.qr.height-header.code.height)<1,'Chip and button height mismatch');
    assert.ok(Math.abs(header.qr.y-header.code.y)<1,'Chip and button row mismatch');
    assert.ok(Math.abs(header.gap-10)<1,'QR/chip gap must be 10px');
    assert.deepEqual(header.buttonStyle,header.chipStyle);
    assert.ok(header.qr.x>=0 && header.code.x+header.code.width<=size.width,'Header controls outside viewport');
    assert.ok(header.scrollWidth<=size.width,'Horizontal overflow in header view');
    await screenshot(teacher,`QR-${size.width}-header.png`);
    await openQR(teacher);
    assert.equal(await teacher.locator('#room-qr-title').textContent(),state.name);
    assert.equal((await teacher.locator('#room-qr-code').textContent()).trim(),'코드 '+code);
    assert.equal(await teacher.locator('#room-qr-dialog').getByText('카메라로 찍으면 바로 들어와요',{exact:true}).count(),1);
    const card=await teacher.locator('.room-qr-card').boundingBox();
    assert.ok(card.x>=0 && card.y>=0 && card.x+card.width<=size.width+1 && card.y+card.height<=size.height+1,'Card must fit viewport '+size.width);
    const image=await teacher.locator('#room-qr-image svg').boundingBox();
    assert.ok(Math.abs(image.width-image.height)<1,'QR must remain square');
    assert.ok(image.width<=640+1);
    const noOverflow=await teacher.locator('.room-qr-card').evaluate(el=>el.scrollWidth<=el.clientWidth+1);
    assert.ok(noOverflow,'Card text must not overflow horizontally');
    await decodeVisibleQR(teacher,String(size.width));
    await screenshot(teacher,`QR-${size.width}-overlay.png`);
    await closeQR(teacher,'button');
    pass('Header design, card viewport fit, capture and decoded QR at '+size.width,{viewport:size,header,card,qr:image});
  }
  assert.equal(libraryLoads,1);pass('Same page loads local QR library once after repeated open/close');

  await teacher.setViewportSize({width:1280,height:800});
  await openQR(teacher);
  await closeQR(teacher,'outside');
  await openQR(teacher);
  await focusCard(teacher);
  const beforeCounter=await teacher.locator('#page-counter').textContent();
  for(const key of ['ArrowRight','ArrowLeft','Space','ArrowUp','ArrowDown','x'])await teacher.keyboard.press(key);
  assert.equal(await teacher.locator('#page-counter').textContent(),beforeCounter);
  assert.equal(await teacher.evaluate(()=>document.getElementById('room-qr-dialog').contains(document.activeElement)),true);
  await teacher.keyboard.press('Tab');
  assert.equal(await teacher.evaluate(()=>document.getElementById('room-qr-dialog').contains(document.activeElement)),true);
  await closeQR(teacher,'escape');
  pass('Outside click and Esc close; focus returns; modal traps focus and blocks lesson shortcuts');

  await teacher.locator('#next').click();assert.equal(await teacher.locator('#page-counter').textContent(),'2 / 6');
  await teacher.locator('#previous').click();assert.equal(await teacher.locator('#page-counter').textContent(),'1 / 6');
  await teacher.locator('#room-code').click();
  assert.equal(await teacher.evaluate(()=>navigator.clipboard.readText()),code);
  pass('Previous, next and room-code clipboard copy retain behavior');

  await clickAndRefresh(teacher,'page-lock',{page:1,open:false});
  await student.waitForFunction(()=>document.getElementById('page-counter').textContent==='2 / 6');
  assert.equal(await teacher.locator('#page-lock').textContent(),'현재 페이지 열기');
  await clickAndRefresh(teacher,'page-lock',{page:1,open:true});
  assert.equal(await teacher.locator('#page-lock').textContent(),'현재 페이지 잠그기');
  await clickAndRefresh(teacher,'lock-all',{lockAll:true});
  await student.waitForFunction(()=>document.getElementById('waiting').hidden===false);
  assert.equal(await student.locator('#page-counter').textContent(),'대기 중');
  assert.equal(await teacher.locator('#page-counter').textContent(),'1 / 6');
  await clickAndRefresh(teacher,'open-all',{maxPage:6});
  await student.waitForFunction(()=>document.getElementById('waiting').hidden===true);
  assert.deepEqual(state.openPages,[1,2,3,4,5,6]);
  pass('Existing page lock/open, lock all and open all update mock state and student view',report.mockRequests);

  for(let i=0;i<3;i++)await teacher.locator('#next').click();
  assert.equal(await teacher.locator('#page-counter').textContent(),'4 / 6');
  const gameFrame=teacher.frameLocator('#demo-game');
  await gameFrame.locator('body').waitFor();
  const game=teacher.frames().find(frame=>frame.url().endsWith('/original-game.html'));
  await game.evaluate(()=>{window.__qrTestMessages=[];window.addEventListener('message',event=>{if(event.data?.channel==='lounge-dino')window.__qrTestMessages.push(event.data);});});
  await openQR(teacher);
  await focusCard(teacher);
  for(const key of ['ArrowRight','ArrowLeft','Space','ArrowUp','ArrowDown','x'])await teacher.keyboard.press(key);
  assert.equal(await teacher.locator('#page-counter').textContent(),'4 / 6');
  assert.deepEqual(await game.evaluate(()=>window.__qrTestMessages),[]);
  await closeQR(teacher,'escape');
  pass('QR modal preserves active game lesson page while keyboard shortcuts are pressed');

  const retryContext=await context(true);
  let retryLoads=0;
  await retryContext.route('**'+vendorPath,route=>{retryLoads++;return retryLoads===1?route.abort('failed'):route.continue();});
  const retry=await retryContext.newPage();await loaded(retry,true);
  await retry.locator('#show-room-qr').click();
  await retry.waitForFunction(()=>document.getElementById('room-qr-dialog').open && !document.querySelector('#room-qr-image svg') && /실패|오류|다시|연결/.test(document.getElementById('room-qr-dialog').textContent));
  await closeQR(retry,'button');await openQR(retry);
  await decodeVisibleQR(retry,'library-retry');assert.equal(retryLoads,2);
  await closeQR(retry,'escape');
  pass('Local library load failure is recoverable by closing and reopening');

  const preview=await studentContext.newPage();await preview.goto(origin+'/lesson');
  assert.equal(await preview.locator('#show-room-qr').isVisible(),false);
  pass('Roomless preview has no teacher QR button');
  assert.deepEqual(report.blockedRequests,[]);assert.deepEqual(report.errors,[]);
  pass('No external network requests or uncaught browser errors');
})().catch(error=>{
  report.failure=error.stack || String(error);process.exitCode=1;console.error(report.failure);
}).finally(async()=>{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  report.passed=!report.failure;report.completedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,'검증.json'),JSON.stringify(report,null,2)+'\n','utf8');
  console.log('REPORT '+path.join(out,'검증.json'));
});
