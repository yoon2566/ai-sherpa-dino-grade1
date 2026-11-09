/* Phase-4 raster, safety, metadata, and real exported-engine regression tests. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
const dir=path.resolve(__dirname,'../assets/practice/modular');
const out=process.env.MODULAR_CAPTURE_DIR||path.resolve(__dirname,'../../../85_공룡3_모듈화/4차캡처');
const html='<!doctype html><script src="/vendor/acorn.js"></script><script src="/safety.js"></script><script src="/pixel.js"></script><script src="/code-bitmap.js"></script><script src="/project.js"></script>';
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'||url.pathname==='/csp'){if(url.pathname==='/csp')res.setHeader('Content-Security-Policy',"worker-src 'none'");res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  const file=path.resolve(dir,'.'+url.pathname);if(!file.startsWith(dir+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const context=await browser.newContext({viewport:{width:768,height:1024}});
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
    const results=await page.evaluate(async()=>{
      const checks=[],check=(name,condition)=>{if(!condition)throw Error(name);checks.push(name);},rejects=fn=>{try{fn();return false;}catch{return true;}};
      const api=SherpaCodeBitmap,project=SherpaProject;await project.init();
      const heroCode="function drawHero(ctx,v){ctx.fillStyle='#123456';ctx.fillRect(0,0,v.pose==='duck'?59:44,v.pose==='duck'?25:47);}";
      const obstacleCode="function drawObstacle(ctx,v){ctx.fillStyle='#654321';ctx.fillRect(2,2,v.w-4,v.h-10);}";
      const itemCode="function drawItem(ctx,v){ctx.fillStyle='#ff3355';ctx.fillRect(0,0,16,16);}";
      const hero=await api.render('hero',heroCode),obstacle=await api.render('obstacle',obstacleCode),item=await api.render('item',itemCode);
      check('hero code uses existing isolated safety and 44x47 stand raster',hero.ok&&hero.execution==='worker'&&hero.width===44&&hero.height===47&&hero.painted===2068);
      check('obstacle raster occupies bottom row',obstacle.ok&&obstacle.pixel.pixels[46].includes('0')&&obstacle.pixel.pixels[0]==='.'.repeat(44));
      check('item keeps 16x16 code contract and fills 24x24 bitmap',item.ok&&item.width===24&&item.height===24&&item.painted===576);
      check('render does not broaden static safety',!(await api.render('hero','function drawHero(ctx,v){while(true){}}')).ok);
      check('render retains all-pose duck overflow rejection',!(await api.render('hero','function drawHero(ctx,v){ctx.fillRect(0,0,44,47);}')).ok);
      check('render refuses empty code drawing',!(await api.render('item','function drawItem(ctx,v){}')).ok);
      const raster=(slot,cells)=>{const [w,h]=api.sizes[slot],rgba=Array(w*h*4).fill(0);for(const [index,color=[20,30,40],alpha=255] of cells){rgba.splice(index*4,4,...color,alpha);}return api.fromRgba(slot,rgba,w,h);};
      const cells=n=>Array.from({length:n},(_,i)=>[i]);
      for(const slot of ['hero','obstacle']){
        check(slot+' exact 25 percent opaque boundary accepted',raster(slot,cells(517)).ok);
        check(slot+' below 25 percent opaque boundary rejected',!raster(slot,cells(516)).ok);
      }
      check('item 115 cells below 20 percent rejected',!raster('item',cells(115)).ok);
      check('item 116 cells above 20 percent accepted',raster('item',cells(116)).ok);
      const body=Array.from({length:20*30},(_,i)=>[Math.floor(i/20)*44+i%20]);
      for(const slot of ['hero','obstacle']){
        const removed=raster(slot,[...body,[2064],[2065],[2066]]);
        check(slot+' three-cell fragment removed without redrawing main body',removed.ok&&removed.removedSmallCells===3&&removed.painted===600);
      }
      const disconnected=[...body,...Array.from({length:10*20},(_,i)=>[Math.floor(i/10)*44+30+i%10])];
      const fragmented=raster('hero',disconnected);
      check('large detached body below 80 percent is rejected rather than discarded',!fragmented.ok&&fragmented.painted===800&&fragmented.connectedRatio===.75);
      const at80=raster('hero',[...body,...Array.from({length:10*15},(_,i)=>[Math.floor(i/10)*44+30+i%10])]);
      check('exact 80 percent connected boundary is accepted',at80.ok&&at80.connectedRatio===.8);
      const varied=raster('hero',Array.from({length:2068},(_,i)=>[i,[i%256,(i*7)%256,(i*13)%256]]));
      check('colour reduction merges many shades into at most twelve colours',varied.ok&&varied.pixel.palette.length<=12&&varied.painted===2068);
      check('transparent alpha fringe does not inflate coverage',!raster('hero',Array.from({length:2068},(_,i)=>[i,[20,30,40],127])).ok);
      check('wrong bitmap dimensions are refused',!api.fromRgba('hero',Array(16*16*4).fill(255),16,16).ok);
      const initial=project.createProject(),before=JSON.stringify(initial);
      let game=project.withPixel(initial,'hero',hero.pixel,{code:heroCode});
      game=project.withPixel(game,'obstacle',obstacle.pixel,{code:obstacleCode,style:{sizeScale:1.2,shape:'rect'}});
      game=project.withPixel(game,'item',item.pixel,{code:itemCode});game=project.withConfig(game,{itemsEnabled:true,initialLives:5,abilityId:'shrink'});
      check('source retained separately while all three slots execute pixels',game.slots.hero.mode==='pixel'&&game.slots.hero.code===heroCode&&game.slots.obstacle.code===obstacleCode&&game.slots.item.code===itemCode);
      check('pixel proposal never mutates original project',JSON.stringify(initial)===before);
      const saved=project.buildGameHtml(game),restored=project.inspectHtml(saved);
      check('high-resolution bitmaps and source survive single HTML metadata roundtrip',restored.kind==='modular'&&JSON.stringify(restored.project)===JSON.stringify(game));
      check('pixel source does not get compiled into engine execution',!saved.includes('window.SherpaCustomSlots='));
      check('hand edit preserves previous source by default',project.withPixel(game,'hero',hero.pixel).slots.hero.code===heroCode);
      check('new direct artwork clears prior source explicitly',!project.withPixel(game,'hero',hero.pixel,{code:null}).slots.hero.code);
      check('unvalidated new source cannot be smuggled with a bitmap',rejects(()=>project.withPixel(game,'hero',hero.pixel,{code:heroCode.replace('#123456','#123455')})));
      const malicious=JSON.parse(JSON.stringify(game));malicious.slots.hero.code='function drawHero(ctx,v){document.body.remove();}';
      check('saved pixel metadata still rejects unsafe source',rejects(()=>project.buildGameHtml(malicious)));
      const allColors={palette:Array.from({length:21},(_,i)=>'#'+i.toString(16).padStart(6,'0')),pixels:Array.from({length:47},(_,y)=>y===0?'k'+'.'.repeat(43):'.'.repeat(44))};
      check('twelve AI plus nine editor colors survive normalization',project.withPixel(initial,'hero',allColors).assets.pixel.palette.length===21);
      const legacy={palette:['#abcdef'],pixels:Array(16).fill('0'.repeat(16))};
      for(const version of [2,3]){const old=project.createProject();old.authoringVersion=version;const roundtrip=project.inspectHtml(project.buildGameHtml(project.withPixel(old,'hero',legacy)));check('authoring '+version+' 16x16 remains replayable and editable',roundtrip.project.authoringVersion===version&&roundtrip.project.assets.pixel.pixels.length===16);}
      const nativeWorker=window.Worker;let terminated=false;
      window.Worker=class{constructor(){setTimeout(()=>this.onmessage?.({data:{ready:true}}),0);}postMessage(){}terminate(){terminated=true;}};
      const started=performance.now(),timeout=await api.render('hero',heroCode);window.Worker=nativeWorker;
      check('stalled code validation terminates within deadline',!timeout.ok&&timeout.error==='timeout'&&terminated&&performance.now()-started<1200);
      return {passed:checks.length,checks,game,saved};
    });
    const saved=results.saved;delete results.saved;delete results.game;
    const game=await context.newPage();await game.setContent(saved.replace('<head>','<head><script>window.__SHERPA_TEST__=true;</script>'));await game.waitForFunction(()=>window.__sherpaTest);
    const engine=await game.evaluate(()=>{
      const api=window.__sherpaTest,checks=[],check=(name,condition)=>{if(!condition)throw Error(name);checks.push(name);};
      api.restart();const standing=api.snapshot();api.down();const duck=api.snapshot();
      check('44x47 hero has compact collision rows without dropping occupied cells',standing.heroBoxes.length===47&&standing.heroBoxes.every(b=>b[2]===44));
      check('44x47 hero duck compresses collision with picture',Math.abs(duck.heroBoxes[0][2]/standing.heroBoxes[0][2]-59/44)<1e-9&&Math.abs(duck.heroBoxes[0][3]/standing.heroBoxes[0][3]-25/47)<1e-9);
      api.up();const full=api.fixture({obstacles:[{kind:'crag',x:200}]});api.activate();const small=api.snapshot();
      const bottom=s=>Math.max(...s.obstacleBoxes[0].map(b=>b[1]+b[3]));
      check('44x47 obstacle shrinks at the same grounded bottom',Math.abs(bottom(full)-bottom(small))<1e-9&&Math.abs(bottom(full)-140)<1e-9&&small.obstacleBoxes[0][0][2]===full.obstacleBoxes[0][0][2]/2);
      api.fixture({runningMs:4000,speed:0,obstacles:[{kind:'crag',x:30}],elapsed:9000});const hit=api.step();
      check('44x47 occupied obstacle cells damage hero',hit.lives===4);
      api.restart();api.fixture({runningMs:4000,speed:0,collectibles:[{x:30,y:100}],obstacles:[]});const picked=api.step();
      check('24x24 gift is collected by fixed item collision',picked.itemCount===1);
      const ctx=document.getElementById('game').getContext('2d'),data=ctx.getImageData(0,0,80,40).data;let red=0;for(let i=0;i<data.length;i+=4)if(data[i]>220&&data[i+1]<90&&data[i+2]>60&&data[i+2]<130)red++;
      check('24x24 gift miniature appears in HUD',red>20);
      return {checks,passed:checks.length};
    });results.checks.push(...engine.checks);results.passed+=engine.passed;
    await page.goto('http://127.0.0.1:'+server.address().port+'/csp');
    const fallback=await page.evaluate(()=>SherpaCodeBitmap.render('item',"function drawItem(ctx,v){ctx.fillStyle='#ff3355';ctx.fillRect(0,0,16,16);}"));
    if(!fallback.ok||fallback.execution!=='fallback'||fallback.painted!==576)throw Error('CSP fallback bitmap failed');results.checks.push('CSP blocked Worker uses checked bounded raster fallback');results.passed++;
    fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'code-bitmap-contract.json'),JSON.stringify(results,null,2)+'\n');
    console.log('PASS phase-4 code bitmap: '+results.passed+' checks');
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
