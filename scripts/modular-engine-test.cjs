/* Local deterministic checks of real engine rendering, input and simulation. No service calls. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(path.resolve(__dirname, '../../../70_검수/node_modules/playwright'));
const dir = path.resolve(__dirname, '../assets/practice/modular');
const output = process.env.MODULAR_CAPTURE_DIR || path.resolve(__dirname, '../../../85_공룡3_모듈화/3차캡처');
fs.mkdirSync(output, {recursive:true});
const results = {checks:[], measurements:{}, screenshots:[], requests:[]};
const check = (name, fn) => {fn();results.checks.push(name);};
const audioStub = `window.__audioEvents=[];window.AudioContext=class {constructor(){this.state='running';this.currentTime=0;this.sampleRate=44100;this.destination={};}resume(){return Promise.resolve();}createOscillator(){const e={kind:'tone',frequencies:[]};window.__audioEvents.push(e);return {type:'',frequency:{setValueAtTime(v,t){e.frequencies.push([v,t]);},exponentialRampToValueAtTime(v,t){e.frequencies.push([v,t]);}},connect(){},start(t){e.start=t;},stop(t){e.stop=t;}};}createGain(){const e={kind:'gain',values:[]};window.__audioEvents.push(e);return {gain:{setValueAtTime(v,t){e.values.push([v,t]);},exponentialRampToValueAtTime(v,t){e.values.push([v,t]);}},connect(){}};}createBuffer(c,n){return {getChannelData(){return new Float32Array(n);}};}createBufferSource(){const e={kind:'noise'};window.__audioEvents.push(e);return {connect(){},start(t){e.start=t;},stop(t){e.stop=t;}};}createBiquadFilter(){return {frequency:{value:0},connect(){}};}};`;
const baseProject = () => ({formatVersion:2,engineVersion:'1.0.0',config:{speedMultiplier:1,initialLives:1,itemsEnabled:false,itemName:'별',abilityId:'',soundPreset:'default',muted:false},slots:{hero:{mode:'default'},background:{mode:'default'},obstacle:{mode:'default',style:{sizeScale:1,shape:'rect'}},item:{mode:'default'}},assets:{pixel:null}});
function game(config={}, pixels=null, audio=false, artwork={}) {
  const p=baseProject();Object.assign(p.config,config);if(pixels){p.slots.hero.mode='pixel';p.assets.pixel=pixels;}
  for(const name of ['hero','obstacle','item'])if(artwork[name]){p.slots[name].mode='pixel';p.assets[name==='hero'?'pixel':name]=artwork[name];}
  if(artwork.sizeScale)p.slots.obstacle.style.sizeScale=artwork.sizeScale;
  const metadata=JSON.stringify(p).replace(/</g,'\\u003c');
  return fs.readFileSync(path.join(dir,'shell.html'),'utf8').replace('<!-- SHERPA_GAME_BUNDLE -->',
    '<script>window.__SHERPA_TEST__=true;let seed=87439;Math.random=()=>((seed=(seed*16807)%2147483647)-1)/2147483646;'+(audio?audioStub:'')+'</script>'+
    '<script type="application/json" id="sherpa-project">'+metadata+'</script>'+
    '<script>'+fs.readFileSync(path.join(dir,'defaults.js'),'utf8')+'</script>'+
    '<script>'+fs.readFileSync(path.join(dir,'engine.js'),'utf8')+'</script>');
}
async function main(){
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({viewport:{width:768,height:1024}});
    await context.route('**/*',route=>{results.requests.push(route.request().url());route.abort();});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    async function load(config={},pixels=null,audio=false,artwork={}){await page.goto('about:blank');await page.setContent(game(config,pixels,audio,artwork));await page.waitForFunction(()=>!!window.__sherpaTest);await page.evaluate(()=>window.__sherpaTest.restart());}
    const call=(method,arg)=>page.evaluate(({method,arg})=>window.__sherpaTest[method](arg),{method,arg});
    const shot=async name=>{await page.screenshot({path:path.join(output,name)});results.screenshots.push(name);};
    const apex=()=>page.evaluate(()=>{const t=window.__sherpaTest;t.jump();let min=93,minVisual=Infinity,n=0;do{const s=t.step();min=Math.min(min,s.player.y);minVisual=Math.min(minVisual,s.heroBounds.y+s.headroom);if(++n>100)throw Error('jump did not land');}while(t.snapshot().player.air);return {height:93-min,minVisual,frames:n};});

    const jumps=[];
    for(const speedMultiplier of [.5,.7,.9,1,1.5,2,2.5]){await load({speedMultiplier});jumps.push({speedMultiplier,...await apex()});}
    check('속도 0.5·0.7·0.9·1·1.5·2·2.5배의 점프 높이/체공 프레임 동일',()=>{assert.equal(new Set(jumps.map(x=>x.height)).size,1);assert.equal(new Set(jumps.map(x=>x.frames)).size,1);});
    results.measurements.jumps=jumps;
    for(const initialLives of [1,5,9]){
      await load({initialLives});await call('fixture',{runningMs:4000,speed:0,obstacles:[{kind:'shard',x:32}]});const first=await call('step',1);
      check('목숨 '+initialLives+'개 충돌당 1 차감',()=>assert.equal(first.lives,initialLives-1));
      if(initialLives===1)check('목숨 0에서 종료',()=>assert.equal(first.phase,'crashed'));
      else {const protectedState=await call('step',60);check('목숨 '+initialLives+'개 피격 후 1초 중복 차감 방지',()=>assert.equal(protectedState.lives,initialLives-1));const expired=await call('step',14);check('목숨 '+initialLives+'개 1.2초 보호 만료 후 차감',()=>assert.equal(expired.lives,initialLives-2));}
      await call('restart');const reset=await call('snapshot');check('목숨 '+initialLives+'개 재시작 초기화',()=>{assert.equal(reset.lives,initialLives);assert.equal(reset.protectedUntil,0);});
    }
    await load({abilityId:'double'});await call('jump');await call('step',5);await call('jump');const second=await call('snapshot');await call('step',3);const beforeThird=await call('snapshot');await call('jump');const third=await call('snapshot');
    check('두 번 점프: 2회 허용·3회 거부',()=>{assert.equal(second.player.v,-10.6);assert.equal(third.player.v,beforeThird.player.v);});
    await call('step',80);await call('jump');const recharged=await call('snapshot');check('두 번 점프: 착지 후 재충전',()=>{assert.equal(recharged.abilityState,'auto');assert.equal(recharged.player.air,true);assert.equal(recharged.player.v,-10.6);});
    await load({abilityId:'high'});const high=await apex();check('높이 점프 정확히 1.5배·위쪽 잘림 없음',()=>{assert.equal(high.height,jumps[0].height*1.5);assert(high.minVisual>=0);});results.measurements.high=high;
    await call('restart');await call('jump');await call('step',12);await shot('엔진_높이점프_768x1024.png');
    for(const abilityId of ['invincible','giant','shield','shrink']){
      await load({abilityId});await call('activate');const active=await call('snapshot');check(abilityId+' 활성 5초·재사용 대기 5초 설정',()=>{assert.equal(active.abilityUntil-active.elapsed,5000);assert.equal(active.readyAt-active.abilityUntil,5000);assert.equal(active.abilityState,'active');});
      await call('fixture',{elapsed:5001});const cooldown=await call('snapshot');check(abilityId+' 5초 뒤 cooldown',()=>assert.equal(cooldown.abilityState,'cooldown'));
      await call('activate');assert.equal((await call('snapshot')).abilityState,'cooldown');await call('fixture',{elapsed:10001});assert.equal((await call('snapshot')).abilityState,'ready');await call('activate');assert.equal((await call('snapshot')).abilityState,'active');
    }
    await load({abilityId:'invincible'});await call('activate');await call('fixture',{runningMs:4000,speed:0,obstacles:[{kind:'shard',x:32}]});const invincible=await call('step');check('무적 장애물 통과',()=>assert.equal(invincible.lives,1));
    await load({abilityId:'shield',initialLives:5});await call('activate');await call('fixture',{runningMs:4000,speed:0,obstacles:[{kind:'shard',x:32}]});const blocked=await call('step');check('보호막 한 장애물 차단·즉시 cooldown',()=>{assert.equal(blocked.lives,5);assert.equal(blocked.abilityState,'cooldown');});assert.equal((await call('step',10)).lives,5);await call('fixture',{obstacles:[{kind:'shard',x:32}]});assert.equal((await call('step')).lives,4);
    await load({abilityId:'giant'});await call('activate');const giant=await call('snapshot');check('커지기 그림/충돌 두 배',()=>{assert.equal(giant.heroBounds.w,88);assert.equal(giant.heroBounds.h,94);assert.equal(giant.heroBoxes[0][2],34);});await call('fixture',{runningMs:4000,speed:0,obstacles:[{kind:'crag',x:40}]});const crushed=await call('step');check('커지기 장애물 파괴·목숨 유지',()=>{assert.equal(crushed.lives,1);assert(!crushed.obstacles.some(o=>o.x===40));});
    await load({abilityId:'shrink'});await call('fixture',{obstacles:[{kind:'crag',x:200}]});const full=await call('snapshot');await call('activate');const small=await call('snapshot');check('장애물 축소: 바닥 140 고정·그림/충돌 모두 절반',()=>{assert.equal(small.obstacleBounds[0].y+small.obstacleBounds[0].h,140);assert.equal(small.obstacleBounds[0].h,full.obstacleBounds[0].h/2);assert.equal(small.obstacleBoxes[0][0][2],full.obstacleBoxes[0][0][2]/2);});await call('step');await shot('엔진_장애물작아지기_바닥.png');
    await load({abilityId:'magnet',itemsEnabled:true});await call('fixture',{speed:0,collectibles:[{x:145,y:117}]});const near=await call('step');check('자석 120px 안 접근',()=>assert(near.collectibles[0].x<145));await call('fixture',{collectibles:[{x:250,y:117}]});const far=await call('step');check('자석 120px 밖 유지',()=>assert.equal(far.collectibles[0].x,250));await call('fixture',{collectibles:[{x:55,y:117}]});const picked=await call('step',12);check('선물 수집 1회·보너스 유지',()=>{assert.equal(picked.itemCount,1);assert.equal(picked.itemBonus,10);assert.equal(picked.score,picked.distanceScore+10);});assert.equal((await call('step',30)).itemCount,1);await call('restart');assert.equal((await call('snapshot')).itemBonus,0);

    const corners='1'+'0'.repeat(254)+'1';await load({abilityId:'shrink',initialLives:5},corners);await call('activate');await call('fixture',{runningMs:4000,speed:0,obstacles:[{kind:'shard',x:42,y:85}]});const gap=await call('step');check('픽셀 마스크: 투명 영역 충돌 제외 (축소 능력 조합)',()=>{assert.equal(gap.heroBoxes.length,2);assert.equal(gap.lives,5);});await call('fixture',{obstacles:[{kind:'shard',x:62,y:105}]});const pixelHit=await call('step');check('픽셀 마스크: 색칠한 영역 충돌 (축소 능력 조합)',()=>assert.equal(pixelHit.lives,4));await shot('엔진_픽셀_축소_충돌.png');
    const ring={palette:['#e415a9'],pixels:Array.from({length:16},(_,y)=>y===0||y===15?'0'.repeat(16):'0'+'.'.repeat(14)+'0')};
    const gift={palette:['#f01234'],pixels:Array.from({length:16},(_,y)=>y<4||y>11?'.'.repeat(16):'.'.repeat(4)+'0'.repeat(8)+'.'.repeat(4))};
    const filled={palette:['#2088ee'],pixels:Array(16).fill('0'.repeat(16))};
    for(const kind of ['shard','crag','drifter']){
      await load({abilityId:'shrink'},null,false,{obstacle:ring,sizeScale:1.3});
      const full=await call('fixture',{obstacles:[{kind,x:200,count:2}]});
      const maxBottom=boxes=>Math.max(...boxes.map(b=>b[1]+b[3]));
      check('픽셀 '+kind+' 묶음: 2개 그림 마스크·비율·바닥 정렬',()=>{assert.equal(full.obstacleBoxes[0].length,120);assert.equal(full.obstacleBoxes[0][0][2],full.obstacleBoxes[0][0][3]);assert(Math.abs(maxBottom(full.obstacleBoxes[0])-(full.obstacleBounds[0].y+full.obstacleBounds[0].h))<1e-9);});
      await call('activate');const shrunk=await call('snapshot');
      check('픽셀 '+kind+' 축소: 동일 바닥·크기 배율·충돌 절반',()=>{assert(Math.abs(maxBottom(shrunk.obstacleBoxes[0])-maxBottom(full.obstacleBoxes[0]))<1e-9);assert.equal(shrunk.obstacleBoxes[0][0][2],full.obstacleBoxes[0][0][2]/2);assert.equal(shrunk.obstacleBoxes[0][0][3],full.obstacleBoxes[0][0][3]/2);});
      await call('step');await shot('엔진_3차픽셀_'+kind+'_바닥.png');
    }
    await load({initialLives:5},corners,false,{obstacle:ring});await call('fixture',{runningMs:4000,speed:0,player:{x:170,y:88},obstacles:[{kind:'shard',x:200}]});
    const hollowPass=await call('step');check('픽셀 장애물 투명 구멍은 충돌하지 않음',()=>assert.equal(hollowPass.lives,5));
    await call('fixture',{player:{x:174,y:88}});const solidHit=await call('step');
    check('픽셀 장애물 칠한 외곽선은 충돌·목숨 1 차감',()=>assert.equal(solidHit.lives,4));
    await load({},null,false,{hero:filled});const standing=await call('snapshot');await call('down');const ducked=await call('snapshot');
    check('AI 픽셀 캐릭터 숙이기: 가로 확장·세로 납작·동일 색칠 충돌',()=>{assert.equal(ducked.heroBoxes.length,256);assert(Math.abs(ducked.heroBoxes[0][2]/standing.heroBoxes[0][2]-59/44)<1e-9);assert(Math.abs(ducked.heroBoxes[0][3]/standing.heroBoxes[0][3]-25/47)<1e-9);});
    const tallObstacle={palette:['#e415a9'],pixels:Array(16).fill('.....000000.....')};
    await load({abilityId:'high',initialLives:5},null,false,{hero:filled,obstacle:tallObstacle,sizeScale:.81});
    const fractional=await call('fixture',{runningMs:4000,speed:0,player:{x:190,y:52.5,air:false},obstacles:[{kind:'crag',x:200}]});
    const edgeCollision=await call('step');
    check('높이 점프 소수좌표: 실제 픽셀의 0.5px 경계 충돌을 빠른 검사에서 보존',()=>{
      const oldBottom=fractional.heroBounds.y+fractional.heroBounds.h,actualBottom=Math.max(...fractional.heroBoxes.map(b=>b[1]+b[3])),obstacleTop=Math.min(...fractional.obstacleBoxes[0].map(b=>b[1]));
      assert(Math.abs(oldBottom-99.5)<1e-9);assert(Math.abs(actualBottom-100)<1e-9);assert(Math.abs(obstacleTop-99.5)<1e-9);assert.equal(edgeCollision.lives,4);
    });
    await load({itemsEnabled:true,abilityId:'magnet'},null,false,{item:gift});await call('fixture',{speed:0,collectibles:[{x:300,y:70}]});
    const giftRender=await page.evaluate(()=>{const c=document.getElementById('game').getContext('2d');return {game:[...c.getImageData(306,76,1,1).data],hud:[...c.getImageData(16,33,1,1).data]};});
    check('선물 16×16 원본과 상단 축소 아이콘에 같은 AI 색',()=>{assert.deepEqual(giftRender.game,[240,18,52,255]);assert.deepEqual(giftRender.hud,[240,18,52,255]);});await shot('엔진_3차선물_아이콘.png');
    await call('fixture',{collectibles:[{x:55,y:117}]});const pixelPicked=await call('step',12);
    check('픽셀 선물 수집은 기존16×16 판정·1회점수',()=>{assert.equal(pixelPicked.itemCount,1);assert.equal(pixelPicked.itemBonus,10);assert.equal(pixelPicked.collectibles.length,0);});
    results.measurements.headroom=[];
    for(const viewport of [{width:1024,height:768},{width:768,height:1024},{width:320,height:180}]){
      await page.setViewportSize(viewport);
      for(const abilityId of ['high','giant','double']){
        await load({abilityId});await call('activate');const trajectory=await page.evaluate(()=>{const t=window.__sherpaTest;t.jump();let min=Infinity;for(let i=0;i<80;i++){if(i===12&&t.snapshot().headroom===120)t.jump();const s=t.step();min=Math.min(min,s.heroBounds.y+s.headroom);}const c=document.querySelector('canvas').getBoundingClientRect();return {min,bounds:{x:c.x,y:c.y,width:c.width,height:c.height},innerWidth,innerHeight};});
        check(abilityId+' '+viewport.width+'×'+viewport.height+' 캔버스와 주인공 잘림 없음',()=>{assert(trajectory.min>=0);assert(trajectory.bounds.x>=0);assert(trajectory.bounds.y>=0);assert(trajectory.bounds.x+trajectory.bounds.width<=trajectory.innerWidth+.01);assert(trajectory.bounds.y+trajectory.bounds.height<=trajectory.innerHeight+.01);});results.measurements.headroom.push({abilityId,viewport,...trajectory});
      }
    }
    await page.setViewportSize({width:768,height:1024});await load({itemsEnabled:true});await call('fixture',{player:{x:-1000}});
    const spawning=await page.evaluate(()=>{const t=window.__sherpaTest;let generatedItems=0,generatedObstacles=0,overlaps=0,previous=t.snapshot();const touch=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;for(let i=0;i<6000;i++){const s=t.step();for(const gift of s.collectibles){if(gift.x> s.worldW&& !previous.collectibles.some(g=>Math.abs(g.x-gift.x-s.speed)<3)){generatedItems++;if(s.obstacleBounds.some(o=>touch(gift,o)))overlaps++;}}for(const o of s.obstacleBounds)if(o.x>s.worldW&&!previous.obstacleBounds.some(old=>Math.abs(old.x-o.x-s.speed)<3)){generatedObstacles++;if(s.collectibles.some(g=>touch(o,g)))overlaps++;}previous=s;}return {generatedItems,generatedObstacles,overlaps};});check('100초 생성 시험: 새 선물/장애물 겹침 없음',()=>{assert(spawning.generatedItems>5);assert(spawning.generatedObstacles>5);assert.equal(spawning.overlaps,0);});results.measurements.spawning=spawning;
    const presets=['뿅!','띠링!','삐용!','통통!','슝!','뽀글!','삑삑!','톡톡!','반짝!'];results.measurements.sounds=[];
    for(const soundPreset of presets){await load({soundPreset,abilityId:'double'},null,true);await call('jump');const sound=await page.evaluate(()=>window.__audioEvents);const voices=sound.filter(e=>e.kind!=='gain'),gains=sound.filter(e=>e.kind==='gain').flatMap(e=>e.values.map(v=>v[0]));const duration=Math.max(...voices.map(e=>e.stop));check(soundPreset+' 합성음 0.1~0.25초·gain≤0.08',()=>{assert(voices.length>0);assert(duration>=.1&&duration<=.25);assert(Math.max(...gains)<=.08);});const n=sound.length;await call('jump');assert.equal((await page.evaluate(()=>window.__audioEvents.length)),n*2);await call('jump');assert.equal((await page.evaluate(()=>window.__audioEvents.length)),n*2);await page.locator('#soundBtn').click();await call('restart');await call('jump');assert.equal((await page.evaluate(()=>window.__audioEvents.length)),n*2);results.measurements.sounds.push({soundPreset,voices:voices.length,duration,maxGain:Math.max(...gains)});}
    check('콘솔 예외 없음·외부 요청 없음',()=>{assert.deepEqual(errors,[]);assert.deepEqual(results.requests,[]);});
    results.ok=true;results.count=results.checks.length;
  } finally {await browser.close();fs.writeFileSync(path.join(output,'엔진검증결과.json'),JSON.stringify(results,null,2));}
  console.log(JSON.stringify({ok:results.ok,count:results.count,output}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
