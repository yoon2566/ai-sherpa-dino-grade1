'use strict';
// Execute the unmodified Worker routes and SQL against disposable in-memory SQLite.
// No credentials, external fetch, AI, real classroom data or live D1 are available.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {webcrypto,scryptSync,timingSafeEqual,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'modules/entry.js'),'utf8');
const report={scope:'Actual Worker default.fetch, board/session/create/update handlers and original SQL; SQLite :memory: D1 adapters only',checks:[],networkCalls:0,actualAiCalls:0,actualDbCalls:0,sqlErrors:[]};
const check=(name)=>{report.checks.push({name,pass:true});console.log('PASS '+name);};
class MemoryD1{
 constructor(schema){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec(schema);this.statements=0;}
 prepare(sql){const db=this;return {sql,values:[],bind(...values){this.values=values;return this;},async first(){return db.execute(sql,this.values,'get')??null;},async all(){return {results:db.execute(sql,this.values,'all'),success:true};},async run(){const result=db.execute(sql,this.values,'run');return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}};}
 execute(sql,values,method){this.statements++;try{return this.sqlite.prepare(sql)[method](...values);}catch(error){report.sqlErrors.push({sql,error:error.message});throw error;}}
 async batch(statements){this.sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.sqlite.exec('COMMIT');return results;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
 row(sql,...values){return this.sqlite.prepare(sql).get(...values);}
 close(){this.sqlite.close();}
}
const classroom=new MemoryD1(`
 CREATE TABLE classrooms(code TEXT PRIMARY KEY,name TEXT,board_visibility TEXT,deleted_at INTEGER);
 CREATE TABLE classroom_board_owners(room_code TEXT NOT NULL,owner_hash TEXT NOT NULL,work_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(room_code,owner_hash));
 CREATE TABLE classroom_works(id TEXT PRIMARY KEY,room_code TEXT NOT NULL,author TEXT,title TEXT,lesson TEXT,html TEXT,bytes INTEGER,created_at INTEGER,edit_secret_hash TEXT,revision INTEGER DEFAULT 1,updated_at INTEGER,public_sync_pending INTEGER DEFAULT 0,deleted_at INTEGER);
 INSERT INTO classrooms VALUES('999999','모의 수업','public',NULL),('888888','모의 다른 수업','class',NULL);
`);
const artworks=new MemoryD1(`
 CREATE TABLE works(id TEXT PRIMARY KEY,author TEXT,title TEXT,lesson TEXT,html TEXT,bytes INTEGER,created_at INTEGER);
 CREATE TABLE classroom_work_sync(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,deleted INTEGER NOT NULL,source TEXT NOT NULL);
`);
const context={Response,Request,Headers,URL,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Buffer,crypto:webcrypto,scryptSync,timingSafeEqual,console,Date,DurableObject:class{},fetch:async()=>{report.networkCalls++;throw Error('External requests forbidden');}};
vm.createContext(context);
vm.runInContext(source.replace(/^import[^\r\n]+;\r?\n/gm,'').replace(/export\s*\{[\s\S]*?\};/,'')+'\nglobalThis.worker=classroom_worker_default;',context,{filename:'unmodified-worker-under-test.js'});
const env={CLASSROOM_DB:classroom,ARTWORK_DB:artworks};
const origin='https://classroom.test',secret='a'.repeat(64),workKey='1'.repeat(32);
const game1='<!doctype html><html lang="ko"><body><canvas id="game"></canvas><script>window.version=1;</script></body></html>';
const game2=game1.replace('version=1','version=2'),game3=game1.replace('version=1','version=3');
let cookie='',id='';
async function request(endpoint,method,body,options={}){
 const headers={Origin:origin,'Content-Type':'application/json',...(options.cookie===false?{}:{Cookie:options.cookie||cookie}),...options.headers};
 const response=await context.worker.fetch(new Request(origin+endpoint,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
 return {status:response.status,data:await response.json(),headers:response.headers};
}
const post=(body,options)=>request('/api/board?room=999999','POST',body,options);
const patch=(body,options)=>request('/api/board/'+id+'?room=999999','PATCH',body,options);
const stored=()=>classroom.row('SELECT * FROM classroom_works WHERE id=?',id);
const count=()=>classroom.row('SELECT COUNT(*) count FROM classroom_works').count;
(async()=>{
 try{
  let r=await post({title:'우주 고양이',html:game1,workKey,editSecret:secret},{cookie:false});assert.equal(r.status,428);assert.equal(r.data.code,'BOARD_SESSION_REQUIRED');assert.equal(count(),0);check('게시 세션 없는 최초 저장은 428이며 작품 미생성');
  r=await request('/api/board/session?room=999999','POST',{}, {cookie:false});assert.equal(r.status,200);assert.equal(r.data.registered,false);cookie=r.headers.get('Set-Cookie').split(';')[0];assert.match(cookie,/^grade1_board_999999=[a-f0-9]{64}$/);for(const flag of ['HttpOnly','SameSite=Strict','Secure','Path=/api/board'])assert(r.headers.get('Set-Cookie').includes(flag));check('실제 세션 핸들러가 방별 HttpOnly 쿠키 발급');
  const original={title:'우주 고양이',html:game1,workKey,editSecret:secret};r=await post(original);assert.equal(r.status,201);id=r.data.item.id;assert.match(id,/^[a-f0-9]{32}$/);assert.equal(r.data.item.revision,1);assert.equal(count(),1);assert.equal(stored().html,game1);assert.equal(stored().edit_secret_hash,createHash('sha256').update(secret).digest('hex'));assert(!JSON.stringify(r.data).includes(secret));check('최초 자동 게시 POST는 작품 하나·revision 1·비밀 해시로 저장');
  assert.equal(artworks.row('SELECT html FROM works WHERE id=?',id).html,game1);assert.equal(artworks.row('SELECT revision FROM classroom_work_sync WHERE id=?',id).revision,1);assert.equal(stored().public_sync_pending,0);check('공개 반의 최초 작품을 실제 공개게시판 동기화 SQL로 반영');
  r=await post(original);assert.equal(r.status,200);assert.equal(r.data.duplicate,true);assert.equal(r.data.item.id,id);assert.equal(r.data.item.revision,1);assert.equal(count(),1);check('동일 POST 재전송은 같은 게시물로 멱등 처리');
  r=await post({...original,workKey:'2'.repeat(32)});assert.equal(r.status,403);assert.equal(r.data.code,'ALREADY_POSTED');assert.equal(count(),1);check('같은 학생 세션의 새 workKey 게시를 403으로 차단');
  r=await patch({title:'날아가는 고양이',html:game2,editSecret:secret,expectedRevision:1});assert.equal(r.status,200);assert.equal(r.data.updated,true);assert.equal(r.data.item.id,id);assert.equal(r.data.item.revision,2);assert.equal(count(),1);assert.equal(stored().html,game2);check('자유 고치기 PATCH는 같은 소유 작품을 revision 2로 갱신');
  assert.equal(artworks.row('SELECT html FROM works WHERE id=?',id).html,game2);assert.equal(artworks.row('SELECT revision FROM classroom_work_sync WHERE id=?',id).revision,2);assert.equal(stored().public_sync_pending,0);check('업데이트도 공개게시판 같은 작품 하나에 동기화');
  const patch3={title:'폭죽 고양이',html:game3,editSecret:secret,expectedRevision:2};
  r=await patch({...patch3,editSecret:'b'.repeat(64)});assert.equal(r.status,403);assert.equal(stored().revision,2);assert.equal(stored().html,game2);check('형식이 올바르지만 틀린 editSecret은 실제 owns 검사에서 403');
  r=await patch(patch3,{cookie:false});assert.equal(r.status,428);assert.equal(stored().revision,2);check('쿠키 없는 업데이트는 428로 차단');
  r=await patch({...patch3,expectedRevision:1});assert.equal(r.status,409);assert.equal(r.data.code,'WORK_CONFLICT');assert.equal(r.data.item.revision,2);assert.equal(stored().html,game2);check('오래된 expectedRevision은 409와 최신 revision 반환·내용 유지');
  r=await patch({title:'날아가는 고양이',html:game2,editSecret:secret,expectedRevision:1});assert.equal(r.status,200);assert.equal(r.data.duplicate,true);assert.equal(r.data.item.revision,2);check('응답 유실 뒤 같은 PATCH 재시도는 중복 증가 없이 성공');
  r=await request('/api/board/session?room=999999','POST',{workId:id,editSecret:'b'.repeat(64)},{cookie:false});assert.equal(r.status,403);assert.equal(stored().revision,2);check('새 화면에서 잘못된 비밀로 소유권 복구 불가');
  r=await request('/api/board/session?room=999999','POST',{workId:id,editSecret:secret},{cookie:false});assert.equal(r.status,200);assert.equal(r.data.registered,true);assert.equal(r.data.item.id,id);const recoveredCookie=r.headers.get('Set-Cookie').split(';')[0];assert.notEqual(recoveredCookie,cookie);check('저장된 workId와 올바른 비밀로 새 화면 세션 소유권 복구');
  r=await patch(patch3,{cookie:recoveredCookie});assert.equal(r.status,200);assert.equal(r.data.item.revision,3);assert.equal(stored().html,game3);assert.equal(count(),1);check('복구한 세션은 기존 작품만 revision 3으로 갱신');
  r=await post({...original,workKey:'3'.repeat(32)},{cookie:recoveredCookie});assert.equal(r.status,403);assert.equal(r.data.code,'ALREADY_POSTED');assert.equal(count(),1);check('복구한 세션에서도 두 번째 게시물 생성 차단');
  r=await patch({...patch3,title:'침입 시도',expectedRevision:3},{headers:{Origin:'https://foreign.test'}});assert.equal(r.status,403);assert.equal(stored().revision,3);check('다른 출처 업데이트를 소유권 검사 전에 차단');
  r=await request('/api/board/'+id+'?room=888888','PATCH',{...patch3,expectedRevision:3},{cookie:'grade1_board_888888='+'c'.repeat(64)});assert.equal(r.status,404);assert.equal(stored().revision,3);check('다른 반 코드에서 동일 작품 ID 수정 불가');
  r=await request('/api/board/'+id+'?room=999999&scope=room','GET');assert.equal(r.status,200);assert.equal(r.data.item.id,id);assert.equal(r.data.item.revision,3);assert.equal(r.data.item.html,game3);check('실제 게시물 조회에서 마지막 HTML·제목·revision 확인');
  assert.equal(report.networkCalls,0);assert.deepEqual(report.sqlErrors,[]);assert.equal(count(),1);assert.equal(artworks.row('SELECT COUNT(*) count FROM works').count,1);check('SQL 오류·외부 요청·실제 AI·실제 DB 요청 0건');report.ok=true;
 }catch(error){report.failure={message:error.message,stack:error.stack};throw error;}
 finally{
  report.tests=report.checks.length;report.sqlStatements=classroom.statements+artworks.statements;report.workerSha256=createHash('sha256').update(source).digest('hex');
  const out=process.env.MODULAR_CAPTURE_DIR||path.resolve(root,'../../85_공룡3_모듈화/6차캡처');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'6차-게시서버검증.json'),JSON.stringify(report,null,2));classroom.close();artworks.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
