// The same 16×16 pattern travels inside the student's standalone game.
(() => {
  'use strict';
  const size = 16;
  const empty = '0'.repeat(size * size);
  const palette = [
    ['지우개', 'transparent'], ['남색', '#172c48'], ['초록', '#28a853'],
    ['빨강', '#ed5147'], ['노랑', '#ffca35'], ['파랑', '#3985e6'],
    ['보라', '#885bcc'], ['분홍', '#fa8ebe'], ['갈색', '#935e3d'], ['하양', '#ffffff']
  ];
  const valid = pixels => typeof pixels === 'string' && /^[0-9]{256}$/.test(pixels) && /[1-9]/.test(pixels);
  const dataTag = /<script type="application\/json" id="grade1-pixel-data">"([0-9]{256})"<\/script>/;
  const attachedScripts = /<!-- grade1-pixel:start -->[\s\S]*?<!-- grade1-pixel:end -->/g;
  const attachedDraw = /\/\* grade1-pixel:draw \*\/[\s\S]*?\/\* grade1-pixel:original \*\//g;
  const attachedHits = /\/\* grade1-pixel:hits \*\/[\s\S]*?\/\* grade1-pixel:hits-end \*\//g;

  function read(html) {
    const pixels = dataTag.exec(html)?.[1];
    return valid(pixels) ? pixels : null;
  }

  function remove(html) {
    return html.replace(attachedDraw, '').replace(attachedHits, '').replace(attachedScripts, '');
  }

  // Serialized into the downloaded HTML. It has no dependency on this editor.
  function installPainter(colors) {
    const pixels = JSON.parse(document.getElementById('grade1-pixel-data').textContent);
    const sheet = document.createElement('canvas');
    sheet.width = sheet.height = 16;
    const art = sheet.getContext('2d');
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i] === '0') continue;
      art.fillStyle = colors[Number(pixels[i])];
      art.fillRect(i % 16, Math.floor(i / 16), 1, 1);
    }
    let left = 16, top = 16, right = -1, bottom = -1;
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i] === '0') continue;
      const x = i % 16, y = Math.floor(i / 16);
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    function geometry(player) {
      const ducking = player.low && !player.air;
      const boxWidth = ducking ? 59 : 44, boxHeight = ducking ? 25 : 47;
      const width = right - left + 1, height = bottom - top + 1;
      const scale = Math.min(boxWidth / width, boxHeight / height);
      return {x: Math.round(player.x) + (boxWidth - width * scale) / 2,
        y: Math.round(player.y) + (ducking ? 18 : 0) + boxHeight - height * scale, scale, width, height};
    }
    window.drawGrade1PixelHero = function (pen, player) {
      const g = geometry(player);
      pen.save();
      pen.imageSmoothingEnabled = false;
      pen.drawImage(sheet, left, top, g.width, g.height, g.x, g.y, g.width * g.scale, g.height * g.scale);
      pen.restore();
    };
    window.grade1PixelHits = function (obstacle, player, boxesTouch, scale = 1) {
      const g = geometry(player);
      const anchorX = player.x + (player.low ? 59 : 44) / 2, anchorY = player.y + 47;
      g.x = anchorX + (g.x - anchorX) * scale;
      g.y = anchorY + (g.y - anchorY) * scale;
      g.scale *= scale;
      return obstacle.boxes.some(box => {
        const target = [box[0] + obstacle.x + 1, box[1] + obstacle.y + 1, box[2], box[3]];
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
          if (pixels[y * 16 + x] !== '0' && boxesTouch([g.x + (x - left) * g.scale, g.y + (y - top) * g.scale, g.scale, g.scale], target)) return true;
        }
        return false;
      });
    };
  }

  function apply(html, pixels) {
    if (!valid(pixels)) throw Error('캐릭터를 한 칸 이상 그려 주세요.');
    const base = remove(html);
    let installed = false;
    const output = base.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (tag, attributes, code) => {
      if (installed || /\b(?:src|type)\s*=/i.test(attributes) && !/type=["'](?:text\/javascript|module)["']/i.test(attributes)) return tag;
      const pen = /\b(\w+)\s*=\s*\w+\.getContext\(\s*['"]2d['"]\s*\)/.exec(code)?.[1];
      if (!pen || !/\bplayer\s*=\s*\{/.test(code) || !/\bplayer\.x\b/.test(code) || !/\bplayer\.y\b/.test(code)) return tag;
      const functions = Array.from(code.matchAll(/\bfunction\s+(draw\w+)\s*\(\s*\)\s*\{/g));
      // Older generated games rename drawDinosaur to drawRobot, drawCat, etc.
      const hero = functions.find(fn => /^draw(?:Dinosaur|Player|Hero|Character)$/.test(fn[1])
        && new RegExp('\\b' + fn[1] + '\\s*\\(\\s*\\)\\s*;').test(code))
        || functions.find(fn => /\bplayer\.[xy]\b/.test(code.slice(fn.index + fn[0].length).split(/\bfunction\s+/)[0].slice(0, 380))
          && !/Fallback|Hud|Score|Item|Obstacle|Power|Shield|Sky|Ground|Scene|Effect/i.test(fn[1])
          && new RegExp('\\b' + fn[1] + '\\s*\\(\\s*\\)\\s*;').test(code));
      if (!hero) return tag;
      const hitFunction = /\bfunction\s+hits\s*\(\s*(\w+)\s*\)\s*\{/.exec(code);
      if (!hitFunction || !/\bfunction\s+boxesTouch\s*\(/.test(code)) return tag;
      const hitOffset = hitFunction.index + hitFunction[0].length;
      code = code.slice(0, hitOffset) + '/* grade1-pixel:hits */return window.grade1PixelHits(' + hitFunction[1] + ',player,boxesTouch);/* grade1-pixel:hits-end */' + code.slice(hitOffset);
      const shiftedHero = code.indexOf(hero[0], hero.index);
      const offset = shiftedHero + hero[0].length;
      const draw = '/* grade1-pixel:draw */window.drawGrade1PixelHero(' + pen + ',player);return;/* grade1-pixel:original */';
      const runtime = '<!-- grade1-pixel:start --><script type="application/json" id="grade1-pixel-data">"'
        + pixels + '"</script><script>(' + installPainter.toString() + ')('
        + JSON.stringify(palette.map(color => color[1])) + ');</script><!-- grade1-pixel:end -->';
      installed = true;
      return runtime + '<script' + attributes + '>' + code.slice(0, offset) + draw + code.slice(offset) + '</script>';
    });
    if (!installed) throw Error('이 게임에서 주인공 그림을 연결하지 못했어요. 다시 시도해 주세요.');
    return output;
  }

  function open({initial, onApply}) {
    if (document.querySelector('.grade1-pixel-editor')) return;
    const pixels = (valid(initial) ? initial : empty).split('');
    const dialog = document.createElement('dialog');
    dialog.className = 'grade1-pixel-editor';
    dialog.setAttribute('aria-labelledby', 'grade1-pixel-heading');
    dialog.innerHTML = '<h2 id="grade1-pixel-heading">내 캐릭터 그리기</h2>'
      + '<p>색을 고르고 칸을 눌러 그려요.</p><div class="pixel-workspace">'
      + '<canvas width="320" height="320" tabindex="0" aria-label="16칸 곱하기 16칸 그림판. 방향키로 이동하고 스페이스바로 칠해요."></canvas>'
      + '<div class="pixel-tools"><div class="pixel-palette" role="group" aria-label="그림 색"></div>'
      + '<button type="button" class="pixel-eraser">지우개</button>'
      + '<button type="button" class="pixel-undo">되돌리기</button>'
      + '<button type="button" class="pixel-clear">모두 지우기</button></div></div>'
      + '<p class="pixel-message" role="status"></p><div class="pixel-actions">'
      + '<button type="button" class="pixel-cancel">취소</button>'
      + '<button type="button" class="pixel-apply">이 캐릭터로 달리기</button></div>';
    const find = selector => dialog.querySelector(selector);
    const canvas = find('canvas'), ctx = canvas.getContext('2d');
    const applyButton = find('.pixel-apply'), undoButton = find('.pixel-undo');
    let color = 1, cursor = 0, stroke = null, keyboardCursor = false;
    const history = [], swatches = [];
    function refresh() {
      for (let i = 0; i < pixels.length; i++) {
        const x = i % size, y = Math.floor(i / size);
        ctx.fillStyle = pixels[i] === '0' ? ((x + y) % 2 ? '#e5edf3' : '#fff') : palette[Number(pixels[i])][1];
        ctx.fillRect(x * 20, y * 20, 20, 20);
      }
      ctx.strokeStyle = '#9aaebd';
      ctx.lineWidth = 1; ctx.beginPath();
      for (let j = 1; j < size; j++) {
        const v = j * 20 + 0.5;
        ctx.moveTo(v, 0); ctx.lineTo(v, 320);
        ctx.moveTo(0, v); ctx.lineTo(320, v);
      }
      ctx.stroke();
      if (keyboardCursor) {
        ctx.lineWidth = 3; ctx.strokeStyle = '#1671cd';
        ctx.strokeRect(cursor % size * 20 + 2, Math.floor(cursor / size) * 20 + 2, 16, 16);
      }
      find('.pixel-clear').disabled = !valid(pixels.join(''));
      undoButton.disabled = history.length === 0;
    }
    function remember(previous) {
      if (previous === pixels.join('')) return;
      history.push(previous);
      if (history.length > 30) history.shift();
    }
    function selectColor(index) {
      color = index;
      swatches.forEach((button, i) => button.setAttribute('aria-pressed', String(i === color)));
    }
    palette.forEach(([name, value], index) => {
      const button = index ? document.createElement('button') : find('.pixel-eraser');
      if (index) {
        button.type = 'button'; button.title = name; button.setAttribute('aria-label', name);
        button.style.backgroundColor = value; find('.pixel-palette').append(button);
      }
      button.onclick = () => selectColor(index);
      swatches.push(button);
    });
    function point(event) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((event.clientX - rect.left) / rect.width * size);
      const y = Math.floor((event.clientY - rect.top) / rect.height * size);
      return x >= 0 && x < size && y >= 0 && y < size ? {x, y} : null;
    }
    function paintTo(to) {
      if (!to) { stroke.last = null; return; }
      const from = stroke.last || to, span = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
      for (let k = 0; k <= span; k++) {
        const x = Math.round(from.x + (to.x - from.x) * k / span);
        const y = Math.round(from.y + (to.y - from.y) * k / span);
        pixels[y * size + x] = String(color);
      }
      stroke.last = to; cursor = to.y * size + to.x; refresh();
    }
    canvas.onpointerdown = event => {
      if (event.button !== 0 || stroke) return;
      event.preventDefault(); keyboardCursor = false;
      canvas.setPointerCapture(event.pointerId);
      stroke = {id:event.pointerId, previous:pixels.join(''), last:null}; paintTo(point(event));
    };
    canvas.onpointermove = event => { if (stroke?.id === event.pointerId) paintTo(point(event)); };
    function finishStroke(event) {
      if (stroke?.id !== event.pointerId) return;
      if (event.type === 'pointerup') paintTo(point(event));
      remember(stroke.previous); stroke = null; refresh();
    }
    canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = finishStroke;
    canvas.onkeydown = event => {
      const x = cursor % size, y = Math.floor(cursor / size);
      switch (event.key) {
        case 'ArrowLeft': cursor = y * size + Math.max(x - 1, 0); break;
        case 'ArrowRight': cursor = y * size + Math.min(x + 1, size - 1); break;
        case 'ArrowUp': cursor = Math.max(0, y - 1) * size + x; break;
        case 'ArrowDown': cursor = Math.min(size - 1, y + 1) * size + x; break;
        case ' ': case 'Enter': {
          const previous = pixels.join(''); pixels[cursor] = String(color); remember(previous); break;
        }
        default: return;
      }
      event.preventDefault(); keyboardCursor = true; refresh();
    };
    undoButton.onclick = () => { const previous = history.pop(); if (previous) pixels.splice(0, pixels.length, ...previous); refresh(); };
    find('.pixel-clear').onclick = () => { const previous = pixels.join(''); pixels.fill('0'); remember(previous); refresh(); };
    find('.pixel-cancel').onclick = () => dialog.close();
    applyButton.onclick = () => {
      const value = pixels.join('');
      if (!valid(value)) {
        try { onApply(null); find('.pixel-message').textContent = '그림이 비어서 기본 공룡으로 달려요'; }
        catch (error) { find('.pixel-message').textContent = error.message; }
        return;
      }
      try { onApply(value); dialog.close(); }
      catch (error) { find('.pixel-message').textContent = error.message; }
    };
    dialog.addEventListener('close', () => dialog.remove(), {once:true});
    document.body.append(dialog); selectColor(1); refresh(); dialog.showModal();
  }
  window.grade1Pixel = {read, remove, apply, open};
})();
