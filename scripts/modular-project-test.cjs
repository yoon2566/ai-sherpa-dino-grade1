/* Local project contract checks. No classroom API, engine execution or DB. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || path.resolve(__dirname, '../../../70_검수/node_modules/playwright'));

const projectSource = fs.readFileSync(path.resolve(__dirname, '../assets/practice/modular/project.js'), 'utf8');
const routes = {
  '/': ['text/html; charset=utf-8', '<!doctype html><html><head></head><body><script src="/modular/vendor/acorn.js"></script><script src="/modular/safety.js"></script><script src="/modular/project.js"></script></body></html>'],
  '/modular/project.js': ['text/javascript; charset=utf-8', projectSource],
  '/modular/vendor/acorn.js': ['text/javascript; charset=utf-8', fs.readFileSync(path.resolve(__dirname, '../assets/practice/modular/vendor/acorn.js'),'utf8')],
  '/modular/safety.js': ['text/javascript; charset=utf-8', fs.readFileSync(path.resolve(__dirname, '../assets/practice/modular/safety.js'),'utf8')],
  // Fixtures isolate the serialization contract from separately tested physics.
  '/modular/shell.html': ['text/html; charset=utf-8', '<!doctype html><html><head></head><body><!-- SHERPA_GAME_BUNDLE --></body></html>'],
  '/modular/defaults.js': ['text/javascript; charset=utf-8', 'window.fixtureDefault = "</script>";'],
  '/modular/engine.js': ['text/javascript; charset=utf-8', 'window.fixtureEngineLoaded = true;']
};
const server = http.createServer((request, response) => {
  const route = routes[new URL(request.url, 'http://127.0.0.1').pathname];
  response.writeHead(route ? 200 : 404, {'Content-Type': route?.[0] || 'text/plain'});
  response.end(route?.[1] || 'Not found');
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    const results = await page.evaluate(async () => {
      const api = window.SherpaProject, passed = [];
      const check = (name, condition) => { if (!condition) throw Error(name); passed.push(name); };
      const rejects = callback => { try { callback(); return false; } catch { return true; } };
      await api.init();
      const initial = api.createProject();
      const initialJson = JSON.stringify(initial);
      check('default version and local settings', initial.formatVersion === 2 && initial.engineVersion === '1.0.0' && initial.config.initialLives === 1 && !initial.config.itemsEnabled);
      const configured = api.withConfig(initial, {speedMultiplier: 2.5, initialLives: 9, itemsEnabled: true, abilityId: 'magnet', soundPreset: '반짝!'});
      const pixels = '1' + '0'.repeat(255), painted = api.withPixel(configured, pixels), reset = api.withPixel(painted, null);
      check('settings and pixels leave prior project immutable', JSON.stringify(initial) === initialJson && configured.assets.pixel === null);
      check('pixel mode uses exact editor data', painted.slots.hero.mode === 'pixel' && painted.assets.pixel === pixels);
      check('pixel reset preserves other settings', reset.slots.hero.mode === 'default' && reset.assets.pixel === null && reset.config.initialLives === 9 && reset.config.abilityId === 'magnet');
      const escapedText = '</script><script><!--&lt;&amp;>&\u2028\u2029';
      const escapedProject = api.withConfig(painted, {itemName: escapedText});
      const html = api.buildGameHtml(escapedProject);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const meta = doc.querySelector('#sherpa-project');
      check('metadata escapes script delimiters, comments, entities and line separators', !/[<>&\u2028\u2029]/.test(meta.textContent) && JSON.parse(meta.textContent).config.itemName === escapedText);
      check('exact metadata roundtrip including entity text and pixels', JSON.stringify(api.inspectHtml(html).project) === JSON.stringify(escapedProject));
      check('metadata cannot create extra script elements', doc.querySelectorAll('script').length === new DOMParser().parseFromString(api.buildGameHtml(painted),'text/html').querySelectorAll('script').length);
      const duplicate = html.replace('</body>', meta.outerHTML + '</body>');
      check('duplicate metadata is unsupported', api.inspectHtml(duplicate).kind === 'unsupported');
      check('malformed metadata is unsupported', api.inspectHtml('<html><script type="application/json" id="sherpa-project">{broken}</script></html>').kind === 'unsupported');
      check('wrong metadata MIME type is unsupported', api.inspectHtml(html.replace('type="application/json"', 'type="text/plain"')).kind === 'unsupported');
      const unknown = html.replace('"engineVersion":"1.0.0"', '"engineVersion":"99.0.0"');
      check('unknown version stays outside editor', api.inspectHtml(unknown).kind === 'unsupported');
      const olderFormat = html.replace('"formatVersion":2', '"formatVersion":3');
      check('unknown format stays outside editor', api.inspectHtml(olderFormat).kind === 'unsupported');
      check('plain legacy HTML keeps legacy route', api.inspectHtml('<html><script>window.legacy=true;</script></html>').kind === 'legacy');
      for (const [name, patch] of [['lives 0', {initialLives: 0}], ['lives 10', {initialLives: 10}], ['fractional lives', {initialLives: 1.5}], ['slow speed outside range', {speedMultiplier: 0.1}], ['fast speed outside range', {speedMultiplier: 3}], ['non-finite speed', {speedMultiplier: Infinity}], ['unknown ability', {abilityId: 'flight'}], ['unknown sound', {soundPreset: 'remote.mp3'}], ['non-boolean items', {itemsEnabled: 'true'}]]) {
        check('reject ' + name, rejects(() => api.withConfig(initial, patch)));
      }
      for (const [name, value] of [['empty pixels', '0'.repeat(256)], ['short pixels', '1'.repeat(255)], ['palette overflow', 'A'.repeat(256)], ['pixel object', {}]]) {
        check('reject ' + name, rejects(() => api.withPixel(initial, value)));
      }
      const wrongVersion = api.createProject(); wrongVersion.engineVersion = '99.0.0';
      check('builder refuses engine version replacement', rejects(() => api.buildGameHtml(wrongVersion)));
      const unvalidated = api.createProject(); unvalidated.slots.hero.code = 'function drawHero(ctx,v){while(true){}}';
      check('builder never accepts unsafe slot code', rejects(() => api.buildGameHtml(unvalidated)));
      const missingPixel = api.createProject(); missingPixel.slots.hero.mode = 'pixel';
      check('pixel mode requires actual opaque pixels', rejects(() => api.buildGameHtml(missingPixel)));
      const obstacleCode = 'function drawObstacle(ctx,v){ctx.fillRect(0,0,v.w,v.h);}';
      const checked = await window.SherpaSlotSafety.validate('obstacle',obstacleCode);
      check('safe custom slot passes isolated trial', checked.ok && ['worker','fallback'].includes(checked.execution));
      const rounded = api.withSlot(initial,'obstacle',obstacleCode,{sizeScale:1.3,shape:'round'});
      check('validated round obstacle survives single HTML roundtrip', api.inspectHtml(api.buildGameHtml(rounded)).project.slots.obstacle.style.shape === 'round');
      check('validated custom source stays unchanged in metadata', api.inspectHtml(api.buildGameHtml(rounded)).project.slots.obstacle.code === obstacleCode);
      check('installing a custom slot leaves previous project immutable', JSON.stringify(initial) === initialJson);
      check('unknown obstacle shapes are rejected', rejects(() => api.withSlot(initial,'obstacle',obstacleCode,{sizeScale:1,shape:'triangle'})));
      const frame = document.createElement('iframe'); frame.srcdoc = html;
      const loaded = new Promise(resolve => frame.onload = resolve); document.body.append(frame); await loaded;
      check('trusted source closing script string remains executable', frame.contentWindow.fixtureDefault === '</script>' && frame.contentWindow.fixtureEngineLoaded === true);
      frame.remove();
      return {passed: passed.length, checks: passed};
    });
    const output = process.env.MODULAR_CAPTURE_DIR || path.resolve(__dirname, '../../../85_공룡3_모듈화/2차캡처');
    fs.mkdirSync(output, {recursive: true});
    fs.writeFileSync(path.join(output, 'project-contract.json'), JSON.stringify(results, null, 2) + '\n');
    console.log('PASS modular project contracts: ' + results.passed + ' checks');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
