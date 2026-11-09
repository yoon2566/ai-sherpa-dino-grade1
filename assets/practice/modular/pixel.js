/* Repair AI drafts before validation; keep edited 12-colour artwork strict. */
(function (global) {
  'use strict';
  const symbols = '0123456789ab';
  const legacyPalette = Object.freeze(['#172c48', '#28a853', '#ed5147', '#ffca35', '#3985e6', '#885bcc', '#fa8ebe', '#935e3d', '#ffffff']);
  const fail = () => { throw Error('그림을 읽지 못했어요. 다시 해봐요.'); };

  function normalize(value, maxColors = 12) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || !Array.isArray(value.palette) || value.palette.length < 1 || value.palette.length > maxColors
      || value.palette.some(color => typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))
      || !Array.isArray(value.pixels) || value.pixels.length !== 16) fail();
    let painted = 0;
    for (const row of value.pixels) {
      if (typeof row !== 'string' || row.length !== 16) fail();
      for (const char of row) {
        if (char === '.') continue;
        const index = symbols.indexOf(char);
        if (index < 0 || index >= value.palette.length) fail();
        painted++;
      }
    }
    if (!painted) fail();
    return {palette: value.palette.map(color => color.toLowerCase()), pixels: value.pixels.slice()};
  }

  function toPixel(value) {
    if (typeof value !== 'string') return normalize(value);
    if (!/^[0-9]{256}$/.test(value) || !/[1-9]/.test(value)) fail();
    const chars = [...value].map(char => char === '0' ? '.' : symbols[Number(char) - 1]).join('');
    return {palette: [...legacyPalette], pixels: Array.from({length: 16}, (_, row) => chars.slice(row * 16, row * 16 + 16))};
  }

  function components(pixel) {
    const flat = pixel.pixels.join(''), seen = new Set();
    const groups = [];
    for (let index = 0; index < 256; index++) {
      if (flat[index] === '.') continue;
      if (seen.has(index)) continue;
      const queue = [index]; seen.add(index);
      for (let at = 0; at < queue.length; at++) {
        const current = queue[at], x = current % 16, y = Math.floor(current / 16);
        for (const next of [x > 0 ? current - 1 : -1, x < 15 ? current + 1 : -1, y > 0 ? current - 16 : -1, y < 15 ? current + 16 : -1]) {
          if (next < 0 || flat[next] === '.' || seen.has(next)) continue;
          seen.add(next); queue.push(next);
        }
      }
      groups.push(queue);
    }
    return groups.sort((a,b) => b.length - a.length);
  }

  function measure(pixel) {
    const groups = components(pixel);
    const painted = groups.reduce((sum,group) => sum + group.length, 0), largestComponent = groups[0]?.length || 0;
    return {painted, largestComponent, connectedRatio: painted ? largestComponent / painted : 0};
  }

  function repair(slot, value) {
    const changes = {};
    const add = (name, count = 1) => { if (count) changes[name] = (changes[name] || 0) + count; };
    const validColor = color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
    const sourcePalette = Array.isArray(value?.palette) ? value.palette : [];
    const kept = [];
    sourcePalette.forEach((color,index) => {
      if (!validColor(color)) add('invalidColors');
      else if (kept.length < 8) kept.push({index,color:color.toLowerCase()});
      else add('excessColors');
    });
    // No usable colour information: preserve the silhouette in the editor's ink.
    if (!kept.length) { kept.push({index:-1,color:legacyPalette[0]}); add('fallbackPalette'); }
    const originalRows = Array.isArray(value?.pixels) ? value.pixels : [];
    let rows = originalRows.map(row => {
      const chars = typeof row === 'string' ? Array.from(row) : [];
      const clean = chars.map(char => {
        if (char === '.' || symbols.includes(char)) return char;
        add('unknownCells'); return '.';
      });
      add('paddedCells', Math.max(0,16-clean.length));
      add('croppedCells', Math.max(0,clean.length-16));
      return clean.slice(0,16).join('').padEnd(16,'.');
    });
    const blank = '.'.repeat(16);
    while (rows.length > 16 && (rows[0] === blank || rows.at(-1) === blank)) {
      if (rows[0] === blank) rows.shift(); else rows.pop();
      add('trimmedBlankRows');
    }
    add('croppedRows',Math.max(0,rows.length-16)); rows = rows.slice(0,16);
    const missing = 16-rows.length, above = slot === 'item' ? Math.floor(missing/2) : missing;
    if (missing) { rows = [...Array(above).fill(blank),...rows,...Array(missing-above).fill(blank)]; add('paddedRowsAbove',above); add('paddedRowsBelow',missing-above); }
    const counts = kept.map(entry => rows.join('').split(symbols[entry.index] || '\0').length-1);
    const mostUsed = counts.indexOf(Math.max(...counts));
    const rgb = color => [1,3,5].map(start => parseInt(color.slice(start,start+2),16));
    const mapping = Array.from(symbols, (char,index) => {
      const retained = kept.findIndex(entry => entry.index === index);
      if (retained >= 0) return symbols[retained];
      if (!validColor(sourcePalette[index])) return symbols[mostUsed];
      const source = rgb(sourcePalette[index]);
      const distances = kept.map(entry => rgb(entry.color).reduce((sum,n,i) => sum+(n-source[i])**2,0));
      return symbols[distances.indexOf(Math.min(...distances))];
    });
    rows = rows.map(row => Array.from(row,char => {
      if (char === '.') return char;
      const mapped = mapping[symbols.indexOf(char)]; if (mapped !== char) add('remappedCells'); return mapped;
    }).join(''));
    const pixel = {palette:kept.map(entry => entry.color),pixels:rows};
    if (slot === 'hero') {
      const flat = rows.join('').split('');
      for (const group of components(pixel)) if (group.length < 4) {
        for (const index of group) flat[index] = '.';
        add('removedSmallCells',group.length);
      }
      pixel.pixels = Array.from({length:16},(_,y) => flat.slice(y*16,y*16+16).join(''));
      // A fragmented draft is repaired to its main silhouette, not rejected
      // for connectivity alone. The same 39-cell minimum still applies.
      if (measure(pixel).connectedRatio < .8) {
        for (const group of components(pixel).slice(1)) {
          for (const index of group) flat[index] = '.';
          add('removedSecondaryCells',group.length);
        }
        pixel.pixels = Array.from({length:16},(_,y) => flat.slice(y*16,y*16+16).join(''));
      }
    }
    if (Object.keys(changes).length) console.info('[SherpaPixel] 밑그림 자동 보정', {slot,...changes});
    return pixel;
  }

  function validatePixel(slot, value) {
    try {
      if (!['hero', 'obstacle', 'item'].includes(slot)) fail();
      const pixel = repair(slot, value), stats = measure(pixel);
      if (stats.painted < Math.ceil(256 * .15)) return {ok: false, pixel, error: '그림을 더 크게 채워 주세요.', ...stats};
      return {ok: true, pixel, ...stats};
    } catch { return {ok: false, error: '그림은 16줄, 한 줄 16칸과 최대 8색으로 보내 주세요.'}; }
  }

  global.SherpaPixel = Object.freeze({symbols, legacyPalette, normalize, toPixel, measure, validatePixel});
})(window);
