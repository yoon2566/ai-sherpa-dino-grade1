/* Sherpa fixed game engine 1.0.0. Derived from original-game.html; legacy stays untouched. */
(() => {
  'use strict';
  const project=JSON.parse(document.getElementById('sherpa-project').textContent);
  const config=project.config,slots=project.slots,defaults=window.SherpaDefaultSlots;
  const abilityId=config.abilityId||'',special=['invincible','giant','shield','shrink'].includes(abilityId);
  const headroom=abilityId==='double'?120:['high','giant'].includes(abilityId)?64:0;
  const multiplier=config.speedMultiplier;
  const canvas=document.getElementById('game'), pen=canvas.getContext('2d'), status=document.getElementById('status');
  const STEP=1000/60, WORLD_H=150+headroom, REST_Y=93, SCOUT_X=24;
  let worldW=Math.min(600,document.documentElement?.clientWidth||window.innerWidth||600);
  function widthAdjustedSpeed(base){if(worldW>=600)return base;const scaled=base*worldW/600*1.2;return scaled>base?base:scaled;}
  const TYPES=[
    {id:'shard',w:17,h:35,y:[105],groupAt:4,minSpeed:0,minGap:120,boxes:[[0,7,5,27],[4,0,6,34],[10,4,7,14]]},
    {id:'crag',w:25,h:50,y:[90],groupAt:7,minSpeed:0,minGap:120,boxes:[[0,12,7,38],[8,0,7,49],[13,10,10,38]]},
    {id:'drifter',w:46,h:40,y:[100,75,50],groupAt:999,minSpeed:8.5,minGap:150,boxes:[[15,15,16,5],[18,21,24,6],[2,14,4,3],[6,10,4,7],[10,8,6,9]]}
  ];
  const RUN_BOXES=[[22,0,17,16],[1,18,30,9],[10,35,14,8],[1,24,29,5],[5,30,21,4],[9,34,15,4]], LOW_BOXES=[[1,18,55,25]];
  const DIGITS=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
  const mobile=/Android/.test(navigator.userAgent)||/iPad|iPhone|iPod/.test(navigator.platform);
  let phase='waiting', previousPhase='running', speed=widthAdjustedSpeed(6*multiplier), distance=0, runningMs=0, introMs=0, clockMs=0, crashAt=0;
  let best=0, score=0, items=[], history=[], floorShift=0, clouds=[{x:400,y:29},{x:155,y:43}], frameNumber=0;
  let player={x:0,y:REST_Y,v:0,air:false,low:false,minReached:false,drop:false}, animationMs=0;
  let displayScore=0, achieving=false, flashTimer=0, flashIterations=0, paintScore=true;
  let inverted=false, invertTimer=0, nightOpacity=0, moonX=worldW-50, starShift=0;
  let last=0, budget=0, nowMs=0, pointerRelease=0, hiddenPaused=false, audio=null, resizeTimer=null;
  let lives=config.initialLives,protectedUntil=0,elapsed=0,abilityUntil=0,readyAt=0,graceUntil=0,extraJumpUsed=false,shieldAvailable=true,blockedObstacle=null;
  let collectibles=[],itemCount=0,itemBonus=0,distanceScore=0,nextItemAt=1500,muted=!!config.muted,lastMilestone=0,lastInversion=0;
  const slotErrors={},disabledSlots=new Set(),custom=window.SherpaCustomSlots||{};
  const slotNames={drawHero:'hero',drawBackground:'background',drawObstacle:'obstacle',drawItem:'item'};
  const customEnabled=name=>slots[slotNames[name]]?.mode==='code' && typeof custom[name]==='function' && !disabledSlots.has(name);
  const activePhase=()=>['running','launch','intro'].includes(phase);
  const active=()=>special&&elapsed<abilityUntil;
  const heroScale=()=>abilityId==='giant'&&active()?2:1;
  const obstacleScale=()=>((slots.obstacle.style||{}).sizeScale||1)*(abilityId==='shrink'&&active()?.5:1);
  try{best=Math.max(0,Number(localStorage.getItem('scout-runner-best-v2'))||0);}catch{}
  function announce(){const label=phase==='waiting'?'시작 전':phase==='crashed'?'게임 종료':phase==='paused'?'일시 정지':'진행 중';status.textContent=label+' · '+score+'점';canvas.setAttribute('aria-label',label+' · '+score+'점 · 스페이스바/위쪽 키 점프, 아래쪽 키 숙이기');}
  function int(min,max){return min+Math.floor(Math.random()*(max-min+1));}
  function audioReady(){try{if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}}
  function blip(kind){
    if(muted||!audio||audio.state!=='running')return;
    try{
      const t=audio.currentTime;
      const tone=(type,start,end,at,duration,peak=.04,middle)=>{
        const o=audio.createOscillator(),g=audio.createGain();o.type=type;
        o.frequency.setValueAtTime(start,t+at);
        if(middle)o.frequency.exponentialRampToValueAtTime(middle,t+at+duration/2);
        o.frequency.exponentialRampToValueAtTime(end,t+at+duration);
        g.gain.setValueAtTime(Math.min(.08,peak),t+at);g.gain.exponentialRampToValueAtTime(.0001,t+at+duration);
        o.connect(g);g.connect(audio.destination);o.start(t+at);o.stop(t+at+duration);
      };
      const noise=(at,duration,frequency)=>{const b=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),g=audio.createGain();source.buffer=b;filter.type='bandpass';filter.frequency.value=frequency;g.gain.setValueAtTime(.035,t+at);g.gain.exponentialRampToValueAtTime(.0001,t+at+duration);source.connect(filter);filter.connect(g);g.connect(audio.destination);source.start(t+at);source.stop(t+at+duration);};
      if(kind==='hit'){tone('triangle',110,45,0,.13);return;}
      if(kind==='point'||kind==='pickup'){tone('triangle',700,950,0,.12);return;}
      switch(config.soundPreset){
        case '뿅!':tone('sine',350,420,0,.18,.04,950);break;
        case '띠링!':tone('sine',740,740,0,.10);tone('sine',1110,1110,.11,.12);break;
        case '삐용!':tone('triangle',950,860,0,.20,.04,260);break;
        case '통통!':tone('sine',180,65,0,.10);tone('sine',160,55,.11,.10);break;
        case '슝!':noise(0,.18,1500);break;
        case '뽀글!':tone('sine',350,550,0,.07);tone('sine',510,700,.08,.07);tone('sine',660,900,.16,.07);break;
        case '삑삑!':tone('square',650,650,0,.08,.025);tone('square',650,650,.12,.08,.025);break;
        case '톡톡!':noise(0,.05,1100);noise(.11,.05,1100);break;
        case '반짝!':tone('sine',660,660,0,.07);tone('sine',880,880,.08,.07);tone('sine',1320,1320,.16,.07);break;
        default:tone('triangle',390,550,0,.10,.025);
      }
    }catch{}
  }
  function resetRun(){lives=config.initialLives;protectedUntil=0;elapsed=abilityUntil=readyAt=graceUntil=0;extraJumpUsed=false;shieldAvailable=true;blockedObstacle=null;collectibles=[];itemCount=itemBonus=distanceScore=0;nextItemAt=1500;lastMilestone=lastInversion=0;speed=widthAdjustedSpeed(6*multiplier);distance=0;score=0;runningMs=0;introMs=0;items=[];floorShift=0;animationMs=0;displayScore=0;achieving=false;flashTimer=0;flashIterations=0;paintScore=true;inverted=false;invertTimer=0;nightOpacity=0;moonX=worldW-50;starShift=0;player={x:SCOUT_X,y:REST_Y,v:0,air:false,low:false,minReached:false,drop:false};pointerRelease=0;phase='running';budget=0;announce();}
  function beginJump(){if(!activePhase()||player.low||(player.air&&(abilityId!=='double'||extraJumpUsed)))return false;extraJumpUsed=player.air;player.air=true;player.minReached=false;player.drop=false;player.v=-10.6;blip('jump');return true;}
  function pressJump(){audioReady();if(phase==='crashed')return;if(phase==='paused'){phase=previousPhase;last=performance.now();budget=0;announce();}if(phase==='waiting'){phase='launch';announce();}beginJump();}
  function releaseJump(){if(phase==='crashed'){if(nowMs-crashAt>=750)resetRun();return;}if(player.air&&player.minReached&&player.v<-5)player.v=-5;}
  function pressDown(){if(!['running','launch','intro'].includes(phase))return;if(player.air){player.drop=true;player.v=1;}else player.low=true;}
  function releaseDown(){player.low=false;player.drop=false;}
  function pause(){if(['running','launch','intro'].includes(phase)){previousPhase=phase;phase='paused';player.low=false;pointerRelease=0;announce();}}
  function boxesTouch(a,b){return a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];}
  function heroBounds(){const scale=heroScale(),width=player.low?59:44;return {x:player.x+width/2-width*scale/2,y:player.y+47-(player.low?29:47)*scale,w:width*scale,h:(player.low?25:47)*scale};}
  function obstacleBounds(o){const scale=obstacleScale();return {x:o.x,y:o.y+o.type.h*(1-scale),w:o.w*scale,h:o.type.h*scale};}
  function obstacleBoxes(o){
    const b=obstacleBounds(o),scale=obstacleScale();
    if(customEnabled('drawObstacle')){
      const boxes=[],w=o.type.w*scale,h=o.type.h*scale;
      for(let i=0;i<o.count;i++){
        const x=b.x+i*w;
        if(slots.obstacle.style.shape==='round'){
          // Ellipse bands use the same local dimensions and scale as the artwork.
          for(let row=0;row<8;row++){const y=(row+.5)/8*2-1,half=Math.sqrt(1-y*y)*w/2;boxes.push([x+w/2-half,b.y+row*h/8,half*2,h/8]);}
        }else boxes.push([x,b.y,w,h]);
      }
      return boxes;
    }
    return o.boxes.map(a=>[b.x+(1+a[0])*scale,b.y+(1+a[1])*scale,a[2]*scale,a[3]*scale]);
  }
  const pixelColors=['transparent','#172c48','#28a853','#ed5147','#ffca35','#3985e6','#885bcc','#fa8ebe','#935e3d','#ffffff'];
  const pixels=slots.hero.mode==='pixel'&&/^[0-9]{256}$/.test(project.assets.pixel||'')&&/[1-9]/.test(project.assets.pixel)?project.assets.pixel:null;
  let pixelRegion=null,pixelSheet=null;
  if(pixels){let l=16,t=16,r=0,b=0;pixelSheet=document.createElement('canvas');pixelSheet.width=pixelSheet.height=16;const art=pixelSheet.getContext('2d');for(let i=0;i<256;i++)if(pixels[i]!=='0'){l=Math.min(l,i%16);t=Math.min(t,Math.floor(i/16));r=Math.max(r,i%16);b=Math.max(b,Math.floor(i/16));art.fillStyle=pixelColors[Number(pixels[i])];art.fillRect(i%16,Math.floor(i/16),1,1);}pixelRegion={l,t,w:r-l+1,h:b-t+1};}
  function pixelGeometry(){const w=player.low?59:44,h=player.low?25:47,r=pixelRegion,s=Math.min(w/r.w,h/r.h),scale=heroScale(),anchorX=player.x+w/2,anchorY=player.y+47;const x=Math.round(player.x)+(w-r.w*s)/2,y=Math.round(player.y)+(player.low?18:0)+h-r.h*s;return {x:anchorX+(x-anchorX)*scale,y:anchorY+(y-anchorY)*scale,s:s*scale};}
  function heroBoxes(){
    if(pixels){const r=pixelRegion,g=pixelGeometry(),boxes=[];for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)if(pixels[(y+r.t)*16+x+r.l]!=='0')boxes.push([g.x+x*g.s,g.y+y*g.s,g.s,g.s]);return boxes;}
    if(customEnabled('drawHero')){const b=heroBounds();return [[b.x,b.y,b.w,b.h]];}
    const scale=heroScale(),w=player.low?59:44;return(player.low?LOW_BOXES:RUN_BOXES).map(a=>[player.x+w/2+(1+a[0]-w/2)*scale,player.y+47+(1+a[1]-47)*scale,a[2]*scale,a[3]*scale]);
  }
  function hits(o){
    if(elapsed<protectedUntil||(abilityId==='invincible'&&active())||(abilityId==='giant'&&elapsed<graceUntil)||blockedObstacle===o)return false;
    const collided=heroBoxes().some(a=>obstacleBoxes(o).some(b=>boxesTouch(a,b)));
    if(collided&&abilityId==='giant'&&active()){items.splice(items.indexOf(o),1);return false;}
    if(collided&&abilityId==='shield'&&active()&&shieldAvailable){shieldAvailable=false;abilityUntil=elapsed;readyAt=elapsed+5000;blockedObstacle=o;return false;}
    return collided;
  }
  function damage(){lives=Math.max(0,lives-1);if(lives===0){crash();collectibles=[];}else{protectedUntil=elapsed+1200;blip('hit');announce();}}
  function updateCollectibles(){
    if(!config.itemsEnabled)return;
    if(runningMs>=nextItemAt){
      const candidate={x:worldW+20,y:int(65,110),w:16,h:16};
      // Keep the whole spawn corridor clear, even while an obstacle moves relative to a magnet.
      const blocked=items.some(o=>{const b=obstacleBounds(o);return boxesTouch([candidate.x-34,0,84,150],[b.x,b.y,b.w,b.h]);});
      if(!blocked){collectibles.push(candidate);nextItemAt=runningMs+int(1800,3000);}else nextItemAt=runningMs+250;
    }
    for(const item of collectibles){item.x-=Math.floor(speed);if(abilityId==='magnet'){const dx=player.x+22-item.x,dy=player.y+24-item.y,d=Math.hypot(dx,dy);if(d>0&&d<=120){const p=Math.min(1,(speed+3)/d);item.x+=dx*p;item.y+=dy*p;}}}
    const boxes=heroBoxes();collectibles=collectibles.filter(item=>{if(boxes.some(b=>boxesTouch(b,[item.x,item.y,16,16]))){itemCount++;itemBonus+=10;blip('pickup');return false;}return item.x+16>0;});
  }
  function makeItem(obstacleSpeed=speed){
    const available=TYPES.filter(t=>t.minSpeed<=obstacleSpeed&&!(history.length===2&&history.every(id=>id===t.id)));
    const type=available[int(0,available.length-1)];let count=int(1,3);if(count>1&&obstacleSpeed<type.groupAt)count=1;
    const heights=mobile&&type.id==='drifter'?[100,50]:type.y;const y=heights[int(0,heights.length-1)],w=type.w*count;
    const boxes=type.boxes.map(b=>b.slice());if(count>1){boxes[1][2]=w-boxes[0][2]-boxes[2][2];boxes[2][0]=w-boxes[2][2];}
    const minimum=Math.round(w*obstacleSpeed+type.minGap*.6), gap=int(minimum,Math.round(minimum*1.5));
    const item={type,count,x:worldW+type.w,y,w,boxes,gap,offset:type.id==='drifter'?(Math.random()>.5?.8:-.8):0,followed:false};
    // A later obstacle must not spawn on a gift already waiting at the edge.
    for(const gift of [...collectibles].sort((a,b)=>a.x-b.x))if(boxesTouch([item.x-34,0,item.w+68,150],[gift.x,gift.y,16,16]))item.x=gift.x+50;
    items.push(item);history.unshift(type.id);history=history.slice(0,2);return item;
  }
  function advanceItems(deltaMs=STEP,obstacleSpeed=speed){for(const item of items)item.x-=Math.floor((obstacleSpeed+item.offset)*60/1000*deltaMs);items=items.filter(item=>item.x+item.w>0);const tail=items.at(-1);if(!tail||(!tail.followed&&tail.x+tail.w+tail.gap<worldW)){if(tail)tail.followed=true;makeItem(obstacleSpeed);}}
  function fitViewport(resized=false){
    worldW=Math.min(600,document.documentElement?.clientWidth||window.innerWidth||600);canvas.width=worldW;canvas.height=WORLD_H;
    const scale=Math.max(.01,Math.min(((window.innerWidth||worldW+24)-24)/worldW,((window.innerHeight||WORLD_H+24)-24)/WORLD_H));canvas.style.width=worldW*scale+'px';canvas.style.height=WORLD_H*scale+'px';
    if(resized){advanceItems(0,0);if(activePhase())pause();updateScore(0);}
  }
  function updateJump(){
    if(!player.air)return;const height=abilityId==='high'?1.5:1;
    player.y+=height*Math.round(player.v*(player.drop?3:1));player.v+=.6;
    const normalY=REST_Y+(player.y-REST_Y)/height;
    if(normalY<63||player.drop)player.minReached=true;
    if((normalY<30||player.drop)&&player.minReached&&player.v<-5)player.v=-5;
    if(player.y>REST_Y){player.y=REST_Y;player.v=0;extraJumpUsed=player.air=player.low=player.drop=player.minReached=false;if(phase==='launch'){phase='intro';introMs=0;}}
  }
  function crash(){phase='crashed';crashAt=nowMs;player.low=false;pointerRelease=0;achieving=false;displayScore=score;paintScore=true;if(score>best){best=score;try{localStorage.setItem('scout-runner-best-v2',String(best));}catch{}}blip('hit');announce();}
  function updateScore(deltaMs=STEP){
    distanceScore=Math.round(Math.ceil(distance)*.025);score=distanceScore+itemBonus;paintScore=true;
    if(!achieving){displayScore=score;if(Math.floor(score/100)>lastMilestone){lastMilestone=Math.floor(score/100);achieving=true;flashTimer=0;blip('point');}}
    else if(flashIterations<=3){flashTimer+=deltaMs;if(flashTimer<250)paintScore=false;else if(flashTimer>500){flashTimer=0;flashIterations++;}}
    else{achieving=false;flashIterations=0;flashTimer=0;}
  }
  function updateInversion(){if(invertTimer>12000){invertTimer=0;inverted=false;}else if(invertTimer){invertTimer+=STEP;}else if(Math.floor(score/700)>lastInversion){lastInversion=Math.floor(score/700);invertTimer+=STEP;inverted=true;}}
  function tick(){
    clockMs+=STEP;if(!activePhase()){updateAbilityHud();return;}const wasActive=active();elapsed+=STEP;if(abilityId==='giant'&&wasActive&&!active())graceUntil=elapsed+600;
    frameNumber++;animationMs+=STEP;updateJump();
    if(pointerRelease>0&&clockMs>=pointerRelease){pointerRelease=0;releaseJump();}
    let travelFrames=1;
    if(phase==='launch')travelFrames=0;
    if(phase==='intro'){player.x=Math.min(SCOUT_X,player.x+Math.round(50/1500*STEP));introMs+=STEP;if(introMs>=400){phase='running';runningMs=0;}}
    else if(phase==='running')runningMs+=STEP;
    if(phase==='running'){
      nightOpacity=Math.max(0,Math.min(1,nightOpacity+(inverted?.035:-.035)));if(nightOpacity>0){moonX-=.25;if(moonX<-40)moonX=worldW;starShift=(starShift+.3)%worldW;}
      const advance=Math.floor(speed);floorShift=(floorShift+advance)%600;
      for(const c of clouds){c.x-=.2/1000*STEP*speed;if(c.x<-50){c.x=worldW+int(0,130);c.y=int(22,65);}}
      if(runningMs>3000){
        advanceItems();
        for(const obstacle of [...items])if(hits(obstacle)){damage();break;}if(phase==='crashed'){updateAbilityHud();return;}
      }
    }
    if(phase==='running')updateCollectibles();
    distance+=speed*travelFrames;if(speed<13*multiplier)speed=Math.min(13*multiplier,speed+.001*multiplier);
    updateScore();
    updateInversion();
    updateAbilityHud();if(frameNumber%30===0)announce();
  }
  function fill(x,y,w,h,color){pen.fillStyle=color;pen.fillRect(Math.round(x),Math.round(y),w,h);}
  function digitString(value,x,y,color){const chars=String(value).padStart(value>99999?6:5,'0');for(let n=0;n<chars.length;n++){const map=DIGITS[Number(chars[n])];for(let k=0;k<15;k++)if(map[k]==='1')fill(x+n*8+(k%3)*2,y+Math.floor(k/3)*2,2,2,color);}}
  const dinosaurAtlasSource="data:image/webp;base64,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";
  let dinosaurAtlas=null,dinosaurAtlasReady=false;
  if(typeof Image==='function'){
    const sources=[dinosaurAtlasSource];
    const loadAtlas=index=>{
      dinosaurAtlasReady=false;dinosaurAtlas=null;
      if(index>=sources.length)return;
      let settled=false;
      const failed=()=>{if(settled)return;settled=true;loadAtlas(index+1);};
      try{
        const image=new Image();image.decoding='async';
        image.onload=()=>{
          if(settled)return;
          if(image.naturalWidth!==704||image.naturalHeight!==94){failed();return;}
          settled=true;dinosaurAtlas=image;dinosaurAtlasReady=true;
        };
        image.onerror=failed;
        image.src=sources[index];
      }catch{failed();}
    };
    loadAtlas(0);
  }
  function drawSlot(name,v,draw,geometry){
    const usesCustom=customEnabled(name);
    let failed=false;pen.save();try{if(geometry){pen.translate(geometry.x,geometry.y);pen.scale(geometry.sx||1,geometry.sy||1);pen.beginPath();pen.rect(0,0,geometry.w,geometry.h);pen.clip();}if(usesCustom)custom[name](window.SherpaDrawingContext(pen),Object.freeze(v));else draw(pen,Object.freeze(v));if(!disabledSlots.has(name))slotErrors[name]=0;}catch{failed=true;slotErrors[name]=(slotErrors[name]||0)+1;if(usesCustom&&slotErrors[name]>=3)disabledSlots.add(name);}finally{pen.restore();}
    if(failed){pen.save();try{if(geometry){pen.translate(geometry.x,geometry.y);pen.scale(geometry.sx||1,geometry.sy||1);pen.beginPath();pen.rect(0,0,geometry.w,geometry.h);pen.clip();}defaults[name](pen,Object.freeze(v));}catch{}finally{pen.restore();}}
  }
  function drawDinosaur(){
    if(elapsed<protectedUntil&&Math.floor(elapsed/90)%2===0)return;
    if(pixels){const g=pixelGeometry(),r=pixelRegion;pen.save();try{pen.imageSmoothingEnabled=false;pen.drawImage(pixelSheet,r.l,r.t,r.w,r.h,g.x,g.y,r.w*g.s,r.h*g.s);}finally{pen.restore();}return;}
    const still=phase==='waiting'||phase==='crashed',low=!still&&player.low&&!player.air;
    const frame=still?0:player.air?5:low?6+Math.floor(animationMs/125)%2:1+Math.floor(animationMs/(1000/12))%4;
    const pose=phase==='crashed'?'dead':phase==='waiting'?'stand':player.air?'jump':low?'duck':'run',scale=heroScale(),w=low?59:44,h=low?25:47;
    const x=player.x+w/2-w*scale/2,y=player.y+47+((low?18:0)-47)*scale;
    let drawn=false;
    if(!customEnabled('drawHero')&&dinosaurAtlasReady&&dinosaurAtlas){pen.save();try{pen.imageSmoothingEnabled=false;pen.drawImage(dinosaurAtlas,frame*88,0,88,94,x,y,w*scale,h*scale);drawn=true;}catch{dinosaurAtlasReady=false;dinosaurAtlas=null;}finally{pen.restore();}}
    if(!drawn)drawSlot('drawHero',{t:animationMs,pose,frame,w,h},defaults.drawHero,{x,y,w,h,sx:scale,sy:scale});
  }
  function drawObstacle(o){const b=obstacleBounds(o),scale=obstacleScale();for(let index=0;index<o.count;index++)drawSlot('drawObstacle',{t:animationMs,w:o.type.w,h:o.type.h,kind:o.type.id,index},defaults.drawObstacle,{x:b.x+index*o.type.w*scale,y:b.y,w:o.type.w,h:o.type.h,sx:scale,sy:scale});}
  function drawCollectible(item){drawSlot('drawItem',{t:animationMs,w:16,h:16},defaults.drawItem,{x:item.x,y:item.y,w:16,h:16});}
  function startIcon(restart){pen.save();pen.translate(worldW/2,73);pen.strokeStyle='#566a68';pen.fillStyle='#566a68';pen.lineWidth=2;if(restart){pen.beginPath();pen.arc(0,0,11,-.6,4.45);pen.stroke();pen.beginPath();pen.moveTo(-7,-12);pen.lineTo(-1,-12);pen.lineTo(-3,-5);pen.fill();}else{pen.beginPath();pen.moveTo(-5,-9);pen.lineTo(9,0);pen.lineTo(-5,9);pen.closePath();pen.fill();}pen.restore();}
  function paint(){
    canvas.style.filter=inverted?'invert(1)':'none';document.body.style.background=inverted?'#050508':'#fafaf7';
    pen.clearRect(0,0,worldW,WORLD_H);
    drawSlot('drawBackground',{t:animationMs,w:worldW,h:WORLD_H,groundY:139+headroom,scroll:floorShift,night:nightOpacity,moonX,starShift,clouds:Object.freeze(clouds.map(c=>Object.freeze({...c})))},defaults.drawBackground,{x:0,y:0,w:worldW,h:WORLD_H});
    pen.save();pen.translate(0,headroom);items.forEach(drawObstacle);collectibles.forEach(drawCollectible);drawDinosaur();
    if(phase==='waiting')startIcon(false);if(phase==='crashed')startIcon(true);if(phase==='paused'){fill(worldW/2-8,63,5,20,'#71837a');fill(worldW/2+3,63,5,20,'#71837a');}pen.restore();
    fill(worldW-162,10,7,2,'#a8b2a6');fill(worldW-160,12,3,5,'#a8b2a6');fill(worldW-163,17,9,1,'#a8b2a6');digitString(best,worldW-149,8,'#8c9a90');
    if(paintScore)digitString(displayScore,worldW-50-(displayScore>99999?8:0),8,'#506963');
    pen.font='bold 14px system-ui,sans-serif';pen.textBaseline='top';pen.fillStyle='#c74b59';pen.fillText('♥ '+lives,10,8);
    if(config.itemsEnabled){pen.fillStyle='#a77c15';pen.fillText('★ '+itemCount,10,27);}
  }
  function frame(time){nowMs=time;if(!last)last=time;budget+=Math.min(100,Math.max(0,time-last));last=time;while(budget>=STEP){tick();budget-=STEP;}paint();requestAnimationFrame(frame);}
  window.addEventListener('keydown',event=>{if(event.altKey||event.ctrlKey||event.metaKey||event.repeat&&['Space','ArrowUp'].includes(event.code))return;if(['Space','ArrowUp','ArrowDown','Enter'].includes(event.code))event.preventDefault();if(event.code==='ArrowDown'){pressDown();return;}if(['Space','ArrowUp'].includes(event.code))pressJump();});
  window.addEventListener('keyup',event=>{if(['Space','ArrowUp'].includes(event.code))releaseJump();if(event.code==='ArrowDown')releaseDown();if(event.code==='Enter'&&phase==='crashed')resetRun();});
  let pointerDownY=0, draggingDown=false;
  canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);pointerDownY=event.clientY;draggingDown=false;audioReady();if(phase==='crashed'){resetRun();return;}pressJump();if(event.pointerType==='mouse')pointerRelease=clockMs+140;});
  canvas.addEventListener('pointermove',event=>{if(event.buttons&&event.clientY-pointerDownY>18&&!draggingDown){draggingDown=true;pressDown();}});
  function pointerUp(event){event.preventDefault();if(draggingDown){releaseDown();draggingDown=false;}else if(event.pointerType!=='mouse')releaseJump();}
  canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',()=>{releaseDown();pointerRelease=0;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenPaused=['running','launch','intro'].includes(phase);pause();}else if(hiddenPaused&&phase==='paused'){phase=previousPhase;hiddenPaused=false;last=performance.now();budget=0;announce();}});
  window.addEventListener('blur',releaseDown);
  window.addEventListener('resize',()=>{if(resizeTimer!==null)return;resizeTimer=setTimeout(()=>{resizeTimer=null;fitViewport(true);},250);});
  /* GRADE1_DUCK_START */
  (()=>{
    const button=document.createElement('button');button.id='grade1-duck';button.type='button';button.textContent='↓ 숙이기';button.title='누르는 동안 숙여요';button.setAttribute('aria-pressed','false');
    const style=document.createElement('style');style.textContent='#grade1-duck{display:none;position:fixed;z-index:10;right:12px;bottom:12px;min-height:48px;padding:8px 16px;white-space:nowrap;font:700 20px Lounge,"Malgun Gothic",sans-serif;color:#183653;background:#edf5ff;border:2px solid #93bde1;border-radius:16px;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}#grade1-duck[aria-pressed=true]{background:#cce5ff;border-color:#347bb7;box-shadow:inset 0 2px 4px #15334f33}@media(pointer:coarse){#grade1-duck{display:block}}html.grade1-touch #grade1-duck{display:block}';document.head.append(style);document.body.append(button);
    if(navigator.maxTouchPoints>0)document.documentElement.classList.add('grade1-touch');
    let pointer=null;function release(){if(pointer===null)return;pointer=null;button.setAttribute('aria-pressed','false');releaseDown();}
    button.addEventListener('pointerdown',event=>{if(event.button!==0||pointer!==null)return;event.preventDefault();pointer=event.pointerId;button.setPointerCapture(pointer);button.setAttribute('aria-pressed','true');pressDown();});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,event=>{if(event.pointerId===pointer)release();});
    button.addEventListener('contextmenu',event=>event.preventDefault());window.addEventListener('blur',release);window.addEventListener('pagehide',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  })();
  /* GRADE1_DUCK_END */
  /* GRADE1_SPECIAL_START */
  (()=>{const b=document.createElement('button');b.id='grade1-special';b.type='button';b.dataset.state='none';b.textContent='★ 특수';const s=document.createElement('style');s.textContent='#grade1-special{display:none;position:fixed;z-index:10;right:150px;bottom:12px;width:126px;height:48px;padding:4px;font:700 16px system-ui,sans-serif;white-space:nowrap;border:2px solid #CCCCCC;border-radius:16px;background:#EEEEEE;color:#888888}#grade1-duck{width:126px}@media(pointer:coarse){#grade1-special{display:block}}html.grade1-touch #grade1-special{display:block}';document.head.append(s);document.body.append(b);b.addEventListener('click',()=>window.grade1SpecialAction?.());window.addEventListener('keydown',e=>{if(e.code==='KeyX'&&!e.repeat&&!e.ctrlKey&&!e.altKey&&!e.metaKey){if(parent!==window)parent.postMessage({channel:'grade1-special-hint'},'*');window.grade1SpecialAction?.()}});})();
  /* GRADE1_SPECIAL_END */

  const abilityChoices={double:['두 번 점프','공중에서 한 번 더 점프해요.'],invincible:['잠깐 무적','5초 동안 장애물을 통과해요.'],high:['높이 점프','평소보다 1.5배 높이 뛰어요.'],magnet:['자석','120픽셀 안의 아이템을 끌어당겨요.'],giant:['잠깐 커지기','5초 동안 커져 장애물을 부숴요.'],shield:['보호막','처음 부딪힌 장애물 한 개를 막아요.'],shrink:['장애물 작아지기','5초 동안 장애물이 절반 크기가 돼요.']};
  let abilityLabel,abilityDetail,abilityButton,lastAbilityMessage='';
  function activateAbility(){if(!special||!activePhase()||elapsed<readyAt)return;shieldAvailable=true;abilityUntil=elapsed+5000;readyAt=abilityUntil+5000;updateAbilityHud();}
  function abilityState(){return !abilityId?'none':!special?'auto':active()?'active':elapsed<readyAt?'cooldown':'ready';}
  function updateAbilityHud(){
    if(!abilityButton||!abilityId)return;const label=abilityChoices[abilityId][0],state=abilityState(),seconds=state==='active'?Math.min(5,Math.ceil((abilityUntil-elapsed)/1000)):state==='cooldown'?Math.min(5,Math.ceil((readyAt-elapsed)/1000)):0;
    abilityButton.dataset.state=state;abilityButton.style.fontSize=state==='ready'&&label.length>=7?'12px':'';
    abilityButton.textContent=state==='auto'?'★ '+label+' · 자동':state==='active'?'★ '+seconds+'초':state==='cooldown'?'다시 '+seconds:'★ '+label;
    abilityButton.disabled=special&&(state!=='ready'||!activePhase());abilityLabel.textContent=special?'X 키: ★ '+label:label;abilityDetail.textContent=special?'':abilityChoices[abilityId][1];
    const message={channel:'grade1-ability',label,state,seconds,enabled:!abilityButton.disabled},key=JSON.stringify(message);if(key!==lastAbilityMessage&&parent!==window){parent.postMessage(message,'*');lastAbilityMessage=key;}
  }
  function installAbilityHud(){
    window.grade1SpecialAction=activateAbility;window.addEventListener('message',event=>{if(event.source===parent&&event.data?.channel==='grade1-ability'&&event.data.command==='activate')activateAbility();});
    if(!abilityId)return;abilityButton=document.getElementById('grade1-special');const hud=document.createElement('div');hud.id='grade1-current-ability';if(special)hud.className='has-special';hud.setAttribute('aria-label','현재 능력');abilityLabel=document.createElement('strong');abilityDetail=document.createElement('span');hud.append(abilityLabel,abilityDetail);document.body.append(hud);
    const style=document.createElement('style');style.textContent='#grade1-current-ability{position:fixed;z-index:5;left:50%;bottom:2px;transform:translateX(-50%);max-width:98%;width:max-content;display:flex;align-items:center;justify-content:center;gap:.4em;padding:3px 7px;border-radius:6px;background:#fff;color:#203b40;font:600 clamp(10px,2.5vw,13px)/1.3 system-ui,sans-serif;text-align:center}#grade1-current-ability strong{white-space:nowrap}#grade1-special{border:2px solid #F0A020;background:#FFF4D6;color:#7A4A00}#grade1-special[data-state=auto]{background:#FFFBEF;border-color:#F5D58A;color:#9A6A10;font-size:12px}#grade1-special[data-state=active]{background:#F0A020;color:white}#grade1-special[data-state=cooldown]{background:#EEEEEE;border-color:#CCCCCC;color:#999999}@media(pointer:coarse){#grade1-current-ability{left:12px;right:auto;transform:none;max-width:calc(100% - 180px)}#grade1-current-ability.has-special{display:none}}html.grade1-touch #grade1-current-ability{left:12px;right:auto;transform:none;max-width:calc(100% - 180px)}html.grade1-touch #grade1-current-ability.has-special{display:none}@media(max-height:230px){#grade1-current-ability{bottom:0;font-size:10px;padding:1px 5px}}';document.head.append(style);
  }
  function installSoundButton(){if(config.soundPreset==='default')return;const button=document.createElement('button');button.id='soundBtn';button.type='button';button.style.cssText='position:fixed;right:12px;top:28px;z-index:6;border:1px solid #a9b9b2;border-radius:7px;background:#fff;color:#344e49;padding:4px 8px;font:600 12px system-ui;min-height:32px';const update=()=>{button.textContent=muted?'🔊 소리 켜기':'🔇 소리 끄기';button.setAttribute('aria-pressed',String(!muted));button.setAttribute('aria-label',muted?'소리 켜기':'소리 끄기');};button.onclick=()=>{muted=!muted;audioReady();update();};document.body.append(button);update();}
  if(window.__SHERPA_TEST__===true){
    const snapshot=()=>({phase,speed,lives,protectedUntil,elapsed,score,distanceScore,itemBonus,itemCount,player:{...player},abilityState:abilityState(),abilityUntil,readyAt,heroBounds:heroBounds(),heroBoxes:heroBoxes(),obstacleBounds:items.map(obstacleBounds),obstacleBoxes:items.map(obstacleBoxes),obstacles:items.map(o=>({kind:o.type.id,x:o.x,y:o.y,count:o.count,w:o.w})),collectibles:collectibles.map(o=>({...o})),worldW,worldH:WORLD_H,headroom,slotErrors:{...slotErrors},disabledSlots:[...disabledSlots],dinosaurAtlasReady});
    window.__sherpaTest=Object.freeze({snapshot,step(n=1){for(let i=0;i<n;i++){nowMs+=STEP;tick();}paint();return snapshot();},restart(){resetRun();updateAbilityHud();paint();},jump:pressJump,releaseJump,down:pressDown,up:releaseDown,activate:activateAbility,fixture(v){if(v.phase)phase=v.phase;if(v.player)Object.assign(player,v.player);if(v.speed!==undefined)speed=v.speed;if(v.runningMs!==undefined)runningMs=v.runningMs;if(v.elapsed!==undefined)elapsed=v.elapsed;if(v.lives!==undefined)lives=v.lives;if(v.distance!==undefined)distance=v.distance;if(v.abilityUntil!==undefined)abilityUntil=v.abilityUntil;if(v.readyAt!==undefined)readyAt=v.readyAt;if(v.collectibles)collectibles=v.collectibles.map(o=>({w:16,h:16,...o}));if(v.obstacles)items=v.obstacles.map(o=>{const type=TYPES.find(t=>t.id===o.kind)||TYPES[0],count=o.count||1,w=type.w*count,boxes=type.boxes.map(b=>b.slice());if(count>1){boxes[1][2]=w-boxes[0][2]-boxes[2][2];boxes[2][0]=w-boxes[2][2];}return {type,count,x:o.x,y:o.y??type.y[0],w,boxes,gap:200,offset:0,followed:true};});updateAbilityHud();paint();return snapshot();}});
  }

  installAbilityHud();installSoundButton();fitViewport();announce();updateAbilityHud();paint();if(window.__SHERPA_TEST__!==true)requestAnimationFrame(frame);

