'use strict';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),isClasses=location.pathname==='/classes';let authenticated=false,rooms=[],createdCode='',deleteTarget=null;
$('home-view').hidden=isClasses;document.title=isClasses?'수업 목록 · 모두의 AI 라운지':'수업 참여';
async function request(url,options={}){const response=await fetch(url,{...options,cache:'no-store',signal:AbortSignal.timeout(7000)}),data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'연결을 확인하고 다시 시도해 주세요.'),{status:response.status});return data}
const post=(url,data)=>request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function message(text,error=false){$('page-status').textContent=text;$('page-status').classList.toggle('error',error)}
function teacherDestination(){const code=params.get('teach');return '/classes'+(code?'?teach='+encodeURIComponent(code):'')}
function requireTeacher(){const code=params.get('teach');location.replace('/?teacher=1'+(code?'&teach='+encodeURIComponent(code):''))}
function showDialog(id){const dialog=$(id);dialog.querySelector('.form-error').textContent='';dialog.showModal()}
function openTeacher(){if(authenticated){location.href=teacherDestination();return}$('teacher-password').value='';showDialog('teacher-dialog');$('teacher-password').focus()}
for(const button of document.querySelectorAll('.close-dialog'))button.onclick=()=>{const dialog=button.closest('dialog');if(dialog.dataset.busy!=='true')dialog.close()};
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('cancel',event=>{if(dialog.dataset.busy==='true')event.preventDefault()});
async function submit(form,errorId,action){
  if(form.dataset.busy==='true')return;const dialog=form.closest('dialog');form.dataset.busy='true';if(dialog)dialog.dataset.busy='true';const buttons=form.querySelectorAll('button');buttons.forEach(button=>button.disabled=true);$(errorId).textContent='';
  try{await action()}catch(error){if(isClasses&&error.status===401){requireTeacher();return}$(errorId).textContent=error.message}finally{form.dataset.busy='false';if(dialog)dialog.dataset.busy='false';buttons.forEach(button=>button.disabled=false)}
}
function teacherEntry(room){location.href='/lesson?room='+room.code+'&role=teacher'}
function showDelete(room){deleteTarget=room;$('delete-class-name').textContent=room.name;showDialog('delete-dialog');$('delete-cancel').focus()}
function renderRooms(){
  const grid=$('class-grid');grid.replaceChildren();
  if(!rooms.length){const empty=document.createElement('div');empty.className='empty-card';empty.textContent='오른쪽 아래에서 수업을 만들어 주세요.';grid.append(empty);return}
  rooms.forEach(room=>{
    const card=$('class-card-template').content.firstElementChild.cloneNode(true);card.dataset.code=room.code;card.classList.toggle('is-new',room.code===createdCode);card.querySelector('.class-name').textContent=room.name;card.querySelector('.card-code strong').textContent=room.code;
    card.querySelector('.card-board-visibility').textContent='게시판 · '+(room.boardVisibility==='class'?'우리 반만':'모두와 공유');
    const time=card.querySelector('time');time.dateTime=new Date(room.createdAt).toISOString();time.textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(room.createdAt);
    const remove=card.querySelector('.delete-class');remove.setAttribute('aria-label',room.name+' 삭제');remove.onclick=()=>showDelete(room);card.querySelector('.teacher-enter').onclick=()=>teacherEntry(room);grid.append(card);
  });
}
async function loadRooms(){const data=await request('/api/classroom');rooms=data.rooms;authenticated=data.authenticated;renderRooms()}
$('teacher-open').onclick=openTeacher;
const joinCode=$('join-code');
const codeCharacters=value=>value.normalize('NFKC').replace(/[^0-9]/g,'');
let composingCode=false;
function formatJoinCode(){
  const value=joinCode.value,caret=joinCode.selectionStart??value.length;
  const next=codeCharacters(value).slice(0,6),position=Math.min(codeCharacters(value.slice(0,caret)).length,next.length);
  if(value!==next){joinCode.value=next;joinCode.setSelectionRange(position,position)}
  $('join-error').textContent='';
}
function normalizedJoinSelection(){
  const value=joinCode.value,rawStart=joinCode.selectionStart??value.length,rawEnd=joinCode.selectionEnd??rawStart;
  const base=codeCharacters(value).slice(0,6);
  return {base,start:Math.min(codeCharacters(value.slice(0,rawStart)).length,base.length),end:Math.min(codeCharacters(value.slice(0,rawEnd)).length,base.length)};
}
// Let the IME finish before formatting, so rewriting the value cannot interrupt composition.
joinCode.addEventListener('compositionstart',()=>{composingCode=true});
joinCode.addEventListener('compositionend',()=>{composingCode=false;formatJoinCode()});
joinCode.addEventListener('beforeinput',event=>{
  if(event.isComposing||event.inputType!=='insertText')return;
  // A committed key must not lose a slot to a stale IME character before the
  // browser applies maxlength. Preserve the selection for replacement typing.
  const {base,start,end}=normalizedJoinSelection();
  if(joinCode.value!==base){joinCode.value=base;joinCode.setSelectionRange(start,end)}
  composingCode=false;
});
joinCode.addEventListener('input',event=>{if(!composingCode&&!event.isComposing)formatJoinCode()});
joinCode.addEventListener('paste',event=>{
  if(!event.clipboardData)return;
  event.preventDefault();
  // An unfinished IME character may still occupy the input. Normalize both the
  // existing value and its selection before measuring the six code characters.
  const {base,start,end}=normalizedJoinSelection();
  const before=base.slice(0,start),after=base.slice(end);
  const available=Math.max(0,6-before.length-after.length);
  const pasted=codeCharacters(event.clipboardData.getData('text')).slice(0,available);
  joinCode.value=before+pasted+after;
  joinCode.setSelectionRange(before.length+pasted.length,before.length+pasted.length);
  composingCode=false;formatJoinCode();
});
$('join-form').onsubmit=event=>{
  event.preventDefault();
  return submit(event.currentTarget,'join-error',async()=>{
    const code=$('join-code').value.normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]/g,'').toUpperCase();
    if(!/^[0-9]{6}$/.test(code))throw Error('수업 코드는 숫자 6자리예요. 선생님이 알려 준 코드를 확인해 주세요.');
    try{await request('/api/classroom/'+encodeURIComponent(code))}
    catch(error){if(error.status===404)throw Error('해당 수업을 찾지 못했어요. 선생님이 알려 준 코드를 확인해 주세요.');throw error}
    location.href='/lesson?room='+code;
  });
};
$('teacher-form').onsubmit=event=>{event.preventDefault();submit(event.currentTarget,'teacher-error',async()=>{await post('/api/classroom/login',{password:$('teacher-password').value});$('teacher-password').value='';authenticated=true;location.href=teacherDestination()})};
function updateBoardVisibilityHint(){const own=$('create-form').elements.boardVisibility.value==='class';$('board-visibility-hint').textContent=own?'우리 반 학생들의 작품만 함께 볼 수 있어요.':'다른 반과 작품을 나누고, 우리 반 작품만 골라 볼 수도 있어요.'}
for(const option of document.querySelectorAll('input[name="boardVisibility"]'))option.addEventListener('change',updateBoardVisibilityHint);
$('create-open').onclick=()=>{$('class-name').value='공룡게임 수업';$('board-visibility-class').checked=true;updateBoardVisibilityHint();showDialog('create-dialog');$('class-name').focus();$('class-name').select()};
$('create-form').onsubmit=event=>{event.preventDefault();submit(event.currentTarget,'create-error',async()=>{const room=await post('/api/classroom',{name:$('class-name').value.trim(),boardVisibility:$('create-form').elements.boardVisibility.value});createdCode=room.code;await loadRooms();$('create-dialog').close();message('수업을 만들었어요.');$('class-grid').querySelector('[data-code="'+room.code+'"]')?.focus({preventScroll:true})})};
$('delete-cancel').onclick=()=>$('delete-dialog').close();
$('delete-form').onsubmit=event=>{event.preventDefault();submit(event.currentTarget,'delete-error',async()=>{if(!deleteTarget)return;await request('/api/classroom/'+deleteTarget.code,{method:'DELETE'});await loadRooms();$('delete-dialog').close();deleteTarget=null;message('수업을 삭제했어요.')})};
(async()=>{
  try{
    const config=await request('/api/classroom/config');authenticated=config.authenticated;
    if(isClasses){
      if(!authenticated){requireTeacher();return}
      await loadRooms();document.body.classList.add('is-classes');$('teacher-header').hidden=false;$('classes-view').hidden=false;
      const code=params.get('teach');if(code){const room=rooms.find(room=>room.code===code.toUpperCase());if(room)teacherEntry(room);else message('수업을 찾지 못했어요. 참여 코드를 확인해 주세요.',true)}
    }else if(params.get('teacher')==='1')openTeacher();
  }catch(error){if(isClasses&&error.status===401)requireTeacher();else if(isClasses)message(error.message,true);else $('join-error').textContent=error.message}
})();
window.addEventListener('pageshow',event=>{if(event.persisted&&isClasses)loadRooms().catch(error=>error.status===401?requireTeacher():message(error.message,true))});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&isClasses&&authenticated&&!document.querySelector('dialog[open]'))loadRooms().catch(error=>error.status===401?requireTeacher():message(error.message,true))});
