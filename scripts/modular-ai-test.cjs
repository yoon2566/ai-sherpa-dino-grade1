'use strict';
// Authoring/SSE contracts with deterministic in-memory responses. No network or DB.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../assets/practice/modular');
const out = process.env.MODULAR_CAPTURE_DIR || path.resolve(__dirname,'../../../85_공룡3_모듈화/3차캡처');
const report={scope:'Node VM, actual pixel/project/AI modules with mock SSE and drawing-validation stub; no network',checks:[]};
const plain=value=>JSON.parse(JSON.stringify(value));
let calls=[],responder;
const sandbox={URL,TextEncoder,TextDecoder,DOMException,AbortController,ReadableStream,Response,console,document:{currentScript:{src:'http://127.0.0.1/modular/project.js'}},fetch:async(url,init)=>{
  const payload=JSON.parse(init.body);calls.push(payload);return responder(payload,calls.length,init.signal);
}};
sandbox.window=sandbox;sandbox.SherpaSlotSafety={names:{hero:'drawHero',background:'drawBackground',obstacle:'drawObstacle',item:'drawItem'},
  validateStatic:()=>({ok:true}),isApproved:()=>true,validate:async(slot,code)=>({ok:typeof code==='string'&&!code.includes('REJECT'),code})};
vm.createContext(sandbox);for(const name of['pixel.js','project.js','ai.js'])vm.runInContext(fs.readFileSync(path.join(dir,name),'utf8'),sandbox,{filename:name});
const api=sandbox.SherpaSlotAI,projectApi=sandbox.SherpaProject;
const art={palette:['#f28c28','#3b2a1a'],pixels:Array.from({length:16},(_,y)=>y<3||y>13?'.'.repeat(16):'...0000111100...')};
const twelve={palette:Array.from({length:12},(_,i)=>'#'+(0x112233+i*0x10101).toString(16)),pixels:Array.from({length:16},(_,y)=>y<3||y>13?'.'.repeat(16):'...ab00111100...')};
const background='function drawBackground(ctx, v) { ctx.fillRect(0, 0, v.w, v.h); }';
const hero='function drawHero(ctx, v) { ctx.fillRect(0, 0, 44, 47); }';
function response(raw,{finish='stop',done=true,usage={prompt_tokens:123,completion_tokens:456,cost:.0002}}={}){
  let body='';for(let i=0;i<raw.length;i+=31)body+='data: '+JSON.stringify({choices:[{delta:{content:raw.slice(i,i+31)}}]})+'\r\n\r\n';
  if(finish!==null||usage)body+='data: '+JSON.stringify({choices:[{delta:{},finish_reason:finish}],usage})+'\r\n\r\n';
  if(done)body+='data: [DONE]\r\n\r\n';
  const bytes=new TextEncoder().encode(body);
  return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}});
}
function mock(fn=()=>response(JSON.stringify(art))){calls=[];responder=fn;}
async function check(name,fn){await fn();report.checks.push({name,pass:true});console.log('PASS '+name);}
const intent={mode:'slot',slot:'hero',freshHero:true,request:'로봇으로 새로 그려 줘.'};
const signal=()=>new AbortController().signal;
(async()=>{
  const original=projectApi.withPixel(projectApi.createProject(),'hero',twelve),before=JSON.stringify(original);
  await check('새 캐릭터 선택은 이전 그림·명시 current 모두 전송하지 않음',async()=>{mock();const result=await api.prepare(original,{...intent,current:twelve},signal());assert.equal(calls.length,1);assert.equal(calls[0].mode,'pixel');assert.equal(Object.hasOwn(calls[0],'current'),false);assert.equal(result.project,undefined);assert.deepEqual(plain(result.draft),art);assert.equal(JSON.stringify(original),before);});
  await check('새 캐릭터 밑그림 다시 그려줘도 빈 상태 요청',async()=>{mock();const proposal=await api.prepare(original,intent,signal());await api.redraw(original,proposal,twelve,signal());assert.equal(calls.length,2);assert.equal(Object.hasOwn(calls[1],'current'),false);assert.equal(calls[1].redraw,true);assert.equal(calls[1].request,intent.request);});
  await check('확인한 캐릭터 다시 그리기는 현재 12색 그림 전송',async()=>{mock();const result=await api.prepare(original,{...intent,freshHero:false,redraw:true},signal());assert.deepEqual(calls[0].current,twelve);assert.equal(result.project,undefined);});
  await check('수정 중 다시 그려줘는 현재 편집한 12색 그림 전송',async()=>{mock();const proposal=await api.prepare(original,{...intent,freshHero:false,redraw:true},signal());const edited=plain(twelve);edited.pixels[0]='b'+'.'.repeat(15);await api.redraw(original,proposal,edited,signal());assert.deepEqual(calls[1].current,edited);});
  await check('9단계 캐릭터는 라우터 1회 뒤 현재 그림 pixel 생성',async()=>{mock(payload=>response(payload.mode==='route'?JSON.stringify({slot:'hero',request:'캐릭터 색 파랗게'}):JSON.stringify(art)));const result=await api.prepare(original,{mode:'route',request:'캐릭터 색 파랗게'},signal());assert.equal(result.slot,'hero');assert.deepEqual(calls.map(x=>x.mode),['route','pixel']);assert.equal(calls[0].artMode,'pixel');assert.deepEqual(calls[0].current,{});assert.deepEqual(calls[1].current,twelve);assert.equal(JSON.stringify(original),before);});
  await check('9단계 장애물은 현재 장애물 그림만 전송',async()=>{const p=projectApi.withPixel(original,'obstacle',twelve);mock(payload=>response(payload.mode==='route'?JSON.stringify({slot:'obstacle',request:'장애물 더 뾰족하게'}):JSON.stringify(art)));const result=await api.prepare(p,{mode:'route',request:'장애물 더 뾰족하게'},signal());assert.equal(result.slot,'obstacle');assert.deepEqual(calls[1].current,twelve);});
  await check('9단계 지원 불가는 한 번만 요청·이전 게임 유지',async()=>{mock(()=>response('{"unsupported":true}'));await assert.rejects(api.prepare(original,{mode:'route',request:'다른 게임으로'},signal()),error=>error.code==='UNSUPPORTED_CHANGE');assert.equal(calls.length,1);assert.equal(JSON.stringify(original),before);});
  await check('3차 라우터의 hero 코드 응답 거절',async()=>{mock(()=>response(JSON.stringify({slot:'hero',code:hero})));await assert.rejects(api.prepare(original,{mode:'route',request:'파란 캐릭터'},signal()),/잘 안 됐어요/);assert.equal(calls.length,1);});
  await check('9단계 배경 응답은 코드 검사 후 프로젝트 반환·추가 AI 없음',async()=>{mock(()=>response(JSON.stringify({slot:'background',code:background})));const result=await api.prepare(original,{mode:'route',request:'바닷가 배경'},signal());assert.equal(calls.length,1);assert.equal(result.project.slots.background.mode,'code');assert.equal(result.project.slots.background.code,background);assert.deepEqual(plain(result.project.assets.pixel),twelve);});
  await check('9단계 배경 그림 검사 실패는 같은 배경 slot만 1회 재요청',async()=>{mock(payload=>response(payload.mode==='route'?JSON.stringify({slot:'background',code:'REJECT'}):'```javascript\n'+background+'\n```'));const result=await api.prepare(original,{mode:'route',request:'바닷가 배경'},signal());assert.deepEqual(calls.map(x=>x.mode),['route','slot']);assert.equal(calls[1].slot,'background');assert.equal(result.project.slots.background.code,background);});
  await check('배경 선택은 2차 코드 경로 유지',async()=>{mock(()=>response('```javascript\n'+background+'\n```'));const result=await api.prepare(original,{mode:'slot',slot:'background',request:'바닷가'},signal());assert.equal(calls[0].mode,'slot');assert.equal(result.project.slots.background.code,background);});
  await check('2차 작품 apply는 hero 코드·이전 코드 전송 호환',async()=>{const old=projectApi.withSlot(original,'hero',hero);old.authoringVersion=2;mock(()=>response('```javascript\n'+hero+'\n```'));const result=await api.apply(old,{mode:'slot',slot:'hero',request:'로봇'},signal());assert.equal(calls[0].mode,'slot');assert.equal(calls[0].current,hero);assert.equal(result.slots.hero.mode,'code');assert.equal(result.authoringVersion,2);});
  await check('9단계 허용 설정은 AI 한 번·그림 불변',async()=>{mock(()=>response('{"config":{"initialLives":5,"speedMultiplier":1.5}}'));const result=await api.prepare(original,{mode:'route',request:'목숨 다섯, 조금 빠르게'},signal());assert.equal(calls.length,1);assert.equal(result.project.config.initialLives,5);assert.equal(result.project.config.speedMultiplier,1.5);assert.deepEqual(plain(result.project.assets),plain(original.assets));});
  await check('잘못된 라우터·임의 설정·혼합 칸·배경 request 거절',async()=>{for(const value of[{config:{initialLives:10}},{config:{gravity:1}},{slot:'hero',request:'',code:hero},{slot:'background',request:'바다'},{unsupported:false},[]])assert.throws(()=>api.parseRoute(JSON.stringify(value)));});
  await check('밑그림 형식 실패 후 한 번만 재요청하여 성공',async()=>{mock((payload,n)=>response(n===1?'{"palette":[],"pixels":[]}':JSON.stringify(art)));const result=await api.prepare(original,intent,signal());assert.equal(calls.length,2);assert.equal(calls[1].retry,true);assert.equal(calls[1].request,intent.request);assert.equal(Object.hasOwn(calls[1],'current'),false);assert.deepEqual(plain(result.draft),art);});
  for(const length of[1990,2000]){
    await check(`${length}자 라우터 요청은 반복 다시 그려줘·재시도에도 원문 길이 유지`,async()=>{
      const request='파'.repeat(length);let pixelCalls=0;
      mock(payload=>{
        assert(payload.request.length<=2000,'server request boundary');
        if(payload.mode==='route')return response(JSON.stringify({slot:'hero',request}));
        pixelCalls++;
        return response(pixelCalls===2?'{"palette":[],"pixels":[]}':JSON.stringify(art));
      });
      let proposal=await api.prepare(original,{mode:'route',request:'캐릭터 파랗게'},signal());
      for(let repeat=0;repeat<4;repeat++)proposal=await api.redraw(original,proposal,twelve,signal());
      const pixel=calls.filter(payload=>payload.mode==='pixel');assert.equal(pixel.length,6);
      assert(pixel.every(payload=>payload.request===request));assert(pixel.slice(1).every(payload=>payload.redraw===true));
      assert.equal(pixel[2].retry,true);assert.equal(proposal.intent.request,request);assert.equal(JSON.stringify(original),before);
    });
  }
  await check('행 길이·팔레트 오류는 보정하여 1회 응답으로 성공',async()=>{mock(()=>response(JSON.stringify({palette:['bad','#123456'],pixels:Array(15).fill('111111111111111')})));const result=await api.prepare(original,intent,signal());assert.equal(calls.length,1);assert.equal(result.draft.pixels.length,16);assert.equal(result.draft.palette[0],'#123456');assert.equal(JSON.stringify(original),before);});
  await check('보정 후 38칸이면 정확히 1회 재요청 뒤 쉬운 안내',async()=>{mock(()=>response(JSON.stringify({palette:['#123456'],pixels:['0'.repeat(16),'0'.repeat(16),'000000']})));await assert.rejects(api.prepare(original,intent,signal()),/잘 안 됐어요/);assert.equal(calls.length,2);assert.equal(calls[1].retry,true);assert.equal(JSON.stringify(original),before);});
  await check('두 차례 형식 실패는 쉬운 안내·원본 유지',async()=>{mock(()=>response('bad json'));await assert.rejects(api.prepare(original,intent,signal()),/잘 안 됐어요\. 다시 해봐요\./);assert.equal(calls.length,2);assert.equal(JSON.stringify(original),before);});
  await check('분리된 캐릭터는 재요청 후 연결된 밑그림만 통과',async()=>{const disconnected={palette:['#000000'],pixels:Array.from({length:16},(_,y)=>y<5||y>10?'00000......00000':'.'.repeat(16))};mock((payload,n)=>response(JSON.stringify(n===1?disconnected:art)));const result=await api.prepare(original,intent,signal());assert.equal(calls.length,2);assert(sandbox.SherpaPixel.measure(result.draft).connectedRatio>=.9);});
  await check('선물 제안은 이름을 보존하되 확인 전 게임 설정을 켜지 않음',async()=>{mock();const result=await api.prepare(original,{mode:'slot',slot:'item',request:'사과',itemName:'사과'},signal());assert.equal(result.intent.itemName,'사과');assert.equal(result.project,undefined);assert.equal(original.config.itemsEnabled,false);});
  await check('요청 전 abort는 AI를 호출하지 않음',async()=>{mock();const c=new AbortController();c.abort();await assert.rejects(api.prepare(original,intent,c.signal),error=>error.name==='AbortError');assert.equal(calls.length,0);});
  await check('응답 중 abort는 재요청 없이 종료',async()=>{const c=new AbortController();mock(()=>{c.abort();return response(JSON.stringify(art));});await assert.rejects(api.prepare(original,intent,c.signal),error=>error.name==='AbortError');assert.equal(calls.length,1);});
  await check('기존 9색 문자열은 현재 픽셀 객체로 변환',async()=>{const p=projectApi.withPixel(original,'1'+'0'.repeat(255));const current=api.currentPixel(p,'hero');assert.equal(current.palette.length,9);assert.equal(current.pixels[0],'0'+'.'.repeat(15));assert.equal(api.currentPixel(projectApi.createProject(),'hero'),undefined);});
  await check('SSE 분할 UTF-8·CRLF·usage·완료 진행 표시 보존',async()=>{const progress=[];mock(()=>response('안녕하세요\n픽셀 밑그림'));const result=await api.receive({mode:'pixel',slot:'hero',request:'안녕'},signal(),(...args)=>progress.push(args));assert.equal(result.raw,'안녕하세요\n픽셀 밑그림');assert.deepEqual(plain(result.usage),{prompt_tokens:123,completion_tokens:456,cost:.0002});assert.deepEqual(progress.at(-1),[result.raw.length,2]);});
  await check('SSE DONE 없는 stop 정상 종료 허용',async()=>{mock(()=>response('ok',{done:false}));assert.equal((await api.receive({},signal())).raw,'ok');});
  await check('SSE 비정상 종료·길이 중단·필터 중단 거절',async()=>{for(const options of[{finish:null,done:false,usage:null},{finish:'length'},{finish:'content_filter'},{finish:'error'}]){mock(()=>response('partial',options));await assert.rejects(api.receive({},signal()),/잘 안 됐어요/);}});
  await check('SSE JSON 파손은 두 번까지만 요청',async()=>{mock(()=>new Response('data: {broken}\n\n'));await assert.rejects(api.prepare(original,intent,signal()),/잘 안 됐어요/);assert.equal(calls.length,2);});
  await check('SSE 오류 객체·빈 응답 거절',async()=>{for(const text of['data: {"error":{"message":"fixture"}}\n\n','data: [DONE]\n\n']){mock(()=>new Response(text));await assert.rejects(api.receive({},signal()),/잘 안 됐어요/);}});
  await check('32,000자 초과 응답 거절',async()=>{mock(()=>response('x'.repeat(32001)));await assert.rejects(api.receive({},signal()),/잘 안 됐어요/);});
  await check('20,000자 초과 요청은 fetch 이전 거절',async()=>{mock();await assert.rejects(api.receive({request:'x'.repeat(20001)},signal()),/잘 안 됐어요/);assert.equal(calls.length,0);});
  await check('HTTP 실패는 응답 본문 정리',async()=>{let cancelled=0;mock(()=>({ok:false,body:{cancel:async()=>cancelled++}}));await assert.rejects(api.receive({},signal()),/잘 안 됐어요/);assert.equal(cancelled,1);});
  await check('SSE 파싱 오류에도 reader 취소·lock 해제',async()=>{let cancelled=0,released=0;mock(()=>({ok:true,body:{getReader:()=>({read:async()=>({done:false,value:new TextEncoder().encode('data: bad\n')}),cancel:async()=>cancelled++,releaseLock:()=>released++})}}));await assert.rejects(api.receive({},signal()));assert.equal(cancelled,1);assert.equal(released,1);});
  assert.equal(JSON.stringify(original),before);console.log(JSON.stringify({passed:report.checks.length}));
})().catch(error=>{report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'ai-contract-verification.json'),JSON.stringify(report,null,2));});
