(function (global) {
  'use strict';
  const choices = {
    '두 번 점프': ['double', '공중에서 한 번 더 점프해요.'],
    '잠깐 무적': ['invincible', '5초 동안 장애물을 통과해요.'],
    '높이 점프': ['high', '평소보다 1.5배 높이 뛰어요.'],
    '천천히 낙하': ['float', '내려올 때 중력이 절반으로 줄어요.'],
    '자석': ['magnet', '120픽셀 안의 아이템을 끌어당겨요.'],
    '잠깐 커지기': ['giant', '5초 동안 커져 장애물을 부숴요.'],
    '작아지기': ['small', '몸과 충돌 범위가 70% 크기로 줄어요.'],
    '보호막': ['shield', '처음 부딪힌 장애물 한 개를 막아요.'],
    '장애물 작아지기': ['shrink', '5초 동안 장애물이 절반 크기가 돼요.'],
    '장애물 느리게': ['slow', '장애물만 원래 속도의 70%로 움직여요.'],
    '자동 점프': ['auto', '가까이 온 장애물 앞에서 스스로 점프해요.']
  };
  const block = /\/\* GRADE1_ABILITY_START:([a-z]+) \*\/[\s\S]*?\/\* GRADE1_ABILITY_END \*\/\n?/g;
  const startup = /\bfitViewport\s*\(\s*\)\s*;/g;
  function incompatible() {
    throw Error('이 게임에서는 선택한 능력을 연결하지 못했어요. 이전 게임에서 다시 골라 주세요.');
  }
  function selected(html) {
    if (typeof html !== 'string') return null;
    const match = [...html.matchAll(block)][0];
    return match ? Object.keys(choices).find(label => choices[label][0] === match[1]) || null : null;
  }
  function forGeneration(html) {
    return html.replace(block, '');
  }
  function declarations(script) {
    const found = [...script.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)];
    return new Map(found.map((match, i) => [match[1], script.slice(match.index, found[i + 1]?.index ?? script.length)]));
  }
  function actorRenderer(functions) {
    const paint = functions.get('paint') || '';
    const draws = [...paint.matchAll(/\b(draw[A-Za-z_$][\w$]*)\s*\(\s*\)\s*;/g)].map(match => match[1]);
    function rendersPlayer(name, visited = new Set()) {
      if (visited.has(name) || !functions.has(name)) return false;
      visited.add(name);
      const body = functions.get(name);
      if (/\bplayer\s*\.\s*(?:x|y|air|low)\b/.test(body)) return true;
      // Some saved characters expose drawDinosaur() as a wrapper around the
      // AI-drawn robot/animal. Scale the outer call, including any pixel sprite.
      const calls = [...body.matchAll(/\b(draw[A-Za-z_$][\w$]*)\s*\(\s*\)\s*;/g)];
      return calls.some(match => rendersPlayer(match[1], visited));
    }
    const actors = draws.filter(name => rendersPlayer(name));
    return actors.find(name => /^(?:drawDinosaur|drawPlayer|drawHero|drawCharacter|drawRobot)$/.test(name)) ||
      actors.find(name => !/(?:Hud|Lives|Score|Ground|Forest|Background|Sky|Cloud|Item|Star|Coin|Gift|Ability|Shield)/i.test(name));
  }
  function collectibleArray(script, functions) {
    // Ignore comments/strings when looking for code; item names are unrestricted.
    const codeOnly = text => text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, ' ');
    const code = codeOnly(script);
    const candidates = [...code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=\s*(?:\[|new\s+Array\s*\(|Array\s*\()/g)];
    for (const [, name] of candidates) {
      if (name === 'items' || /obstacle|hazard|enemy|enemies/i.test(name)) continue;
      const id = name.replace(/\$/g, '\\$');
      const ref = '(?<![\\w$.])' + id;
      if (!new RegExp(ref + '\\s*\\.\\s*(?:push|unshift)\\s*\\(|' + ref + '\\s*=\\s*' + id + '\\s*\\.\\s*concat\\s*\\(').test(code)) continue;
      for (const [fn, source] of functions) {
        const bodyCode = codeOnly(source);
        // declarations() includes trailing code: stop at this function's closing brace.
        const start = bodyCode.indexOf('{');
        let depth = 1, end = start + 1;
        while (end < bodyCode.length && depth) { if (bodyCode[end] === '{') depth++; if (bodyCode[end] === '}') depth--; end++; }
        const body = bodyCode.slice(start + 1, end - 1);
        const collecting = /collect|pickup/i.test(fn) ||
          (/\b(?:player|boxesTouch)\b/.test(body) && /\b(?:\w*(?:Count|Bonus)|score)\s*(?:\+\+|\+=)/.test(body));
        if (!collecting) continue;
        if (new RegExp(ref + '\\s*\\.\\s*splice\\s*\\(|' + ref + '\\s*=\\s*' + id + '\\s*\\.\\s*filter\\s*\\(').test(body)) return name;
      }
    }
    return null;
  }

  // This function is embedded in the game's own runner closure. It uses that
  // game's player, obstacles, collectible collection, renderer and jump sound.
  // It is also the only implementation used by downloads and published games.
  function installAbility(config, drawing, collectibles) {
    const kind = config.kind;
    let extraJumpUsed = false, shieldAvailable = true, blockedObstacle = null;
    let elapsed = 0, invincibleUntil = 0, readyAt = 0, graceUntil = 0;
    const special = ['invincible','giant','shield','shrink'].includes(kind);
    const active = () => special && elapsed < invincibleUntil;
    const activePhase = () => ['launch', 'intro', 'running'].includes(phase);
    const hud = document.createElement('div');
    hud.id = 'grade1-current-ability'; if (special) hud.classList.add('has-special');
    hud.setAttribute('aria-label', '현재 능력');
    const label = document.createElement('strong');
    label.textContent = config.label;
    const detail = document.createElement('span');
    const button = document.getElementById('grade1-special') || document.createElement('button');
    button.type = 'button'; button.id = 'grade1-special';
    button.textContent = '무적 사용 (X)';
    const style = document.createElement('style');
    style.textContent =
      '#grade1-current-ability{position:fixed;z-index:5;left:50%;bottom:2px;transform:translateX(-50%);max-width:98%;width:max-content;display:flex;align-items:center;justify-content:center;gap:.4em;padding:3px 7px;border-radius:6px;background:#fff;color:#203b40;font:600 clamp(10px,2.5vw,13px)/1.3 system-ui,sans-serif;text-align:center}' +
      '#grade1-current-ability strong{white-space:nowrap}#grade1-current-ability button{font:inherit;padding:4px;border:1px solid #347b80;border-radius:4px;color:inherit;background:white;cursor:pointer}' +
      '#abilityInfo,#abilityBtn,#abilityBar,#abilityHint,#abilityButton,#ability-status,#ability-info,#ability-btn,#shieldBtn,#shieldButton,#invincibleBtn,#invincibleButton,#powerBtn,#powerButton{display:none!important}' +
      '@media(pointer:coarse){#grade1-current-ability{left:12px;right:auto;transform:none;max-width:calc(100% - 180px)}#grade1-current-ability button{min-height:48px;padding:8px 12px;font-size:16px}}html.grade1-touch #grade1-current-ability{left:12px;right:auto;transform:none;max-width:calc(100% - 180px)}' +
      '@media(max-height:230px){#grade1-current-ability{bottom:0;font-size:10px;padding:1px 5px}#grade1-current-ability button{padding:1px 4px}}';
    style.textContent += '#grade1-special{display:none;position:fixed;z-index:10;right:calc(12px + 126px + 12px);bottom:12px;width:126px;height:48px;padding:4px;font:700 16px system-ui,sans-serif;white-space:nowrap;border:2px solid #F0A020;border-radius:16px;background:#FFF4D6;color:#7A4A00}#grade1-duck{width:126px}#grade1-special[data-state=auto]{background:#FFFBEF;border-color:#F5D58A;color:#9A6A10;font-size:12px}#grade1-special[data-state=active]{background:#F0A020;color:white}#grade1-special[data-state=cooldown]{background:#EEEEEE;border-color:#CCCCCC;color:#999999}@media(pointer:coarse){#grade1-special{display:block}}html.grade1-touch #grade1-special{display:block}';
    style.textContent += '@media(pointer:coarse){#grade1-current-ability.has-special{display:none}}html.grade1-touch #grade1-current-ability.has-special{display:none}';
    document.head.append(style);
    hud.append(label, detail);
    if (!button.isConnected) document.body.append(button);
    document.body.append(hud);
    // Older AI-generated games have their own ability bar and keyboard power.
    // Keep adjacent controls (e.g. sound) and retain the post-hit grace period.
    if (config.legacyUi) renderAbilityUi = function () {};
    const soundControls = document.getElementById('soundBtn')?.closest('#controlBar');
    if (soundControls) soundControls.hidden = false;
    if (config.powerTimer) isPowerInvulnerable = () => false;
    if (config.hitTimer && typeof invulnUntil === 'number') {
      isInvulnerable = () => clockMs < invulnUntil;
    }
    // Older drawings sometimes painted their ability label directly on the
    // canvas instead of using the named HTML controls. Keep independent HUD
    // segments such as score/lives while removing this superseded instruction.
    const legacyText = /두\s*번\s*점프|더블\s*점프|공중\s*(?:추가\s*)?점프|보호막|무적\s*(?:버튼|사용|발동)|잠깐\s*무적|장애물\s*느리게|자동\s*점프|천천히\s*낙하|능력\s*[:：]/;
    for (const method of ['fillText', 'strokeText']) {
      if (typeof pen[method] !== 'function') continue;
      const writeText = pen[method].bind(pen);
      pen[method] = function (text, ...args) {
        if (typeof text === 'string' && legacyText.test(text)) {
          text = text.split(/\s*[|·]\s*/).filter(part => !legacyText.test(part)).join(' · ');
          if (!text) return;
        }
        return writeText(text, ...args);
      };
    }
    for (const node of document.querySelectorAll('button,span,p,label')) {
      if (node !== button && !hud.contains(node) && node.childElementCount === 0 && legacyText.test(node.textContent || '')) node.style.setProperty('display', 'none', 'important');
    }
    function updateHud() {
      if (special) {
        const state = active() ? 'active' : elapsed < readyAt ? 'cooldown' : 'ready';
        const seconds = state === 'active' ? Math.min(5,Math.ceil((invincibleUntil-elapsed)/1000)) : Math.min(5,Math.ceil((readyAt-elapsed)/1000));
        button.dataset.state = state;
        button.style.fontSize = state === 'ready' && config.label.length >= 7 ? '12px' : ''; 
        button.textContent = state === 'active' ? '★ ' + seconds + '초' : state === 'cooldown' ? '다시 ' + seconds : '★ ' + config.label;
        button.disabled = state !== 'ready' || !activePhase();
        label.textContent = 'X 키: ★ ' + config.label; detail.textContent = '';
        if (parent !== window) parent.postMessage({channel:'grade1-ability', label:config.label, state, seconds, enabled:!button.disabled}, '*');
      } else { button.dataset.state='auto'; button.textContent='★ '+config.label+' · 자동'; button.disabled=false; label.textContent = config.label; detail.textContent = config.description; if(parent!==window) parent.postMessage({channel:'grade1-ability',label:config.label,state:'auto',enabled:true},'*'); }
    }
    function activate() {
      if (!special || !activePhase() || elapsed < readyAt) return;
      shieldAvailable = true; invincibleUntil = elapsed + 5000; readyAt = invincibleUntil + 5000;
      updateHud();
    }
    window.addEventListener('message', event => { if (event.source === parent && event.data?.channel === 'grade1-ability' && event.data.command === 'activate') activate(); });
    if (!button.dataset.baseBound) button.addEventListener('click', activate);
    window.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code === 'KeyX') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) { if (!special && parent !== window) parent.postMessage({channel:'grade1-special-hint'}, '*'); activate(); }
      } else if (event.repeat && ['Space', 'ArrowUp'].includes(event.code)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);

    const restart = resetRun;
    resetRun = function (...args) {
      shieldAvailable = true;
      extraJumpUsed = false;
      blockedObstacle = null;
      elapsed = invincibleUntil = readyAt = graceUntil = 0;
      const result = restart(...args);
      updateHud();
      return result;
    };
    beginJump = function () {
      if (!activePhase() || player.low) return false;
      if (player.air && (kind !== 'double' || extraJumpUsed)) return false;
      extraJumpUsed = player.air;
      player.air = true;
      player.minReached = false;
      player.drop = false;
      player.v = -10 - speed / 10;
      blip('jump');
      updateHud();
      return true;
    };
    updateJump = function () {
      if (!player.air) return;
      // Scale vertical displacement and thresholds together to preserve the
      // runner's jump shape and reach a 1.5x apex for the same input.
      const height = kind === 'high' ? 1.5 : 1;
      player.y += height * Math.round(player.v * (player.drop ? 3 : 1));
      player.v += kind === 'float' && player.v >= 0 ? .3 : .6;
      const normalY = REST_Y + (player.y - REST_Y) / height;
      if (normalY < 63 || player.drop) player.minReached = true;
      if ((normalY < 30 || player.drop) && player.minReached && player.v < -5) player.v = -5;
      if (player.y > REST_Y) {
        player.y = REST_Y;
        player.v = 0;
        player.air = player.low = player.drop = player.minReached = extraJumpUsed = false;
        if (phase === 'launch') { phase = 'intro'; introMs = 0; }
        updateHud();
      }
    };
    function playerBox(box) {
      const scale = kind === 'small' ? .7 : kind === 'giant' && active() ? 2 : 1;
      const width = player.low ? 59 : 44;
      return [player.x + width / 2 + (1 + box[0] - width / 2) * scale,
        player.y + 47 + (1 + box[1] - 47) * scale, box[2] * scale, box[3] * scale];
    }
    hits = function (obstacle) {
      if ((kind === 'invincible' && active()) || (kind === 'giant' && elapsed < graceUntil)) return false;
      if (blockedObstacle === obstacle) return false;
      const collided = window.grade1PixelHits
        && !(kind === 'shrink' && active())
        ? window.grade1PixelHits(obstacle, player, boxesTouch, kind === 'small' ? .7 : kind === 'giant' && active() ? 2 : 1)
        : (player.low ? LOW_BOXES : RUN_BOXES).some(box =>
          obstacle.boxes.some(other => boxesTouch(playerBox(box),
            [obstacle.x + (1 + other[0]) * (kind === 'shrink' && active() ? .5 : 1), obstacle.y + (1 + other[1]) * (kind === 'shrink' && active() ? .5 : 1), other[2] * (kind === 'shrink' && active() ? .5 : 1), other[3] * (kind === 'shrink' && active() ? .5 : 1)])));
      if (collided && kind === 'giant' && active()) { const index=items.indexOf(obstacle); if(index>=0) items.splice(index,1); return false; }
      if (collided && kind === 'shield' && active() && shieldAvailable) {
        shieldAvailable = false; invincibleUntil = elapsed; readyAt = elapsed + 5000;
        blockedObstacle = obstacle;
        updateHud();
        return false;
      }
      return collided;
    };
    if (kind === 'small' || kind === 'giant') {
      const draw = drawing.get();
      drawing.set(function (...args) {
        const x = player.x + (player.low ? 59 : 44) / 2, y = player.y + 47;
        pen.save();
        try { pen.translate(x, y); const scale=kind === 'small' ? .7 : active() ? 2 : 1; pen.scale(scale, scale); pen.translate(-x, -y); return draw(...args); }
        finally { pen.restore(); }
      });
    }
    if (kind === 'shrink' && typeof drawItem === 'function') {
      const drawObstacle = drawItem; drawItem = function(o, ...args) { if (!active()) return drawObstacle(o,...args); pen.save(); try { pen.translate(o.x,o.y); pen.scale(.5,.5); pen.translate(-o.x,-o.y); return drawObstacle(o,...args); } finally { pen.restore(); } };
    }
    // Keep the existing spawn/gap rules. Normalize only obstacle movement so an
    // old AI-generated 70% multiplier is neither retained nor applied twice.
    const move = advanceItems;
    advanceItems = function (deltaMs = STEP, obstacleSpeed = speed) {
      const before = new Map(items.map(item => [item, item.x]));
      const result = move(deltaMs, obstacleSpeed);
      for (const item of items) if (before.has(item)) {
        const normal = Math.floor((obstacleSpeed + (item.offset || 0)) * 60 / 1000 * deltaMs);
        item.x = before.get(item) - normal * (kind === 'slow' ? .7 : 1);
      }
      return result;
    };
    function attract() {
      const x = player.x + 22, y = player.y + 24;
      for (const item of collectibles()) {
        const dx = x - item.x, dy = y - item.y, distance = Math.hypot(dx, dy);
        if (distance > 0 && distance <= 120) {
          const portion = Math.min(1, (speed + 3) / distance);
          item.x += dx * portion;
          item.y += dy * portion;
        }
      }
    }
    const stepGame = tick;
    tick = function (...args) {
      if (activePhase()) {
        const wasActive = active(); elapsed += STEP; if (kind === 'giant' && wasActive && !active()) graceUntil = elapsed + 600;
        if (phase === 'running' && kind === 'magnet') attract();
        if (phase === 'running' && kind === 'auto' && !player.air && !player.low) {
          const front = player.x + 38;
          if (items.some(item => item.x + item.w > front && item.x - front <= Math.max(30, speed * 9))) beginJump();
        }
      }
      const result = stepGame(...args);
      updateHud();
      return result;
    };
    updateHud();
  }
  function inspectGame(html, needsCollectibles) {
    const source = forGeneration(html), scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
    for (const match of scripts) {
      const script = match[1], functions = declarations(script);
      if (!['beginJump', 'pressJump', 'updateJump', 'resetRun', 'hits', 'boxesTouch', 'advanceItems', 'tick', 'blip', 'paint', 'frame'].every(name => functions.has(name))) continue;
      if (!['RUN_BOXES', 'LOW_BOXES', 'STEP', 'REST_Y', 'player', 'pen', 'items', 'phase', 'speed', 'introMs'].every(name => new RegExp('\\b' + name + '\\b').test(script))) continue;
      const called = (caller, callee) => new RegExp('\\b'+callee+'\\s*\\(').test(functions.get(caller));
      if (!called('frame','tick') || !called('frame','paint') || !called('pressJump','beginJump') ||
          !['updateJump', 'advanceItems', 'hits'].every(name => called('tick', name))) continue;
      const actor = actorRenderer(functions), pickups = collectibleArray(script, functions);
      if (!actor) incompatible();
      if (needsCollectibles && !pickups) {
        const error = Error('이 게임에서는 자석을 쓸 수 없어요. 다른 능력을 골라 주세요.');
        error.code = 'MISSING_COLLECTIBLES';
        throw error;
      }
      const anchors = [...script.matchAll(startup)];
      if (anchors.length !== 1) incompatible();
      const at = match.index + match[0].indexOf('>') + 1 + anchors[0].index;
      return {source, functions, actor, pickups, at};
    }
    incompatible();
  }
  function checkGame(html, {collectibles = false} = {}) {
    inspectGame(html, collectibles);
    return true;
  }
  function apply(html, label) {
    if (!Object.hasOwn(choices, label)) throw Error('목록에서 능력을 다시 골라 주세요.');
    const [kind, description] = choices[label];
    const {source, functions, actor, pickups, at} = inspectGame(html, kind === 'magnet');
    if (kind === 'shrink' && !functions.has('drawItem')) incompatible();
    const config = JSON.stringify({kind, label, description, legacyUi:functions.has('renderAbilityUi'),
      powerTimer:functions.has('isPowerInvulnerable'), hitTimer:functions.has('isInvulnerable')});
    const drawing = '{get:()=>'+actor+',set:fn=>{'+actor+'=fn}}';
    const collection = pickups ? '()=>'+pickups : 'null';
    const code = '/* GRADE1_ABILITY_START:'+kind+' */\n;('+installAbility.toString()+')('+config+','+drawing+','+collection+');\n/* GRADE1_ABILITY_END */\n';
    return source.slice(0, at) + code + source.slice(at);
  }
  global.Grade1Abilities = Object.freeze({apply, selected, forGeneration, checkGame});
})(globalThis);

