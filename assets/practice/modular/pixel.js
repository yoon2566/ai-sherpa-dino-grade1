/* Pixel data contracts: strict AI drafts, then editable 12-colour artwork. */
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

  function measure(pixel) {
    const flat = pixel.pixels.join(''), seen = new Set();
    let painted = 0, largestComponent = 0;
    for (let index = 0; index < 256; index++) {
      if (flat[index] === '.') continue;
      painted++;
      if (seen.has(index)) continue;
      const queue = [index]; seen.add(index);
      for (let at = 0; at < queue.length; at++) {
        const current = queue[at], x = current % 16, y = Math.floor(current / 16);
        for (const next of [x > 0 ? current - 1 : -1, x < 15 ? current + 1 : -1, y > 0 ? current - 16 : -1, y < 15 ? current + 16 : -1]) {
          if (next < 0 || flat[next] === '.' || seen.has(next)) continue;
          seen.add(next); queue.push(next);
        }
      }
      largestComponent = Math.max(largestComponent, queue.length);
    }
    return {painted, largestComponent, connectedRatio: painted ? largestComponent / painted : 0};
  }

  function validatePixel(slot, value) {
    try {
      if (!['hero', 'obstacle', 'item'].includes(slot)) fail();
      if (!value || Object.keys(value).sort().join(',') !== 'palette,pixels') fail();
      const pixel = normalize(value, 8), stats = measure(pixel);
      if (stats.painted < Math.ceil(256 * .15)) return {ok: false, error: '그림을 더 크게 채워 주세요.', ...stats};
      if (slot === 'hero' && stats.connectedRatio < .9) return {ok: false, error: '머리와 몸통과 다리를 붙여 주세요.', ...stats};
      return {ok: true, pixel, ...stats};
    } catch { return {ok: false, error: '그림은 16줄, 한 줄 16칸과 최대 8색으로 보내 주세요.'}; }
  }

  global.SherpaPixel = Object.freeze({symbols, legacyPalette, normalize, toPixel, measure, validatePixel});
})(window);
