'use strict';
window.bindGameExpand=function(panel,button,embedded=false){
  let active=false,native=false;
  function close(){
    active=false;panel.classList.remove('expanded-game');button.textContent='⛶ 크게 보기';button.setAttribute('aria-expanded','false');
    if(embedded)parent.postMessage({channel:'grade1-expand',active:false},location.origin);
    if(document.fullscreenElement===panel)document.exitFullscreen().catch(()=>{});
    native=false;
  }
  button.setAttribute('aria-expanded','false');
  button.addEventListener('click',()=>{
    if(active){close();return}
    active=true;panel.classList.add('expanded-game');button.textContent='✕ 작게 보기';button.setAttribute('aria-expanded','true');
    if(embedded)parent.postMessage({channel:'grade1-expand',active:true},location.origin);
    if(panel.requestFullscreen)panel.requestFullscreen().then(()=>{native=true}).catch(()=>{});
  });
  document.addEventListener('fullscreenchange',()=>{if(native&&!document.fullscreenElement)close()});
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();close()}});
  window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.channel==='grade1-classroom'&&!event.data.active)close()});
  return close;
};
