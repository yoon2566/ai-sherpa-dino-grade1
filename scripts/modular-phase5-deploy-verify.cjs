'use strict';
// Read-only deployment evidence. Never calls classroom, artwork, password or DB APIs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const out = path.resolve(__dirname, '../../../85_공룡3_모듈화/5차캡처');
const baseline = '8021a106a621fffa5004272d46cdb5e486c93e50';
const before = process.argv.includes('--before');
const expectedVersion = before ? 'c3757a1f-1b5a-4abc-8a81-941442460f58' : process.argv[2];
const config = JSON.parse(fs.readFileSync(path.join(repo, 'wrangler.json'), 'utf8'));
const origin = 'https://ai-sherpa-dino-grade1.yoon2566.workers.dev';
const report = {checkedAt:new Date().toISOString(), before, baseline, origin, assets:[], endpoints:[]};
const git = (...args) => execFileSync('git', args, {cwd:repo, windowsHide:true, encoding:'utf8'}).trim();
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const baselineFile = file => execFileSync('git', ['show', baseline + ':' + file], {cwd:repo, windowsHide:true, maxBuffer:25000000});
async function api(endpoint) {
  const response = await fetch('https://api.cloudflare.com/client/v4/' + endpoint, {headers:{Authorization:'Bearer ' + process.env.CLOUDFLARE_API_TOKEN}});
  assert.equal(response.status, 200, endpoint);
  const body = await response.json();
  assert.equal(body.success, true, endpoint);
  return body.result;
}
(async () => {
  assert(process.env.CLOUDFLARE_API_TOKEN, 'CLOUDFLARE_API_TOKEN required in process environment');
  assert.equal(config.name, 'ai-sherpa-dino-grade1');
  assert.equal(git('branch', '--show-current'), 'modular');
  report.commit = git('rev-parse', 'HEAD');
  report.tokenStatus = (await api('user/tokens/verify')).status;
  assert.equal(report.tokenStatus, 'active');
  const base = 'accounts/' + config.account_id + '/workers/scripts/' + config.name;
  const deployments = await api(base + '/deployments');
  report.deployment = deployments.deployments[0];
  assert(expectedVersion, 'expected version ID required');
  assert.deepEqual(report.deployment.versions, [{version_id:expectedVersion, percentage:100}]);
  const changed = before ? ['assets/practice/grade1-pixel.js','assets/practice/grade1-pixel.css'] : git('diff', '--name-only', baseline, 'HEAD').split(/\r?\n/).filter(file => file.startsWith('assets/'));
  assert(changed.length > 0, 'no assets to compare');
  for (const file of changed) {
    const response = await fetch(origin + '/' + file.slice(7) + '?verify=' + Date.now(), {cache:'no-store'});
    assert.equal(response.status, 200, file);
    const remote = Buffer.from(await response.arrayBuffer());
    const local = before ? baselineFile(file) : fs.readFileSync(path.join(repo, file));
    const entry = {file, localSha256:hash(local), remoteSha256:hash(remote)};
    entry.equal = entry.localSha256 === entry.remoteSha256;
    report.assets.push(entry);
    assert(entry.equal, file + ' SHA-256 mismatch');
  }
  const response = await fetch('https://api.cloudflare.com/client/v4/' + base, {headers:{Authorization:'Bearer ' + process.env.CLOUDFLARE_API_TOKEN}});
  assert.equal(response.status, 200, 'Worker source');
  let source;
  if ((response.headers.get('content-type') || '').startsWith('multipart/')) {
    for (const [name, file] of (await response.formData()).entries()) {
      if (name === 'entry.js' || name.endsWith('/entry.js') || file?.name === 'entry.js') source = Buffer.from(typeof file === 'string' ? file : await file.arrayBuffer());
    }
  } else source = Buffer.from(await response.arrayBuffer());
  assert(source, 'entry.js missing');
  report.worker = {localSha256:hash(fs.readFileSync(path.join(repo,'modules/entry.js'))), remoteSha256:hash(source)};
  assert.equal(report.worker.localSha256, report.worker.remoteSha256);
  for (const endpoint of ['/api/health', '/lesson']) {
    const response = await fetch(origin + endpoint, {cache:'no-store'});
    report.endpoints.push({path:endpoint,status:response.status});
    assert.equal(response.status,200,endpoint);
    await response.body.cancel();
  }
  report.configSha256 = hash(fs.readFileSync(path.join(repo,'wrangler.json')));
  assert.equal(report.configSha256, hash(baselineFile('wrangler.json')));
  report.protectedBranches = Object.fromEntries(['master','board-expand'].map(branch => [branch,git('rev-parse',branch)]));
  assert.deepEqual(report.protectedBranches,{master:'a54bbdc75a9e6c3c7ca354767dfe98eda9f17745','board-expand':'55be3e2b4c836e6b3d399f66ff4189835c4c1bb2'});
  report.ok = true;
  console.log(JSON.stringify({ok:true,before,commit:report.commit,version:expectedVersion,assetHashes:report.assets.length,endpoints:report.endpoints}));
})().catch(error => {report.error=error.message;console.error(error.message);process.exitCode=1;}).finally(() => {
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,before?'운영-배포전검증.json':'운영-배포검증.json'),JSON.stringify(report,null,2)+'\n');
});
