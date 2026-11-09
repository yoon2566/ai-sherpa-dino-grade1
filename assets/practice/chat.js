'use strict';
let classroomPracticeHidden=false;
window.addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin||event.data?.channel!=='grade1-classroom')return;const hidden=event.data.active!==true;if(hidden===classroomPracticeHidden)return;classroomPracticeHidden=hidden;if(hidden){if(speech)speech.abort();$('game').srcdoc='';}else if(html){$('game').srcdoc=previewDocument(html);}});
const $=id=>document.getElementById(id);
let lesson,html='',step=0,working=false,speech=null;
let modularProject=null,modularUnsupported=false,initialGameHtml='';
const speedChoices=[[0.5,'더더 느려요'],[0.7,'더 느려요'],[0.9,'느려요'],[1,'보통이에요'],[1.5,'빨라요'],[2,'더 빨라요'],[2.5,'더더 빨라요']];
const options=[[['🤖','로봇'],['🤡','광대'],['🦓','얼룩말'],['🐱','고양이'],['🐰','토끼'],['🐸','개구리'],['🦊','여우'],['🐼','판다'],['👽','외계인']],[['🌳','숲속'],['🪐','우주'],['🏖️','바닷가'],['🏔️','눈 덮인 산'],['🌆','도시'],['🏜️','사막'],['🌈','무지개 나라'],['🏰','성'],['🌋','화산']],[['🪨','바위'],['📦','상자'],['🌵','선인장'],['🍄','버섯'],['🪵','통나무'],['🎃','호박'],['🧊','얼음'],['⚽','축구공'],['🚧','공사 표지판']],[],[],[],[],[]];
const titles=['누구로 바꿔볼까?','어디에서 달려볼까?','무엇을 뛰어넘을까?','얼마나 빠르게 달릴까?','목숨을 몇 개로 할까?','어떤 선물을 모을까?','어떤 능력을 써볼까?','어떤 소리로 뛸까?'];
const categories=[['🤖','주인공','주인공을 파란 용으로 바꿔 줘.'],['🌳','배경','배경을 구름 위의 성으로 바꿔 줘.'],['🪨','장애물','장애물을 커다란 도넛으로 바꿔 줘.'],['🐇','속도','점수가 높아지면 조금씩 빨라지게 해 줘.'],['❤️','목숨','별을 5개 모으면 목숨을 하나 더 줘.'],['⭐','아이템','반짝이는 무지개 보석을 모으게 해 줘.'],['✨','특별 능력','버튼을 누르면 잠깐 하늘을 날게 해 줘.'],['🔔','효과음','점프하면 귀여운 삐용 소리가 나게 해 줘.'],['✏️','직접 적기','100점이 되면 축하 꽃가루가 나오게 해 줘.']];
function node(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n}
function btn(text,fn,cls){const b=node('button',text,cls);b.type='button';b.onclick=fn;return b}
function lock(root,value=true){root.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=value)}
function bottom(){const c=$('conversation');c.scrollTop=c.scrollHeight}
function say(title,text){const a=node('article');if(title)a.append(node('h2',title));if(text)a.append(node('p',text));$('conversation').append(a);bottom();return a}
function reveal(a){requestAnimationFrame(()=>$('conversation').scrollTo({top:a.offsetTop-$('conversation').offsetTop,behavior:'smooth'}))}
function previewDocument(value){return parent!==window ? value.replace(/<\/head\s*>/i, '<style>#grade1-duck,#grade1-special,#grade1-current-ability{display:none!important}</style></head>') : value;}
function preview(value){const projectState=window.SherpaProject.inspectHtml(value);modularProject=projectState.kind==='modular'?projectState.project:null;modularUnsupported=projectState.kind==='unsupported';window.resetSpecialControl?.();html=value;if(!classroomPracticeHidden)$('game').srcdoc=previewDocument(value);$('status').textContent='미리보기'}
function choice(icon,label,fn){const b=btn('',fn),s=node('span',icon,'choice-icon');s.setAttribute('aria-hidden','true');b.append(s,node('span',label,'choice-label'));b.title=label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed','false');return b}
function next(previousCharacterActions = null){
 window.saveClassroomPractice(html,step,false);
 if(step>=8){customPicker();return}
 $('progress').textContent=`${step+1} / 9 단계`;
 const a=say(titles[step],step===3||step===4?'동그라미를 움직이고 아래 버튼을 눌러요.':'마음에 드는 그림을 눌러요.');a.classList.add('step-message');
 if(step===3||step===4){
  const speed=step===3,box=node('div',null,'slider-choice'),label=node('label',speed?'달리기 속도':'목숨 수'),input=node('input'),value=node('output');
  input.type='range';input.id=speed?'speed-range':'lives-range';input.min=speed?'0':'1';input.max=speed?'6':'9';input.step='1';input.value='3';label.htmlFor=input.id;value.htmlFor=input.id;
  const number=node('div',null,'speed-number');
  const selected=()=>speed?speedChoices[Number(input.value)][0].toFixed(1)+'배':input.value+'개';
  const update=()=>{value.textContent=speed?speedChoices[Number(input.value)][1]:selected();number.textContent=selected();input.setAttribute('aria-valuetext',value.textContent+(speed?' · '+selected():''))};input.oninput=update;update();
  box.append(label,value);
  if(speed){box.classList.add('speed-choice');box.append(number)}
  box.append(input);
  if(speed){const ends=node('div',null,'speed-ends');ends.append(node('span','🐢 느리게'),node('span','보통'),node('span','빠르게 🐇'));box.append(ends)}
  else box.append(node('div','1개 ··· 9개','range-ends'));
  box.append(btn('이걸로 정하기 ✓',()=>apply(speed?'🐇':'❤️',selected(),box),'primary'));a.append(box);
 }else{
  const grid=node('div',null,'grid');if(options[step].length<3)grid.classList.add('few-choices');for(const [icon,label]of options[step])grid.append(choice(icon,label,()=>apply(icon,label,grid)));if(step===0)appendCharacterChoices(grid,previousCharacterActions);a.append(grid);
 }
 reveal(a);
}
function finishPrompt(request){return request+'\n요청한 부분만 바꾸고 나머지 디자인과 이미 추가한 게임 기능은 보존해 줘. 현재 게임을 수정한 전체 HTML을 html 코드 블록으로 제공해 줘. 외부 파일 없이 Canvas, CSS, 인라인 SVG를 써 줘. 화면 크기에 맞게 게임 전체가 보이게 해 줘. 스페이스바와 터치 조작을 지원해 줘. 부모 메시지 {channel:"lounge-dino",command:"tap"}은 시작/점프, command:"restart"는 재시작으로 연결해 줘. 이벤트와 게임 루프를 중복 등록하지 마.'}
function prompt(label){
 const stage=lesson.stages[step];
 if(step===3){const n=Number(label.replace('배',''));if(!Number.isFinite(n)||n<0.5||n>2.5)throw Error('속도를 다시 골라 주세요.');return finishPrompt(`달리기 속도를 최초 기본 속도의 ${n}배로 설정해 줘. 기본 속도 1배는 6이다. 현재 속도에 곱해서 누적하지 말고 기준 속도 6에 배율 ${n}을 한 번만 적용해 줘. 가속도와 최대 속도도 동일한 기준 배율을 적용하고 재시작에도 유지해 줘. 점프 높이와 중력은 변경하지 마.`)}
 if(step===4){const n=Number(label.replace('개',''));if(!Number.isInteger(n)||n<1||n>9)throw Error('목숨을 다시 골라 주세요.');return finishPrompt(`목숨을 ${n}개로 설정해 줘. 시작·재시작 시 정확히 ${n}개, 충돌마다 하나씩 감소, 0이 되면 게임 종료. 충돌 직후 1.2초 보호 시간 동안 중복 차감하지 마. 남은 목숨을 숫자로 표시해 줘.`)}
 const preset=stage.questions[0].issues.find(o=>o.label===label)?.request;
 const request=preset||[`주인공을 ${label} 모습으로 새로 그려 줘.`,`배경을 ${label} 풍경으로 바꿔 줘.`,`장애물을 ${label} 모양으로 바꿔 줘.`][step];
 if(!request)throw Error('선택지를 다시 골라 주세요.');return finishPrompt(request+'\n'+(stage.activity?.rules||'')+'\n'+(stage.activity?.optionRules?.[label]||''));
}
async function generate(request,message,controls,onSuccess,abilityOverride,projectChange,slotIntent){
 if(working)return;working=true;lock(controls);if(speech)speech.abort();$('conversation').append(node('div',message,'user'));
 const a=say('','코드 0줄 · AI 응답을 기다리고 있어요…'),p=a.querySelector('p'),controller=new AbortController();let timer;const startTimer=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(new DOMException('생성 시간 초과','TimeoutError')),180000)},cancel=btn('멈추기',()=>controller.abort());startTimer();a.append(cancel);
 $('busy').hidden=false;$('busy').textContent=p.textContent;$('status').textContent='AI가 수정 중';$('jump').disabled=$('restart').disabled=true;bottom();
 try{
  requireEditableProject();
  const progress=(length,lines)=>{p.textContent=$('busy').textContent=lines?'코드 '+lines.toLocaleString('ko-KR')+'줄 · '+length.toLocaleString('ko-KR')+'자 작성 중…':'코드 0줄 · AI 응답을 기다리고 있어요…'};
  let nextProject=modularProject,confirmed=false;
  if(modularProject&&slotIntent&&modularProject.authoringVersion===3){
   let proposal=await window.SherpaSlotAI.prepare(modularProject,slotIntent,controller.signal,progress);
   while(proposal.draft){
    clearTimeout(timer);cancel.hidden=true;$('busy').hidden=true;
    const choice=await reviewPixelDraft(modularProject,proposal,controller.signal);
    if(choice.action==='cancel'){lock(controls,false);$('status').textContent='이전 게임 유지';a.remove();return}
    if(choice.action==='apply'){confirmed=true;break}
    cancel.hidden=false;$('busy').hidden=false;startTimer();progress(0,0);
    proposal=await window.SherpaSlotAI.redraw(modularProject,proposal,choice.pixel,controller.signal,progress);
   }
   nextProject=proposal.project;
  }else if(modularProject){nextProject=slotIntent?await window.SherpaSlotAI.apply(modularProject,slotIntent,controller.signal,progress):projectChange?projectChange(modularProject):modularProject}
  const result=confirmed?null:nextProject?{html:window.SherpaProject.buildGameHtml(nextProject)}:await generateClassroomEdit({prompt:request,baseHtml:html,abilityOverride},controller.signal,progress);
  if(controller.signal.aborted)throw controller.signal.reason;
  if(!confirmed)savePracticePreview(result.html);p.textContent='바꿨어요! 미리보기에서 게임을 해봐요.';onSuccess(a);
 }catch(e){console.error('[공룡3 생성 실패]',e);p.className='error';p.textContent=controller.signal.aborted?(controller.signal.reason?.name==='TimeoutError'?'시간이 오래 걸려요. 다시 해봐요.':'멈췄어요. 다시 골라 주세요.'):['MISSING_COLLECTIBLES','UNSUPPORTED_CHANGE'].includes(e.code)?e.message:'잘 안 됐어요. 다시 해봐요.';lock(controls,false);$('status').textContent='이전 게임 유지';a.append(btn('입력으로 돌아가기',()=>reveal(controls)))}
 finally{clearTimeout(timer);cancel.remove();working=false;$('busy').hidden=true;$('jump').disabled=$('restart').disabled=false;bottom()}
}
function reviewPixelDraft(project,proposal,signal){
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason);return}
  let dialog;
  const finish=value=>{signal.removeEventListener('abort',abort);resolve(value)};
  const abort=()=>{dialog?.close();signal.removeEventListener('abort',abort);reject(signal.reason)};
  signal.addEventListener('abort',abort,{once:true});
  dialog=window.grade1Pixel.open({draft:proposal.draft,slot:proposal.slot,
   onApply(pixel){
    if(signal.aborted)throw signal.reason;
    let nextProject=window.SherpaProject.withPixel(project,proposal.slot,pixel);
    if(proposal.slot==='item')nextProject=window.SherpaProject.withConfig(nextProject,{itemsEnabled:true,...(proposal.intent.itemName?{itemName:proposal.intent.itemName}:{})});
    savePracticePreview(window.SherpaProject.buildGameHtml(nextProject));finish({action:'apply'});
   },
   onRetry:pixel=>finish({action:'retry',pixel}),onCancel:()=>finish({action:'cancel'})
  });
 });
}
function apply(icon,label,controls,redraw=false){
 if(working)return;controls.querySelectorAll('button[aria-pressed]').forEach(b=>b.setAttribute('aria-pressed',String(b.title===label)));
 if(step===6){selectClassroomAbility(label,controls);return}
 const request=prompt(label)+(redraw?'\n같은 선택으로 다시 만들어 줘. 그림은 새롭게 그리고 기능의 수치는 중복하거나 누적하지 마.':'');
 generate(request,`${icon} ${label}${redraw?', 다시 만들어 주세요!':'! 이걸로 해볼래요.'}`,controls,a=>{
  if(step===0){appendCharacterResultActions(a,actions=>{lock(actions);apply(icon,label,controls,true)});return}
  const actions=node('div',null,'actions');actions.append(btn('다시 그리기',()=>{if(working)return;lock(actions);apply(icon,label,controls,true)}),btn(step===7?'내 생각 더하기 →':'다음 단계 →',()=>{if(working)return;lock(actions);step++;next()},'primary'));a.append(actions);
 },undefined,project=>window.SherpaProject.withConfig(project,step===3?{speedMultiplier:Number(label.replace('배',''))}:step===4?{initialLives:Number(label.replace('개',''))}:step===7?{soundPreset:label}:{}),modularSlotIntent(label,redraw));
}
function modularSlotIntent(label,redraw=false){
 const slot={0:'hero',1:'background',2:'obstacle',5:'item'}[step];if(!slot)return null;
 const stage=lesson.stages[step],preset=stage.questions[0].issues.find(o=>o.label===label)?.request;
 // Preserve the current choice's request verbatim; engine rules are owned by
 // the fixed engine, and full-HTML editing instructions belong to legacy only.
 const request=preset||[`주인공을 ${label} 모습으로 새로 그려 줘.`,`배경을 ${label} 풍경으로 바꿔 줘.`,`장애물을 ${label} 모양으로 바꿔 줘.`][step];
 return {mode:'slot',slot,redraw,freshHero:slot==='hero'&&!redraw,request:request+(redraw?'\n같은 선택으로 다시 만들어 줘. 그림은 새롭게 그려 줘.':''),...(slot==='item'?{itemName:label}:{})};
}
function complete(){if(working)return;window.saveClassroomPractice(html,step,true);$('progress').textContent='완성';const a=say('나만의 게임 완성! 🎉','게시판에 저장해서 친구들과 함께 해봐요.');const actions=node('div',null,'completion-actions');const board=node('a','친구들 게임 보기 ↗','share-board-link');board.href=classroomBoardUrl('/board');board.target='_blank';board.rel='noopener';actions.append(...window.createGameShareButtons(()=>html),btn('더 바꾸고 싶어요',()=>{lock(a);customPicker()}),board);a.append(actions);reveal(a)}
function customPicker(){
 window.saveClassroomPractice(html,8,false);
 $('progress').textContent='9 / 9 단계 · 내 생각';const a=say('뭘 바꾸고 싶어?','그림을 고르거나 직접 적어 봐요.');a.classList.add('step-message');const grid=node('div',null,'grid');
 for(const [icon,label,example]of categories)grid.append(choice(icon,label,()=>{if(working)return;lock(a);customForm(icon,label,example)}));
 a.append(grid,btn('이대로 완성하기 ✓',()=>{lock(a);complete()},'primary finish-button'));reveal(a);
}
function customForm(icon,label,example){
 const a=say('어떻게 바꾸고 싶어?',label==='직접 적기'?'만들고 싶은 것을 자유롭게 적어 봐요.':icon+' '+label+'을 어떻게 바꿀까요?');a.classList.add('custom-message');a.append(node('p','예시: '+example,'example'));
 const input=node('textarea');input.rows=4;input.maxLength=600;input.placeholder=example;input.setAttribute('aria-label','바꾸고 싶은 내용');
 const help=node('p','말한 내용은 글자로 나와요. 확인한 뒤 바꾸기 버튼을 눌러요.','voice-help');help.setAttribute('role','status');input.oninput=()=>{help.textContent='적힌 내용을 확인하고 바꾸기 버튼을 눌러요.'};const actions=node('div',null,'actions');let recognition=null,listening=false,base='',failed=false;
 const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
 const mic=btn('🎤 말로 적기',()=>{
  if(!Speech){help.textContent='이 브라우저에서는 말로 적기를 쓸 수 없어요. 글자로 적어 주세요.';return}
  if(listening){recognition.stop();return}
  try{
   recognition=new Speech();speech=recognition;recognition.lang='ko-KR';recognition.interimResults=true;recognition.continuous=false;base=input.value.trim();failed=false;
   recognition.onresult=e=>{let words='';for(let i=0;i<e.results.length;i++)words+=e.results[i][0].transcript;input.value=(base+(base?' ':'')+words).slice(0,600)};
   recognition.onerror=e=>{failed=true;help.textContent=e.error==='not-allowed'?'마이크 사용이 허용되지 않았어요. 브라우저에서 허용하거나 글자로 적어 주세요.':e.error==='no-speech'?'목소리가 들리지 않았어요. 다시 눌러 말해 주세요.':'음성을 듣지 못했어요. 다시 말하거나 글자로 적어 주세요.'};
   recognition.onend=()=>{listening=false;input.readOnly=false;mic.textContent='🎤 말로 적기';mic.setAttribute('aria-pressed','false');if(speech===recognition)speech=null;if(!failed)help.textContent='적힌 내용을 확인하고 바꾸기 버튼을 눌러요.'};
   recognition.start();listening=true;input.readOnly=true;mic.textContent='⏹ 말하기 끝';mic.setAttribute('aria-pressed','true');help.textContent='듣고 있어요. 바꾸고 싶은 것을 말해 주세요.';
  }catch{listening=false;input.readOnly=false;help.textContent='마이크를 시작하지 못했어요. 다시 누르거나 글자로 적어 주세요.'}
 });mic.setAttribute('aria-pressed','false');
 actions.append(mic,btn('이렇게 바꾸기 ✨',()=>{
  const text=input.value.trim();if(!text){help.textContent='바꾸고 싶은 내용을 먼저 적거나 말해 주세요.';input.focus();return}
  generate(finishPrompt(`아이가 바꾸고 싶은 부분: ${label}\n아이의 요청: ${text}`),icon+' '+text,a,result=>{const buttons=node('div',null,'actions');buttons.append(btn('더 바꾸기',()=>{if(working)return;lock(buttons);customPicker()}),btn('완성하기 ✓',()=>{if(working)return;lock(buttons);complete()},'primary'));result.append(buttons)},undefined,undefined,{mode:'route',request:`아이가 바꾸고 싶은 부분: ${label}\n아이의 요청: ${text}`});
 },'primary'),btn('다른 부분 고르기',()=>{if(working)return;if(speech)speech.abort();lock(a);customPicker()}));a.append(input,help,actions);reveal(a);
}
window.addEventListener('pagehide',()=>{if(speech)speech.abort()});
$('jump').onclick=()=>{$('game').contentWindow.postMessage({channel:'lounge-dino',command:'tap'},'*');$('game').focus()};$('restart').onclick=()=>preview(html);
$('download').onclick=()=>{if(!html)return;let owner=document;try{if(parent!==window&&parent.location.origin===location.origin)owner=parent.document}catch{}const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),a=owner.createElement('a');a.href=url;a.download='나의_공룡게임.html';a.hidden=true;owner.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
(async()=>{try{
 const response=await fetch('lesson-data.json');if(!response.ok)throw Error('수업 자료 로딩 실패');lesson=await response.json();for(const i of [5,6,7])options[i]=lesson.stages[i].questions[0].issues.map(o=>[o.icon,o.label]);
 const resumed=window.restoreClassroomPractice();
 const resumedKind=resumed?window.SherpaProject.inspectHtml(resumed.html).kind:null;
 initialGameHtml=lesson.game;
 if(!resumed||resumedKind==='modular'){await window.SherpaProject.init();initialGameHtml=window.SherpaProject.buildGameHtml(window.SherpaProject.createProject())}
 if(resumed){step=resumed.step;preview(resumed.html);if(resumed.complete){complete();return}}else preview(initialGameHtml);if(new URLSearchParams(location.search).get('course')==='1'){next();return}
 const a=say('우리 함께 게임을 만들어요!','먼저 미리보기에서 공룡게임을 해봐요. 준비되면 아래 버튼을 눌러요.');a.append(btn('주인공 바꾸러 가기 →',()=>{lock(a);next()},'primary'));
}catch{say('수업을 불러오지 못했어요','로컬 서버를 확인하고 새로고침해 주세요.')}})();

