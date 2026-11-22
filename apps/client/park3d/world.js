// Canonical 3D park scenery: the main game and map editor use this same builder.
(function () {
  function create(THREE, MAP, TRUCK_DEF, renderer) {
    const root = new THREE.Group(), scene = root;
    const MW = MAP.width, MH = MAP.height;
    const layer = (n) => MAP.layers.find((l) => l.name === n);
    const GROUND = layer("ground").data, OBST = layer("obstacles").data;
    const G = { snow: 1, snow2: 2, path: 3, plaza: 4, ice: 5, outside: 6, tree: 7, fence: 8, rock: 9, wall: 10, benchDown: 11, benchUp: 12, benchLeft: 13, garden: 14, bridge: 15, stage: 16 };
    const prop = (o, k) => (o.properties || []).find((p) => p.name === k)?.value;
    const groundAt = (x, y) => GROUND[y * MW + x];
// ───────── 재질 ─────────
const ramp = new THREE.DataTexture(new Uint8Array([110, 110, 110, 172, 172, 172, 228, 228, 228]), 3, 1, THREE.RGBFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
const mats = new Map();
const toon = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshToonMaterial({ color: c, gradientMap: ramp })); return mats.get(c); };
const glowM = (c) => { const k = "g" + c; if (!mats.has(k)) mats.set(k, new THREE.MeshBasicMaterial({ color: c })); return mats.get(k); };
function M(geo, mat, x = 0, y = 0, z = 0, p) { const m = new THREE.Mesh(geo, typeof mat === "number" ? toon(mat) : mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; (p || scene).add(m); return m; }
const geos = new Map();
function rboxGeo(w, h, d, r = 0.05) {
  r = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002); const k = [w, h, d, r].join(); if (geos.has(k)) return geos.get(k);
  const e = r * 0.05, x = w / 2 - r - e, y = h / 2 - r - e, s = new THREE.Shape();
  s.absarc(x, y, e, 0, Math.PI / 2); s.absarc(-x, y, e, Math.PI / 2, Math.PI); s.absarc(-x, -y, e, Math.PI, Math.PI * 1.5); s.absarc(x, -y, e, Math.PI * 1.5, Math.PI * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 2 }); g.translate(0, 0, -(d - 2 * r) / 2);
  geos.set(k, g); return g;
}
const box = (w, h, d, c, x, y, z, p, r) => M(rboxGeo(w, h, d, r), c, x, y, z, p);
const SPH = new THREE.SphereGeometry(1, 16, 12);
const cyl = (rt, rb, h, c, x, y, z, p, seg = 10) => M(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z, p);
const GLOW_TEX = (() => { const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,214,140,.9)"); gr.addColorStop(0.5, "rgba(255,180,100,.3)"); gr.addColorStop(1, "rgba(255,170,90,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
function glow(x, y, z, size, p, op = 0.8) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(x, y, z); s.scale.set(size, size, 1); (p || scene).add(s); return s; }
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); const rr = (a, b) => a + (b - a) * rnd();
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ───────── 바닥 높이 (화면 전용, 충돌과 무관) ─────────
// 공원 전체가 큰 언덕으로 완만하게 오르내리고(길도 같이 오르내림), 길에서 먼 눈밭에는 작은 둔덕, 공원 밖 숲은 바깥으로 갈수록 솟은 산자락.
// 연못·광장·트럭·벤치 자리는 이어진 덩어리마다 평평한 단으로 고르고, 연못은 둑보다 낮게 판다
const TILE_H = { [G.snow]: 0.1, [G.snow2]: 0.1, [G.path]: 0, [G.plaza]: 0.02, [G.ice]: -0.32, [G.outside]: 0.18, [G.bridge]: 0.02, [G.stage]: 0.02 };
const SOFT = new Set([G.snow, G.snow2, G.outside]);
const clampX = (x) => Math.max(0, Math.min(MW - 1, x)), clampY = (y) => Math.max(0, Math.min(MH - 1, y));
const gAt = (x, y) => groundAt(clampX(x), clampY(y));
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function vnoise(x, z) { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz; }
// 단단한 바닥(길·광장·연못…)에서 떨어진 거리 (칸)
const softDist = new Float32Array(MW * MH);
for (let i = 0; i < MW * MH; i++) softDist[i] = SOFT.has(GROUND[i]) ? 99 : 0;
for (const [s, e, d] of [[0, MW * MH, 1], [MW * MH - 1, -1, -1]]) for (let i = s; i !== e; i += d) {
  const x = i % MW, y = (i / MW) | 0; let v = softDist[i];
  for (const [dx, dy, c] of [[-d, 0, 1], [0, -d, 1], [-d, -d, 1.414], [d, -d, 1.414]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < MW && yy < MH) v = Math.min(v, softDist[yy * MW + xx] + c); }
  softDist[i] = v;
}
const fieldAt = (f, x, z) => { const fx = Math.max(0, Math.min(MW - 1.001, x - 0.5)), fz = Math.max(0, Math.min(MH - 1.001, z - 0.5)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = f[j * MW + i], b = f[j * MW + i + 1], c = f[(j + 1) * MW + i], d = f[(j + 1) * MW + i + 1]; return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
// 공원 안(바깥 숲이 아닌 칸)과, 바깥 칸이 공원 가장자리에서 몇 칸 떨어졌는지 (9칸까지)
const inside = new Uint8Array(MW * MH); for (let i = 0; i < MW * MH; i++) inside[i] = GROUND[i] !== G.outside ? 1 : 0;
const edgeDist = new Uint8Array(MW * MH).fill(255); { const q = []; for (let i = 0; i < MW * MH; i++) if (inside[i]) { edgeDist[i] = 0; q.push(i); } for (let h = 0; h < q.length; h++) { const i = q[h], x = i % MW, y = (i / MW) | 0; if (edgeDist[i] >= 9) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue; const j = yy * MW + xx; if (edgeDist[j] === 255) { edgeDist[j] = edgeDist[i] + 1; q.push(j); } } } }
// 칸마다 바탕 높이: 큰 언덕 두 겹 + 바깥 산자락 (지도 맨 끝에서는 다시 낮춰 바깥 바닥과 잇는다)
const BASE = new Float32Array(MW * MH);
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
  const i = y * MW + x, border = Math.min(x, y, MW - 1 - x, MH - 1 - y);
  BASE[i] = ((vnoise(x * 0.055 + 3.7, y * 0.055 + 11.2) - 0.5) * 3 + (vnoise(x * 0.13 + 50, y * 0.13 + 20) - 0.5) * 0.7
    + smooth(0, 7, Math.min(9, edgeDist[i])) * (1.3 + vnoise(x * 0.08 + 7, y * 0.08) * 1.4)) * smooth(0, 5, border);
}
// 평평하게 고를 덩어리: 1 = 연못(얼음·목교), 2 = 광장·무대·트럭과 벤치 둘레. 이어진 덩어리마다 바탕 높이를 평균으로 맞춘다
{
  const cls = new Uint8Array(MW * MH);
  const pad = (l, t, r, b) => { for (let y = Math.max(0, t); y <= Math.min(MH - 1, b); y++) for (let x = Math.max(0, l); x <= Math.min(MW - 1, r); x++) cls[y * MW + x] = 2; };
  for (const o of layer("trucks").objects) pad(Math.floor(o.x / 32) - 2, Math.floor(o.y / 32) - 2, Math.ceil((o.x + o.width) / 32) + 1, Math.ceil((o.y + o.height) / 32) + 2);
  for (const o of [...layer("seats").objects, ...(layer("tables")?.objects || [])]) pad(Math.floor(o.x / 32) - 1, Math.floor(o.y / 32) - 1, Math.ceil((o.x + o.width) / 32), Math.ceil((o.y + o.height) / 32));
  for (let i = 0; i < MW * MH; i++) { const t = GROUND[i]; if (t === G.ice || t === G.bridge) cls[i] = 1; else if (t === G.plaza || t === G.stage) cls[i] = 2; }
  const seen = new Uint8Array(MW * MH);
  for (let i0 = 0; i0 < MW * MH; i0++) {
    if (!cls[i0] || seen[i0]) continue;
    const q = [i0]; seen[i0] = 1; let sum = 0;
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % MW, y = (i / MW) | 0; sum += BASE[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue; const j = yy * MW + xx; if (!seen[j] && cls[j] === cls[i0]) { seen[j] = 1; q.push(j); } } }
    const avg = sum / q.length; for (const i of q) BASE[i] = avg;
  }
}
const baseAt = (x, y) => BASE[clampY(y) * MW + clampX(x)];
// Derive each bridge's length and direction from its connected tiles, including diagonal spans.
// The arch and short bank ramps feed the shared walking height as well as the visible timber.
const isBridgeRoad = (tile) => tile === G.path || tile === G.plaza || tile === G.stage;
const bridgeIds = new Int32Array(MW * MH).fill(-1), bridgeSpans = [];
for (let start = 0; start < GROUND.length; start++) {
  if (GROUND[start] !== G.bridge || bridgeIds[start] !== -1) continue;
  const id = bridgeSpans.length, cells = [start]; bridgeIds[start] = id;
  for (let head = 0; head < cells.length; head++) {
    const i = cells[head], x = i % MW, z = Math.floor(i / MW);
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, nz = z + dz, next = nz * MW + nx;
      if (nx < 0 || nz < 0 || nx >= MW || nz >= MH || GROUND[next] !== G.bridge || bridgeIds[next] !== -1) continue;
      bridgeIds[next] = id; cells.push(next);
    }
  }
  let cx = 0, cz = 0;
  for (const i of cells) { cx += i % MW + 0.5; cz += Math.floor(i / MW) + 0.5; }
  cx /= cells.length; cz /= cells.length;
  let xx = 0, xz = 0, zz = 0;
  for (const i of cells) { const x = i % MW + 0.5 - cx, z = Math.floor(i / MW) + 0.5 - cz; xx += x*x; xz += x*z; zz += z*z; }
  const angle = Math.atan2(2 * xz, xx - zz) / 2, dx = Math.cos(angle), dz = Math.sin(angle);
  let min = Infinity, max = -Infinity;
  for (const i of cells) for (const [ox, oz] of [[0,0],[1,0],[0,1],[1,1]]) {
    const projection = (i % MW + ox) * dx + (Math.floor(i / MW) + oz) * dz;
    min = Math.min(min, projection); max = Math.max(max, projection);
  }
  bridgeSpans.push({ dx, dz, min, length: max - min, rise: Math.min(1.8, (max - min) * 0.18) });
}
function bridgeLiftAt(x, z) {
  let nearest = 1, span;
  const tx = Math.floor(x), tz = Math.floor(z);
  for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
    const nx = tx + ox, nz = tz + oz;
    if (nx < 0 || nz < 0 || nx >= MW || nz >= MH) continue;
    const id = bridgeIds[nz * MW + nx]; if (id === -1) continue;
    const distance = Math.hypot(Math.max(nx - x, 0, x - nx - 1), Math.max(nz - z, 0, z - nz - 1));
    if (distance < nearest) { nearest = distance; span = bridgeSpans[id]; }
  }
  if (!span || nearest >= 0.8) return 0;
  const t = Math.max(0, Math.min(1, (x * span.dx + z * span.dz - span.min) / span.length));
  return span.rise * Math.sin(Math.PI * t) ** 2 * (1 - smooth(0, 0.8, nearest));
}

