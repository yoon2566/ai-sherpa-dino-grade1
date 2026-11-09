/* Drawing-only JavaScript. Acorn 8.17.0 is vendored with its MIT license. */
(function (global) {
  'use strict';
  const names = Object.freeze({hero:'drawHero',background:'drawBackground',obstacle:'drawObstacle',item:'drawItem'});
  const methods = new Set(['fillRect','strokeRect','beginPath','closePath','moveTo','lineTo','arc','ellipse','quadraticCurveTo','bezierCurveTo','rect','roundRect','fill','stroke','createLinearGradient','createRadialGradient']);
  const properties = new Set(['fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','globalAlpha']);
  const math = new Set(['sin','cos','tan','abs','min','max','floor','ceil','round','sqrt','pow','hypot','sign']);
  const values = {hero:['t','pose','frame','w','h'],background:['t','w','h','groundY','scroll','night'],obstacle:['t','w','h','kind','index'],item:['t','w','h']};
  const approved = new Set();
  const failure = error => ({ok:false,error:String(error?.message || error || 'invalid')});
  const key = (slot,code) => slot+'\n'+code;

  function validateStatic(slot, code) {
    try {
      if (!Object.hasOwn(names,slot) || typeof code !== 'string' || !code.trim() || code.length > 6000) throw Error('source');
      if (!global.acorn?.parse) throw Error('parser-unavailable');
      const ast = global.acorn.parse(code, {ecmaVersion:2020,sourceType:'script'});
      const fn = ast.body[0];
      if (ast.body.length!==1 || fn?.type!=='FunctionDeclaration' || fn.id.name!==names[slot] || fn.async || fn.generator || fn.params.length!==2 || fn.params[0].type!=='Identifier' || fn.params[0].name!=='ctx' || fn.params[1].type!=='Identifier' || fn.params[1].name!=='v') throw Error('function-contract');
      const locals = new Map(), counters = new Set();
      let operations = 0;
      const deny = () => {throw Error('not-allowed');};
      function cost(weight) { operations += weight; if (operations > 10000) throw Error('complexity'); }
      function number(node,weight) {if(expr(node,weight)!=='number')deny();}
      function localName(node) {return node?.type==='Identifier' && /^[A-Za-z_$][\w$]*$/.test(node.name) && !['ctx','v','Math','undefined','NaN','Infinity',names[slot],'__proto__','prototype','constructor'].includes(node.name);}
      function expr(node,weight=1) {
        if (!node) deny(); cost(weight);
        switch(node.type) {
          case 'Literal':
            if (node.regex || node.bigint || !['number','string','boolean'].includes(typeof node.value) || typeof node.value==='number' && (!Number.isFinite(node.value) || Math.abs(node.value)>1000000) || typeof node.value==='string' && node.value.length>300) deny();
            return typeof node.value;
          case 'Identifier': if(!locals.has(node.name))deny(); return locals.get(node.name).type;
          case 'ArrayExpression': {
            if(node.elements.length>200 || !node.elements.length)deny();
            const types=node.elements.map(e=>expr(e,weight));
            if(types.some(t=>t!==types[0]) || !['number','string','boolean'].includes(types[0]))deny();
            return 'array:'+types[0];
          }
          case 'MemberExpression': {
            if(node.optional || node.object.type!=='Identifier')deny();
            const owner=node.object.name;
            if(node.computed){
              const type=locals.get(owner)?.type;
              if(!type?.startsWith('array:'))deny(); number(node.property,weight); return type.slice(6);
            }
            if(node.property.type!=='Identifier')deny();
            const prop=node.property.name;
            if(owner==='v' && values[slot].includes(prop))return ['pose','kind'].includes(prop)?'string':'number';
            if(owner==='Math' && ['PI','E'].includes(prop))return 'number';
            if(locals.get(owner)?.type?.startsWith('array:') && prop==='length')return 'number';
            deny(); break;
          }
          case 'UnaryExpression':
            if(!['+','-','!'].includes(node.operator))deny();
            if(node.operator==='!'){expr(node.argument,weight);return 'boolean';}number(node.argument,weight);return 'number';
          case 'BinaryExpression': {
            const a=expr(node.left,weight),b=expr(node.right,weight);
            if(['+','-','*','/','%','**'].includes(node.operator)){if(a!=='number'||b!=='number')deny();return 'number';}
            if(['===','!==','==','!=','<','<=','>','>='].includes(node.operator) && ['number','string','boolean'].includes(a) && ['number','string','boolean'].includes(b))return 'boolean';
            deny(); break;
          }
          case 'LogicalExpression': {
            if(!['&&','||'].includes(node.operator))deny();
            const a=expr(node.left,weight),b=expr(node.right,weight);if(a!==b)deny();return a;
          }
          case 'ConditionalExpression': {
            expr(node.test,weight);const a=expr(node.consequent,weight),b=expr(node.alternate,weight);if(a!==b)deny();return a;
          }
          case 'CallExpression': {
            const callee=node.callee;
            if(node.optional || callee.type!=='MemberExpression' || callee.computed || callee.object.type!=='Identifier' || callee.property.type!=='Identifier' || node.arguments.length>12)deny();
            const owner=callee.object.name,method=callee.property.name;
            if(owner==='Math' && math.has(method)){node.arguments.forEach(a=>number(a,weight));return 'number';}
            if(owner==='ctx' && methods.has(method)){
              node.arguments.forEach((a,index)=>{const type=expr(a,weight);if(type!=='number' && !(type==='boolean' && (method==='arc'&&index===5 || method==='ellipse'&&index===7)))deny();});
              return method.includes('Gradient')?'gradient':'void';
            }
            if(locals.get(owner)?.type==='gradient' && method==='addColorStop' && node.arguments.length===2){number(node.arguments[0],weight);if(expr(node.arguments[1],weight)!=='string')deny();return 'void';}
            deny(); break;
          }
          case 'AssignmentExpression': {
            const type=expr(node.right,weight),left=node.left;
            if(left.type==='Identifier'){
              const target=locals.get(left.name);
              if(!target || target.constant || counters.has(left.name) || target.type!==type || !['number','boolean','string'].includes(type))deny();
              if(!['=','+=','-=','*=','/=','%='].includes(node.operator) || node.operator!=='=' && type!=='number')deny();
              return type;
            }
            if(left.type!=='MemberExpression' || left.computed || left.object.type!=='Identifier' || left.object.name!=='ctx' || !properties.has(left.property.name) || node.operator!=='=')deny();
            const prop=left.property.name;
            if(['fillStyle','strokeStyle'].includes(prop) && !['string','gradient'].includes(type) || ['lineWidth','globalAlpha'].includes(prop) && type!=='number' || ['lineCap','lineJoin'].includes(prop) && type!=='string')deny();
            return type;
          }
          case 'UpdateExpression': {
            if(!['++','--'].includes(node.operator) || node.argument.type!=='Identifier')deny();
            const target=locals.get(node.argument.name);
            if(!target || target.constant || target.type!=='number' || counters.has(node.argument.name))deny();return 'number';
          }
          default: deny();
        }
      }
      function statement(node,weight=1) {
        cost(weight);
        switch(node.type) {
          case 'BlockStatement': {
            const outer=new Set(locals.keys());
            node.body.forEach(n=>statement(n,weight));
            for(const name of locals.keys())if(!outer.has(name))locals.delete(name);
            break;
          }
          case 'EmptyStatement': break;
          case 'VariableDeclaration':
            if(!['let','const'].includes(node.kind))deny();
            for(const declaration of node.declarations){
              if(!localName(declaration.id) || locals.has(declaration.id.name))deny();
              const type=expr(declaration.init,weight);if(type==='void')deny();
              locals.set(declaration.id.name,{type,constant:node.kind==='const'});
            }break;
          case 'ExpressionStatement':
            if(!['CallExpression','AssignmentExpression','UpdateExpression'].includes(node.expression.type))deny();expr(node.expression,weight);break;
          case 'IfStatement': expr(node.test,weight);statement(node.consequent,weight);if(node.alternate)statement(node.alternate,weight);break;
          case 'ReturnStatement': if(node.argument)expr(node.argument,weight);break;
          case 'ForStatement': {
            const init=node.init,test=node.test,update=node.update;
            if(init?.type!=='VariableDeclaration' || init.kind!=='let' || init.declarations.length!==1)deny();
            const d=init.declarations[0],start=d.init?.value,end=test?.right?.value;
            if(!localName(d.id) || locals.has(d.id.name) || d.init?.type!=='Literal' || !Number.isInteger(start) || start<0 || start>200 || test?.type!=='BinaryExpression' || !['<','<='].includes(test.operator) || test.left.type!=='Identifier' || test.left.name!==d.id.name || test.right.type!=='Literal' || !Number.isInteger(end) || end<start || end>200 || test.operator==='<=' && end===200 || update?.type!=='UpdateExpression' || update.operator!=='++' || update.argument.type!=='Identifier' || update.argument.name!==d.id.name)deny();
            const count=end-start+(test.operator==='<='?1:0);
            if(weight*Math.max(1,count)>2000)throw Error('loop-budget');
            locals.set(d.id.name,{type:'number',constant:false});counters.add(d.id.name);
            statement(node.body,weight*Math.max(1,count));counters.delete(d.id.name);locals.delete(d.id.name);break;
          }
          default: deny();
        }
      }
      statement(fn.body);
      return {ok:true,code};
    } catch(error) {return failure(error);}
  }

  // Shared by isolated trials and the exported fixed engine. Drawings cannot own
  // state stacks, transforms, clipping or canvas objects. Native inputs are capped.
  function drawingContext(ctx) {
    let calls=0;
    const out=Object.create(null);
    for(const method of ['fillRect','strokeRect','beginPath','closePath','moveTo','lineTo','arc','ellipse','quadraticCurveTo','bezierCurveTo','rect','roundRect','fill','stroke','createLinearGradient','createRadialGradient']) {
      out[method]=function(...args){
        if(++calls>3000)throw Error('draw-budget');
        if(args.some((n,index)=>typeof n!=='number'||!Number.isFinite(n) ? !(typeof n==='boolean' && (method==='arc'&&index===5 || method==='ellipse'&&index===7)) : false))throw Error('draw-number');
        const limited=args.map(n=>typeof n==='boolean'?n:Math.max(-10000,Math.min(10000,n)));
        if(method==='arc' || method==='createRadialGradient') {const indices=method==='arc'?[2]:[2,5];for(const i of indices)if(limited[i]>=0)limited[i]=Math.min(1024,limited[i]);}
        if(method==='ellipse')for(const i of [2,3])if(limited[i]>=0)limited[i]=Math.min(1024,limited[i]);
        return ctx[method](...limited);
      };
    }
    for(const prop of ['fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','globalAlpha'])Object.defineProperty(out,prop,{set(value){
      if(prop==='lineWidth')value=Math.max(.1,Math.min(64,Number(value)||1));
      if(prop==='globalAlpha')value=Math.max(0,Math.min(1,Number(value)||0));
      ctx[prop]=value;
    }});
    return Object.freeze(out);
  }

  function trial(slot,draw,makeCanvas) {
    const cases=[];
    for(const t of [0,250,1900]) {
      if(slot==='hero')for(const pose of ['stand','run','jump','duck','dead'])cases.push({t,pose,frame:t?2:0,w:pose==='duck'?59:44,h:pose==='duck'?25:47});
      else if(slot==='background')cases.push({t,w:600,h:214,groundY:203,scroll:t/10,night:t===1900?1:0});
      else if(slot==='obstacle')for(const [kind,w,h] of [['shard',17,35],['crag',25,50],['drifter',46,40]])cases.push({t,w,h,kind,index:t?2:0});
      else cases.push({t,w:16,h:16});
    }
    let minimum=1,maximumOverflowRatio=0;
    for(const v of cases) {
      // A clipped trial can hide a misplaced body (especially the 59x25 duck
      // pose). Inspect a padded hero image before the engine applies its clip.
      const margin=slot==='hero'?64:0,width=v.w+margin*2,height=v.h+margin*2;
      const canvas=makeCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx)throw Error('canvas-unavailable');
      ctx.save();
      if(margin)ctx.translate(margin,margin);
      else {ctx.beginPath();ctx.rect(0,0,v.w,v.h);ctx.clip();}
      try {draw(drawingContext(ctx),Object.freeze(v));} finally {ctx.restore();}
      const data=ctx.getImageData(0,0,width,height).data;
      let visible=0,outside=0;
      for(let i=3;i<data.length;i+=4)if(data[i]>=32){
        const pixel=(i-3)/4,x=pixel%width,y=Math.floor(pixel/width);
        if(x>=margin&&x<margin+v.w&&y>=margin&&y<margin+v.h)visible++;else outside++;
      }
      const ratio=visible/(v.w*v.h);minimum=Math.min(minimum,ratio);
      if(visible<4 || ratio<(slot==='item'?.02:.01))throw Error('empty-drawing');
      const overflowRatio=outside/(visible+outside);maximumOverflowRatio=Math.max(maximumOverflowRatio,overflowRatio);
      if(slot==='hero'&&overflowRatio>.15)throw Error('drawing-overflow');
    }
    return {samples:cases.length,minimumOpaqueRatio:minimum,maximumOverflowRatio};
  }

  async function validate(slot,code) {
    const checked=validateStatic(slot,code);if(!checked.ok)return checked;
    const fallback=()=>{
      try {
        const draw=new Function('"use strict";\n'+code+'\nreturn '+names[slot]+';')();
        const started=performance.now();
        const result=trial(slot,draw,(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;});
        if(performance.now()-started>300)throw Error('timeout');
        approved.add(key(slot,code));return {ok:true,code,execution:'fallback',...result};
      } catch(error) {return failure(error);}
    };
    if(typeof Worker!=='function' || typeof OffscreenCanvas!=='function')return fallback();
    let url,worker;
    try {
      const source='"use strict";\n'+drawingContext.toString()+'\n'+trial.toString()+'\nself.onmessage=e=>{try{const {slot,code,name}=e.data;const draw=new Function("\\\"use strict\\\";\\n"+code+"\\nreturn "+name+";")();const result=trial(slot,draw,(w,h)=>new OffscreenCanvas(w,h));self.postMessage({ok:true,...result});}catch(e){self.postMessage({ok:false,error:String(e.message||e)});}};self.postMessage({ready:true});';
      url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new Worker(url);
    } catch {if(url)URL.revokeObjectURL(url);return fallback();}
    return new Promise(resolve=>{
      let started=false,finished=false,timer=setTimeout(()=>finish({ok:false,error:'worker-start-timeout'}),1500);
      function finish(result){if(finished)return;finished=true;clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);if(result.ok)approved.add(key(slot,code));resolve({...result,...(result.ok?{code,execution:'worker'}:{})});}
      worker.onmessage=event=>{
        if(event.data?.ready){started=true;clearTimeout(timer);timer=setTimeout(()=>finish({ok:false,error:'timeout'}),300);worker.postMessage({slot,code,name:names[slot]});}
        else finish(event.data?.ok?event.data:failure(event.data?.error));
      };
      worker.onerror=event=>{event.preventDefault();if(started)finish(failure('worker-execution'));else {worker.terminate();URL.revokeObjectURL(url);clearTimeout(timer);finished=true;resolve(fallback());}};
    });
  }
  global.SherpaSlotSafety=Object.freeze({names,validateStatic,validate,drawingContext,isApproved:(slot,code)=>approved.has(key(slot,code))});
})(globalThis);