// Added only to the grade-one classroom's practice script by build.cjs.
function appendCharacterChoices(grid, previousActions) {
  grid.append(choice('🎨', '직접 그리기', () => openCharacterEditor(grid)));

  if (previousActions) {
    grid.append(choice('↩', '현재 캐릭터 유지', () => {
      if (working) return;
      lock(grid);
      lock(previousActions, false);
      reveal(previousActions.parentElement);
      previousActions.querySelector('button').focus({preventScroll: true});
    }));
  } else if (html !== initialGameHtml) {
    // A restored first step may already contain a successfully changed hero.
    grid.append(choice('✓', '지금 캐릭터로 다음 단계', () => {
      if (working) return;
      lock(grid);
      step++;
      next();
    }));
  }
}

function appendCharacterResultActions(article, redraw) {
  const actions = node('div', null, 'actions');
  actions.append(
    btn('다시 그리기', () => {
      if (!working) redraw(actions);
    }),
    btn('다른 캐릭터 고르기', () => {
      if (working) return;
      lock(actions);
      next(actions);
    }),
    btn('다음 단계 →', () => {
      if (working) return;
      lock(actions);
      step++;
      next();
    }, 'primary')
  );
  article.append(actions);
}

function openCharacterEditor(controls) {
  if (working || step !== 0) return;
  try { requireEditableProject(); } catch (error) { reveal(say('', error.message)); return; }
  const editor = window.grade1Pixel;
  editor.open({
    initial: modularProject?.authoringVersion===3 ? null : modularProject ? modularProject.assets.pixel : editor.read(html),
    onApply(sprite) {
      const changedGame = modularProject ? window.SherpaProject.buildGameHtml(window.SherpaProject.withPixel(modularProject,sprite)) : sprite ? editor.apply(html, sprite) : lesson.game;
      if (!window.saveClassroomPractice(changedGame, 0, false)) {
        throw Error('그림을 저장하지 못했어요. 브라우저의 저장 공간을 확인해 주세요.');
      }
      preview(changedGame);
      if (!sprite) return;
      lock(controls);
      const result = say('내가 그린 캐릭터로 바꿨어요!', '미리보기에서 움직여 보세요.');
      appendCharacterResultActions(result, openCharacterEditor);
      reveal(result);
    }
  });
}

