(() => {
  const compact=matchMedia('(max-width:1100px), (pointer:coarse) and (max-width:1400px)');
  const names=['chat','preview'];
  let active='chat';
  function update(){
    for(const name of names){
      const panel=document.getElementById(name+'-panel');
      const tab=document.getElementById(name+'-tab');
      const selected=name===active;
      tab.setAttribute('aria-selected',String(selected));
      tab.tabIndex=selected?0:-1;
      panel.inert=compact.matches&&!selected;
      if(compact.matches)panel.setAttribute('aria-hidden',String(!selected));
      else panel.removeAttribute('aria-hidden');
    }
  }
  for(const name of names){
    const tab=document.getElementById(name+'-tab');
    tab.onclick=()=>{active=name;update()};
    tab.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      active=event.key==='Home'?'chat':event.key==='End'?'preview':active==='chat'?'preview':'chat';
      update();document.getElementById(active+'-tab').focus();
    };
  }
  compact.addEventListener('change',update);
  update();
})();
