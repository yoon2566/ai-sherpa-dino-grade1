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
      current:project.slots[intent.slot].code || '', contract:{function:names[intent.slot],parameters:['ctx','v']}};
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
  async function apply(project, intent, signal, onProgress) {
    let payload = intent.mode === 'route' ? routePayload(project,intent) : slotPayload(project,intent);
    for (let attempt = 0; attempt < 2; attempt++) {
      aborted(signal);
      let candidate;
      try {
        const response = await receive(payload,signal,onProgress);
        candidate = payload.mode === 'route' ? parseRoute(response.raw) : parseSlot(payload.slot,response.raw);
        if (candidate.unsupported) {
          const error = Error(unsupportedMessage); error.code = 'UNSUPPORTED_CHANGE'; throw error;
        }
        if (candidate.config) return global.SherpaProject.withConfig(project,candidate.config);
        // A route is called once. A rejected drawing retries only that slot.
        payload = slotPayload(project,{slot:candidate.slot,request:intent.request});
        const checked = await global.SherpaSlotSafety.validate(candidate.slot,candidate.code);
        aborted(signal);
        if (!checked.ok) { const error = Error('Drawing rejected'); error.validation = checked.error; throw error; }
        let next = global.SherpaProject.withSlot(project,candidate.slot,checked.code,candidate.obstacleStyle);
        if (candidate.slot === 'item') next = global.SherpaProject.withConfig(next,{itemsEnabled:true,...(intent.itemName ? {itemName:intent.itemName} : {})});
        return next;
      } catch (error) {
        aborted(signal);
        if (error.code === 'UNSUPPORTED_CHANGE' || attempt === 1 || payload.mode === 'route') throw error;
        payload = {...payload,request:payload.request+'\n앞선 그림은 검사에 통과하지 못했어요. 계약과 허용 API를 지켜 눈에 보이는 그림을 새롭게 그려 줘. 빈 배열·push 등 배열 메서드와 배열 변경은 금지야. 반복은 for(let i=0;i<10;i++)처럼 숫자 리터럴 상한과 i++만 사용해. 꼭짓점은 반복 안에서 좌표를 계산해 바로 moveTo/lineTo로 그려 줘.'};
        onProgress?.(0,0);
      }
    }
    fail();
  }
  global.SherpaSlotAI = Object.freeze({receive,parseSlot,parseRoute,apply,unsupportedMessage});
})(window);
