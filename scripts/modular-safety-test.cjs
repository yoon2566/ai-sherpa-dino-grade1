/* Offline adversarial slot validation and exported-engine containment checks. */
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.resolve(__dirname,'../../../70_검수/node_modules/playwright'));
const base=path.resolve(__dirname,'../assets/practice/modular');
const html='<!doctype html><script src="/vendor/acorn.js"></script><script src="/safety.js"></script><script src="/project.js"></script>';
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'||pathname==='/csp'){if(pathname==='/csp')res.setHeader('Content-Security-Policy',"worker-src 'none'");res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  const file=path.resolve(base,'.'+pathname);
  if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
    const results=await page.evaluate(async()=>{
      const api=SherpaSlotSafety,project=SherpaProject,checks=[],details=[];
      const check=(name,condition)=>{if(!condition)throw Error(name);checks.push(name);};
      const hero="function drawHero(ctx,v){ctx.fillStyle='#247';ctx.fillRect(0,0,v.pose==='duck'?59:44,v.pose==='duck'?25:47);}";
      const body=source=>'function drawHero(ctx,v){'+source+'}';
      await project.init();
      const initial=project.createProject(),initialJson=JSON.stringify(initial);
      const cases=[
        ['syntax', 'function drawHero(ctx,v){'],['while',body('while(true){}')],['do',body('do{}while(true);')],
        ['document',body('document.body.remove();')],['fetch',body("fetch('/secret');")],['window',body('window.x=1;')],['parent',body("parent.postMessage('x','*');")],
        ['top',body('top.location=1;')],['storage',body("localStorage.setItem('a','b');")],['xhr',body('new XMLHttpRequest();')],['eval',body("eval('1');")],
        ['Function',body("Function('return 1')();")],['dynamic import',body("import('/a');")],['this',body('this.x=1;')],['timer',body('setTimeout(1,2);')],
        ['interval',body('setInterval(1,2);')],['animation',body('requestAnimationFrame(1);')],['global assignment',body('secret=1;')],
        ['multiple functions',hero+' function extra(){}'],['wrong name',hero.replace('drawHero','drawOther')],['wrong parameters',hero.replace('ctx,v','ctx,value')],
        ['parameter defaults',body('').replace('ctx,v','ctx,v={}')],['async',hero.replace('function','async function')],['generator',hero.replace('function','function*')],
        ['nested function',body('function helper(){}')],['arrow',body('const a=()=>1;')],['recursive call',body('drawHero(ctx,v);')],
        ['constructor escape',body("ctx.fillRect.constructor('return window')();")],['computed context',body("ctx['fillRect'](0,0,44,47);")],
        ['prototype',body('const a=ctx.__proto__;')],['context alias',body('const a=ctx;a.fillRect(0,0,44,47);')],['method alias',body('const a=ctx.fillRect;')],
        ['Math alias',body('const m=Math;')],['v mutation',body('v.t=0;')],['ctx canvas',body('const a=ctx.canvas;')],
        ['context stack',body('ctx.restore();')],['transform',body('ctx.scale(0,0);')],['clip',body('ctx.clip();')],
        ['dynamic bound',body('for(let i=0;i<v.t;i++){ctx.fillRect(0,0,44,47);}')],
        ['over bound',body('for(let i=0;i<201;i++){ctx.fillRect(0,0,44,47);}')],
        ['inclusive over bound',body('for(let i=0;i<=200;i++){ctx.fillRect(0,0,44,47);}')],
        ['counter mutation',body('for(let i=0;i<20;i++){i=0;}')],['counter update mutation',body('for(let i=0;i<20;i++){i--;}')],
        ['nested product',body('for(let i=0;i<200;i++){for(let j=0;j<200;j++){ctx.fillRect(0,0,44,47);}}')],
        ['array mutation',body('const colors=[1,2];colors[0]=3;')],['string expansion',body("let a='x';for(let i=0;i<200;i++){a=a+a;}")],
        ['Math overwrite',body('Math.sin=1;')],['oversize',hero+' '.repeat(6000)],['object escape',body('const a={constructor:1};')],
        ['getters',body('const a={get x(){return 1;}};')],['for-of',body('for(const x of [1,2]){}')],['for-in',body('for(const x in v){}')],
        ['try-catch',body('try{}catch(e){}')],['huge literal',body('ctx.fillRect(0,0,1e100,47);')],
        ['out-of-scope variable',body('if(v.t===0){const x=1;}ctx.fillRect(x,0,44,47);')]
      ];
      const good=await api.validate('hero',hero);check('normal drawing executes in Worker',good.ok&&good.execution==='worker');details.push({name:'normal',...good,code:undefined});
      let current=project.withSlot(initial,'hero',hero);const prior=JSON.stringify(current);
      check('slot installation preserves prior project',JSON.stringify(initial)===initialJson&&current.slots.hero.mode==='code');
      check('all hero poses remain inside their drawing contract',good.samples===15&&good.maximumOverflowRatio===0);
      const overflowing=body("ctx.fillStyle='#247';ctx.fillRect(0,0,44,47);");
      const overflow=await api.validate('hero',overflowing);
      check('duck body outside 59x25 is rejected',!overflow.ok&&overflow.error==='drawing-overflow');
      let overflowRejected=false;try{project.withSlot(current,'hero',overflowing);}catch{overflowRejected=true;}
      check('duck overflow preserves previously accepted hero',overflowRejected&&JSON.stringify(current)===prior);
      details.push({name:'duck-overflow',...overflow});
      const edgeStroke=body("const w=v.pose==='duck'?59:44;const h=v.pose==='duck'?25:47;ctx.fillStyle='#247';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#123';ctx.lineWidth=2;ctx.strokeRect(0,0,w,h);");
      const edged=await api.validate('hero',edgeStroke);
      check('small edge stroke spill remains within tolerance',edged.ok&&edged.maximumOverflowRatio>0&&edged.maximumOverflowRatio<=.15);
      for(const [name,code] of cases){const result=await api.validate('hero',code);check('reject '+name,!result.ok);let rejected=false;try{project.withSlot(current,'hero',code);}catch{rejected=true;}check('keep previous after '+name,rejected&&JSON.stringify(current)===prior);}
      for(const [name,code] of [['empty',body('')],['transparent',body('ctx.globalAlpha=0;ctx.fillRect(0,0,44,47);')],['offcanvas',body('ctx.fillRect(900,900,10,10);')],['pose-specific blank',body("if(v.pose!=='duck')ctx.fillRect(0,0,44,47);")],['runtime exception',body('ctx.arc(4,4,-1,0,6);')]]){
        const result=await api.validate('hero',code);check('runtime reject '+name,!result.ok);details.push({name,...result});
        let rejected=false;try{project.withSlot(current,'hero',code);}catch{rejected=true;}check('runtime preserves prior '+name,rejected&&JSON.stringify(current)===prior);
      }
      const gradient="function drawBackground(ctx,v){const g=ctx.createLinearGradient(0,0,0,v.h);g.addColorStop(0,'#29a');g.addColorStop(1,'#fff');ctx.fillStyle=g;ctx.fillRect(0,0,v.w,v.h);}";
      const array="function drawItem(ctx,v){const c=['#f00','#00f'];for(let i=0;i<2;i++){ctx.fillStyle=c[i];ctx.fillRect(i*8,0,8,16);}}";
      check('gradient supported',(await api.validate('background',gradient)).ok);
      check('bounded loop and literal palette supported',(await api.validate('item',array)).ok);
      check('arc direction boolean supported',(await api.validate('item','function drawItem(ctx,v){ctx.beginPath();ctx.arc(8,8,7,0,Math.PI*2,false);ctx.fill();}')).ok);
      check('separate branch variables preserve lexical scope',(await api.validate('hero',body("if(v.pose==='duck'){const x=0;ctx.fillRect(x,0,59,25);}else{const x=0;ctx.fillRect(x,0,44,47);}"))).ok);
      const untested=hero.replace("'#247'","'#123'");let refused=false;try{project.withSlot(current,'hero',untested);}catch{refused=true;}check('static alone cannot install untested source',refused);
      const rounded=await api.validate('obstacle',"function drawObstacle(ctx,v){ctx.fillStyle='#a54';ctx.beginPath();ctx.ellipse(v.w/2,v.h/2,v.w/2,v.h/2,0,0,Math.PI*2);ctx.fill();}");
      check('round obstacle draws',rounded.ok);current=project.withSlot(current,'obstacle',rounded.code,{sizeScale:1.3,shape:'round'});
      check('validated style preserved',current.slots.obstacle.style.shape==='round'&&current.slots.obstacle.style.sizeScale===1.3);
      const serialized=project.buildGameHtml(current);check('offline HTML embeds compiled slots without parser or eval',serialized.includes('window.SherpaCustomSlots')&&!serialized.includes('new Function(')&&!serialized.includes('vendor/acorn'));
      check('metadata roundtrip supports validated source',project.inspectHtml(serialized).project.slots.hero.code===hero);
      const w=window.Worker;let terminated=false;
      window.Worker=class{constructor(){setTimeout(()=>this.onmessage?.({data:{ready:true}}),0);}postMessage(){}terminate(){terminated=true;}};
      const started=performance.now(),timeout=await api.validate('hero',hero);window.Worker=w;
      check('execution deadline terminates stalled worker',!timeout.ok&&timeout.error==='timeout'&&terminated&&performance.now()-started<1200);details.push({name:'timeout',...timeout});
      const delayed=body("if(v.t>2000)ctx.arc(0,0,-1,0,1);ctx.fillStyle='#247';ctx.fillRect(0,0,v.pose==='duck'?59:44,v.pose==='duck'?25:47);");
      check('later-frame failure fixture passes initial samples',(await api.validate('hero',delayed)).ok);
      const delayedHtml=project.buildGameHtml(project.withSlot(current,'hero',delayed));
      return {passed:checks.length,checks,details,exported:serialized,delayed:delayedHtml};
    });
    const exported=results.exported,delayed=results.delayed;delete results.exported;delete results.delayed;
    const frame=await browser.newPage();await frame.setContent(exported.replace('<head>','<head><script>window.__SHERPA_TEST__=true</script>'));
    await frame.waitForFunction(()=>window.__sherpaTest);
    const runtime=await frame.evaluate(()=>{const api=window.__sherpaTest;api.restart();return api.fixture({obstacles:[{kind:'shard',x:200}]});});
    if(runtime.obstacleBoxes[0].length!==8)throw Error('round collision bands absent');
    results.checks.push('offline compiled functions run and round collision follows scale');results.passed++;
    await frame.setContent(delayed.replace('<head>','<head><script>window.__SHERPA_TEST__=true</script>'));
    await frame.waitForFunction(()=>window.__sherpaTest);
    const guarded=await frame.evaluate(()=>{const api=window.__sherpaTest;api.restart();api.step(180);api.step(0);api.step(0);api.step(0);return api.snapshot();});
    if(guarded.slotErrors.drawHero!==3||guarded.disabledSlots.length!==1||guarded.disabledSlots[0]!=='drawHero'||guarded.slotErrors.drawObstacle)throw Error('consecutive-error slot-only fallback failed: '+JSON.stringify(guarded.slotErrors));
    results.checks.push('three later frame failures disable only the failing hero and engine stays responsive');results.passed++;
    await page.goto('http://127.0.0.1:'+server.address().port+'/csp');
    const fallback=await page.evaluate(async()=>({good:await SherpaSlotSafety.validate('item',"function drawItem(ctx,v){ctx.fillStyle='#f00';ctx.fillRect(0,0,16,16);}"),bad:await SherpaSlotSafety.validate('item','function drawItem(ctx,v){}'),overflow:await SherpaSlotSafety.validate('hero','function drawHero(ctx,v){ctx.fillRect(0,0,44,47);}')}));
    if(!fallback.good.ok||fallback.good.execution!=='fallback'||fallback.bad.ok||fallback.overflow.ok||fallback.overflow.error!=='drawing-overflow')throw Error('CSP fallback visibility validation failed');
    results.checks.push('CSP blocked worker uses bounded fallback and still rejects empty drawing');results.passed++;results.fallback=fallback;
    results.checks.push('CSP fallback also rejects overflowing duck artwork');results.passed++;
    const out=process.env.MODULAR_CAPTURE_DIR||path.resolve(__dirname,'../../../85_공룡3_모듈화/2차캡처');fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'safety-results.json'),JSON.stringify(results,null,2)+'\n');
    console.log('PASS modular safety: '+results.passed+' checks');
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
