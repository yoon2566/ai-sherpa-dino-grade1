/* Fixed default drawing slots. No gameplay state is passed to a slot. */
(function(global){'use strict';
function drawHero(ctx,v){
    const pen=ctx, player={x:0,y:v.pose==='duck'?-18:0,low:v.pose==='duck',air:v.pose==='jump'},animationMs=v.t,phase=v.pose==='dead'?'crashed':'running';
    const fill=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);};
    // Original triceratops artwork: three ivory horns, amber frill, four legs and a tapered tail.
    // Pose and decorative pixels stay inside the existing 44x47 / 59x25 sprite envelopes.
    const x=player.x,y=player.y,ink='#344e49',shadow='#456c61',skin='#659383',light='#9cba95',frill='#ba8856',horn='#e4d4ad';
    const step=player.air?0:Math.floor(animationMs/(player.low?125:1000/12))%2,lift=step*3;
    if(player.low){
      fill(x+9,y+34,6,8-lift,shadow);fill(x+35,y+34,6,5+lift,shadow);
      fill(x+1,y+29,8,4,ink);fill(x+4,y+27,8,8,ink);
      fill(x+9,y+24,28,15,ink);fill(x+6,y+28,35,9,ink);fill(x+10,y+26,25,10,skin);fill(x+12,y+25,18,3,light);
      fill(x+30,y+20,5,18,ink);fill(x+34,y+18,9,21,ink);fill(x+32,y+23,12,13,frill);fill(x+36,y+21,5,15,'#d0a76e');
      fill(x+42,y+25,10,12,ink);fill(x+50,y+29,8,8,ink);fill(x+43,y+27,9,8,skin);fill(x+51,y+31,5,4,light);
      fill(x+43,y+19,4,10,ink);fill(x+45,y+18,5,4,ink);fill(x+45,y+20,2,7,horn);fill(x+47,y+19,2,2,horn);
      fill(x+47,y+24,4,6,ink);fill(x+50,y+21,5,4,ink);fill(x+49,y+25,2,4,horn);fill(x+51,y+22,3,2,horn);
      fill(x+55,y+26,3,7,ink);fill(x+57,y+24,2,4,ink);fill(x+56,y+28,1,4,horn);fill(x+58,y+25,1,2,horn);
      fill(x+47,y+30,2,2,ink);fill(x+55,y+35,2,1,ink);fill(x+16,y+30,3,2,shadow);fill(x+24,y+32,3,2,shadow);
      fill(x+9,y+36,5,7-lift,ink);fill(x+7,y+41-lift,8,3,ink);fill(x+34,y+36,5,4+lift,ink);fill(x+33,y+38+lift,8,3,ink);
    }else{
      // Rear legs alternate behind the near pair; the raised, horned head follows the existing head hitbox.
      fill(x+11,y+33,5,9-lift,shadow);fill(x+25,y+32,4,7+lift,shadow);
      fill(x+1,y+21,3,4,ink);fill(x+3,y+23,6,6,ink);fill(x+5,y+24,6,4,skin);
      fill(x+8,y+18,18,18,ink);fill(x+5,y+22,26,10,ink);fill(x+9,y+20,17,13,skin);fill(x+8,y+22,4,8,skin);fill(x+12,y+19,12,4,light);
      fill(x+24,y+13,9,18,ink);fill(x+25,y+16,6,13,skin);
      fill(x+22,y+1,8,3,ink);fill(x+19,y+4,14,15,ink);fill(x+17,y+8,4,9,ink);fill(x+21,y+17,10,6,ink);
      fill(x+22,y+4,7,15,frill);fill(x+20,y+7,5,10,frill);fill(x+23,y+6,4,12,'#d0a76e');fill(x+20,y+9,2,3,horn);fill(x+23,y+17,3,2,horn);
      fill(x+29,y+8,9,13,ink);fill(x+33,y+15,9,8,ink);fill(x+30,y+11,6,9,skin);fill(x+35,y+17,6,4,light);
      // Far brow horn, near brow horn and the shorter nose horn.
      fill(x+29,y+2,4,9,ink);fill(x+31,y,6,3,ink);fill(x+31,y+3,1,6,horn);fill(x+33,y+1,3,1,horn);
      fill(x+33,y+8,4,7,ink);fill(x+36,y+5,4,5,ink);fill(x+39,y+3,4,3,ink);fill(x+35,y+9,1,4,horn);fill(x+38,y+6,1,3,horn);fill(x+40,y+4,2,1,horn);
      fill(x+39,y+13,3,5,ink);fill(x+41,y+10,3,4,ink);fill(x+40,y+14,1,3,horn);fill(x+42,y+11,1,2,horn);
      fill(x+31,y+14,3,3,ink);fill(x+31,y+14,1,1,'#f6f1da');fill(x+39,y+20,2,1,ink);fill(x+14,y+25,3,2,shadow);fill(x+20,y+28,3,2,shadow);
      fill(x+10,y+33,6,10-lift,ink);fill(x+11,y+34,3,6-lift,skin);fill(x+9,y+42-lift,8,3,ink);
      fill(x+21,y+33,6,7+lift,ink);fill(x+22,y+34,3,4+lift,skin);fill(x+21,y+39+lift,8,3,ink);
      if(phase==='crashed'){fill(x+30,y+13,2,2,ink);fill(x+33,y+16,2,2,ink);fill(x+33,y+13,2,2,ink);fill(x+30,y+16,2,2,ink);}
    }
  }