// These functions are included in the classroom practice script by build.cjs.
function requireEditableProject() {
  if (modularUnsupported) throw Error('이 버전의 게임은 지금 바꿀 수 없어요. 저장한 게임은 그대로 할 수 있어요.');
}

function savePracticePreview(game) {
  if (!window.saveClassroomPractice(game, step, false)) {
    throw Error('게임을 저장하지 못했어요. 브라우저의 저장 공간을 확인한 뒤 다시 시도해 주세요.');
  }
  preview(game);
}

async function generateClassroomEdit(payload, signal, onProgress) {
  const pixel = window.grade1Pixel;
  const abilities = window.Grade1Abilities;
  const previous = payload.baseHtml;
  const sprite = pixel.read(previous);
  const ability = abilities.selected(previous);
  const changingHero = step === 0 || payload.prompt.startsWith('아이가 바꾸고 싶은 부분: 주인공\n');
  const changingAbility = payload.prompt.startsWith('아이가 바꾸고 싶은 부분: 특별 능력\n');
  const keepSprite = sprite && !changingHero;
  const keepAbility = payload.abilityOverride || (ability && !changingAbility ? ability : null);

  // Unwrap the generated game's renderer/physics in reverse order. The model
  // edits the original game, then the exact saved choices are attached again.
  const clean = pixel.remove(abilities.forGeneration(previous));
  // Large one-line image literals are immutable assets, not code to regenerate.
  const assets = [];
  const modelHtml = clean.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, value => {
    const token = '__SHERPA_IMAGE_ASSET_' + assets.length + '__';
    assets.push({token, value}); return token;
  });
  const contract = '\n이 수업은 같은 Canvas 러너를 이어서 편집해. pen, player.x/y/air/low, phase, speed, introMs, STEP, REST_Y, RUN_BOXES, LOW_BOXES, items를 보존해. '
    + 'frame에서 tick과 paint, tick에서 updateJump·advanceItems·hits, pressJump에서 beginJump를 호출하고 resetRun, boxesTouch, blip, fitViewport() 초기화를 유지해. '
    + 'paint에서 인자 없는 주인공 그리기 함수(drawDinosaur 등)를 호출해. 아이템을 추가한 뒤에는 장애물과 별도 수집 배열, 실제 획득 규칙을 보존해. '
    + '버튼 관련 코드는 앱이 관리하니 그대로 둬. '
    + '__SHERPA_IMAGE_ASSET_N__ 문자열은 앱이 복원하는 기존 이미지야. 사용하는 이미지는 이 문자열을 그대로 보존하고 base64를 생성하지 마. 주인공을 바꾸면 새 주인공은 Canvas로 그려 줘. '
    + 'grade1UseFallback 선언과 이미지 조건은 유지해.';
  let prompt = payload.prompt + contract;
  // Compare the model's editable input, ignoring formatting/comments and app-owned controls.
  const comparable = value => value
    .replace(/\/\* GRADE1_(DUCK|SPECIAL)_START \*\/[\s\S]*?\/\* GRADE1_\1_END \*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|<!--[\s\S]*?-->|\s+/g,
      token => /^["'`]/.test(token) ? token : '');
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await receiveGameHtml({baseHtml: modelHtml, prompt}, signal, onProgress);
    const unchanged = comparable(result.html) === comparable(modelHtml);
    for (const {token,value} of assets) result.html = result.html.split(token).join(value);
    if (/__SHERPA_IMAGE_ASSET_\d+__/.test(result.html)) throw Error('게임 그림을 복원하지 못했어요. 다시 시도해 주세요.');
    try {
      if (unchanged) console.info('[공룡3 응답 검사]', {step: step + 1, status: 'unchanged'});
      // Detect a rewritten engine before advancing to the ability step. Never
      // replace the student's last playable game with an incompatible response.
      if (step <= 6 || keepAbility) {
        abilities.checkGame(result.html, {collectibles: keepAbility === '자석'});
      }
      let game = result.html;
      // Restore the trusted controls inside the runner closure before initialization.
      for (const name of ['DUCK', 'SPECIAL']) {
        const pattern = new RegExp('/\\* GRADE1_' + name + '_START \\*/[\\s\\S]*?/\\* GRADE1_' + name + '_END \\*/', 'g');
        const original = lesson.game.match(pattern)?.[0];
        if (original) {
          if (pattern.test(game)) { pattern.lastIndex = 0; let first = true; game = game.replace(pattern, () => { if (!first) return ''; first = false; return original; }); }
          else game = game.replace(/(?=\bfitViewport\s*\(\s*\)\s*;)/, () => original + '\n  ');
        }
      }
      const fallback = value => value.match(/function\s+drawDinosaurFallback\s*\(\s*\)\s*\{[\s\S]*?(?=\n\s*function\s+drawItem\s*\()/)?.[0];
      const originalFallback = fallback(lesson.game), actualFallback = fallback(game);
      const fallbackReady = originalFallback && actualFallback && /const grade1UseFallback = (?:true|false);/.test(game) && /if\s*\(\s*!grade1UseFallback\s*&&\s*dinosaurAtlasReady\s*&&\s*dinosaurAtlas\s*\)/.test(game);
      // Ask once more for the character hook, but never block the class on it.
      if (!fallbackReady && attempt === 0 && !payload.abilityOverride) throw Error('캐릭터 연결 다시 시도');
      if (fallbackReady) game = game.replace(/const grade1UseFallback = (?:true|false);/, 'const grade1UseFallback = ' + (actualFallback !== originalFallback) + ';');
      if (keepSprite) game = pixel.apply(game, sprite);
      if (keepAbility) game = abilities.apply(game, keepAbility);
      return {...result, html: game};
    } catch (error) {
      console.warn('[공룡3 응답 검사]', error);
      if (attempt > 0 || signal.aborted || payload.abilityOverride) throw error;
      prompt += '\n직전 응답은 위 러너 연결 검사에 실패했어. 처음 전달한 기존 HTML을 복사한 상태에서 필요한 함수 내부만 수정해 줘.';
      onProgress(0, 0);
    }
  }
}

function selectClassroomAbility(label, controls) {
  if (working) return;
  const selected = controls.querySelector('button[aria-pressed="true"]');
  let game;
  try {
    requireEditableProject();
    game = modularProject ? window.SherpaProject.buildGameHtml(window.SherpaProject.withConfig(modularProject,{abilityId:window.SherpaProject.abilityIds[label]})) : window.Grade1Abilities.apply(html, label);
  } catch (error) {
    if (modularProject || modularUnsupported) { reveal(say('능력을 적용하지 못했어요.', error.message)); return; }
    if (error.code === 'MISSING_COLLECTIBLES') {
      const result = say('', error.message);
      lock(controls, false); reveal(result);
      return;
    }
    // Old student games may use a different AI-generated engine. Reconnect it
    // once, then use the same deterministic ability rule and save-on-success path.
    generate(finishPrompt('이전 수업에서 만든 이 게임의 캐릭터, 배경, 아이템, 속도, 목숨, 소리와 조작을 보존하면서 아래 러너 함수 구조로 연결해 줘. 기존 특별 능력과 안내는 제거해 줘.'),
      label + ' 능력을 연결할게요.', controls, result => {
        result.querySelector('p').textContent = label + ' 능력을 적용했어요. 미리보기에서 해 보세요.';
        appendAbilityActions(result, controls, selected);
      }, label);
    return;
  }
  try {
    savePracticePreview(game);
  } catch (error) {
    const result = say('능력을 적용하지 못했어요.', error.message);
    reveal(result);
    return;
  }
  lock(controls);
  const result = say('능력을 적용했어요!', label + ' · 미리보기에서 해 보세요.');
  appendAbilityActions(result, controls, selected);
}

function appendAbilityActions(result, controls, selected) {
  const actions = node('div', null, 'actions');
  actions.append(
    btn('능력 다시 고르기', () => {
      if (working) return;
      lock(actions); lock(controls, false); reveal(controls); selected?.focus({preventScroll:true});
    }),
    btn('다음 단계 →', () => {
      if (working) return;
      lock(actions); step++; next();
    }, 'primary')
  );
  result.append(actions); reveal(result);
}
