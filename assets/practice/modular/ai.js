/* Small drawing requests only. The legacy full-HTML API stays in game-api.js. */
(function (global) {
  'use strict';
  const names = Object.freeze({hero:'drawHero', background:'drawBackground', obstacle:'drawObstacle', item:'drawItem'});
  const unsupportedMessage = '그건 이 게임에서 바꿀 수 없어요. 다른 걸 골라 봐요.';
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fail = () => { throw Error('잘 안 됐어요. 다시 해봐요.'); };
  const aborted = signal => { if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError'); };
  function style(value) {
    if (!object(value) || Object.keys(value).sort().join(',') !== 'shape,sizeScale'
      || !Number.isFinite(value.sizeScale) || value.sizeScale < 0.7 || value.sizeScale > 1.3
      || !['rect','round'].includes(value.shape)) fail();
    return {sizeScale:value.sizeScale,shape:value.shape};
  }
  function parseSlot(slot, raw) {
    if (!Object.hasOwn(names, slot) || typeof raw !== 'string') fail();
    const match = raw.trim().match(/^```(?:javascript|js)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
    if (!match || match[1].includes('```')) fail();
    const code = match[1].trim();
    const markers = [...code.matchAll(/^\s*\/\/\s*obstacleStyle:\s*(\{[^\r\n]*\})\s*$/gm)];
    if (markers.length > 1 || (markers.length && slot !== 'obstacle')) fail();
    return {slot, code, ...(markers.length ? {obstacleStyle:style(JSON.parse(markers[0][1]))} : {})};
  }
  function parseRoute(raw) {
    if (typeof raw !== 'string') fail();
    const text = raw.trim().replace(/^```json\s*\r?\n([\s\S]*?)\r?\n```$/i, '$1');
    const value = JSON.parse(text);
    if (!object(value)) fail();
    const keys = Object.keys(value).sort().join(',');
    if (keys === 'unsupported' && value.unsupported === true) return value;
    if (keys === 'config') {
      const config = value.config;
      if (!object(config) || !Object.keys(config).length || Object.keys(config).some(key => !['speedMultiplier','initialLives','soundPreset'].includes(key))) fail();
      if (Object.hasOwn(config,'speedMultiplier') && (!Number.isFinite(config.speedMultiplier) || config.speedMultiplier < 0.5 || config.speedMultiplier > 2.5)) fail();
      if (Object.hasOwn(config,'initialLives') && (!Number.isInteger(config.initialLives) || config.initialLives < 1 || config.initialLives > 9)) fail();
      if (Object.hasOwn(config,'soundPreset') && !global.SherpaProject.soundPresets.includes(config.soundPreset)) fail();
      return {config};
    }
    if (keys === 'request,slot' && ['hero','obstacle','item'].includes(value.slot)
      && typeof value.request === 'string' && value.request.trim() && value.request.length <= 2000) return value;
    if (!['code,slot','code,obstacleStyle,slot'].includes(keys) || !Object.hasOwn(names,value.slot) || typeof value.code !== 'string') fail();
    if (Object.hasOwn(value,'obstacleStyle')) {
      if (value.slot !== 'obstacle') fail();
      value.obstacleStyle = style(value.obstacleStyle);
    }
    return value;
  }
  async function receive(payload, signal, onProgress = () => {}) {
    aborted(signal);
    const body = JSON.stringify(payload);
    if (body.length > 20000) fail();
    const response = await fetch('/api/game', {method:'POST', headers:{'Content-Type':'application/json'}, body, signal});
    if (!response.ok || !response.body) { await response.body?.cancel(); fail(); }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let raw = '', pending = '', done = false, finish = '', usage = null, lastNotify = 0, bytes = 0;
    function line(text) {
      if (!text.startsWith('data:')) return;
      const data = text.slice(5).trim();
      if (!data) return;
      if (data === '[DONE]') { done = true; return; }
      const value = JSON.parse(data);
      if (value.error) fail();
      if (value.usage) usage = value.usage;
      const choice = value.choices?.[0];
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (typeof choice?.delta?.content === 'string') raw += choice.delta.content;
      if (raw.length > 32000) fail();
      if (Date.now() - lastNotify > 150) { lastNotify = Date.now(); onProgress(raw.length, raw ? raw.split(/\r?\n/).length : 0); }
    }
    try {
      for (;;) {
        aborted(signal);
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 1000000) fail();
        pending += decoder.decode(part.value, {stream:true});
        let at;
        while ((at = pending.indexOf('\n')) !== -1) { line(pending.slice(0,at).replace(/\r$/, '')); pending = pending.slice(at+1); }
      }
      pending += decoder.decode();
      if (pending) line(pending);
      if (!raw || ['length','content_filter','error'].includes(finish) || (!done && !['stop','end_turn'].includes(finish))) fail();
      aborted(signal);
      onProgress(raw.length, raw.split(/\r?\n/).length);
      return {raw, usage};
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  function slotPayload(project, intent) {
    return {mode:'slot', slot:intent.slot, request:intent.request,
      ...(!intent.freshHero ? {current:intent.currentCode ?? project.slots[intent.slot].code ?? ''} : {}),
      ...(intent.redraw ? {redraw:true} : {}), contract:{function:names[intent.slot],parameters:['ctx','v']}};
  }
  function routePayload(project, intent) {
    const current = {};
    // Whole engine/HTML/assets never enter the model context. Omit complete
    // drawings if needed; never truncate a function into invalid source.
    const payload = {mode:'route',request:intent.request,current,config:{speedMultiplier:project.config.speedMultiplier,initialLives:project.config.initialLives,soundPreset:project.config.soundPreset}};
    for (const slot of Object.keys(names)) {
      if (!project.slots[slot].code) continue;
      current[slot] = project.slots[slot].code;
      if (JSON.stringify(payload).length > 18000) delete current[slot];
    }
    return payload;
  }
  function checkConfigRequest(candidate, intent) {
    // A constant setting cannot implement a timed/progressive/conditional rule.
    // Keep the router first, then reject a lossy interpretation as unsupported.
    if(candidate.config && /점점|서서히|갈수록|마다|시간이|점수가|모으면|얻으면|획득하면|gradual|over time/i.test(intent.request||'')) {
      const error=Error(unsupportedMessage);error.code='UNSUPPORTED_CHANGE';throw error;
    }
  }
  async function apply(project, intent, signal, onProgress) {
    let payload = intent.mode === 'route' ? routePayload(project,intent) : slotPayload(project,intent);
    for (let attempt = 0; attempt < 2; attempt++) {
      aborted(signal);
      let candidate;
      try {
        if (attempt === 0 && intent.candidate) candidate = intent.candidate;
        else {
          const response = await receive(payload,signal,onProgress);
          candidate = payload.mode === 'route' ? parseRoute(response.raw) : parseSlot(payload.slot,response.raw);
        }
        if (candidate.unsupported) {
          const error = Error(unsupportedMessage); error.code = 'UNSUPPORTED_CHANGE'; throw error;
        }
        if (candidate.config) {checkConfigRequest(candidate,intent);return global.SherpaProject.withConfig(project,candidate.config);}
        // A route is called once. A rejected drawing retries only that slot.
        payload = slotPayload(project,{...intent,slot:candidate.slot});
        const checked = await global.SherpaSlotSafety.validate(candidate.slot,candidate.code);
        aborted(signal);
        if (!checked.ok) { const error = Error('Drawing rejected'); error.validation = checked.error; throw error; }
        let next = global.SherpaProject.withSlot(project,candidate.slot,checked.code,candidate.obstacleStyle);
        if (candidate.slot === 'item') next = global.SherpaProject.withConfig(next,{itemsEnabled:true,...(intent.itemName ? {itemName:intent.itemName} : {})});
        return next;
      } catch (error) {
        aborted(signal);
        if (error.code === 'UNSUPPORTED_CHANGE' || attempt === 1 || payload.mode === 'route') throw error;
        payload = {...payload,retry:true};
        onProgress?.(0,0);
      }
    }
    fail();
  }
  function currentPixel(project, slot) {
    const asset = project.assets[slot === 'hero' ? 'pixel' : slot];
    return project.slots[slot].mode === 'pixel' && asset ? global.SherpaPixel.toPixel(asset) : undefined;
  }
  async function preparePixel(project, intent, signal, onProgress) {
    const current = intent.freshHero ? undefined : intent.current || (intent.redraw ? currentPixel(project,intent.slot) : undefined);
    let payload = {mode:'pixel',slot:intent.slot,request:intent.request,...(current ? {current} : {}),...(intent.redraw ? {redraw:true} : {})};
    for (let attempt = 0; attempt < 2; attempt++) {
      aborted(signal);
      try {
        const response = await receive(payload,signal,onProgress);
        const raw = response.raw.trim().replace(/^```json\s*\r?\n([\s\S]*?)\r?\n```$/i,'$1');
        const checked = global.SherpaPixel.validatePixel(intent.slot,JSON.parse(raw));
        if (!checked.ok) fail();
        aborted(signal);
        return {slot:intent.slot,draft:checked.pixel,intent};
      } catch (error) {
        aborted(signal);
        if (attempt === 1) fail();
        payload = {...payload,retry:true};
        onProgress?.(0,0);
      }
    }
  }
  // The phase-four quality gate decides this constant before deployment.
  // Code and converted pixels stay a proposal until the editor confirms.
  const reviewCodeDrafts = true;
  async function prepareCode(project,intent,signal,onProgress) {
    if (!reviewCodeDrafts) return {project:await apply(project,intent,signal,onProgress)};
    let payload=slotPayload(project,intent);
    for(let attempt=0;attempt<2;attempt++) {
      aborted(signal);
      try {
        const response=await receive(payload,signal,onProgress);
        const candidate=parseSlot(intent.slot,response.raw);
        const checked=await global.SherpaCodeBitmap.render(candidate.slot,candidate.code);
        aborted(signal);
        if(!checked.ok) {console.info('[공룡3 코드 밑그림 검사]',candidate.slot,checked.error);fail();}
        return {slot:candidate.slot,draft:checked.pixel,source:candidate.code,style:candidate.obstacleStyle,intent};
      } catch(error) {
        aborted(signal);
        if(attempt===1)fail();
        payload={...payload,retry:true};onProgress?.(0,0);
      }
    }
  }
  async function prepare(project, intent, signal, onProgress) {
    if (intent.mode !== 'route') {
      if (intent.slot === 'background') return {project:await apply(project,intent,signal,onProgress)};
      return prepareCode(project,intent,signal,onProgress);
    }
    const payload = {...routePayload(project,intent),artMode:'code'};
    const response = await receive(payload,signal,onProgress), candidate = parseRoute(response.raw);
    if (candidate.unsupported) { const error = Error(unsupportedMessage); error.code='UNSUPPORTED_CHANGE'; throw error; }
    if (candidate.config) {checkConfigRequest(candidate,intent);return {project:global.SherpaProject.withConfig(project,candidate.config)};}
    if (candidate.slot === 'background' && candidate.code) return {project:await apply(project,{mode:'slot',slot:'background',request:intent.request,candidate},signal,onProgress)};
    if (!candidate.request || !['hero','obstacle','item'].includes(candidate.slot)) fail();
    const nextIntent={mode:'slot',slot:candidate.slot,request:candidate.request,redraw:true};
    if(!project.slots[candidate.slot].code && currentPixel(project,candidate.slot)) {
      return {slot:candidate.slot,draft:currentPixel(project,candidate.slot),direct:true,
        notice:'직접 그린 그림은 손보기 창에서 고쳐 봐요',intent:nextIntent};
    }
    return prepareCode(project,nextIntent,signal,onProgress);
  }
  async function redraw(project, proposal, edited, signal, onProgress) {
    const intent = {...proposal.intent,redraw:true,currentCode:proposal.source || project.slots[proposal.slot].code || ''};
    return prepareCode(project,intent,signal,onProgress);
  }
  global.SherpaSlotAI = Object.freeze({receive,parseSlot,parseRoute,apply,prepare,redraw,currentPixel,unsupportedMessage,reviewCodeDrafts});
})(window);
