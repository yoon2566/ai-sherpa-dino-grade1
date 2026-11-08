'use strict';
if(parent!==window){document.body.classList.add('embedded');const heading=document.querySelector('.preview-heading'),save=document.getElementById('download');heading.insertBefore(save,document.getElementById('restart'));}
const duckButton=document.createElement('button');
duckButton.id='duck';duckButton.type='button';duckButton.className='duck-button';
duckButton.textContent='↓ 숙이기';duckButton.title='누르는 동안 숙여요';
const playControls=document.createElement('div');playControls.className='play-controls';
const jumpButton=document.getElementById('jump');jumpButton.before(playControls);const specialButton=document.createElement('button');specialButton.id='special';specialButton.type='button';specialButton.className='special-button';playControls.append(specialButton,duckButton,jumpButton);
const tip=document.querySelector('.play-tip span:last-child'),defaultTip='★ 특수 능력(X키) · 숙이기는 누르는 동안!';let tipTimer;
function hint(text){clearTimeout(tipTimer);tip.textContent=text;tipTimer=setTimeout(()=>tip.textContent=defaultTip,2000)}
window.resetSpecialControl=()=>{specialButton.dataset.state='none';specialButton.textContent='★ 특수';specialButton.disabled=false;clearTimeout(tipTimer);tip.textContent=defaultTip};
specialButton.onclick=()=>{const state=specialButton.dataset.state;if(state==='none')hint('7단계에서 능력을 골라요');else if(state==='auto')hint(specialButton.dataset.label==='자석'?'아이템이 저절로 끌려와요':'점프하면 저절로 써져요');else document.getElementById('game').contentWindow.postMessage({channel:'grade1-ability',command:'activate'},'*')};
window.addEventListener('message',event=>{if(event.source!==document.getElementById('game').contentWindow||event.data?.channel!=='grade1-ability')return;const d=event.data;specialButton.dataset.state=d.state;specialButton.dataset.label=d.label;specialButton.style.fontSize=d.state==='ready'&&d.label.length>=7?'16px':'';specialButton.style.letterSpacing=d.state==='auto'?'-1.5px':'';specialButton.disabled=!d.enabled;specialButton.textContent=d.state==='active'?'★ '+Math.min(5,d.seconds)+'초':d.state==='cooldown'?'다시 '+Math.min(5,d.seconds):'★ '+d.label+(d.state==='auto'?' · 자동':'')});
window.addEventListener('keydown',event=>{if(event.code==='KeyX'&&!event.repeat&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)){event.preventDefault();specialButton.click()}});
window.resetSpecialControl();
window.bindDinoDuck(duckButton,document.getElementById('game'));
const expandButton=document.createElement('button');expandButton.id='expand-game';expandButton.type='button';expandButton.textContent='⛶ 크게 보기';
document.querySelector('.preview-heading').append(expandButton);
window.bindGameExpand(document.getElementById('preview-panel'),expandButton,parent!==window);


window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.channel==='grade1-ability'&&event.data.command==='activate'&&!specialButton.hidden)specialButton.click()});

window.addEventListener('message',event=>{if(event.source===document.getElementById('game').contentWindow&&event.data?.channel==='grade1-special-hint')specialButton.click()});
