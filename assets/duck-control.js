'use strict';
// Momentary control: every cancellation path must release ArrowDown.
window.bindDinoDuck = function(button, frame) {
  let held = false, pointer = null;
  const send = down => frame.contentWindow?.postMessage({channel:'lounge-dino',code:40,down}, '*');
  function release() {
    pointer = null;
    if (!held) return;
    held = false; button.setAttribute('aria-pressed','false'); send(false);
  }
  function press() {
    if (button.disabled || held) return;
    held = true; button.setAttribute('aria-pressed','true'); send(true);
  }
  button.setAttribute('aria-pressed','false');
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== null || button.disabled) return;
    event.preventDefault(); pointer = event.pointerId;
    button.setPointerCapture(pointer); button.focus({preventScroll:true}); press();
  });
  for (const name of ['pointerup','pointercancel','lostpointercapture']) {
    button.addEventListener(name, event => { if (event.pointerId === pointer) release(); });
  }
  button.addEventListener('keydown', event => {
    if (['Space','Enter','ArrowDown'].includes(event.code)) { event.preventDefault(); press(); }
  });
  button.addEventListener('keyup', event => {
    if (['Space','Enter','ArrowDown'].includes(event.code)) { event.preventDefault(); release(); }
  });
  button.addEventListener('blur',release);
  button.addEventListener('contextmenu',event=>event.preventDefault());
  window.addEventListener('blur',release);
  window.addEventListener('pagehide',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  window.addEventListener('message',event=>{
    if(event.source===parent && event.origin===location.origin && event.data?.channel==='grade1-classroom' && !event.data.active)release();
  });
  frame.addEventListener('load',release);
  const panel=button.closest('#preview-panel');
  if(panel)new MutationObserver(()=>{if(panel.inert)release();}).observe(panel,{attributes:true,attributeFilter:['inert','aria-hidden']});
  const jump=document.getElementById('jump');
  new MutationObserver(()=>{button.disabled=jump.disabled;if(button.disabled)release();}).observe(jump,{attributes:true,attributeFilter:['disabled']});
  return release;
};
