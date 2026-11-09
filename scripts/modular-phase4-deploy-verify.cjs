'use strict';
// Read-only verification: public assets/health and downloaded Worker source.
// No settings, secret values, classroom/board endpoints or database calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),out=path.resolve(__dirname,'../../../85_공룡3_모듈화/4차캡처');
const config=JSON.parse(fs.readFileSync(path.join(repo,'wrangler.json'),'utf8'));
assert.equal(config.name,'ai-sherpa-dino-grade1');
const origin='https://ai-sherpa-dino-grade1.yoon2566.workers.dev';
const report={checkedAt:new Date().toISOString(),origin,assets:[],endpoints:[]};
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',windowsHide:true}).trim();
(async()=>{
 report.commit=git('rev-parse','HEAD');assert.equal(git('branch','--show-current'),'modular');
 const changed=git('diff','--name-only','d4e0663','HEAD').split(/\r?\n/).filter(n=>n.startsWith('assets/'));
 assert(changed.length>0);
 for(const file of changed){
  const url=origin+'/'+file.slice(7)+'?verify='+report.commit;
  const response=await fetch(url,{cache:'no-store'});assert.equal(response.status,200,file);
  const remote=Buffer.from(await response.arrayBuffer()),local=fs.readFileSync(path.join(repo,file));
  const entry={file,localSha256:hash(local),remoteSha256:hash(remote),bytes:remote.length};entry.equal=entry.localSha256===entry.remoteSha256;report.assets.push(entry);assert(entry.equal,file+' hash mismatch');
 }
 const token=process.env.CLOUDFLARE_API_TOKEN;if(!token)throw Error('CLOUDFLARE_API_TOKEN required in process environment');
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+config.account_id+'/workers/scripts/'+config.name,{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200,'Worker source download');
 const type=response.headers.get('content-type')||'';let source;
 if(type.startsWith('multipart/')){
  const form=await response.formData();
  for(const[name,file]of form.entries())if(name==='entry.js'||name.endsWith('/entry.js')||file?.name==='entry.js')source=Buffer.from(typeof file==='string'?file:await file.arrayBuffer());
 }else source=Buffer.from(await response.arrayBuffer());
 assert(source,'entry module missing');
 report.worker={file:'modules/entry.js',localSha256:hash(fs.readFileSync(path.join(repo,'modules/entry.js'))),remoteSha256:hash(source)};report.worker.equal=report.worker.localSha256===report.worker.remoteSha256;assert(report.worker.equal,'Worker source mismatch');
 for(const endpoint of ['/api/health','/lesson']){
  const response=await fetch(origin+endpoint,{cache:'no-store'});report.endpoints.push({path:endpoint,status:response.status});assert.equal(response.status,200,endpoint);await response.body.cancel();
 }
 report.configUnchanged=git('diff','d4e0663','HEAD','--','wrangler.json')==='';assert(report.configUnchanged);
 report.ok=true;console.log(JSON.stringify({ok:true,commit:report.commit,assetHashes:report.assets.length,workerHash:report.worker.equal,endpoints:report.endpoints}));
})().catch(error=>{report.error=error.message;console.error(error.message);process.exitCode=1;}).finally(()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'운영-배포검증.json'),JSON.stringify(report,null,2));});
