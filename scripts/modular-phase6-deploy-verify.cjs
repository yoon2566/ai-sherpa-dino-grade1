'use strict';
// Read-only evidence. No AI, classroom, board, database, password or write APIs.
// PowerShell caller maps 1_CLOUDFLARE_API_TOKEN to CLOUDFLARE_API_TOKEN only
// for the process; this script never serializes tokens or Worker source.
// Usage: node scripts/modular-phase6-deploy-verify.cjs --before
//        node scripts/modular-phase6-deploy-verify.cjs <deployed-version-uuid>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const out = path.resolve(__dirname, '../../../85_공룡3_모듈화/6차캡처');
const baseline = '556020b8b197c813ef87c5589dbd6041c57aea04';
const rollbackTag = '2026-11-10-0157버전';
const before = process.argv.includes('--before');
const expectedVersion = before ? '838c2371-0dfe-4131-8047-c101ff278dfc' : process.argv[2];
const origin = 'https://ai-sherpa-dino-grade1.yoon2566.workers.dev';
const protectedExpected = {master:'a54bbdc75a9e6c3c7ca354767dfe98eda9f17745','board-expand':'55be3e2b4c836e6b3d399f66ff4189835c4c1bb2','qr-big':'d15c83e64ed7888c468165cd9d7052462f36380c'};
const report = {checkedAt:new Date().toISOString(),before,baseline,rollbackTag,origin,assets:[],endpoints:[]};
const git = (...args) => execFileSync('git', ['-c','core.quotepath=false',...args], {cwd:repo,windowsHide:true,encoding:'utf8'}).trim();
const lines = value => value.split(/\r?\n/).filter(Boolean);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function compare(file,local,remote) {
  const entry={file,localSha256:hash(local),remoteSha256:hash(remote)};
  entry.equal=entry.localSha256===entry.remoteSha256;
  // Git stores LF; the rollback version predates this verifier and includes
  // one CRLF in game-sharing.js. Record that distinction, never call it a
  // byte match. Post-deployment checks always require exact local bytes.
  if(before && !entry.equal) {
    entry.normalizedLocalSha256=hash(local.toString('utf8').replace(/\r\n/g,'\n'));
    entry.normalizedRemoteSha256=hash(remote.toString('utf8').replace(/\r\n/g,'\n'));
    entry.lineEndingsOnly=entry.normalizedLocalSha256===entry.normalizedRemoteSha256;
  }
  return entry;
}
const baselineFile = file => execFileSync('git', ['show',baseline+':'+file], {cwd:repo,windowsHide:true,maxBuffer:25000000});
const auth = () => ({Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN});
async function read(url, headers) {
  return fetch(url,{method:'GET',headers,cache:'no-store',signal:AbortSignal.timeout(30000)});
}
async function api(endpoint) {
  const response = await read('https://api.cloudflare.com/client/v4/'+endpoint,auth());
  assert.equal(response.status,200,endpoint+' HTTP status');
  const body = await response.json();
  assert.equal(body.success,true,endpoint+' API success');
  return body.result;
}
(async()=>{
  assert(process.env.CLOUDFLARE_API_TOKEN,'CLOUDFLARE_API_TOKEN required in process environment');
  assert.match(expectedVersion || '',/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,'expected deployment UUID required');
  const configBytes = fs.readFileSync(path.join(repo,'wrangler.json'));
  const config = JSON.parse(configBytes.toString('utf8'));
  assert.equal(config.name,'ai-sherpa-dino-grade1');
  assert.equal(config.account_id,'82356ad65ade9e0a481f823ca538d437');
  assert.equal(git('branch','--show-current'),'modular');
  assert.equal(git('rev-parse',rollbackTag+'^{commit}'),baseline,'rollback tag changed');
  report.commit = git('rev-parse','HEAD');
  report.configSha256 = hash(configBytes);
  report.baselineConfigSha256 = hash(baselineFile('wrangler.json'));
  assert.equal(report.configSha256,report.baselineConfigSha256,'production wrangler.json changed');
  report.protectedBranches = Object.fromEntries(Object.keys(protectedExpected).map(branch=>[branch,git('rev-parse',branch)]));
  assert.deepEqual(report.protectedBranches,protectedExpected,'protected branch changed');
  if(!before) assert.equal(git('status','--porcelain','--','assets','modules','wrangler.json'),'','runtime files must be committed and unchanged after deployment');
  report.tokenStatus = (await api('user/tokens/verify')).status;
  assert.equal(report.tokenStatus,'active');
  const base = 'accounts/'+config.account_id+'/workers/scripts/'+config.name;
  const deployment = (await api(base+'/deployments')).deployments[0];
  assert(deployment,'current deployment missing');
  report.deployment = {id:deployment.id,created_on:deployment.created_on,source:deployment.source,versions:deployment.versions};
  assert.deepEqual(deployment.versions,[{version_id:expectedVersion,percentage:100}],'expected version must serve 100 percent');
  const tracked = lines(git('diff','--name-only',baseline,...(before?[]:['HEAD']),'--','assets','modules','wrangler.json'));
  const untracked = before ? lines(git('ls-files','--others','--exclude-standard','--','assets','modules')) : [];
  report.changedRuntimeFiles = [...new Set([...tracked,...untracked])].sort();
  // Include the planned edit surfaces before they have been saved by another
  // implementation task, so the original production copies are captured too.
  const expectedAssets = before ? ['assets/board.html','assets/board.js','assets/practice/chat.js','assets/practice/game-sharing.js','assets/practice/game-api.js'] : [];
  const changedAssets = [...new Set([...report.changedRuntimeFiles.filter(file=>file.startsWith('assets/')),...expectedAssets])].sort();
  assert(changedAssets.length>0,'no changed assets to compare');
  const baselinePaths = new Set(lines(git('ls-tree','-r','--name-only',baseline,'--','assets')));
  for(const file of changedAssets) {
    if(before && !baselinePaths.has(file)) {report.assets.push({file,addedAfterBaseline:true,checked:false});continue;}
    const response = await read(origin+'/'+file.slice(7)+'?verify='+Date.now());
    assert.equal(response.status,200,file+' HTTP status');
    const remote = Buffer.from(await response.arrayBuffer());
    const local = before ? baselineFile(file) : fs.readFileSync(path.join(repo,file));
    const entry = compare(file,local,remote);
    report.assets.push(entry);
    assert(entry.equal || before && entry.lineEndingsOnly,file+' SHA-256 mismatch');
  }
  const sourceResponse = await read('https://api.cloudflare.com/client/v4/'+base,auth());
  assert.equal(sourceResponse.status,200,'Worker source HTTP status');
  let source;
  if((sourceResponse.headers.get('content-type') || '').startsWith('multipart/')) {
    for(const [name,file] of (await sourceResponse.formData()).entries()) {
      if(name==='entry.js' || name.endsWith('/entry.js') || file?.name==='entry.js') source=Buffer.from(typeof file==='string'?file:await file.arrayBuffer());
    }
  } else source=Buffer.from(await sourceResponse.arrayBuffer());
  assert(source,'entry.js missing from deployed Worker');
  const localWorker = before ? baselineFile('modules/entry.js') : fs.readFileSync(path.join(repo,'modules/entry.js'));
  report.worker = compare('modules/entry.js',localWorker,source);
  assert(report.worker.equal || before && report.worker.lineEndingsOnly,'Worker entry.js SHA-256 mismatch');
  for(const endpoint of ['/api/health','/lesson']) {
    const response=await read(origin+endpoint);
    report.endpoints.push({path:endpoint,status:response.status});
    assert.equal(response.status,200,endpoint+' HTTP status');
    await response.body?.cancel();
  }
  report.ok=true;
  console.log(JSON.stringify({ok:true,before,commit:report.commit,version:expectedVersion,assetHashes:report.assets.filter(item=>item.equal).length,assetLineEndingsOnly:report.assets.filter(item=>item.lineEndingsOnly).map(item=>item.file),workerEqual:report.worker.equal,endpoints:report.endpoints,protectedBranches:report.protectedBranches}));
})().catch(error=>{
  // No response bodies or fetch options are logged, including on failure.
  report.error=error.message;console.error(error.message);process.exitCode=1;
}).finally(()=>{
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,before?'운영-배포전검증.json':'운영-배포검증.json'),JSON.stringify(report,null,2)+'\n');
});
