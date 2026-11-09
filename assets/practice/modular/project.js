/* Versioned authoring data. The legacy full-HTML editor never enters this path. */
(function (global) {
  'use strict';
  const ENGINE_VERSION = '1.0.0';
  const MAX_HTML_BYTES = 1500000;
  const BUNDLE_MARKER = '<!-- SHERPA_GAME_BUNDLE -->';
  const sourceBase = new URL('.', document.currentScript.src);
  const abilityIds = Object.freeze({
    '두 번 점프': 'double', '잠깐 무적': 'invincible', '높이 점프': 'high',
    '자석': 'magnet', '잠깐 커지기': 'giant', '보호막': 'shield', '장애물 작아지기': 'shrink'
  });
  const soundPresets = Object.freeze(['default', '뿅!', '띠링!', '삐용!', '통통!', '슝!', '뽀글!', '삑삑!', '톡톡!', '반짝!']);
  let bundle = null, loading = null;
  const copy = value => JSON.parse(JSON.stringify(value));
  const invalid = () => { throw Error('게임 설정을 읽지 못했어요. 이전 게임을 유지해요.'); };
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validPixels = value => typeof value === 'string' && /^[0-9]{256}$/.test(value) && /[1-9]/.test(value);

  function createProject() {
    return {
      formatVersion: 2, engineVersion: ENGINE_VERSION,
      config: {speedMultiplier: 1, initialLives: 1, itemsEnabled: false, itemName: '별', abilityId: '', soundPreset: 'default', muted: false},
      slots: {hero: {mode: 'default'}, background: {mode: 'default'}, obstacle: {mode: 'default', style: {sizeScale: 1, shape: 'rect'}}, item: {mode: 'default'}},
      assets: {pixel: null}
    };
  }

  function normalizeProject(value) {
    if (!isObject(value) || value.formatVersion !== 2 || value.engineVersion !== ENGINE_VERSION) invalid();
    const result = createProject(), config = value.config, slots = value.slots, assets = value.assets;
    if (!isObject(config) || !isObject(slots) || !isObject(assets)) invalid();
    if (!Number.isFinite(config.speedMultiplier) || config.speedMultiplier < 0.5 || config.speedMultiplier > 2.5) invalid();
    if (!Number.isInteger(config.initialLives) || config.initialLives < 1 || config.initialLives > 9) invalid();
    if (typeof config.itemsEnabled !== 'boolean' || typeof config.muted !== 'boolean') invalid();
    if (typeof config.itemName !== 'string' || config.itemName.length > 80) invalid();
    if (!['', ...Object.values(abilityIds)].includes(config.abilityId) || !soundPresets.includes(config.soundPreset)) invalid();
    for (const key of Object.keys(result.config)) result.config[key] = config[key];
    for (const name of ['hero', 'background', 'obstacle', 'item']) {
      const slot = slots[name];
      if (!isObject(slot) || !(['default', 'code', ...(name === 'hero' ? ['pixel'] : [])].includes(slot.mode))) invalid();
      if (slot.mode === 'code') {
        if (!global.SherpaSlotSafety?.validateStatic(name, slot.code).ok) invalid();
        result.slots[name].code = slot.code;
      } else if (slot.code) invalid();
      result.slots[name].mode = slot.mode;
    }
    const style = slots.obstacle.style;
    if (!isObject(style) || !Number.isFinite(style.sizeScale) || style.sizeScale < 0.7 || style.sizeScale > 1.3 || !['rect', 'round'].includes(style.shape)) invalid();
    result.slots.obstacle.style = {sizeScale: style.sizeScale, shape: style.shape};
    if (assets.pixel !== null && !validPixels(assets.pixel)) invalid();
    if (slots.hero.mode === 'pixel' && !validPixels(assets.pixel)) invalid();
    result.assets.pixel = assets.pixel;
    return result;
  }

  function inspectHtml(html) {
    if (typeof html !== 'string' || !/\bid\s*=\s*["']sherpa-project["']/i.test(html)) return {kind: 'legacy'};
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const tags = doc.querySelectorAll('script#sherpa-project');
      if (tags.length !== 1 || tags[0].type !== 'application/json') return {kind: 'unsupported'};
      return {kind: 'modular', project: normalizeProject(JSON.parse(tags[0].textContent))};
    } catch { return {kind: 'unsupported'}; }
  }

  async function init() {
    if (bundle) return;
    if (!loading) loading = Promise.all(['shell.html', 'defaults.js', 'engine.js'].map(async name => {
      const response = await fetch(new URL(name, sourceBase));
      if (!response.ok) throw Error('게임 엔진을 불러오지 못했어요. 새로고침해 주세요.');
      return response.text();
    })).then(([shell, defaults, engine]) => {
      if (shell.split(BUNDLE_MARKER).length !== 2 || /<script\b[^>]*\bsrc\s*=/i.test(shell)) throw Error('게임 엔진 구성을 확인해 주세요.');
      bundle = {shell, defaults, engine};
    }).catch(error => { loading = null; throw error; });
    return loading;
  }

  function safeJson(value) {
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => ({'<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029'}[char]));
  }

  function buildGameHtml(project) {
    if (!bundle) throw Error('게임 엔진이 아직 준비되지 않았어요.');
    const normalized = normalizeProject(project);
    const script = source => '<script>\n' + source.replace(/<\/script/gi, '<\\/script') + '\n</script>';
    const custom = Object.entries(normalized.slots).filter(([,slot]) => slot.mode === 'code');
    // These functions were AST-checked above. Runtime metadata is never eval'd.
    const customSource = custom.length ? '"use strict";\nwindow.SherpaDrawingContext=' + global.SherpaSlotSafety.drawingContext.toString() + ';\nwindow.SherpaCustomSlots=Object.freeze({' + custom.map(([name,slot]) => {
      const fn = global.SherpaSlotSafety.names[name];
      return JSON.stringify(fn) + ':(()=>{\n' + slot.code + '\nreturn ' + fn + ';})()';
    }).join(',\n') + '});' : '';
    const payload = '<script type="application/json" id="sherpa-project">' + safeJson(normalized) + '</script>\n'
      + script(bundle.defaults) + '\n' + (customSource ? script(customSource) + '\n' : '') + script(bundle.engine);
    const html = bundle.shell.replace(BUNDLE_MARKER, () => payload);
    if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) throw Error('게임 파일이 너무 커요. 이전 게임을 유지해요.');
    return html;
  }

  function withConfig(project, patch) {
    const next = copy(project);
    Object.assign(next.config, patch);
    return normalizeProject(next);
  }

  function withPixel(project, pixels) {
    if (pixels !== null && !validPixels(pixels)) invalid();
    const next = copy(project);
    next.slots.hero = {mode: pixels ? 'pixel' : 'default'};
    next.assets.pixel = pixels;
    return normalizeProject(next);
  }

  function withSlot(project, name, code, style) {
    if (!global.SherpaSlotSafety?.isApproved(name, code)) invalid();
    const next = copy(project);
    next.slots[name] = {mode:'code',code};
    if (name === 'obstacle') next.slots.obstacle.style = style || copy(project.slots.obstacle.style);
    return normalizeProject(next);
  }

  global.SherpaProject = Object.freeze({ENGINE_VERSION, abilityIds, soundPresets, init, createProject, normalizeProject, inspectHtml, buildGameHtml, withConfig, withPixel, withSlot});
  global.buildGameHtml = buildGameHtml;
})(window);
