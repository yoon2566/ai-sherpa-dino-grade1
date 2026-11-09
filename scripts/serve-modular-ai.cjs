'use strict';
// Local dev only. Caller supplies SHERPA_OPENROUTER_KEY through process env.
// No classroom/board D1 bindings, production account, remote mode or key file.
const path = require('node:path');
const {spawn} = require('node:child_process');
const repo = path.resolve(__dirname,'..');
const key = process.env.SHERPA_OPENROUTER_KEY;
if (!key) throw Error('SHERPA_OPENROUTER_KEY runtime environment is required');
const env = {};
for (const name of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','COMSPEC','PATHEXT']) {
  if (process.env[name]) env[name] = process.env[name];
}
// secrets.required loads the selected process secret through Wrangler's dotenv
// loader. Disabling that loader also disables process-secret loading in 4.152.
Object.assign(env,{SHERPA_OPENROUTER_KEY:key,WRANGLER_SEND_METRICS:'false',CI:'true'});
const child = spawn(process.execPath,[path.join(repo,'node_modules/wrangler/bin/wrangler.js'),'dev','--config',path.join(__dirname,'wrangler-modular-local.json'),'--local','--ip','127.0.0.1','--port','19186','--inspector-port','0','--persist-to',path.join(repo,'.wrangler/modular-phase2-local'),'--log-level','error','--no-show-interactive-dev-session'],{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
for (const stream of [child.stdout,child.stderr]) stream.on('data',chunk => process.stdout.write(chunk.toString().split(key).join('[REDACTED]')));
child.on('exit',code=>process.exit(code||0));
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
console.log('Local-only Wrangler starting at http://127.0.0.1:19186; no classroom DB bindings.');