const HR = 2, HW = MW * HR + 1, HH = MH * HR + 1, HEIGHT = new Float32Array(HW * HH);
const RAISED = { [G.stage]: 0.36, [G.bridge]: 0.16 }; // 덩어리 바탕 높이에서 이만큼 올린 단
for (let j = 0; j < HH; j++) for (let i = 0; i < HW; i++) {
  const x = i / HR, z = j / HR; let sum = 0, ws = 0;
  for (let ty = Math.floor(z - 1.8); ty <= Math.floor(z + 1.8); ty++) for (let tx = Math.floor(x - 1.8); tx <= Math.floor(x + 1.8); tx++) {
    const r = Math.hypot(tx + 0.5 - x, ty + 0.5 - z); if (r > 1.8) continue; const w = (1 - r / 1.8) ** 2; sum += (TILE_H[gAt(tx, ty)] + baseAt(tx, ty)) * w; ws += w;
  }
  let h = sum / ws;
  h += (vnoise(x * 0.07, z * 0.07) * 0.65 + vnoise(x * 0.19 + 31, z * 0.19 + 7) * 0.35 - 0.42) * 0.5 * smooth(1.2, 6, fieldAt(softDist, x, z));
  // 무대·목교는 가장자리만 살짝 깎은 단으로 (칸 경계의 꼭짓점은 반 높이)
  for (const t of [G.stage, G.bridge]) { let k = 0, b = 0; for (const [dx, dz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) if (gAt(Math.floor(x + dx), Math.floor(z + dz)) === t) { k++; b = baseAt(Math.floor(x + dx), Math.floor(z + dz)); } if (k) h = h + (b + RAISED[t] - h) * (k / 4); }
  HEIGHT[j * HW + i] = h + bridgeLiftAt(x, z);
}
function editHeightAt(x, z) {
  const xx = x - 0.5, zz = z - 0.5, ix = Math.floor(xx), iz = Math.floor(zz), u = xx - ix, v = zz - iz;
  const h = (dx, dz) => MAP.editor3d?.heights?.[(iz + dz) * MW + ix + dx] || 0;
  return h(0, 0) * (1-u) * (1-v) + h(1, 0) * u * (1-v) + h(0, 1) * (1-u) * v + h(1, 1) * u * v;
}
function heightAt(x, z) {
  const fx = Math.max(0, Math.min(HW - 1.001, x * HR)), fz = Math.max(0, Math.min(HH - 1.001, z * HR)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = HEIGHT[j * HW + i], b = HEIGHT[j * HW + i + 1], c = HEIGHT[(j + 1) * HW + i], d = HEIGHT[(j + 1) * HW + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v + editHeightAt(x, z);
}

// Collision/character height stays on the deck; the rendered riverbed is below the water.
const isWaterTile = (tile) => tile === G.ice || tile === G.bridge;
function waterHeightAt(x, z) {
  return fieldAt(BASE, x, z) - 0.32 + editHeightAt(x, z);
}
function terrainHeightAt(x, z) {
  const touching = [-0.01, 0.01].flatMap((dx) => [-0.01, 0.01].map((dz) => gAt(Math.floor(x + dx), Math.floor(z + dz))));
  // The abutment meets the full width of the road; excavating it into the riverbed
  // would leave a visible gap and a drop at the bridge entrance.
  if (touching.includes(G.bridge) && touching.some(isBridgeRoad)) return heightAt(x, z);
  return touching.some(isWaterTile) ? Math.min(heightAt(x, z), waterHeightAt(x, z) - 0.22) : heightAt(x, z);
}

// ───────── 바닥 텍스처 (1칸 = 8px): 눈·길·얼음 경계는 칸 모양 대신 둥글게 섞고, 광장·목교·무대만 반듯하게 ─────────
{
  const S = 8, CW = MW * S, CH = MH * S, c = document.createElement("canvas"); c.width = CW; c.height = CH; const g = c.getContext("2d");
  const img = g.createImageData(CW, CH), px = img.data;
  const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const C = { snow: hex("#eef2fb"), snowB: hex("#e4eaf7"), snowW: hex("#fbfcff"), out: hex("#e6ebf6"), path: hex("#ddd3cc"), pathD: hex("#cfc4bc"), pathL: hex("#e9e1db"), ice: hex("#bcdcf0"), iceL: hex("#e2f2fb"), iceRim: hex("#d6eaf6"),
    pz: [hex("#e9dfd6"), hex("#dfd3c8"), hex("#e4d6c6")], pzLine: hex("#cbbdb1"), plank: hex("#b69b72"), plankD: hex("#94795a"), stage: hex("#c9c2b6"), stageD: hex("#b4ab9d") };
  const NAT = (t) => t === G.ice ? 2 : t === G.path || t === G.plaza || t === G.bridge || t === G.stage ? 1 : 0; // 0 눈 1 다져진 길 2 얼음
  const sc = [0, 0, 0];
  // 비탈 음영을 무늬에 살짝 굽는다: 위에서 내려다봐도 언덕이 읽히게 (해가 오는 서·남쪽 비탈은 밝게, 반대쪽은 어둡게)
  const SHADE = new Float32Array(HW * HH);
  for (let j = 0; j < HH; j++) for (let i = 0; i < HW; i++) {
    const hx = HEIGHT[j * HW + Math.min(i + 1, HW - 1)] - HEIGHT[j * HW + Math.max(i - 1, 0)], hz = HEIGHT[Math.min(j + 1, HH - 1) * HW + i] - HEIGHT[Math.max(j - 1, 0) * HW + i];
    SHADE[j * HW + i] = Math.max(0.8, Math.min(1.08, 1 + (hx - hz) * 0.3));
  }
  const shadeAt = (pxl, py) => { const u = Math.min(HW - 1.001, (pxl + 0.5) / S * HR), v = Math.min(HH - 1.001, (py + 0.5) / S * HR), i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * HW + i;
    return SHADE[k] + (SHADE[k + 1] - SHADE[k]) * fu + (SHADE[k + HW] - SHADE[k]) * fv + (SHADE[k] - SHADE[k + 1] - SHADE[k + HW] + SHADE[k + HW + 1]) * fu * fv; };
  for (let py = 0; py < CH; py++) for (let pxl = 0; pxl < CW; pxl++) {
    const tx = (pxl / S) | 0, ty = (py / S) | 0, lx = pxl % S, ly = py % S, own = gAt(tx, ty), hp = hash(pxl, py);
    let col;
    if (own === G.plaza) { const k = (lx >> 2) + (ly >> 2) * 2, hk = hash(tx * 2 + (lx >> 2), ty * 2 + (ly >> 2)); col = (lx & 3) === 3 || (ly & 3) === 3 ? C.pzLine : hk > 0.9 && (ly & 3) < 2 ? C.snowW : C.pz[(hk * 3) | 0]; }
    else if (own === G.bridge) col = ly === 3 || ly === 7 ? C.plankD : C.plank;
    else if (own === G.stage) col = lx === 3 ? C.stageD : C.stage;
    else {
      // 주변 네 칸 중심에서 이중선형으로 섞고 노이즈로 흔들어 가장 센 종류를 고른다
      const u = pxl / S + 0.5 / S - 0.5, v = py / S + 0.5 / S - 0.5, i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
      sc[0] = sc[1] = sc[2] = 0;
      sc[NAT(gAt(i0, j0))] += (1 - fu) * (1 - fv); sc[NAT(gAt(i0 + 1, j0))] += fu * (1 - fv); sc[NAT(gAt(i0, j0 + 1))] += (1 - fu) * fv; sc[NAT(gAt(i0 + 1, j0 + 1))] += fu * fv;
      const wob = (vnoise(pxl * 0.09, py * 0.09) - 0.5) * 0.34 + (hp - 0.5) * 0.08;
      sc[1] += wob; sc[2] -= wob * 0.6;
      const k = sc[2] > sc[0] && sc[2] > sc[1] ? 2 : sc[1] > sc[0] ? 1 : 0, margin = k === 2 ? sc[2] - Math.max(sc[0], sc[1]) : 1;
      if (k === 2) col = margin < 0.07 ? C.iceRim : vnoise(pxl * 0.05 + py * 0.02, py * 0.4) > 0.78 ? C.iceL : C.ice;
      else if (k === 1) col = hp < 0.06 ? C.pathD : hp > 0.95 ? C.pathL : C.path;
      else { const base = own === G.outside ? C.out : C.snow, n = vnoise(pxl * 0.03 + 9, py * 0.03); col = hp < 0.004 ? C.snowW : n < 0.3 ? C.snowB : base; }
    }
    const o = (py * CW + pxl) * 4, sh = shadeAt(pxl, py); px[o] = Math.min(255, col[0] * sh); px[o + 1] = Math.min(255, col[1] * sh); px[o + 2] = Math.min(255, col[2] * sh); px[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(window.ParkGround.compose(c, MAP, shadeAt)); tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const geo = new THREE.PlaneGeometry(MW, MH, MW * HR, MH * HR).rotateX(-Math.PI / 2), gp = geo.attributes.position;
  for (let k = 0; k < gp.count; k++) gp.setY(k, terrainHeightAt(gp.getX(k) + MW / 2, gp.getZ(k) + MH / 2));
  geo.computeVertexNormals();
  // 바닥은 계단 음영 대신 부드러운 음영 (눈 언덕이 매끈하게 보이도록)
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  ground.name = "park-terrain";
  ground.position.set(MW / 2, 0, MH / 2); ground.receiveShadow = true; scene.add(ground);
  // 지도 바깥 바닥: 지도를 둘러싼 네 장 (지도 안의 낮은 땅을 뚫고 올라오지 않게 가운데는 비운다)
  for (const [w, d, x, z] of [[MW + 60, 30, MW / 2, -15], [MW + 60, 30, MW / 2, MH + 15], [30, MH, -15, MH / 2], [30, MH, MW + 15, MH / 2]]) {
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), toon(0xcfd6ea)); rim.position.set(x, 0.05, z); scene.add(rim);
  }
}

// Water continues beneath bridge tiles; its shader moves without rebuilding geometry.
const waterPositions = [], waterIndices = [], wetPixels = new Uint8Array(MW * MH * 4);
for (let i = 0; i < MW * MH; i++) { const wet = isWaterTile(GROUND[i]) ? 255 : 0; wetPixels.set([wet, wet, wet, 255], i * 4); }
const waterMask = new THREE.DataTexture(wetPixels, MW, MH, THREE.RGBAFormat);
waterMask.minFilter = waterMask.magFilter = THREE.LinearFilter; waterMask.needsUpdate = true;
for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) {
  if (![-1, 0, 1].some((dx) => [-1, 0, 1].some((dz) => isWaterTile(gAt(x + dx, z + dz))))) continue;
  const start = waterPositions.length / 3;
  for (const [dx, dz] of [[0, 0], [0, 1], [1, 0], [1, 1]]) waterPositions.push(x + dx, waterHeightAt(x + dx, z + dz), z + dz);
  waterIndices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
}
const waterGeometry = new THREE.BufferGeometry();
waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3)); waterGeometry.setIndex(waterIndices);
waterGeometry.computeVertexNormals();
const waterMaterial = new THREE.ShaderMaterial({
  uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 }, uMask: { value: waterMask }, uMapSize: { value: new THREE.Vector2(MW, MH) } }, fog: true,
  vertexShader: `
    uniform float uTime; varying vec2 vWater;
    #include <fog_pars_vertex>
    void main() {
      vWater = position.xz;
      vec3 p = position;
      p.y += 0.012 * sin(p.x * 2.1 + p.z * 1.4 - uTime * 1.3);
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `
    uniform float uTime; uniform sampler2D uMask; uniform vec2 uMapSize; varying vec2 vWater;
    #include <fog_pars_fragment>
    void main() {
      vec2 p = vWater;
      float wet = texture2D(uMask, p / uMapSize).r;
      float shore = 0.48 + sin(p.x * 7.0 + sin(p.y * 5.0)) * 0.045;
      if (wet < shore) discard;
      float a = p.x * 2.1 + p.y * 1.4 - uTime * 1.3;
      float b = p.x * -3.8 + p.y * 2.6 - uTime * 0.83;
      float swell = sin(a) * 0.5 + sin(b) * 0.24;
      vec3 color = mix(vec3(0.22, 0.48, 0.60), vec3(0.47, 0.73, 0.80), 0.5 + swell * 0.4);
      float ripple = sin(p.y * 15.0 + p.x * 2.2 + sin(a) * 1.5 - uTime * 2.0);
      float broken = smoothstep(0.10, 0.85, sin(p.x * 4.2 + sin(b) + uTime * 0.4));
      float crest = smoothstep(0.88, 0.99, ripple) * broken;
      color = mix(color, vec3(0.79, 0.93, 0.96), crest * 0.38);
      float glint = pow(max(0.0, sin(a * 2.3 + sin(b)) * sin(b * 1.7 - uTime * 0.3)), 20.0);
      color += vec3(0.26, 0.28, 0.25) * glint;
      float rim = 1.0 - smoothstep(shore, shore + 0.16, wet);
      color = mix(color, vec3(0.72, 0.86, 0.89), rim * 0.65);
      gl_FragColor = vec4(color, 1.0);
      #include <fog_fragment>
    }`,
});
const water = new THREE.Mesh(waterGeometry, waterMaterial); water.name = 'flowing-water'; scene.add(water);

// Separate timber slabs have visible thickness, gaps and an open water channel below.
const deckPositions = [], deckColors = [];
const faces = [[0, 2, 1, 1, 2, 3], [4, 5, 6, 5, 7, 6], [0, 1, 4, 1, 5, 4], [2, 6, 3, 3, 6, 7], [0, 4, 2, 2, 4, 6], [1, 3, 5, 3, 7, 5]];
for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) {
  if (gAt(x, z) !== G.bridge) continue;
  for (let plank = 0; plank < 4; plank++) {
    const x0 = x + 0.008, x1 = x + 0.992, z0 = z + plank / 4 + 0.008, z1 = z + (plank + 1) / 4 - 0.008;
    const corners = [[x0,z0], [x1,z0], [x0,z1], [x1,z1]];
    const vertices = [0, 1].flatMap((bottom) => corners.map(([px,pz]) => [px, heightAt(px,pz) - bottom * 0.12, pz]));
    const color = new THREE.Color().setHSL(0.095, 0.29, 0.44 + hash(x * 4 + plank, z) * 0.10);
    for (const face of faces) for (const i of face) { deckPositions.push(...vertices[i]); deckColors.push(color.r, color.g, color.b); }
  }
}
const deckGeometry = new THREE.BufferGeometry();
deckGeometry.setAttribute('position', new THREE.Float32BufferAttribute(deckPositions, 3));
deckGeometry.setAttribute('color', new THREE.Float32BufferAttribute(deckColors, 3)); deckGeometry.computeVertexNormals();
const deck = new THREE.Mesh(deckGeometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
deck.name = 'bridge-deck'; deck.castShadow = deck.receiveShadow = true; scene.add(deck);

// ───────── 장애물: 나무·바위·생울타리·울타리 (인스턴싱) ─────────
function instanced(geo, color, items, fn, mat) {
  const im = new THREE.InstancedMesh(geo, mat || toon(color), items.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => { q.setFromAxisAngle(up, it.rot || 0); fn(it, p, s, q); im.setMatrixAt(i, m4.compose(p, q, s)); });
  im.castShadow = im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im;
}
const SNOWM = new THREE.MeshLambertMaterial({ color: 0xf6f8fd });
const BARE = window.ParkTrees.styles.filter((s) => s.id.startsWith("bare"));
const trees = [], rocks = [], hedges = [], fences = [], pines = [], spruces = [], bare = BARE.map(() => []);
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
  const o = OBST[y * MW + x], h = hash(x, y), h2 = hash(y * 3 + 7, x * 5 + 1), h3 = hash(x + 101, y + 57);
  let t = null, park = false;
  if (o === G.tree) { t = { x: x + 0.5 + (h - 0.5) * 0.4, z: y + 0.5 + (h2 - 0.5) * 0.4 }; park = true; }
  else if (o === G.wall && !inside[y * MW + x] && edgeDist[y * MW + x] <= 8 && h < 0.22) t = { x: x + 0.5 + (h2 - 0.5) * 0.7, z: y + 0.5 + (h - 0.5) * 0.7 };
  if (t) {
    const chosen = park && MAP.editor3d?.trees?.[y * MW + x];
    t.rot = chosen ? 0 : h3 * 6.28; t.v = chosen ? 0.5 : h2; trees.push(t);
    if (!park) {
      // A more open perimeter with larger silhouettes and a mix of all winter species.
      // Coordinate hashes keep the grove stable across reloads and editor rebuilds.
      const pick = hash(x + 307, y + 911);
      t.s = 1.3 + hash(x + 503, y + 701) * 0.6; t.sy = 1;
      if (pick < 0.22) pines.push(t);
      else if (pick < 0.42) spruces.push(t);
      else bare[Math.min(BARE.length - 1, Math.floor(hash(x + 887, y + 199) * BARE.length))].push(t);
      continue;
    }
    if (chosen) {
      t.x = x + 0.5; t.z = y + 0.5; t.s = MAP.editor3d?.treeScales?.[y * MW + x] ?? 1; t.sy = 1;
      if (chosen === "pine") pines.push(t);
      else if (chosen === "spruce") spruces.push(t);
      else bare[Math.min(BARE.length - 1, Number(chosen.slice(4)) || 0)].push(t);
      continue;
    }
    const pick = h3; // Interior automatic trees retain the original species balance.
    if (pick < 0.28) { t.s = 0.8 + h * 0.5; t.sy = (0.85 + h2 * 0.4) * 1.06; pines.push(t); }
    else if (pick < 0.4) { t.s = 0.75 + h * 0.35; t.sy = (1.1 + h2 * 0.5) * 1.06; spruces.push(t); }
    else { const k = Math.floor(hash(x * 7, y * 13) * BARE.length); t.s = 0.85 + h * 0.35; t.sy = (0.9 + h2 * 0.2) * 1.06; bare[k].push(t); }
    if (park) t.s *= MAP.editor3d?.treeScales?.[y * MW + x] ?? 1;
    continue;
  }
  if (o === G.rock) rocks.push({ x: x + 0.5, z: y + 0.5, s: 0.7 + h * 0.4, rot: h * 6 });
  else if (o === G.garden) hedges.push({ x: x + 0.5 + (h2 - 0.5) * 0.3, z: y + 0.5 + (h3 - 0.5) * 0.3, s: 0.75 + h * 0.45, sy: 0.7 + h3 * 0.6, rot: h2 * 6.28, v: h3 });
  else if (o === G.fence) fences.push({ x: x + 0.5, z: y + 0.5, rot: 0 });
}
// Merge the branches of each species once, then instance the complete tree.
const treeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const treeLists = new Map([["pine", pines], ["spruce", spruces], ...BARE.map((s, i) => [s.id, bare[i]])]);
for (const [id, list] of treeLists) {
  if (!list.length) continue;
  const parts = window.ParkTrees.geometry(THREE, id, 7919 + window.ParkTrees.styles.findIndex((s) => s.id === id) * 101);
  for (const part of parts) {
    const mesh = instanced(part.geometry, 0, list, (t, p, s) => { p.set(t.x, heightAt(t.x, t.z), t.z); s.set(t.s, t.s * t.sy, t.s); }, treeMaterial);
    mesh.userData.treeStyle = id; mesh.userData.treePart = part.part;
  }
}
const SBALL = new THREE.IcosahedronGeometry(1, 2), CAP = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
// 나무 밑동에 쌓인 눈
const MOUND = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
instanced(MOUND, 0, trees, (t, p, s) => { p.set(t.x, heightAt(t.x, t.z) - 0.02, t.z); s.set(0.42 * t.s, 0.1, 0.36 * t.s); }, SNOWM);
// 바위: 둥근 조약돌 + 눈 모자
instanced(SBALL, 0xa9a6b8, rocks, (t, p, s) => { p.set(t.x, 0.16 * t.s + heightAt(t.x, t.z), t.z); s.set(0.4 * t.s, 0.3 * t.s, 0.36 * t.s); });
instanced(CAP, 0, rocks, (t, p, s) => { p.set(t.x, 0.24 * t.s + heightAt(t.x, t.z), t.z); s.set(0.34 * t.s, 0.17 * t.s, 0.3 * t.s); }, SNOWM);
// 생울타리 덤불: 크기·높이·색을 섞어 줄 맞춘 공처럼 보이지 않게
const BUSH = SBALL;
[0x5a9e7e, 0x4d9073, 0x6aa77f].forEach((c, k) => { const l = hedges.filter((t) => Math.floor(t.v * 3) === k); if (!l.length) return;
  instanced(BUSH, c, l, (t, p, s) => { p.set(t.x, 0.26 * t.sy + heightAt(t.x, t.z), t.z); s.set(0.58 * t.s, 0.36 * t.sy, 0.5 * t.s); }); });
instanced(MOUND, 0, hedges, (t, p, s) => { p.set(t.x, 0.42 * t.sy + heightAt(t.x, t.z), t.z); s.set(0.4 * t.s, 0.16, 0.34 * t.s); }, SNOWM);
instanced(new THREE.CylinderGeometry(0.1, 0.11, 0.5, 10), 0xb89070, fences, (t, p, s) => { p.set(t.x, 0.25 + heightAt(t.x, t.z), t.z); s.setScalar(1); });
instanced(SBALL, 0xffffff, fences, (t, p, s) => { p.set(t.x, 0.53 + heightAt(t.x, t.z), t.z); s.set(0.12, 0.08, 0.12); });

// 바람에 쌓인 낮은 눈둔덕 (길에서 떨어진 넓은 눈밭에만 드문드문)·마른 풀 덤불·목교 난간
const drifts = [], grass = [], rails = [], railBeams = [], railPosts = new Set(), tilt = new THREE.Quaternion(), ax = new THREE.Vector3();
for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
  const t = groundAt(x, y), h = hash(x * 3 + 1, y * 7 + 2), h2 = hash(y + 11, x + 5), d = softDist[y * MW + x];
  if (!OBST[y * MW + x] && SOFT.has(t) && t !== G.outside) {
    if (d >= 2.5 && h < 0.03) drifts.push({ x: x + h2, z: y + 0.5, s: 0.9 + h2 * 1.1, rot: h2 * 6.28 });
    if (d >= 1.5 && h2 < 0.025) for (let k = 0; k < 5; k++) grass.push({ x: x + 0.5 + (hash(x, y + k) - 0.5) * 0.25, z: y + 0.5 + (hash(y, x + k) - 0.5) * 0.25, s: 0.7 + hash(x + k, y) * 0.6, rot: k * 1.26 + h, lean: 0.25 + hash(k, x) * 0.35 });
  }
  if (t === G.bridge) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const neighbor = gAt(x + dx, y + dy);
    const span = bridgeSpans[bridgeIds[y * MW + x]], sideEdge = Math.abs(dx * span.dx + dy * span.dz) < 0.6;
    if (isBridgeRoad(neighbor) || neighbor === G.bridge || (neighbor !== G.ice && !sideEdge && bridgeLiftAt(x + 0.5, y + 0.5) < 0.4)) continue;
    const endpoints = dx ? [[x + (dx > 0 ? 1 : 0), y], [x + (dx > 0 ? 1 : 0), y + 1]] : [[x, y + (dy > 0 ? 1 : 0)], [x + 1, y + (dy > 0 ? 1 : 0)]];
    for (const [px, pz] of endpoints) {
      const key = px + "," + pz;
      if (!railPosts.has(key)) { railPosts.add(key); rails.push({ x: px, z: pz, rot: 0 }); }
    }
    railBeams.push({ x: (endpoints[0][0] + endpoints[1][0]) / 2, z: (endpoints[0][1] + endpoints[1][1]) / 2, along: dx ? "z" : "x" });
  }
}
instanced(MOUND, 0, drifts, (t, p, s) => { p.set(t.x, heightAt(t.x, t.z) - 0.03, t.z); s.set(t.s, 0.12 + t.s * 0.04, t.s * 0.55); }, SNOWM);
instanced(new THREE.ConeGeometry(0.055, 0.3, 5).translate(0, 0.15, 0), 0xb59a72, grass, (t, p, s, q) => { p.set(t.x, heightAt(t.x, t.z) - 0.03, t.z); s.setScalar(t.s); q.multiply(tilt.setFromAxisAngle(ax.set(1, 0, 0), t.lean)); });
instanced(new THREE.CylinderGeometry(0.065, 0.085, 1, 8), 0x72553d, rails, (t, p, s) => {
  const top = heightAt(t.x, t.z) - 0.04, bottom = waterHeightAt(t.x, t.z) - 0.23;
  p.set(t.x, (top + bottom) / 2, t.z); s.set(1, Math.max(0.1, top - bottom), 1);
});
instanced(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 8), 0x8f7556, rails, (t, p, s) => { p.set(t.x, heightAt(t.x, t.z) + 0.4, t.z); s.setScalar(1); });
instanced(SBALL, 0xffffff, rails, (t, p, s) => { p.set(t.x, heightAt(t.x, t.z) + 0.82, t.z); s.set(0.09, 0.06, 0.09); });
for (const r of railBeams) {
  const dx = r.along === "x" ? 0.5 : 0, dz = r.along === "z" ? 0.5 : 0;
  const start = new THREE.Vector3(r.x - dx, heightAt(r.x - dx, r.z - dz), r.z - dz);
  const end = new THREE.Vector3(r.x + dx, heightAt(r.x + dx, r.z + dz), r.z + dz);
  const direction = end.clone().sub(start), center = start.clone().add(end).multiplyScalar(0.5);
  // Upper/lower rails and underside beams all follow the arch instead of staying horizontal.
  for (const [offset, thickness, color] of [[0.77, 0.09, 0x8f7556], [0.35, 0.065, 0x8f7556], [-0.22, 0.18, 0x72553d], [0.83, 0.025, 0xfafcff]]) {
    const beam = box(direction.length(), thickness, 0.10, color, center.x, center.y + offset, center.z, null, Math.min(0.025, thickness * 0.3));
    beam.name = offset === 0.77 ? "bridge-rail" : "bridge-structure";
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.clone().normalize());
  }
}

// ───────── 벤치 (seats 레이어: slots 칸 수) ─────────
// Bench geometry, seated characters and server-facing data share all four orientations.
const SEATS = [];
for (const o of layer("seats").objects) {
  const f0 = prop(o, "facing") || "down", side = f0 === "left" || f0 === "right", x = o.x / 32, z = o.y / 32, w = o.width / 32, h = o.height / 32, n = prop(o, "slots") || 2;
  const long = side ? h : w;
  const b = new THREE.Group(); b.position.set(x + w / 2, heightAt(x + w / 2, z + h / 2), z + h / 2); b.rotation.y = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 }[f0]; scene.add(b);
  box(long - 0.12, 0.16, 0.48, 0xc8946a, 0, 0.34, 0, b, 0.07); box(long - 0.12, 0.34, 0.13, 0xc8946a, 0, 0.62, -0.2, b, 0.06);
  for (const s of [-1, 1]) for (const z of [-0.13, 0.13]) cyl(0.07, 0.08, 0.28, 0x55607a, s * (long / 2 - 0.28), 0.14, z, b, 10);
  // 둥근 금속 팔걸이와 나뭇결 이음선을 더해 작은 공원 가구처럼 보이게
  for (const s of [-1, 1]) {
    box(0.12, 0.12, 0.5, 0xb9825c, s * (long / 2 - 0.04), 0.52, 0, b, 0.055);
    box(0.1, 0.42, 0.1, 0x55607a, s * (long / 2 - 0.04), 0.34, 0, b, 0.045);
  }
  box(long - 0.3, 0.035, 0.018, 0xa86f4f, 0, 0.36, 0.04, b, 0.008); box(long - 0.3, 0.07, 0.36, 0xfafcff, 0, 0.44, 0.02, b, 0.035); box(long - 0.3, 0.06, 0.12, 0xfafcff, 0, 0.81, -0.2, b, 0.03);
  // 등받이 꼭대기의 작고 불규칙한 눈 뭉치
  for (const s of [-1, 0, 1]) { const cap = M(SPH, SNOWM, s * (long / 2 - 0.2), 0.82, -0.2, b); cap.scale.set(0.12, 0.045, 0.075); cap.castShadow = false; }
  const front = { down: [0,1], up: [0,-1], left: [-1,0], right: [1,0] }[f0];
  const slots = Array.from({ length: n }, (_, i) => ({ x: (side ? x + w / 2 : x + (i + 0.5) * w / n) + front[0] * 0.08, z: (side ? z + (i + 0.5) * h / n : z + h / 2) + front[1] * 0.08 }));
  const seat = { id: o.name, side, facing: f0, yaw: b.rotation.y, box: { l: x, t: z, r: x + w, b: z + h }, slots, group: b, obj: o };
  b.userData.seat = seat; SEATS.push(seat);
}

// Picnic tables occupy their own blocked footprint; the benches remain real, usable seats.
for (const o of layer("tables")?.objects || []) {
  const x = o.x / 32, z = o.y / 32, w = o.width / 32, h = o.height / 32, side = h > w, long = Math.max(w, h);
  const table = new THREE.Group(); table.name = "picnic-table";
  table.position.set(x + w / 2, heightAt(x + w / 2, z + h / 2), z + h / 2); table.rotation.y = side ? Math.PI / 2 : 0; scene.add(table);
  for (let i = 0; i < 4; i++) box(long - 0.08, 0.10, 0.205, i % 2 ? 0xb68b61 : 0xc59a6d, 0, 0.72, (i - 1.5) * 0.22, table, 0.025);
  for (const sx of [-1,1]) {
    box(0.12, 0.64, 0.62, 0x76563f, sx * (long / 2 - 0.36), 0.35, 0, table, 0.025);
    box(0.32, 0.10, 0.83, 0x76563f, sx * (long / 2 - 0.36), 0.08, 0, table, 0.025);
  }
  box(long - 0.52, 0.12, 0.12, 0x8c694a, 0, 0.30, 0, table, 0.025);
  box(long - 0.35, 0.025, 0.08, 0xfafcff, 0, 0.785, -0.35, table, 0.01);
}

let lampRoot = null;
function buildLamps() {
  if (lampRoot) { scene.remove(lampRoot); window.ParkLamps.dispose(lampRoot); }
  lampRoot = new THREE.Group(); scene.add(lampRoot);
  for (const o of MAP.editor3d?.lamps || []) {
    const x = o.x / 32 + 0.5, z = o.y / 32 + 0.5, y = heightAt(x, z);
    const lamp = window.ParkLamps.create(THREE, o.style);
    lamp.position.set(x, y, z); lampRoot.add(lamp);
  }
}
buildLamps();

// ───────── 간식 트럭 8대 (trucks 레이어 + shared/data/trucks.json) ─────────
const TRUCK_COLOR = { bunsik: 0xf2786a, eomuk: 0x82b6e3, bungeoppang: 0x8fd8c4, hotteok: 0xf0b25a, goguma: 0xb592d6, gyeranppang: 0xf3d06a, drink: 0x89cfe6, kkochi: 0xe89a6a };
const trucks = [];
for (const o of layer("trucks").objects) {
  const def = TRUCK_DEF.get(o.name); if (!def) continue;
  const x0 = o.x / 32, z0 = o.y / 32, w = o.width / 32, d = o.height / 32, C = TRUCK_COLOR[o.name] || 0x8fd8c4;
  const t = new THREE.Group(); t.position.set(x0 + w / 2, heightAt(x0 + w / 2, z0 + d + 0.5), z0 + d / 2); scene.add(t); t.userData.truck = o.name;
  box(2.85, 0.26, 1.7, 0xf2f2f6, 0, 0.44, 0, t, 0.12);
  box(2.85, 1.2, 0.6, C, 0, 1.1, -0.55, t, 0.2);
  box(2.85, 0.52, 0.85, C, 0, 0.78, 0.3, t, 0.2);
  box(2.95, 0.1, 0.9, 0xfff4e6, 0, 1.06, 0.33, t, 0.05);
  for (const s of [-1, 1]) box(0.2, 0.7, 0.8, C, s * 1.33, 1.42, 0.3, t, 0.09);
  box(3.05, 0.24, 1.95, 0xfff4e6, 0, 1.84, 0, t, 0.12); box(3.0, 0.2, 1.9, 0xffffff, 0, 2.0, 0, t, 0.1);
  for (const s of [-1, 1]) { const hl = M(SPH, glowM(0xfff1b8), s * 1.44, 0.72, 0.62, t); hl.scale.set(0.05, 0.1, 0.1); hl.castShadow = false; }
  M(new THREE.PlaneGeometry(2.5, 0.62), glowM(0xffe0a8), 0, 1.42, -0.26, t);
  for (let i = 0; i < 6; i++) { const s = box(0.47, 0.04, 0.5, i % 2 ? 0xfff4e6 : C, -1.18 + i * 0.47, 1.7, 0.95, t, 0.02); s.rotation.x = 0.4; }
  for (let i = 0; i < 6; i++) { const b = M(SPH, glowM([0xffd27a, 0xff9e7a, 0xfff1b8][i % 3]), -1.2 + i * 0.48, 1.56, 1.2, t); b.scale.setScalar(0.05); b.castShadow = false; }
  for (const [x, z] of [[-0.95, 0.84], [0.95, 0.84], [-0.95, -0.84], [0.95, -0.84]]) { const wh = cyl(0.3, 0.3, 0.2, 0x4a4560, x, 0.3, z, t, 16); wh.rotation.x = Math.PI / 2; const hub = cyl(0.13, 0.13, 0.22, 0xe8e4f0, x, 0.3, z, t, 12); hub.rotation.x = Math.PI / 2; }
  for (let i = 0; i < 3; i++) box(0.26, 0.09, 0.16, 0xe0a050, -0.7 + i * 0.32, 1.13, 0.48, t, 0.03);
  glow(0, 1.5, 1.1, 2.4, t, 0.5);
  const name = def.name.ko, c = document.createElement("canvas"); c.width = 320; c.height = 80; const g = c.getContext("2d"); g.scale(2, 2);
  const sign = new THREE.CanvasTexture(c);
  const draw = () => { g.fillStyle = "#fff4e6"; g.fillRect(0, 0, 160, 40); g.fillStyle = "#" + C.toString(16).padStart(6, "0"); g.fillRect(0, 0, 160, 5); g.fillRect(0, 35, 160, 5); g.fillStyle = "#4a3550"; g.font = '22px Jua, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, 80, 22); sign.needsUpdate = true; };
  draw(); document.fonts && document.fonts.ready.then(draw);
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: sign })); sm.position.set(0, 2.38, 0.2); t.add(sm);
  // 가로등
  const lx = x0 - 0.5, lz = z0 + d + 0.4;
  const ly = heightAt(lx, lz);
  cyl(0.08, 0.12, 1.8, 0x55607a, lx, ly + 0.9, lz, null, 10); cyl(0.17, 0.2, 0.14, 0x55607a, lx, ly + 0.07, lz, null, 12);
  const lb = M(SPH, glowM(0xffdc96), lx, ly + 2.02, lz); lb.scale.setScalar(0.22); lb.castShadow = false; cyl(0.15, 0.2, 0.1, 0x55607a, lx, ly + 2.24, lz, null, 12); M(SPH, 0xffffff, lx, ly + 2.3, lz).scale.set(0.15, 0.07, 0.15); glow(lx, ly + 2.0, lz, 1.5);
  trucks.push({ id: o.name, def, name, group: t, front: new THREE.Vector3(x0 + w / 2, 0, z0 + d + 0.55), steam: new THREE.Vector3(x0 + w / 2 - 0.4, 1.2 + t.position.y, z0 + d / 2 + 0.5), color: C, obj: o });
}


    return { root, heightAt, inside, SEATS, trucks, update(time) { waterMaterial.uniforms.uTime.value = time; }, dispose() {
      const geometries = new Set(), materials = new Set(), textures = new Set();
      root.traverse((o) => { if (o.geometry) geometries.add(o.geometry); if (o.isInstancedMesh) o.dispose(); if (o.material) materials.add(o.material); });
      geos.forEach((g) => geometries.add(g)); mats.forEach((m) => materials.add(m));
      materials.forEach((m) => { if (m.map) textures.add(m.map); if (m.gradientMap) textures.add(m.gradientMap); m.dispose(); });
      textures.add(waterMask);
      geometries.forEach((g) => g.dispose()); textures.forEach((t) => t.dispose());
      if (root.parent) root.parent.remove(root);
    } };
  }
  const trees = window.ParkTrees.styles;
  window.ParkWorld = { create, trees };
})();
