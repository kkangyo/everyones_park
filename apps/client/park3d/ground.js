// Deterministic winter surfaces. Overrides retain the original collision/terrain tile IDs.
(function () {
  const styles = [
    { id: '1', name: '눈밭 · 완전히 덮인 눈', group: '눈과 잔디', base: 1, kind: 'snow', color: '#eef2fb' },
    { id: '2', name: '눈밭 · 푸른 그늘', group: '눈과 잔디', base: 2, kind: 'snow', color: '#e4eaf7' },
    { id: 'grass-bare', name: '겨울 잔디 · 눈 없음', group: '눈과 잔디', base: 1, kind: 'grass', snow: 0, color: '#7e8970' },
    { id: 'grass-dusting', name: '겨울 잔디 · 눈 조금', group: '눈과 잔디', base: 1, kind: 'grass', snow: 0.25, color: '#a5b09a' },
    { id: 'grass-patchy', name: '겨울 잔디 · 반쯤 쌓인 눈', group: '눈과 잔디', base: 1, kind: 'grass', snow: 0.5, color: '#c3cbbb' },
    { id: 'grass-deep', name: '겨울 잔디 · 눈 많이', group: '눈과 잔디', base: 1, kind: 'grass', snow: 0.78, color: '#e0e6dd' },
    { id: '3', name: '기존 다져진 산책로', group: '산책로', base: 3, kind: 'dirt', color: '#d9cfc6' },
    { id: 'brick-brown', name: '갈색 벽돌 블록', group: '산책로', base: 3, kind: 'brick', color: '#a27c63' },
    { id: 'brick-brown-snow', name: '갈색 벽돌 · 틈새에 쌓인 눈', group: '산책로', base: 3, kind: 'brick', snow: 0.25, color: '#baa18d' },
    { id: 'block-gray', name: '회색 보도 블록', group: '산책로', base: 3, kind: 'block', color: '#939da4' },
    { id: 'block-gray-snow', name: '회색 블록 · 가장자리 눈', group: '산책로', base: 3, kind: 'block', snow: 0.3, color: '#b9c3ca' },
    { id: 'stone-light', name: '밝은 석재 판석', group: '산책로', base: 4, kind: 'stone', color: '#c8c2b5' },
    { id: 'gravel', name: '고운 자갈 산책로', group: '산책로', base: 3, kind: 'gravel', color: '#b0a79a' },
    { id: 'asphalt', name: '짙은 회색 포장길', group: '산책로', base: 3, kind: 'asphalt', color: '#737d83' },
    { id: 'edge-brick', name: '잔디 ↔ 갈색 벽돌 경계', group: '잔디와 길 연결', base: 3, kind: 'brick', edge: true, color: '#999277' },
    { id: 'edge-gray', name: '잔디 ↔ 회색 블록 경계', group: '잔디와 길 연결', base: 3, kind: 'block', edge: true, color: '#9aa496' },
    { id: 'shore-earth', name: '호숫가 · 얼어붙은 흙과 눈', group: '호수 주변', base: 1, kind: 'earth', snow: 0.3, color: '#b6aa95' },
    { id: 'shore-pebbles', name: '호숫가 · 둥근 조약돌', group: '호수 주변', base: 1, kind: 'pebbles', snow: 0.15, color: '#9fa49f' },
    { id: 'shore-stone', name: '호숫가 · 석축 가장자리', group: '호수 주변', base: 3, kind: 'shore-stone', color: '#949e9d' },
    { id: 'shore-reeds', name: '호숫가 · 마른 풀과 눈', group: '호수 주변', base: 1, kind: 'reeds', snow: 0.65, color: '#d4d3bc' },
    { id: 'shore-snow', name: '호숫가 · 푸른 눈 둔덕', group: '호수 주변', base: 1, kind: 'shore-snow', color: '#d8e7ed' },
    { id: '5', name: '흐르는 강물 · 통행 불가', group: '호수 주변', base: 5, kind: 'ice', color: '#bcdcf0' },
    { id: '15', name: '목교 · 물 위 나무 다리', group: '기존 바닥', base: 15, kind: 'wood', color: '#b69b72' },
    { id: '4', name: '기존 광장', group: '기존 바닥', base: 4, kind: 'stone', color: '#e6d9cc' },
    { id: '16', name: '기존 무대', group: '기존 바닥', base: 16, kind: 'wood', color: '#c9c2b6' },
  ];
  const byId = new Map(styles.map((s) => [s.id, s]));
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
  const hash = (x, y) => { let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  function noise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), u = smooth(0, 1, x - ix), v = smooth(0, 1, y - iy); return (hash(ix, iy) * (1-u) + hash(ix+1, iy) * u) * (1-v) + (hash(ix, iy+1) * (1-u) + hash(ix+1, iy+1) * u) * v; }
  const snowColor = (x, z) => mix([227, 235, 244], [249, 251, 253], noise(x * 3, z * 3));
  function surface(style, x, z) {
    const speck = hash(Math.floor(x * 64), Math.floor(z * 64)), n = noise(x * 4, z * 4);
    let col = rgb(style.color), seam = 0;
    if (style.kind === 'grass' || style.kind === 'reeds' || style.kind === 'earth') {
      col = style.kind === 'grass' ? mix([99, 116, 83], [153, 149, 105], n) : mix([116, 105, 84], [181, 171, 135], n);
      if (style.kind !== 'earth') {
        const row = Math.floor(z * 32), blade = (Math.floor(x * 64) + row * 3) % (style.kind === 'reeds' ? 13 : 7);
        if (blade === 0 && speck > 0.2) col = mix(col, style.kind === 'reeds' ? [118, 98, 61] : [72, 88, 58], 0.6);
        else if (blade === 1) col = mix(col, [178, 168, 118], 0.3);
      }
    } else if (['brick', 'block', 'stone', 'shore-stone', 'wood'].includes(style.kind)) {
      const brick = style.kind === 'brick', wood = style.kind === 'wood', rows = wood ? 5 : brick ? 4 : style.kind === 'block' ? 3 : 2;
      const row = Math.floor(z * rows), u = x * (brick ? 2 : wood ? 1 : 2) + (row % 2) * 0.5, v = z * rows;
      const fx = u - Math.floor(u), fz = v - row;
      seam = Math.min(fx, 1-fx) < 0.075 || Math.min(fz, 1-fz) < (brick ? 0.075 : 0.045) ? 1 : 0;
      const variation = hash(Math.floor(u), row);
      const base = style.edge ? (brick ? [162, 124, 99] : [147, 157, 164]) : rgb(style.color);
      col = base.map((c) => c * (0.88 + variation * 0.23));
      col = mix(col, [87, 89, 87], seam * 0.7);
      if (!seam && fz < 0.14) col = mix(col, [233, 231, 220], 0.18);
      if (wood) col = mix(col, [91, 72, 51], Math.max(0, noise(x * 23, z * 5) - 0.55) * 0.6);
    } else if (style.kind === 'gravel' || style.kind === 'pebbles') {
      const scale = style.kind === 'pebbles' ? 3.3 : 7.3, sx = x * scale, sz = z * scale;
      const row = Math.floor(sz), colId = Math.floor(sx + row % 2 * 0.5);
      const u = sx + row % 2 * 0.5 - colId - 0.5, v = sz - row - 0.5, r = Math.sqrt(u*u + v*v * 1.2);
      col = mix([111, 119, 119], [191, 187, 168], hash(colId, row));
      if (r > 0.43) col = [102, 108, 105]; else if (v < -0.14) col = mix(col, [227, 230, 221], 0.25);
    } else if (style.kind === 'shore-snow' || style.kind === 'ice') {
      col = mix(style.kind === 'ice' ? [157, 197, 220] : [200, 220, 232], [240, 247, 249], n);
      if (style.kind === 'ice' && noise(x * 17, z * 3) > 0.73) col = [228, 243, 249];
    } else if (style.kind === 'snow') col = mix(snowColor(x, z), rgb(style.color), style.id === '2' ? 0.65 : 0.1);
    col = col.map((c) => c * (0.96 + speck * 0.08));
    if (style.snow) {
      const cover = noise(x * 2.2 + 31, z * 2.2 + 9) * 0.74 + noise(x * 7, z * 7) * 0.26;
      const amount = smooth(1 - style.snow - 0.08, 1 - style.snow + 0.08, cover + seam * 0.26);
      col = mix(col, snowColor(x, z), amount);
    }
    if (style.kind === 'reeds') {
      const bx = Math.floor(x * 4), bz = Math.floor(z * 2), phase = x * 16 + bz * 0.7;
      if (hash(bx, bz) > 0.55 && phase - Math.floor(phase) < 0.18 && (z * 5 % 1) < 0.7) col = mix(col, [133, 112, 68], 0.8);
    }
    return col;
  }
  function styleAt(map, x, z) {
    x = Math.max(0, Math.min(map.width - 1, x)); z = Math.max(0, Math.min(map.height - 1, z));
    const i = z * map.width + x, override = map.editor3d?.groundStyles?.[i];
    return byId.get(override) || byId.get(String(map.layers.find((l) => l.name === 'ground').data[i])) || byId.get('1');
  }
  const natural = (s) => ['grass', 'snow', 'earth', 'reeds', 'shore-snow', 'pebbles'].includes(s.kind);
  function sample(style, x, z, neighbors) {
    let col = surface(style, x, z);
    if (neighbors && ['brick', 'block', 'asphalt', 'gravel', 'shore-stone'].includes(style.kind)) {
      const fx = x - Math.floor(x), fz = z - Math.floor(z);
      const edges = [[fx, neighbors[0]], [1-fx, neighbors[1]], [fz, neighbors[2]], [1-fz, neighbors[3]]].filter(([, s]) => natural(s)).sort((a,b) => a[0]-b[0]);
      if (edges.length) {
        const [distance, neighbor] = edges[0], width = style.edge ? 0.44 : 0.09;
        const wobble = (noise(x * 9, z * 9) - 0.5) * 0.07;
        const blend = 1 - smooth(width * 0.4, width, distance + wobble);
        col = mix(col, surface(neighbor, x, z), blend);
        if (style.kind === 'shore-stone' && distance > width && distance < width + 0.07) col = mix(col, [224, 232, 231], 0.55);
      }
    }
    if (neighbors && style.id.startsWith('shore-')) {
      const fx = x - Math.floor(x), fz = z - Math.floor(z);
      const shore = [[fx, neighbors[0]], [1-fx, neighbors[1]], [fz, neighbors[2]], [1-fz, neighbors[3]]].filter(([, s]) => s.kind === 'ice').sort((a,b) => a[0]-b[0]);
      if (shore.length) {
        const distance = shore[0][0], damp = 1 - smooth(0.03, 0.22, distance + (noise(x*9,z*9)-0.5)*0.04);
        col = mix(col, style.kind === 'shore-snow' ? [185,212,230] : [105,127,131], damp * 0.65);
        if (style.kind === 'shore-stone' && distance > 0.1 && distance < 0.17) col = [217,225,222];
      }
    }
    return col;
  }
  function compose(baseCanvas, map, shadeAt) {
    const entries = Object.entries(map.editor3d?.groundStyles || {}).filter(([, id]) => byId.has(id));
    if (!entries.length) return baseCanvas;
    const S = 16, canvas = document.createElement('canvas'); canvas.width = map.width * S; canvas.height = map.height * S;
    const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(baseCanvas, 0, 0, canvas.width, canvas.height);
    const image = g.getImageData(0, 0, canvas.width, canvas.height), data = image.data;
    for (const [key, id] of entries) {
      const i = Number(key), tx = i % map.width, tz = Math.floor(i / map.width), style = byId.get(id);
      const neighbors = [styleAt(map, tx-1, tz), styleAt(map, tx+1, tz), styleAt(map, tx, tz-1), styleAt(map, tx, tz+1)];
      for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
        const x = tx + (px + 0.5) / S, z = tz + (py + 0.5) / S, col = sample(style, x, z, neighbors);
        const shade = shadeAt ? shadeAt(x * 8 - 0.5, z * 8 - 0.5) : 1, offset = ((tz * S + py) * canvas.width + tx * S + px) * 4;
        for (let c = 0; c < 3; c++) data[offset+c] = Math.max(0, Math.min(255, col[c] * shade)); data[offset+3] = 255;
      }
    }
    g.putImageData(image, 0, 0); return canvas;
  }
  function preview(canvas, id) {
    const style = byId.get(id) || styles[0], S = 16, tiles = 3, c = document.createElement('canvas'); c.width = c.height = S * tiles;
    const g = c.getContext('2d'), img = g.createImageData(c.width, c.height);
    const grass = byId.get('grass-patchy'), neighbors = style.edge ? [grass, style, style, style] : undefined;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const col = sample(style, (x+0.5)/S, (y+0.5)/S, neighbors), offset = (y*c.width+x)*4; img.data.set([...col.map(Math.round),255],offset); }
    g.putImageData(img, 0, 0); const out = canvas.getContext('2d'); out.imageSmoothingEnabled = false; out.drawImage(c,0,0,canvas.width,canvas.height);
  }
  window.ParkGround = { styles, byId, compose, sample, preview, styleAt };
})();
