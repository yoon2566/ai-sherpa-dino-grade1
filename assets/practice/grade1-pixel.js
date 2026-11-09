// Bitmap editor; the original 16×16 string format remains available for legacy games.
(() => {
  'use strict';
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

  function open({initial, draft, slot = 'hero', width = 16, height = 16, description, onApply, onRetry, onCancel}) {
    if (document.querySelector('.grade1-pixel-editor')) return;
    const ai = draft !== undefined;
    const indices = '0123456789abcdefghijklmnopqrstuvwxyz';
    const aiIndices = '0123456789abcdefghijklmnopqrstuvwxyz';
    const colors = palette.map(entry => entry.slice());
    const bitmap = ai ? draft : initial && typeof initial === 'object' ? initial : null;
    if (bitmap) {
      height = bitmap.pixels?.length;
      width = bitmap.pixels?.[0]?.length;
    }
    if (![[16,16],[44,47],[24,24]].some(([w,h]) => width === w && height === h)) throw Error('잘 안 됐어요. 다시 해봐요.');
    const bitmapOutput = ai || !!bitmap || width !== 16 || height !== 16;
    let seed = width === 16 && height === 16 && valid(initial) ? initial : '0'.repeat(width * height);
    if (ai || bitmap) {
      if (!['hero', 'obstacle', 'item'].includes(slot) || !bitmap || !Array.isArray(bitmap.palette)
          || bitmap.palette.length < 1 || bitmap.palette.length > 21
          || bitmap.palette.some(value => typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
          || !Array.isArray(bitmap.pixels) || bitmap.pixels.length !== height
          || bitmap.pixels.some(row => typeof row !== 'string' || row.length !== width
            || Array.from(row).some(pixel => pixel !== '.' && (aiIndices.indexOf(pixel) < 0 || aiIndices.indexOf(pixel) >= bitmap.palette.length)))) {
        throw Error('잘 안 됐어요. 다시 해봐요.');
      }
      colors.splice(1, colors.length - 1, ...bitmap.palette.map((value, index) => ['AI 색 ' + (index + 1), value.toLowerCase()]));
      for (const entry of palette.slice(1)) {
        if (colors.length === 22) break;
        if (!colors.some(color => color[1] === entry[1])) colors.push(entry.slice());
      }
      seed = bitmap.pixels.join('').split('').map(pixel => pixel === '.' ? '0' : indices[aiIndices.indexOf(pixel) + 1]).join('');
    }
    const pixels = seed.split('');
    const hasPaint = () => pixels.some(pixel => pixel !== '0');
    const artwork = () => ({
      palette: colors.slice(1).map(entry => entry[1]),
      pixels: Array.from({length: height}, (_, y) => pixels.slice(y * width, (y + 1) * width)
        .map(pixel => pixel === '0' ? '.' : aiIndices[indices.indexOf(pixel) - 1]).join(''))
    });
    const dialog = document.createElement('dialog');
    dialog.className = 'grade1-pixel-editor';
    if (width !== 16 || height !== 16) dialog.classList.add('pixel-detailed');
    dialog.setAttribute('aria-labelledby', 'grade1-pixel-heading');
    dialog.innerHTML = '<h2 id="grade1-pixel-heading">내 캐릭터 그리기</h2>'
      + '<p>색을 고르고 칸을 눌러 그려요.</p><div class="pixel-workspace">'
      + '<canvas width="' + width * 20 + '" height="' + height * 20 + '" tabindex="0" aria-label="' + width + '칸 곱하기 ' + height + '칸 그림판. 방향키로 이동하고 스페이스바로 칠해요."></canvas>'
      + '<div class="pixel-tools"><div class="pixel-palette" role="group" aria-label="그림 색"></div>'
      + '<div class="pixel-brushes" role="group" aria-label="붓 크기">'
      + '<button type="button" data-brush="1">가는 붓</button>'
      + '<button type="button" data-brush="3">중간 붓</button>'
      + '<button type="button" data-brush="5">굵은 붓</button></div>'
      + '<button type="button" class="pixel-eraser">지우개</button>'
      + '<button type="button" class="pixel-undo">되돌리기</button>'
      + '<button type="button" class="pixel-clear">모두 지우기</button></div></div>'
      + '<p class="pixel-message" role="status"></p><div class="pixel-actions">'
      + '<button type="button" class="pixel-cancel">취소</button>'
      + '<button type="button" class="pixel-apply">이 캐릭터로 달리기</button></div>';
    const find = selector => dialog.querySelector(selector);
    if (ai) {
      find('h2').textContent = description
        ? {hero:'내 캐릭터 그리기', obstacle:'내 장애물 그리기', item:'내 선물 그리기'}[slot]
        : {hero:'AI가 그린 밑그림이에요', obstacle:'AI가 그린 장애물이에요', item:'AI가 그린 선물이에요'}[slot];
      find('p').textContent = description || '마음에 안 드는 칸을 고쳐 봐요. 다 되면 아래 버튼을 눌러요.';
      find('.pixel-cancel').textContent = onRetry ? '다시 그려줘' : '취소';
      find('.pixel-apply').textContent = {hero:'이 캐릭터로 달리기 ✓', obstacle:'이 장애물로 정하기 ✓', item:'이 선물로 정하기 ✓'}[slot];
      const close = document.createElement('button');
      close.type = 'button'; close.className = 'pixel-close'; close.textContent = '✕';
      close.setAttribute('aria-label', '닫기'); close.style.float = 'right';
      close.onclick = () => { if (!applying) dialog.close(); };
      dialog.prepend(close);
    }
    const canvas = find('canvas'), ctx = canvas.getContext('2d');
    canvas.style.aspectRatio = width + ' / ' + height;
    const applyButton = find('.pixel-apply'), undoButton = find('.pixel-undo');
    let color = 1, brush = 3, cursor = 0, stroke = null, keyboardCursor = false, applying = false, outcome = 'cancel';
    const history = [], swatches = [];
    function refresh() {
      for (let i = 0; i < pixels.length; i++) {
        const x = i % width, y = Math.floor(i / width);
        ctx.fillStyle = pixels[i] === '0' ? ((x + y) % 2 ? '#e5edf3' : '#fff') : colors[indices.indexOf(pixels[i])][1];
        ctx.fillRect(x * 20, y * 20, 20, 20);
      }
      ctx.strokeStyle = '#e8eef5';
      ctx.lineWidth = 1; ctx.beginPath();
      for (let j = 1; j < width; j++) {
        const v = j * 20 + 0.5;
        ctx.moveTo(v, 0); ctx.lineTo(v, canvas.height);
      }
      for (let j = 1; j < height; j++) {
        const v = j * 20 + 0.5;
        ctx.moveTo(0, v); ctx.lineTo(canvas.width, v);
      }
      ctx.stroke();
      if (keyboardCursor) {
        ctx.lineWidth = 3; ctx.strokeStyle = '#1671cd';
        ctx.strokeRect(cursor % width * 20 + 2, Math.floor(cursor / width) * 20 + 2, 16, 16);
      }
      find('.pixel-clear').disabled = !hasPaint();
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
    function selectBrush(value) {
      brush = value;
      dialog.querySelectorAll('[data-brush]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.brush) === brush)));
    }
    dialog.querySelectorAll('[data-brush]').forEach(button => { button.onclick = () => selectBrush(Number(button.dataset.brush)); });
    colors.forEach(([name, value], index) => {
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
      const x = Math.floor((event.clientX - rect.left) / rect.width * width);
      const y = Math.floor((event.clientY - rect.top) / rect.height * height);
      return x >= 0 && x < width && y >= 0 && y < height ? {x, y} : null;
    }
    function dab(x, y) {
      const radius = (brush - 1) / 2;
      for (let py = Math.max(0, y - radius); py <= Math.min(height - 1, y + radius); py++) {
        for (let px = Math.max(0, x - radius); px <= Math.min(width - 1, x + radius); px++) pixels[py * width + px] = indices[color];
      }
    }
    function paintTo(to) {
      if (!to) { stroke.last = null; return; }
      const from = stroke.last || to, span = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
      for (let k = 0; k <= span; k++) {
        const x = Math.round(from.x + (to.x - from.x) * k / span);
        const y = Math.round(from.y + (to.y - from.y) * k / span);
        dab(x, y);
      }
      stroke.last = to; cursor = to.y * width + to.x; refresh();
    }
    canvas.onpointerdown = event => {
      if (event.button !== 0 || stroke || applying) return;
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
      if (applying) return;
      const x = cursor % width, y = Math.floor(cursor / width);
      switch (event.key) {
        case 'ArrowLeft': cursor = y * width + Math.max(x - 1, 0); break;
        case 'ArrowRight': cursor = y * width + Math.min(x + 1, width - 1); break;
        case 'ArrowUp': cursor = Math.max(0, y - 1) * width + x; break;
        case 'ArrowDown': cursor = Math.min(height - 1, y + 1) * width + x; break;
        case ' ': case 'Enter': {
          const previous = pixels.join(''); dab(x, y); remember(previous); break;
        }
        default: return;
      }
      event.preventDefault(); keyboardCursor = true; refresh();
    };
    undoButton.onclick = () => { const previous = history.pop(); if (previous) pixels.splice(0, pixels.length, ...previous); refresh(); };
    find('.pixel-clear').onclick = () => { const previous = pixels.join(''); pixels.fill('0'); remember(previous); refresh(); };
    find('.pixel-cancel').onclick = () => {
      if (applying) return;
      if (ai && onRetry) { outcome = 'retry'; const value = artwork(); dialog.close(); onRetry(value); }
      else dialog.close();
    };
    applyButton.onclick = async () => {
      if (applying) return;
      const value = pixels.join('');
      if (!hasPaint()) {
        if (ai) { find('.pixel-message').textContent = '잘 안 됐어요. 다시 해봐요.'; return; }
        try { await onApply(null); find('.pixel-message').textContent = '그림이 비어서 기본 공룡으로 달려요'; }
        catch (error) { find('.pixel-message').textContent = error.message; }
        return;
      }
      applying = true;
      dialog.querySelectorAll('button').forEach(button => { button.disabled = true; });
      try { await onApply(bitmapOutput ? artwork() : value); outcome = 'apply'; dialog.close(); }
      catch (error) { find('.pixel-message').textContent = error.message; }
      finally {
        applying = false;
        dialog.querySelectorAll('button').forEach(button => { button.disabled = false; });
        refresh();
      }
    };
    dialog.addEventListener('cancel', event => { if (applying) event.preventDefault(); });
    // Native dialog backdrops retarget clicks to the dialog itself.
    dialog.addEventListener('click', event => {
      if (event.target !== dialog || applying) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => { dialog.remove(); if (outcome === 'cancel') onCancel?.(); }, {once:true});
    document.body.append(dialog); selectColor(1); selectBrush(3); refresh(); dialog.showModal();
    return dialog;
  }
  window.grade1Pixel = {read, remove, apply, open};
})();
