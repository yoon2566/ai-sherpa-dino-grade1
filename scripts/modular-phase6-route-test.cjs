'use strict';
// Actual slot/project modules with deterministic router SSE. No external calls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../assets/practice/modular'),out=process.env.MODULAR_CAPTURE_DIR||path.resolve(__dirname,'../../../85_공룡3_모듈화/6차캡처');
const report={scope:'Offline actual apply/prepare router semantics; no network or database',checks:[]};let calls=[],candidate;
const sandbox={URL,TextEncoder,TextDecoder,DOMException,AbortController,Response,console,document:{currentScript:{src:'http://localhost/modular/project.js'}},fetch:async(url,init)=>{calls.push(JSON.parse(init.body));return new Response('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(candidate)},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');}};
sandbox.window=sandbox;sandbox.SherpaSlotSafety={names:{hero:'drawHero',obstacle:'drawObstacle',item:'drawItem',background:'drawBackground'},validateStatic:()=>({ok:true}),isApproved:()=>true,validate:async()=>{throw Error('Config route must not render a drawing');}};
sandbox.SherpaCodeBitmap={render:async()=>{throw Error('Config route must not render a bitmap');}};
vm.createContext(sandbox);for(const name of ['pixel.js','project.js','ai.js'])vm.runInContext(fs.readFileSync(path.join(dir,name),'utf8'),sandbox,{filename:name});
const api=sandbox.SherpaSlotAI,P=sandbox.SherpaProject,plain=value=>JSON.parse(JSON.stringify(value));
const positive=[
 ['속도를 1.8배로 해 줘',{speedMultiplier:1.8}],
 ['조금 느리게 해 줘',{speedMultiplier:.7}],
 ['목숨을 다섯 개로 해 줘',{initialLives:5}],
 ['점프 소리를 반짝으로 바꿔 줘',{soundPreset:'반짝!'}],
 ['속도 1.5배와 목숨 3개로 해 줘',{speedMultiplier:1.5,initialLives:3}]
];
const conditional=[
 ['점점 빨라지게',{speedMultiplier:1.8}],
 ['서서히 느려지게',{speedMultiplier:.7}],
 ['갈수록 더 빨리 달려 줘',{speedMultiplier:2}],
 ['시간이 지날수록 빨라지게',{speedMultiplier:1.8}],
 ['점수가 높아지면 빨라지게',{speedMultiplier:1.8}],
 ['100점마다 목숨을 하나 더 줘',{initialLives:2}],
 ['별을 5개 모으면 목숨을 하나 더 줘',{initialLives:2}],
 ['선물을 얻으면 목숨을 늘려 줘',{initialLives:5}],
 ['아이템을 획득하면 목숨을 줘',{initialLives:3}],
 ['gradually increase speed over time',{speedMultiplier:2}]
];
(async()=>{
 for(const [method,version]of [['apply',2],['prepare',4]]){
  const original=P.createProject();original.authoringVersion=version;const before=JSON.stringify(original);
  for(const [request,config]of positive){
   calls=[];candidate={config};const result=await api[method](original,{mode:'route',request},new AbortController().signal),project=method==='prepare'?result.project:result;
   assert.equal(calls.length,1);assert.equal(calls[0].mode,'route');assert.equal(calls[0].request,request);for(const [key,value]of Object.entries(config))assert.equal(project.config[key],value);assert.deepEqual(plain(project.assets),plain(original.assets));assert.equal(JSON.stringify(original),before);
   const name=version+'차 '+method+' 단순 설정 유지: '+request;report.checks.push({name,pass:true});console.log('PASS '+name);
  }
  for(const [request,config]of conditional){
   calls=[];candidate={config};await assert.rejects(api[method](original,{mode:'route',request},new AbortController().signal),error=>error.code==='UNSUPPORTED_CHANGE');assert.equal(calls.length,1);assert.equal(calls[0].mode,'route');assert.equal(calls[0].request,request);assert.equal(JSON.stringify(original),before);
   const name=version+'차 '+method+' 조건 요청을 상수 설정으로 적용하지 않음: '+request;report.checks.push({name,pass:true});console.log('PASS '+name);
  }
 }
 report.ok=true;
})().catch(error=>{report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(()=>{report.count=report.checks.length;fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'6차-라우터의미검증.json'),JSON.stringify(report,null,2));});
