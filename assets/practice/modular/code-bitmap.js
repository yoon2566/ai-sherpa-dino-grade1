/* Checked drawing code becomes an editable bitmap; no generated source owns UI. */
(function (global) {
  'use strict';
  const sizes = Object.freeze({hero:[44,47],obstacle:[44,47],item:[24,24]});
  const symbols = '0123456789ab';
  const failure = error => ({ok:false,error:String(error?.message || error || '그림을 읽지 못했어요.')});

  // This function is also embedded in the isolated drawing Worker. Keep all
  // dependencies explicit, and keep the original item slot's 16x16 contract.
  function rasterize(slot,draw,makeCanvas,drawingContext) {
    const width=slot==='item'?24:44,height=slot==='item'?24:47;
    const canvas=makeCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw Error('canvas-unavailable');
    const v=slot==='hero'?{t:0,pose:'stand',frame:0,w:44,h:47}:slot==='obstacle'?{t:0,w:44,h:47,kind:'shard',index:0}:{t:0,w:16,h:16};
    ctx.save();
    try {
      ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
      if(slot==='item')ctx.scale(1.5,1.5);
      draw(drawingContext(ctx),Object.freeze(v));
    } finally {ctx.restore();}
    return {width,height,rgba:Array.from(ctx.getImageData(0,0,width,height).data)};
  }

  async function isolatedRaster(slot,code) {
    const safety=global.SherpaSlotSafety;
    const fallback=()=>{
      try {
        const draw=new Function('"use strict";\n'+code+'\nreturn '+safety.names[slot]+';')();
        const started=performance.now();
        const result=rasterize(slot,draw,(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;},safety.drawingContext);
        if(performance.now()-started>300)throw Error('timeout');
        return {ok:true,...result,execution:'fallback'};
      } catch(error) {return failure(error);}
    };
    if(typeof Worker!=='function'||typeof OffscreenCanvas!=='function')return fallback();
    let url,worker;
    try {
      const source='"use strict";\n'+safety.drawingContext.toString()+'\n'+rasterize.toString()+'\nself.onmessage=e=>{try{const {slot,code,name}=e.data;const draw=new Function("\\\"use strict\\\";\\n"+code+"\\nreturn "+name+";")();self.postMessage({ok:true,...rasterize(slot,draw,(w,h)=>new OffscreenCanvas(w,h),drawingContext)});}catch(e){self.postMessage({ok:false,error:String(e.message||e)});}};self.postMessage({ready:true});';
      url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new Worker(url);
    } catch {if(url)URL.revokeObjectURL(url);return fallback();}
    return new Promise(resolve=>{
      let started=false,finished=false,timer=setTimeout(()=>finish(failure('worker-start-timeout')),1500);
      function finish(result){if(finished)return;finished=true;clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);resolve({...result,...(result.ok?{execution:'worker'}:{})});}
      worker.onmessage=event=>{
        if(event.data?.ready){started=true;clearTimeout(timer);timer=setTimeout(()=>finish(failure('timeout')),300);worker.postMessage({slot,code,name:safety.names[slot]});}
        else finish(event.data?.ok?event.data:failure(event.data?.error));
      };
      worker.onerror=event=>{event.preventDefault();if(started)finish(failure('worker-execution'));else {worker.terminate();URL.revokeObjectURL(url);clearTimeout(timer);finished=true;resolve(fallback());}};
    });
  }

  function reduceColors(colors) {
    const distance=(a,b)=>a.reduce((sum,n,i)=>sum+(n-b[i])**2,0);
    const entries=[...colors.entries()].map(([key,count])=>({key,count,rgb:key.split(',').map(Number)})).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
    if(entries.length<=12)return {palette:entries.map(e=>e.rgb),mapping:new Map(entries.map((e,i)=>[e.key,i]))};
    // Weighted colour clustering merges each original shade into its nearest
    // representative; farthest-colour seeds preserve small eyes and outlines.
    let centers=[entries[0].rgb.slice()];
    while(centers.length<12){
      let best=entries[0],score=-1;
      for(const entry of entries){const value=Math.min(...centers.map(c=>distance(entry.rgb,c)))*Math.sqrt(entry.count);if(value>score){best=entry;score=value;}}
      centers.push(best.rgb.slice());
    }
    const nearest=rgb=>{let index=0,best=Infinity;centers.forEach((c,i)=>{const d=distance(rgb,c);if(d<best){best=d;index=i;}});return index;};
    for(let iteration=0;iteration<8;iteration++){
      const sums=centers.map(()=>[0,0,0,0]);
      for(const entry of entries){const sum=sums[nearest(entry.rgb)];for(let i=0;i<3;i++)sum[i]+=entry.rgb[i]*entry.count;sum[3]+=entry.count;}
      centers=centers.map((c,i)=>sums[i][3]?sums[i].slice(0,3).map(n=>Math.round(n/sums[i][3])):c);
    }
    return {palette:centers,mapping:new Map(entries.map(e=>[e.key,nearest(e.rgb)]))};
  }

  function fromRgba(slot,rgba,width,height) {
    try {
      if(!sizes[slot]||sizes[slot][0]!==width||sizes[slot][1]!==height||!rgba||rgba.length!==width*height*4)throw Error('bitmap-size');
      const colors=new Map(),keys=Array(width*height).fill(null);
      for(let i=0;i<keys.length;i++)if(rgba[i*4+3]>=128){const key=[rgba[i*4],rgba[i*4+1],rgba[i*4+2]].join(',');keys[i]=key;colors.set(key,(colors.get(key)||0)+1);}
      if(!colors.size)throw Error('그림을 더 크게 채워 주세요.');
      const reduced=reduceColors(colors),palette=reduced.palette.map(rgb=>'#'+rgb.map(n=>n.toString(16).padStart(2,'0')).join(''));
      let flat=keys.map(key=>key===null?'.':symbols[reduced.mapping.get(key)]);
      const pixel={palette,pixels:Array.from({length:height},(_,y)=>flat.slice(y*width,(y+1)*width).join(''))};
      let removedSmallCells=0;
      for(const group of global.SherpaPixel.components(pixel))if(group.length<4){for(const index of group)flat[index]='.';removedSmallCells+=group.length;}
      if(slot==='obstacle'){
        let bottom=-1;for(let i=0;i<flat.length;i++)if(flat[i]!=='.')bottom=Math.floor(i/width);
        const shift=height-1-bottom;
        if(bottom>=0&&shift>0)flat=[...Array(shift*width).fill('.'),...flat.slice(0,(height-shift)*width)];
      }
      pixel.pixels=Array.from({length:height},(_,y)=>flat.slice(y*width,(y+1)*width).join(''));
      const stats=global.SherpaPixel.measure(pixel),opaqueRatio=stats.painted/(width*height);
      const result={pixel,width,height,...stats,opaqueRatio,removedSmallCells};
      if(opaqueRatio<(slot==='item'?.2:.25))return {ok:false,...result,error:'그림을 더 크게 채워 주세요.'};
      if(stats.connectedRatio<.8)return {ok:false,...result,error:'머리와 몸통 등 그림을 한 덩어리로 이어 주세요.'};
      return {ok:true,...result};
    } catch(error) {return failure(error);}
  }

  async function render(slot,code) {
    if(!sizes[slot])return failure('bitmap-slot');
    const checked=await global.SherpaSlotSafety.validate(slot,code);
    if(!checked.ok)return checked;
    const raster=await isolatedRaster(slot,code);
    if(!raster.ok)return raster;
    return {...fromRgba(slot,raster.rgba,raster.width,raster.height),execution:raster.execution};
  }
  global.SherpaCodeBitmap=Object.freeze({sizes,render,fromRgba});
})(window);
