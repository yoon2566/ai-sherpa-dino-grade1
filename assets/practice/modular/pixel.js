/* Legacy AI draft repairs and dimension-aware, strictly checked editor artwork. */
(function (global) {
  'use strict';
  const symbols = '0123456789abcdefghijklmnopqrstuvwxyz';
  const legacyPalette = Object.freeze(['#172c48', '#28a853', '#ed5147', '#ffca35', '#3985e6', '#885bcc', '#fa8ebe', '#935e3d', '#ffffff']);
  const fail = () => { throw Error('그림을 읽지 못했어요. 다시 해봐요.'); };

  function normalize(value, maxColors = 21) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || !Array.isArray(value.palette) || value.palette.length < 1 || value.palette.length > maxColors
      || value.palette.some(color => typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))
      || !Array.isArray(value.pixels)) fail();
    const height = value.pixels.length, width = value.pixels[0]?.length;
    if (![[16,16],[44,47],[24,24]].some(([w,h]) => width === w && height === h)) fail();
    let painted = 0;
    for (const row of value.pixels) {
      if (typeof row !== 'string' || row.length !== width) fail();
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
    const flat = pixel.pixels.join(''), seen = new Set(), width = pixel.pixels[0].length, height = pixel.pixels.length;
    const groups = [];
    for (let index = 0; index < width * height; index++) {
      if (flat[index] === '.') continue;
      if (seen.has(index)) continue;
      const queue = [index]; seen.add(index);
      for (let at = 0; at < queue.length; at++) {
        const current = queue[at], x = current % width, y = Math.floor(current / width);
        for (const next of [x > 0 ? current - 1 : -1, x < width - 1 ? current + 1 : -1, y > 0 ? current - width : -1, y < height - 1 ? current + width : -1]) {
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
    const symbols = '0123456789ab';
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
    if (slot === 'item' || slot === 'obstacle') {
      const flat = pixel.pixels.join('').split('');
      // Keep the largest component even when every component is tiny.
      for (const group of components(pixel).slice(1)) if (group.length < 4) {
        for (const index of group) flat[index] = '.';
        add('removedSmallCells',group.length);
      }
      pixel.pixels = Array.from({length:16},(_,y) => flat.slice(y*16,y*16+16).join(''));
    }
    // Enlarge only compact AI drafts, after all existing repairs. Copy cells
    // exactly (nearest neighbour); larger drafts keep their original position.
    const cells = pixel.pixels.flatMap((row,y) => Array.from(row,(color,x) => ({color,x,y}))).filter(cell => cell.color !== '.');
    if (cells.length) {
      const left = Math.min(...cells.map(c => c.x)), top = Math.min(...cells.map(c => c.y));
      const width = Math.max(...cells.map(c => c.x))-left+1, height = Math.max(...cells.map(c => c.y))-top+1;
      const scale = Math.min(3,Math.floor(16/Math.max(width,height)));
      if (scale >= 2) {
        const x = Math.floor((16-width*scale)/2);
        const y = slot === 'item' ? Math.floor((16-height*scale)/2) : 16-height*scale;
        const enlarged = Array.from({length:16},() => Array(16).fill('.'));
        for (const cell of cells) for (let dy=0;dy<scale;dy++) for (let dx=0;dx<scale;dx++) {
          enlarged[y+(cell.y-top)*scale+dy][x+(cell.x-left)*scale+dx] = cell.color;
        }
        pixel.pixels = enlarged.map(row => row.join(''));
        changes.enlargement = {width,height,scale,x,y,paintedBefore:cells.length,paintedAfter:cells.length*scale*scale};
      }
    }
    if (Object.keys(changes).length) console.info('[SherpaPixel] 밑그림 자동 보정', {slot,...changes});
    return pixel;
  }

  function validatePixel(slot, value) {
    try {
      if (!['hero', 'obstacle', 'item'].includes(slot)) fail();
      const pixel = repair(slot, value), stats = measure(pixel);
      if (stats.painted < (slot === 'item' ? 20 : 39)) return {ok: false, pixel, error: '그림을 더 크게 채워 주세요.', ...stats};
      return {ok: true, pixel, ...stats};
    } catch { return {ok: false, error: '그림은 16줄, 한 줄 16칸과 최대 8색으로 보내 주세요.'}; }
  }

  global.SherpaPixel = Object.freeze({symbols, legacyPalette, normalize, toPixel, components, measure, validatePixel});
})(window);
