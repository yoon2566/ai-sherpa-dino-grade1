(function(){
  'use strict';
  const room=(new URLSearchParams(location.search).get('room')||'').toUpperCase();
  const enabled=/^[0-9]{6}$/.test(room),storageKey='sherpa-room-'+room+':sherpa-board-work-v1';
  const listeners=new Set(),hex32=/^[a-f0-9]{32}$/,hex64=/^[a-f0-9]{64}$/;
  let pending=Promise.resolve();
  function record(value){
    if(!value||!hex32.test(value.workKey||'')||!hex64.test(value.editSecret||''))return null;
    return {workKey:value.workKey,editSecret:value.editSecret,id:hex32.test(value.id||'')?value.id:null,revision:Number.isInteger(value.revision)&&value.revision>0?value.revision:0,title:typeof value.title==='string'?value.title.slice(0,80):''};
  }
  function read(){try{const value=JSON.parse(localStorage.getItem(storageKey));if(value?.version===1)return {version:1,active:record(value.active),draft:record(value.draft)}}catch{}return {version:1,active:null,draft:null}}
  function notify(){for(const listener of listeners)listener(current())}
  function write(value){
    try{const serialized=JSON.stringify(value);localStorage.setItem(storageKey,serialized);if(localStorage.getItem(storageKey)!==serialized)throw Error('Storage verification failed')}catch{throw Error('이 브라우저에 게시 정보를 보관하지 못했어요. 저장 공간을 확인한 뒤 다시 눌러 주세요.')}
    notify();
  }
  function current(){const value=enabled?read().active:null;return value?.id?{id:value.id,revision:value.revision,title:value.title}:null}
  function randomHex(bytes){return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),value=>value.toString(16).padStart(2,'0')).join('')}
  function api(path){const url=new URL(path,location.origin);url.searchParams.set('room',room);return url.pathname+url.search}
  function accept(owner,item){
    if(!hex32.test(item?.id||'')||!Number.isInteger(item.revision)||item.revision<1)throw Error('저장 결과를 확인하지 못했어요. 다시 눌러 주세요.');
    const value=read();
    // A late response must never replace another tab's active ownership record.
    if(value.active?.id&&value.active.id!==item.id)throw Error('다른 창에서 게시 정보가 바뀌었어요. 새로고침한 뒤 기존 게시물을 확인해 주세요.');
    value.active={...owner,id:item.id,revision:item.revision,title:item.title};value.draft=null;write(value);
  }
  function apiError(response,data){
    if(response.status===410||data.code==='WORK_DELETED')return Object.assign(Error('선생님이 이 게시물을 삭제했어요. 다시 게시할 수 없으니 선생님께 알려 주세요.'),{status:410});
    if(data.code==='ALREADY_POSTED')return Object.assign(Error('이미 게시한 게임이 있어요. 처음 게시한 화면에서 그 게임만 업데이트할 수 있어요.'),{status:response.status,code:data.code});
    return Object.assign(Error(data.error||'저장하지 못했어요. 다시 눌러 주세요.'),{status:response.status,code:data.code});
  }
  async function saveOne(title,html,{signal,target}={}){
    if(!enabled)throw Error('숫자 6자리 수업 코드로 입장한 뒤 게시해 주세요.');
    let value=read();
    if(target!==undefined&&(target?.id||null)!==(value.active?.id||null))throw Object.assign(Error('다른 창에서 게시 정보가 바뀌었어요. 제목과 작품을 확인한 뒤 다시 업데이트해 주세요.'),{retryAsUpdate:true});
    const hadDraft=Boolean(value.draft);
    let owner=value.active?.id?value.active:null,updating=Boolean(owner);
    if(!owner){owner=value.draft||{workKey:randomHex(16),editSecret:randomHex(32),id:null,revision:0,title:''};value.draft={...owner,title};write(value)}
    // Initialize the browser's room-specific submission before the first write.
    // Reusing an existing post proves ownership using its original edit secret.
    const sessionResponse=await fetch(api('/api/board/session'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(updating?{workId:owner.id,editSecret:owner.editSecret}:{}),signal});
    const session=await sessionResponse.json();if(!sessionResponse.ok)throw apiError(sessionResponse,session);
    if(session.registered&&session.item?.id!==owner.id){
      // A lost first POST response still has its original draft. Let the server
      // check that workKey/secret instead of generating a second post.
      if(updating||!hadDraft)throw apiError({status:403},{code:'ALREADY_POSTED'});
    }
    const response=await fetch(api(updating?'/api/board/'+owner.id:'/api/board'),{method:updating?'PATCH':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,html,...(updating?{editSecret:owner.editSecret,expectedRevision:target?.revision||owner.revision}:{workKey:owner.workKey,editSecret:owner.editSecret})}),signal});
    const data=await response.json();
    if(!response.ok){
      if(response.status===409&&data.item){accept(owner,data.item);throw Object.assign(Error('게시물이 다른 곳에서 바뀌었어요. 최신 제목은 “'+data.item.title+'”예요. 제목과 작품을 확인한 뒤 다시 업데이트해 주세요.'),{retryAsUpdate:true,status:409})}
      throw apiError(response,data);
    }
    accept(owner,data.item);return {...data,updated:updating};
  }
  function save(title,html,options={}){
    if(options.asNew)return Promise.reject(Error('새 게시물은 추가할 수 없어요. 기존 게시물의 수정 내용 업데이트를 이용해 주세요.'));
    // The session cookie must be initialized once across tabs. Without Web Locks
    // two first-time tabs can receive separate cookies before either posts.
    if(!navigator.locks?.request)return Promise.reject(Error('이 브라우저에서는 게시 정보를 안전하게 저장할 수 없어요. 최신 Chrome 또는 Edge에서 수업을 열어 주세요.'));
    const run=()=>navigator.locks.request('sherpa-grade1-board-session',{mode:'exclusive',...(options.signal?{signal:options.signal}:{})},()=>saveOne(title,html,options));
    const result=pending.then(run,run);pending=result.catch(()=>{});return result;
  }
  window.classroomWorkClient={enabled,current,save,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)}};
  window.addEventListener('storage',event=>{if(event.key===storageKey)notify()});
})();