function drawObstacle(ctx,v){
    const o={x:0,y:0,type:{id:v.kind,w:v.w},count:1},animationMs=v.t;
    const fill=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);};
    const x=Math.round(o.x),y=o.y;
    if(o.type.id==='drifter'){
      // A small faceted survey airship, intentionally without bird wings or beak.
      const flap=Math.floor(animationMs/(1000/6))%2;fill(x+6,y+11,9,8,'#6c787f');fill(x+10,y+8,8,12,'#9faeb3');fill(x+15,y+15,17,6,'#607578');fill(x+18,y+21,24,6,'#607578');fill(x+21,y+22,18,3,'#b6c1ba');fill(x+2,y+14,4,3,'#3e5b60');fill(x+15,y+11-flap*3,12,2,'#8a9b96');fill(x+30,y+17,5,4,'#adbcb0');
    }else{
      for(let i=0;i<o.count;i++){const xx=x+i*o.type.w;
        if(o.type.id==='shard'){fill(xx+4,y,6,34,'#778783');fill(xx,y+7,5,27,'#8d9c91');fill(xx+10,y+4,7,14,'#5e7474');fill(xx+6,y+3,2,23,'#c4ccaf');fill(xx+12,y+6,2,9,'#9baf9c');fill(xx+1,y+31,15,4,'#6c7e75');}
        else{fill(xx+8,y,7,49,'#6d7d7c');fill(xx,y+12,7,38,'#8c998b');fill(xx+13,y+10,10,38,'#536e70');fill(xx+10,y+3,2,34,'#bdc5ad');fill(xx+2,y+16,2,24,'#b2baa1');fill(xx+17,y+14,2,21,'#879d91');fill(xx+2,y+47,21,3,'#5e7471');}
      }
    }
  }

function drawBackground(ctx,v){
    const pen=ctx,worldW=v.w,nightOpacity=v.night,moonX=v.moonX,starShift=v.starShift,floorShift=v.scroll,clouds=v.clouds,dy=v.groundY-139;
    const fill=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y+dy),w,h);};
    ctx.fillStyle='#fafaf7';ctx.fillRect(0,0,v.w,v.h);
    if(nightOpacity>0){pen.save();pen.globalAlpha=nightOpacity;fill(moonX+5,22,10,2,'#7d8c82');fill(moonX+2,24,8,16,'#7d8c82');fill(moonX+5,40,10,2,'#7d8c82');for(let i=0;i<2;i++){const sx=(worldW*(.28+i*.43)-starShift+worldW)%worldW,sy=21+i*24;fill(sx,sy,1,7,'#8d998e');fill(sx-3,sy+3,7,1,'#8d998e');}pen.restore();}
    for(const c of clouds){const x=Math.round(c.x);fill(x+4,c.y+5,32,2,'#e5e6de');fill(x+10,c.y+2,15,3,'#e5e6de');fill(x,c.y+7,43,1,'#e5e6de');}
    fill(0,139,worldW,1,'#8d9890');for(let i=0;i<16;i++){const x=((i*47-floorShift)%600+600)%600;fill(x,143+(i%3),i%2?5:2,1,'#c0c4b7');}
  }
function drawItem(ctx,v){ctx.fillStyle='#e7ae28';ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?3.3:7.5;const x=8+Math.cos(a)*r,y=8+Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.fillStyle='#fff1a7';ctx.fillRect(7,4,2,5);}
global.SherpaDefaultSlots=Object.freeze({drawHero,drawBackground,drawObstacle,drawItem});
})(globalThis);
