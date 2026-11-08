function classroomBoardUrl(path,work){const url=new URL(path,location.origin),room=new URLSearchParams(location.search).get('room');if(room!==null)url.searchParams.set('room',room.toUpperCase());if(work)url.searchParams.set('work',work);return url.pathname+url.search}
(function(){
 'use strict';
 const client=window.classroomWorkClient,room=(new URLSearchParams(location.search).get('room')||'').toUpperCase(),progressKey='sherpa-room-'+room+':sherpa-grade1-practice-v1';
 let current=null;
 window.restoreClassroomPractice=function(){
  if(!client.enabled)return null;
  try{const value=JSON.parse(localStorage.getItem(progressKey));if(value?.version===1&&typeof value.html==='string'&&value.html.length<=1500000&&/<html(?:\s|>)/i.test(value.html)&&/<\/html\s*>/i.test(value.html)&&Number.isInteger(value.step)&&value.step>=0&&value.step<=8)return {html:value.html,step:value.step,complete:value.complete===true}}catch{}
  return null;
 };
 window.saveClassroomPractice=function(html,step,complete=false){if(!client.enabled)return true;if(typeof html!=='string'||!html)return false;try{const serialized=JSON.stringify({version:1,html,step:complete?8:Math.max(0,Math.min(8,step)),complete});localStorage.setItem(progressKey,serialized);return localStorage.getItem(progressKey)===serialized}catch{return false}};
 let missingSavedGame=Boolean(client.current())&&!window.restoreClassroomPractice();
 const sharingStyle=document.createElement('style');sharingStyle.textContent='.completion-actions [hidden],.game-share-dialog [hidden]{display:none!important}';document.head.append(sharingStyle);
 window.createGameShareButtons=function(getHtml){
  const share=document.createElement('button');share.type='button';share.className='primary';
  function refresh(){share.textContent=client.current()?'수정 내용 업데이트':'게시판에 저장하기';share.disabled=!client.enabled}
  share.onclick=()=>window.openGameShare(getHtml());client.subscribe(refresh);refresh();return [share];
 };
 window.openGameShare=function(gameHtml){
  if(current||!client.enabled)return;
  const saved=client.current();let target=saved;
  const dialog=document.createElement('dialog');dialog.className='game-share-dialog';dialog.setAttribute('aria-labelledby','game-share-title');
  const heading=document.createElement('h2');heading.id='game-share-title';
  const hint=document.createElement('p'),form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),status=document.createElement('p'),actions=document.createElement('div');
  label.textContent='게임 이름';input.name='title';input.required=true;input.maxLength=80;input.placeholder='예: 신나는 로봇 달리기';input.value=saved?saved.title:'';label.append(input);status.setAttribute('role','status');status.setAttribute('aria-live','polite');actions.className='actions';
  const cancel=document.createElement('button'),submit=document.createElement('button');cancel.type='button';cancel.textContent='취소';submit.type='submit';submit.className='primary';actions.append(cancel,submit);form.append(label,status,actions);dialog.append(heading,hint,form);document.body.append(dialog);current=dialog;let sending=false;
  function renderMode(){const updating=Boolean(client.current());heading.textContent=updating?'내 게임을 업데이트해요':'내 게임을 게시판에 저장해요';hint.textContent=updating?'기존 게시물의 제목과 게임이 지금 내용으로 바뀌어요. 새 글은 추가되지 않아요.':'처음 한 번 게시한 뒤에는 같은 게시물만 업데이트할 수 있어요.';submit.textContent=updating?'수정 내용 업데이트':'게시판에 저장하기';if(updating&&missingSavedGame){hint.textContent='이 브라우저에 이전 게임이 남아 있지 않아 업데이트를 멈췄어요. 처음 게시한 화면을 확인하거나 선생님께 알려 주세요.';submit.disabled=true}}
  function close(){dialog.close();dialog.remove();current=null}
  renderMode();cancel.onclick=()=>{if(!sending)close()};dialog.addEventListener('cancel',e=>{e.preventDefault();if(!sending)close()});
  form.onsubmit=async e=>{
   e.preventDefault();if(sending||(client.current()&&missingSavedGame))return;const title=input.value.trim();if(!title){status.textContent='게임 이름을 적어 주세요.';input.focus();return}
   sending=true;input.disabled=cancel.disabled=submit.disabled=true;status.textContent='게시판에 저장하고 있어요…';submit.textContent='저장 중…';
   try{
    if(!window.saveClassroomPractice(gameHtml,8,true))throw Error('이 브라우저에 게임을 보관하지 못했어요. 저장 공간을 확인한 뒤 다시 눌러 주세요.');
    const data=await client.save(title,gameHtml,{target,signal:AbortSignal.timeout(30000)});missingSavedGame=false;
    heading.textContent=data.updated?'수정 내용을 업데이트했어요! 🎉':'게시판에 저장했어요! 🎉';hint.textContent=data.updated?'같은 게시물에서 최신 게임을 해 볼 수 있어요.':'다음부터는 수정 내용 업데이트로 이 게시물만 바꿀 수 있어요.';status.textContent='6페이지 게시판에서도 내 게임을 확인할 수 있어요.';label.hidden=true;actions.replaceChildren();
    const board=document.createElement('a');board.href=classroomBoardUrl('/board',data.item.id);board.target='_blank';board.rel='noopener';board.className='share-board-link primary';board.textContent='내 게임 보러 가기 ↗';const done=document.createElement('button');done.type='button';done.textContent='닫기';done.onclick=close;actions.append(board,done);done.focus();
   }catch(error){if(error.retryAsUpdate){target=client.current()}status.textContent=error.name==='TimeoutError'?'저장 확인이 늦어지고 있어요. 다시 누르면 중복 없이 결과를 확인할 수 있어요.':error.message;input.disabled=cancel.disabled=submit.disabled=false;renderMode()}
   finally{sending=false}
  };
  dialog.showModal();input.focus();
 };
})();