// Inserted inside the copied runner's IIFE by build-game.cjs.
// Only presentation controls are adapted; gameplay functions remain unchanged.
(() => {
  'use strict';
  const host=window.parent,embedded=host!==window,held=new Set();
  const controlCodes=new Set([32,38,40,13]);
  function focusGame(){try{canvas.focus({preventScroll:true});}catch{}}
  function key(code,down){
    if(!controlCodes.has(code)||typeof down!=='boolean')return;
    if(down){
      held.add(code);
      if(code===40)pressDown();
      else if(code===32||code===38)pressJump();
    }else{
      held.delete(code);
      if(code===40)releaseDown();
      else if(code===32||code===38)releaseJump();
      else if(code===13&&phase==='crashed')resetRun();
    }
  }
  function releaseHeld(){
    for(const code of held){
      if(code===40)releaseDown();
      else if((code===32||code===38)&&phase!=='crashed')releaseJump();
    }
    held.clear();
  }
  function tap(){
    focusGame();
    if(phase==='crashed'){releaseHeld();resetRun();return;}
    pressJump();pointerRelease=clockMs+140;
  }
  function restart(){
    focusGame();releaseHeld();
    if(phase==='waiting')tap();else resetRun();
  }
  window.addEventListener('message',event=>{
    if(!embedded||event.source!==host)return;
    const data=event.data;
    if(!data||typeof data!=='object'||data.channel!=='lounge-dino')return;
    if(data.command==='tap'){tap();return;}
    if(data.command==='restart'){restart();return;}
    key(data.code,data.down);
  });
  document.addEventListener('keydown',event=>{
    if(!embedded||event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return;
    const directions={ArrowLeft:-1,PageUp:-1,ArrowRight:1,PageDown:1};
    const direction=directions[event.key]??directions[event.code];
    if(direction!==-1&&direction!==1)return;
    event.preventDefault();
    // srcdoc may have an opaque origin. The payload contains only a page direction;
    // the containing lesson validates event.source against its own game iframe.
    try{host.postMessage({channel:'lounge-dino',navigate:direction},'*');}catch{}
  });
  // Preserve the approved behavior: changing slide-control focus does not pause.
  // Its existing visibilitychange handler pauses hidden tabs, and resize pauses.
  window.addEventListener('blur',releaseHeld);
})();

})();
