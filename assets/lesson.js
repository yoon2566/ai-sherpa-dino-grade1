'use strict';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),code=(params.get('room')||'').toUpperCase(),wantTeacher=params.get('role')==='teacher';
const pages=[...document.querySelectorAll('[data-page]')];
let page=1,openPages=code?[]:pages.map((_,index)=>index+1),teacher=false,unavailable=false,polling=false,practiceFrame=null,boardFrame=null,demoActive=false;
async function request(url,options={}){const r=await fetch(url,{...options,cache:'no-store',signal:AbortSignal.timeout(7000)});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'연결을 확인해 주세요.'),{status:r.status});return data}
const allowed=n=>!unavailable&&(teacher||openPages.includes(n));

// Load the bundled MIT QR encoder only when a teacher opens the dialog.
const qrDialog=$('room-qr-dialog');
let qrLibraryPromise;
function loadQrLibrary(){
 if(typeof window.qrcode==='function')return Promise.resolve(window.qrcode);
 if(!qrLibraryPromise)qrLibraryPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  const timeout=setTimeout(fail,10000);
  function fail(){clearTimeout(timeout);script.remove();qrLibraryPromise=null;reject(Error('QR을 불러오지 못했어요. 닫고 다시 눌러 주세요.'))}
  script.src='/vendor/qrcode-generator-2.0.4.js';script.async=true;
  script.onload=()=>{if(typeof window.qrcode!=='function'){fail();return}clearTimeout(timeout);resolve(window.qrcode)};
  script.onerror=fail;document.head.append(script);
 });
 return qrLibraryPromise;
}
function fitRoomQr(){
 // Keep the requested QR size unless the card would exceed a short viewport.
 const card=qrDialog.querySelector('.room-qr-card'),qrImage=$('room-qr-image');
 qrImage.style.width='';
 const overflow=card.getBoundingClientRect().height-(qrDialog.clientHeight-32);
 if(overflow>0)qrImage.style.width=Math.max(64,qrImage.getBoundingClientRect().width-overflow)+'px';
}
function closeRoomQr(){qrDialog.close();$('show-room-qr').focus()}
$('show-room-qr').onclick=async()=>{
 if(!teacher||!code||unavailable||qrDialog.open)return;
 window.releaseLessonDuck?.();
 $('room-qr-title').textContent=$('room-name').textContent;
 $('room-qr-code').textContent='코드 '+code;
 $('room-qr-image').replaceChildren();
 $('room-qr-status').textContent='QR을 준비하고 있어요.';$('room-qr-status').hidden=false;
 qrDialog.showModal();fitRoomQr();
 try{
  const makeQr=await loadQrLibrary();
  const studentUrl=new URL('/lesson',location.origin);studentUrl.searchParams.set('room',code);
  const qr=makeQr(0,'M');qr.addData(studentUrl.href);qr.make();
  // cellSize 1 + margin 4 gives an exact four-module white quiet zone.
  $('room-qr-image').innerHTML=qr.createSvgTag({cellSize:1,margin:4,scalable:true});
  $('room-qr-status').hidden=true;
 }catch(error){$('room-qr-status').textContent=error.message}
 if(qrDialog.open)fitRoomQr();
};
$('close-room-qr').onclick=closeRoomQr;
qrDialog.addEventListener('click',event=>{if(event.target===qrDialog)closeRoomQr()});
qrDialog.addEventListener('cancel',event=>{event.preventDefault();closeRoomQr()});
window.addEventListener('resize',()=>{if(qrDialog.open)fitRoomQr()});
// Capture before lesson/game shortcuts; the native dialog keeps background controls inert.
for(const type of ['keydown','keyup'])window.addEventListener(type,event=>{
 if(!qrDialog.open)return;
 event.stopImmediatePropagation();
 if(type==='keydown'&&event.key==='Escape'){event.preventDefault();closeRoomQr()}
},true);

function neighboring(direction){for(let n=page+direction;n>=1&&n<=pages.length;n+=direction)if(allowed(n))return n;return null}
function sendPractice(active){if(practiceFrame){practiceFrame.hidden=!active;practiceFrame.inert=!active;practiceFrame.contentWindow.postMessage({channel:'grade1-classroom',active},location.origin)}}
function showBoard(active){
 if(active&&!boardFrame){
  boardFrame=document.createElement('iframe');boardFrame.id='board-frame';boardFrame.title='게임 게시판';
  boardFrame.src='/board?'+(code?'room='+encodeURIComponent(code)+'&scope=room&':'')+'embedded=lesson';
  pages[5].append(boardFrame);
 }else if(!active&&boardFrame){boardFrame.src='about:blank';boardFrame.remove();boardFrame=null}
}
function render(){
 window.releaseLessonDuck?.();
 if(page!==4)window.closeLessonExpand?.();
 if(page!==5)document.body.classList.remove('practice-expanded');
 const visible=allowed(page);pages.forEach((el,i)=>el.hidden=!(visible&&i+1===page));$('waiting').hidden=visible;
 $('page-counter').textContent=visible?page+' / '+pages.length:'대기 중';$('previous').disabled=neighboring(-1)===null;$('next').disabled=neighboring(1)===null;
 document.body.classList.toggle('practice-active',visible&&page===5);$('teacher-tools').hidden=!teacher;
 $('show-room-qr').hidden=!teacher||unavailable;
 if(qrDialog.open&&(!teacher||unavailable))closeRoomQr();
 $('page-lock').textContent=openPages.includes(page)?'현재 페이지 잠그기':'현재 페이지 열기';$('page-lock').setAttribute('aria-pressed',String(openPages.includes(page)));
 if(visible&&page===4){if(!demoActive){$('demo-game').src='/original-game.html';demoActive=true}}else if(demoActive){$('demo-game').src='about:blank';demoActive=false}
 if(visible&&page===5&&!practiceFrame){practiceFrame=document.createElement('iframe');practiceFrame.id='practice';practiceFrame.title='AI와 게임 수정하기';practiceFrame.allow='microphone';practiceFrame.src='/practice/index.html?course=1'+(code?'&room='+encodeURIComponent(code):'');practiceFrame.onload=()=>sendPractice(allowed(page)&&page===5);pages[4].append(practiceFrame)}
 sendPractice(visible&&page===5);showBoard(visible&&page===6);document.title=(visible?pages[page-1].getAttribute('aria-label'):'수업 대기')+' · AI 셰르파';
}
function move(direction){const target=neighboring(direction);if(target===null)return;page=target;render()}
$('previous').onclick=()=>move(-1);$('next').onclick=()=>move(1);
$('jump').onclick=()=>{$('demo-game').contentWindow.postMessage({channel:'lounge-dino',command:'tap'},'*');$('demo-game').focus()};$('restart').onclick=()=>{$('demo-game').src='/original-game.html'};
window.addEventListener('message',e=>{if(e.source===$('demo-game').contentWindow&&e.data?.channel==='lounge-dino'&&[-1,1].includes(e.data.navigate))move(e.data.navigate)});
window.addEventListener('keydown',e=>{if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey||['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target.tagName))return;if(page===4&&['Space','ArrowUp','ArrowDown'].includes(e.code)){$('demo-game').contentWindow.postMessage({channel:'lounge-dino',code:{Space:32,ArrowUp:38,ArrowDown:40}[e.code],down:true},'*');e.preventDefault();return}if(e.code==='ArrowRight'){e.preventDefault();move(1)}if(e.code==='ArrowLeft'){e.preventDefault();move(-1)}});
window.addEventListener('keyup',e=>{if(page===4&&['Space','ArrowUp','ArrowDown'].includes(e.code))$('demo-game').contentWindow.postMessage({channel:'lounge-dino',code:{Space:32,ArrowUp:38,ArrowDown:40}[e.code],down:false},'*')});
$('room-code').onclick=async()=>{if(!code)return;try{await navigator.clipboard.writeText(code);$('room-code').textContent='복사했어요!';setTimeout(()=>$('room-code').textContent='코드 '+code,1200)}catch{$('room-code').textContent='코드 '+code}};
async function refresh(){
 if(!code||polling)return;polling=true;
 try{const data=await request('/api/classroom/'+encodeURIComponent(code));if(wantTeacher&&!data.canManage){location.replace('/?teacher=1&teach='+encodeURIComponent(code));return}const before=JSON.stringify([openPages,teacher,unavailable]);teacher=wantTeacher&&data.canManage;openPages=data.openPages;unavailable=false;$('room-name').textContent=data.name;$('room-code').textContent='코드 '+data.code;$('home').href=teacher?'/classes':'/';$('home').textContent=teacher?'← 수업 목록':'← 홈으로';document.body.classList.toggle('is-teacher',teacher);if(!allowed(page)&&openPages.length)page=openPages[0];if(before!==JSON.stringify([openPages,teacher,unavailable]))render()}
 catch(e){if(e.status===404){unavailable=true;$('waiting-message').textContent='수업을 찾을 수 없어요. 홈에서 참여 코드를 확인해 주세요.';render()}else{$('teacher-status').textContent='연결을 확인하고 있어요.';if(!openPages.length){$('waiting-message').textContent='연결을 확인하고 있어요. 잠시만 기다려 주세요.';render()}}}
 finally{polling=false}
}
async function changePages(payload){const buttons=$('teacher-tools').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{await request('/api/classroom/'+code,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});$('teacher-status').textContent='학생 화면에 반영했어요.';await refresh()}catch(e){$('teacher-status').textContent=e.message}finally{buttons.forEach(b=>b.disabled=false)}}
$('page-lock').onclick=()=>changePages({page,open:!openPages.includes(page)});$('lock-all').onclick=()=>changePages({lockAll:true});$('open-all').onclick=()=>changePages({maxPage:pages.length});
if(code&&!/^[A-F0-9]{6}$/.test(code)){unavailable=true;$('waiting-message').textContent='참여 코드를 확인해 주세요.'}
window.releaseLessonDuck=window.bindDinoDuck($('duck'),$('demo-game'));
window.closeLessonExpand=window.bindGameExpand(document.querySelector('[data-page="4"]'),$('expand-game'));
window.addEventListener('message',event=>{if(event.source===practiceFrame?.contentWindow&&event.origin===location.origin&&event.data?.channel==='grade1-expand')document.body.classList.toggle('practice-expanded',event.data.active===true&&page===5&&allowed(page))});
render();if(code&&!unavailable){refresh();const timer=setInterval(refresh,1500);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true})}

if(navigator.maxTouchPoints>0)document.documentElement.classList.add('grade1-touch');

window.addEventListener('keydown',event=>{if(page===5&&practiceFrame&&!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&event.code==='KeyX'&&!['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)){practiceFrame.contentWindow.postMessage({channel:'grade1-ability',command:'activate'},location.origin);event.preventDefault()}});
