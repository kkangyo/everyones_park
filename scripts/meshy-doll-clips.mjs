// Meshy 웹에서 동작을 한 파일로 묶어 받은 인형(뼈 이름 mixamorig:*)을 게임용 GLB 로 (docs/meshy-character.md).
// 뼈 이름의 mixamorig: 를 떼고(게임 코드가 Head · LeftArm 같은 이름으로 찾는다), 동작 이름을 게임 이름으로 바꾸고,
// 머리카락을 머리 뼈에만 붙인 뒤 텍스처 512 JPEG(tex1024 면 1024)(색만. 노멀·금속 맵은 지운다) · 양자화 · meshopt(high: 노멀·무게도 필터로 줄임) 로 줄인다.
// 이름표에 없는 동작은 버린다. Meshy 웹에서 4K 텍스처 셋(색·노멀·금속)으로 받으면 30MB 가 넘지만 결과는 400KB 안팎이다.
// node scripts/meshy-doll-clips.mjs <in.glb> <out.glb> <원래이름=게임이름[@last],...> [머리색: brown | darkbrown(기본) | black] [머리카락 최저 높이(기본 0.55)] [가방색: none(기본) | yellow]
//   가방색: 등에 멘 가방·가방끈을 등 뼈(Spine2)에만 붙인다 (자동 리깅이 끈을 팔 뼈에도 붙여서, 팔을 들면 끈이 팔을 따라 늘어난다)
// 마지막에 split 을 붙이면 팔 옷과 몸통 옷을 겨드랑이 아래에서 잘라 따로 움직이게 한다 (아래 splitArms)
// 마지막에 longhair 를 붙이면 등·팔 옆으로 길게 늘어진 머리카락을 몸통 뼈에 붙인다 (아래 bindLongHair)
// 그 밖의 옵션 standlegs · skin · smooth · tex1024 는 각 블록 주석 참고
//   @last: 마지막 장면 하나만 남긴다 (예: 뒤돌아보고 앉는 동작 → 앉아 있는 자세)
//   예: node scripts/meshy-doll-clips.mjs meshy_child_motion.glb assets/models/meshy-child.glb "Idle_11=idle,Walking=walk,Hop_with_Arms_Raised=jump,Look_Back_and_Sit=sit@last,Wave_One_Hand=wave"
// 필요한 패키지는 meshy-doll.mjs 와 같고 three도 필요하다 (저장소 의존성에 없어 따로 설치).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, quantize, meshopt, textureCompress, resample } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import fs from "node:fs";
import { applyStandingPose } from "./lib/standing-pose.mjs";

const [IN, OUT, MAP, HAIR = "darkbrown", HAIR_Y = "0.55", BAG = "none", ...FLAGS] = process.argv.slice(2);
const BAG_COLOR = { none: () => false, yellow: (r, g, b) => r > 170 && g > 110 && b < 110 && r - b > 110 }[BAG];
const HAIR_COLOR = {
  brown: (r, g, b) => r < 205 && r - g > 45 && g - b > 20,
  darkbrown: (r, g, b) => r < 170 && r - g > 25 && g - b > 8,
  black: (r, g, b) => Math.max(r, g, b) < 70 && Math.max(r, g, b) - Math.min(r, g, b) < 25,
}[HAIR];
if (!IN || !OUT || !MAP || !HAIR_COLOR) throw new Error("사용법은 파일 머리 주석 참고");
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(IN), root = doc.getRoot(), buf = root.listBuffers()[0];

for (const n of root.listNodes()) n.setName(n.getName().replace(/^mixamorig:/, ""));
// 같은 원래 이름을 여러 번 써도 된다: @first 는 그 동작의 첫 장면만 남긴 새 동작을 따로 만든다
// (예: "Wave_One_Hand=wave,Wave_One_Hand=idle@first" — Idle 동작이 없는 파일에서 안녕 첫 장면을 서 있기로)
const rename = new Map();
for (const p of MAP.split(",")) { const [from, to] = p.split("="); const [name, mode] = to.split("@"); const k = from.trim(); if (!rename.has(k)) rename.set(k, []); rename.get(k).push({ name, mode }); }
const oneFrame = (s, out, i) => { const k = out.getElementSize();
  s.setInput(doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0])).setBuffer(buf));
  s.setOutput(doc.createAccessor().setType(out.getType()).setArray(out.getArray().slice(i * k, (i + 1) * k)).setBuffer(buf)).setInterpolation("LINEAR"); };
for (const a of root.listAnimations()) {
  const rs = rename.get(a.getName());
  if (!rs) { console.log("버림:", a.getName()); a.dispose(); continue; }
  for (const r of rs.filter((r) => r.mode === "first")) {
    const b = doc.createAnimation(r.name);
    for (const ch of a.listChannels()) {
      const src = ch.getSampler(), s = doc.createAnimationSampler(); oneFrame(s, src.getOutput(), 0);
      b.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(ch.getTargetPath()).setSampler(s));
    }
  }
  const r = rs.find((r) => r.mode !== "first");
  if (!r) { a.dispose(); continue; }
  a.setName(r.name);
  if (r.mode !== "last") continue;
  for (const ch of a.listChannels()) { const s = ch.getSampler(), out = s.getOutput(); oneFrame(s, out, out.getCount() - 1); }
}
/**
 * standlegs: idle·wave 모두 발목을 골반 아래로 모은 같은 하체 자세로 고정한다.
 * 기본 리깅 자세도 다리가 벌어질 수 있어 IK로 발 간격을 줄인다. 허리 위 동작은 유지한다.
 */
if (FLAGS.includes("standlegs")) {
  const animations = root.listAnimations().filter(a => ["idle", "wave"].includes(a.getName()));
  console.log("서 있기·안녕 하체 보정:", applyStandingPose(doc, animations), "채널");
}
/**
 * 팔 옷과 몸통 옷 떼기: Meshy 메시는 소매 안쪽이 몸통 옆에 붙은 한 덩어리이고, 겨드랑이~허리 옆 꼭짓점이 팔 뼈와 몸통 뼈에 섞여 붙어
 * 팔을 들면 몸통 옷이 팔을 따라 늘어난다. 팔 축(위팔 → 아래팔 → 손 → 소매 끝)에서 RADIUS 안이면서 몸 쪽으로 CUT 보다 가까운 꼭짓점은 팔,
 * 나머지는 몸통으로 나누고 (RADIUS 가 없으면 팔과 같은 높이의 가슴 앞·등 옷까지 팔로 간다)
 * (겨드랑이 아래만. 어깨는 섞인 채로 둔다), 둘에 걸친 삼각형은 많은 쪽으로 보내며 걸린 꼭짓점을 복제해 메시를 자른다.
 * 팔 쪽은 그 팔 뼈(Arm · ForeArm · Hand)에만, 몸통 쪽은 그 밖의 뼈에만 붙인다.
 * 자른 자리는 팔이 붙어 있던 곳이라 밑에 옷 면이 없어 구멍이 난다: 구멍마다 가운데 점으로 부채꼴 면을 채우고, 구멍 가장자리에서 가장 밝은
 * (후드티) 색 한 점을 칠한다. 그래도 남는 틈은 안쪽 면이 보이게 재질을 양면으로 한다
 */
async function splitArms(prim, joints) {
  // 몸 쪽 경계(팔 뼈 무게가 0.5 를 넘는 곳) · 소매 반지름(팔 뼈에만 붙은 꼭짓점이 축에서 가장 먼 거리) · 어깨 관절 아래로 이만큼부터 자른다
  const CUT = 0.055, RADIUS = 0.085, ARMPIT = 0.03;
  const segDist = (v, a, b) => {
    const ab = b.map((x, i) => x - a[i]), av = v.map((x, i) => x - a[i]);
    const t = Math.max(0, Math.min(1, av.reduce((s, x, i) => s + x * ab[i], 0) / ab.reduce((s, x) => s + x * x, 0)));
    return Math.hypot(...av.map((x, i) => x - ab[i] * t));
  };
  const P = prim.getAttribute("POSITION"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0"), n = P.getCount();
  const jointPos = (name) => joints.find((j) => j.getName() === name).getWorldTranslation();
  const side = new Int8Array(n); // 0 = 몸통, 1 = 오른팔, 2 = 왼팔
  const chains = ["Right", "Left"].map((s, k) => {
    const A = jointPos(s + "Arm"), F = jointPos(s + "ForeArm"), H = jointPos(s + "Hand"), out = s === "Right" ? -1 : 1;
    const T = H.map((x, i) => x + (H[i] - F[i]) * 0.6); // 소매 끝 (손 뼈 너머)
    const l = Math.hypot(H[0] - A[0], H[1] - A[1]), d = [(H[0] - A[0]) / l, (H[1] - A[1]) / l];
    const nrm = Math.sign(-d[1]) === out ? [-d[1], d[0]] : [d[1], -d[0]]; // 팔 축에 수직, 바깥(팔) 쪽 (앞뒤 무시)
    for (let i = 0; i < n; i++) {
      const v = P.getElement(i, []); if (Math.sign(v[0]) !== out || v[1] > A[1] - ARMPIT) continue;
      const near = Math.min(segDist(v, A, F), segDist(v, F, H), segDist(v, H, T)) < RADIUS;
      if (near && (v[0] - A[0]) * nrm[0] + (v[1] - A[1]) * nrm[1] > -CUT) side[i] = k + 1;
    }
    return new Set(["Arm", "ForeArm", "Hand"].map((b) => joints.findIndex((j) => j.getName() === s + b)));
  });
  const spine = joints.findIndex((j) => j.getName() === "Spine2");
  const reweight = (j, w, s) => { // s 쪽 뼈만 남기고 다시 합이 1 이 되게
    const keep = (x) => (s ? chains[s - 1].has(x) : !chains[0].has(x) && !chains[1].has(x));
    const ws = w.map((x, k) => (keep(j[k]) ? x : 0)), sum = ws.reduce((a, b) => a + b, 0);
    if (sum > 1e-3) return [j, ws.map((x) => x / sum)];
    return [[s ? [...chains[s - 1]][0] : spine, 0, 0, 0], [1, 0, 0, 0]];
  };
  // 삼각형마다 쪽을 정하고, 다른 쪽 꼭짓점은 복제한다. extra: 새 꼭짓점 { src: 복사할 꼭짓점, cls: 쪽, pos·nrm·uv: 바꿀 값 }
  const idx = Array.from(prim.getIndices().getArray()), dup = new Map(), extra = [], triCls = [];
  for (let t = 0; t < idx.length; t += 3) {
    const s = [side[idx[t]], side[idx[t + 1]], side[idx[t + 2]]], c = s.filter((x) => x === s[0]).length >= 2 ? s[0] : s[1] === s[2] ? s[1] : 0;
    triCls.push(c);
    for (let k = 0; k < 3; k++) {
      const i = idx[t + k]; if (side[i] === c) continue;
      const key = i * 3 + c; if (!dup.has(key)) { dup.set(key, n + extra.length); extra.push({ src: i, cls: c }); }
      idx[t + k] = dup.get(key);
    }
  }
  // 구멍 막기: 쪽마다 삼각형 하나에만 쓰인 모서리(위치로 비교: UV 이음매는 모서리가 둘로 나뉘어 있다) 중 자른 자리의 것을 이어 고리로
  const src = (v) => (v < n ? v : extra[v - n].src), pos = (v) => P.getElement(src(v), []), pk = (v) => pos(v).map((x) => x.toFixed(5)).join(",");
  const UV = prim.getAttribute("TEXCOORD_0"), uvOf = (v) => UV.getElement(src(v), []);
  const tex = prim.getMaterial().getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const bright = ([u, v]) => { const o = (Math.round(Math.min(1, Math.max(0, v)) * (info.height - 1)) * info.width + Math.round(Math.min(1, Math.max(0, u)) * (info.width - 1))) * 4; return data[o] + data[o + 1] + data[o + 2]; };
  const seam = new Set(extra.map((e) => pk(n + extra.indexOf(e))));
  let caps = 0;
  for (const c of [0, 1, 2]) {
    const count = new Map(), next = new Map();
    for (let t = 0; t < idx.length; t += 3) if (triCls[t / 3] === c) for (let k = 0; k < 3; k++) {
      const a = idx[t + k], b = idx[t + (k + 1) % 3], key = [pk(a), pk(b)].sort().join("|");
      count.set(key, (count.get(key) || 0) + 1); next.set(pk(a) + ">" + pk(b), [a, b]);
    }
    const out = new Map(); // 가장자리 모서리 a → b (삼각형 방향)
    for (const [k, [a, b]] of next) { const key = [pk(a), pk(b)].sort().join("|"); if (count.get(key) === 1 && seam.has(pk(a)) && seam.has(pk(b))) out.set(pk(a), [a, b]); }
    const seen = new Set();
    for (const start of out.keys()) {
      if (seen.has(start)) continue;
      const loop = []; let cur = start;
      while (out.has(cur) && !seen.has(cur)) { seen.add(cur); const [a, b] = out.get(cur); loop.push(a); cur = pk(b); }
      if (loop.length < 3 || cur !== start) continue;
      const center = [0, 1, 2].map((i) => loop.reduce((s, v) => s + pos(v)[i], 0) / loop.length);
      const nrm = [0, 0, 0]; // 채울 면은 고리와 반대 방향 (Newell)
      for (let i = 0; i < loop.length; i++) { const p = pos(loop[(i + 1) % loop.length]), q = pos(loop[i]); nrm[0] += (p[1] - q[1]) * (p[2] + q[2]); nrm[1] += (p[2] - q[2]) * (p[0] + q[0]); nrm[2] += (p[0] - q[0]) * (p[1] + q[1]); }
      const l = Math.hypot(...nrm) || 1; nrm.forEach((x, i) => (nrm[i] = x / l));
      const uv = uvOf(loop.reduce((best, v) => (bright(uvOf(v)) > bright(uvOf(best)) ? v : best)));
      const capOf = (v) => { extra.push({ src: src(v), cls: c, nrm, uv }); return n + extra.length - 1; };
      const mid = capOf(loop[0]); extra[mid - n].pos = center;
      const ring = loop.map(capOf);
      for (let i = 0; i < ring.length; i++) { idx.push(ring[(i + 1) % ring.length], ring[i], mid); triCls.push(c); }
      caps++;
    }
  }
  for (const sem of prim.listSemantics()) {
    const acc = prim.getAttribute(sem), k = acc.getElementSize(), from = acc.getArray(), arr = new from.constructor((n + extra.length) * k);
    arr.set(from);
    extra.forEach((e, i) => {
      const o = (n + i) * k, val = sem === "POSITION" ? e.pos : sem === "NORMAL" ? e.nrm : sem === "TEXCOORD_0" ? e.uv : null;
      arr.set(val || from.subarray(e.src * k, e.src * k + k), o);
    });
    acc.setArray(arr);
  }
  const ja = J.getArray(), wa = W.getArray(), all = [...side, ...extra.map((e) => e.cls)];
  for (let i = 0; i < all.length; i++) { const [j, w] = reweight(Array.from(ja.subarray(i * 4, i * 4 + 4)), Array.from(wa.subarray(i * 4, i * 4 + 4)), all[i]); ja.set(j, i * 4); wa.set(w, i * 4); }
  J.setArray(ja); W.setArray(wa);
  prim.setIndices(prim.getIndices().setArray(Uint32Array.from(idx)));
  prim.getMaterial().setDoubleSided(true);
  console.log("팔 옷 떼기: 오른팔", side.filter((x) => x === 1).length, "· 왼팔", side.filter((x) => x === 2).length, "꼭짓점, 새 꼭짓점", extra.length, "· 막은 구멍", caps);
}
/**
 * armweights: 메시는 자르지 않고 팔·손 무게만 고친다. 자동 리깅이 가슴 앞·등 옷까지 위팔 뼈에 붙여서 팔을 들면 몸통 옷이 팔을 따라 늘어나고,
 * 손 뼈 무게가 아래팔 소매 중간까지 번져 손을 흔들면 소매가 손을 따라 비틀린다.
 * 소매가 통통해 몸통에 거의 닿아서 위치로는 소매·몸통 옷을 가를 수 없다: 색으로 가른다 (조끼 = 밝은 색, 소매 = 그보다 어두운 색).
 * - 손목 전(위팔→손 축 비율 < HANDT)의 밝은 꼭짓점(둘러싼 삼각형 색의 가장 어두운 채널이 LIGHT 넘는 쪽이 많으면)은 몸통 옷: 팔 뼈 무게를 뺀다
 *   (기본 자세에서 아래팔이 허리 옆에 늘어져 조끼 옆구리가 아래팔 뼈에 붙어 있다. 손은 살색도 밝아서 손목 너머는 그대로)
 * - 어깨 높이(겨드랑이 위)는 색과 상관없이 어깨 관절보다 몸 안쪽으로 들어간 만큼 팔 뼈 무게를 줄인다 (IN 에서 0)
 * - 반대쪽 몸의 꼭짓점은 이쪽 팔 뼈 무게를 뺀다
 * - 아래팔·손(위팔→손 축 비율 > LOW): 기본 자세에서 손이 허벅지 옆에 있어 손을 허벅지 뼈에도 붙여 놓았다 (팔을 들면 손이 허리까지 늘어난다).
 *   팔 뼈 무게가 HANDARM 이상이거나 소매 색이면서 0.1 이상이면 팔 뼈에만, 아니면(조끼 밑단·바지) 팔 뼈를 뺀다
 * - 목 아래 팔 쪽 꼭짓점의 머리·목 뼈 무게를 뺀다 (어깨 소매가 머리 뼈에 붙어 고개를 기울이면 어깨가 따라간다. 긴 머리카락은 뒤에서 다시 붙인다)
 * - 손 뼈 무게는 손목(손 뼈 자리) 근처부터: 아래팔→손 축의 비율 WRIST 이전은 아래팔 뼈로
 * 뺀 무게는 남은 뼈에 나눠 주고, 남은 뼈가 없으면 Spine2(몸통) · ForeArm(손).
 */
/**
 * 무게 고치기 도우미: 꼭짓점 좌표(뼈와 같은 공간) · 같은 자리 꼭짓점 묶음(grp) · 묶음마다 어두운 정도(dark: 1 = 어두운 옷, 0 = 밝은 옷·살)
 */
async function surfaceColor(prim, joints, skin, LIGHT, SMOOTH) {
  const P = prim.getAttribute("POSITION"), n = P.getCount(), spine = joints.findIndex((j) => j.getName() === "Spine2");
  // 꼭짓점마다 밝은 삼각형 비율 (삼각형 색 = 세 UV 가운데 텍스처 색)
  const UV = prim.getAttribute("TEXCOORD_0"), tex = prim.getMaterial().getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const idx = prim.getIndices().getArray(), lightN = new Float32Array(n), triN = new Float32Array(n);
  for (let t = 0; t < idx.length; t += 3) {
    const uv = [0, 1, 2].map((k) => UV.getElement(idx[t + k], [])), u = (uv[0][0] + uv[1][0] + uv[2][0]) / 3, v = (uv[0][1] + uv[1][1] + uv[2][1]) / 3;
    const o = (Math.round(Math.min(1, Math.max(0, v)) * (info.height - 1)) * info.width + Math.round(Math.min(1, Math.max(0, u)) * (info.width - 1))) * 4;
    const light = Math.min(data[o], data[o + 1], data[o + 2]) > LIGHT ? 1 : 0;
    for (let k = 0; k < 3; k++) { lightN[idx[t + k]] += light; triN[idx[t + k]]++; }
  }
  // UV 이음매에서 갈라진 같은 자리 꼭짓점은 한 점으로 본다 (따로 판정하면 이음매가 찢어진다). 이웃끼리 SMOOTH 번 평균해 경계를 부드럽게
  const grp = new Int32Array(n), keyOf = new Map();
  for (let i = 0; i < n; i++) { const k = P.getElement(i, []).map((x) => x.toFixed(5)).join(","); if (!keyOf.has(k)) keyOf.set(k, keyOf.size); grp[i] = keyOf.get(k); }
  const G = keyOf.size, gl = new Float32Array(G), gt = new Float32Array(G), nb = Array.from({ length: G }, () => new Set());
  for (let i = 0; i < n; i++) { gl[grp[i]] += lightN[i]; gt[grp[i]] += triN[i]; }
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = grp[idx[t + k]], b = grp[idx[t + (k + 1) % 3]]; if (a !== b) { nb[a].add(b); nb[b].add(a); } }
  let dark = Float32Array.from({ length: G }, (_, g) => (gl[g] * 2 > gt[g] ? 0 : 1)); // 1 = 소매(팔), 0 = 밝은 몸통 옷
  const dark0 = dark;
  for (let it = 0; it < SMOOTH; it++) dark = dark.map((x, g) => { let s = x, c = 1; for (const q of nb[g]) { s += dark[q]; c++; } return s / c; });
  // 메시 좌표를 뼈와 같은 공간으로: 기본 자세에서는 어느 뼈든 (뼈 월드 행렬 × 역바인드 행렬) 이 같다
  const ibm = skin.getInverseBindMatrices().getElement(spine, []), jw = joints[spine].getWorldMatrix();
  const B = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) B[c * 4 + r] += jw[k * 4 + r] * ibm[c * 4 + k];
  const pos = (i) => { const p = P.getElement(i, []); return [0, 1, 2].map((r) => B[r] * p[0] + B[4 + r] * p[1] + B[8 + r] * p[2] + B[12 + r]); };
  return { pos, grp, dark, dark0 };
}
async function fixArmWeights(prim, joints, skin) {
  const IN = 0.07, ARMPIT = 0.03, LIGHT = 200, WRIST = [0.7, 1.0], LOW = 0.6, HANDARM = 0.3, HANDT = 0.95, SMOOTH = 4, SOFT = 0.5, BRIDGE = 0.5, PIT = 0.04;
  const sm = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const segT = (v, a, b) => { const ab = b.map((x, i) => x - a[i]); return v.reduce((s, x, i) => s + (x - a[i]) * ab[i], 0) / ab.reduce((s, x) => s + x * x, 0); };
  const P = prim.getAttribute("POSITION"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0"), n = P.getCount();
  const { pos, grp, dark, dark0 } = await surfaceColor(prim, joints, skin, LIGHT, SMOOTH);
  const ji = (name) => joints.findIndex((j) => j.getName() === name), jp = (name) => joints[ji(name)].getWorldTranslation();
  const ja = J.getArray(), wa = W.getArray(), spine = ji("Spine2");
  let moved = 0, handMoved = 0, legMoved = 0, headMoved = 0;
  const head = ji("Head"), neck = ji("Neck"), neckY = jp("Neck")[1];
  for (const s of ["Right", "Left"]) {
    const A = jp(s + "Arm"), F = jp(s + "ForeArm"), H = jp(s + "Hand"), out = s === "Right" ? -1 : 1;
    const arm = new Set([ji(s + "Arm"), ji(s + "ForeArm"), ji(s + "Hand")]), hand = ji(s + "Hand"), fore = ji(s + "ForeArm");
    for (let i = 0; i < n; i++) {
      const v = pos(i), j = Array.from(ja.subarray(i * 4, i * 4 + 4)), w = Array.from(wa.subarray(i * 4, i * 4 + 4));
      if (!j.some((x, k) => w[k] > 0 && arm.has(x))) continue;
      let allow = 1;
      if (Math.sign(v[0]) !== out) allow = 0;
      // 손목 전 밝은 꼭짓점 = 조끼 (손은 살색도 밝아서 손목 너머만 예외). 겨드랑이 둘레만 경계를 부드럽게, 아래팔 옆 조끼는 딱 잘라 (반쯤 남기면 팔을 들 때 조끼가 길게 끌려 올라간다)
      else if (segT(v, A, F) < 1 || segT(v, A, H) < HANDT) allow = segT(v, A, F) < SOFT ? dark[grp[i]] : dark0[grp[i]];
      if (v[1] > A[1] - ARMPIT) allow *= sm(out * (v[0] - A[0]), -IN, -0.01);
      let onlyArm = false;
      if (allow > 0 && segT(v, A, H) > LOW) { const as = j.reduce((t, x, k) => t + (arm.has(x) ? w[k] : 0), 0); if (as >= HANDARM || (as >= 0.1 && dark[grp[i]] > 0.5)) onlyArm = as < 0.999; else allow = 0; }
      if (onlyArm) { for (let k = 0; k < 4; k++) if (!arm.has(j[k])) w[k] = 0; legMoved++; }
      // 어깨 소매가 머리 뼈에도 붙어 있다 (고개를 기울이면 어깨가 따라간다): 목 아래 팔 쪽 꼭짓점은 머리·목 뼈를 뺀다
      let headCut = false;
      if (allow > 0 && v[1] < neckY) for (let k = 0; k < 4; k++) if ((j[k] === head || j[k] === neck) && w[k] > 0) { w[k] = 0; headCut = true; }
      if (headCut) headMoved++;
      const handOk = sm(segT(v, F, H), ...WRIST);
      let lost = 0, toFore = 0;
      for (let k = 0; k < 4; k++) {
        if (!arm.has(j[k]) || !w[k]) continue;
        const keep = w[k] * allow, cut = w[k] - keep; lost += cut; w[k] = keep;
        if (j[k] === hand) { const h = w[k] * handOk; toFore += w[k] - h; w[k] = h; }
      }
      if (lost < 1e-4 && toFore < 1e-4 && !onlyArm && !headCut) continue;
      if (lost > 1e-4) moved++; if (toFore > 1e-4) handMoved++;
      // 손에서 뺀 무게는 아래팔 뼈로 (자리가 없으면 가장 작은 칸을 바꾼다)
      if (toFore > 0) { let k = j.findIndex((x, q) => x === fore && w[q] > 0); if (k < 0) { k = w.indexOf(Math.min(...w)); j[k] = fore; w[k] = 0; } w[k] += toFore; }
      const sum = w.reduce((a, b) => a + b, 0);
      if (sum < 1e-3) { j.fill(0); w.fill(0); j[0] = spine; w[0] = 1; }
      else for (let k = 0; k < 4; k++) w[k] /= sum;
      ja.set(j, i * 4); wa.set(w, i * 4);
    }
  }
  J.setArray(ja); W.setArray(wa);
  // 아래팔·손과 몸통을 잇는 삼각형 지우기: 기본 자세에서 아래팔 안쪽 소매가 조끼 옆구리에 붙어 메시가 이어져 있어, 팔을 들면 그 삼각형이 길게 늘어나
  // 조끼가 팔을 따라 끌려 올라가 보인다. 꼭짓점 하나는 아래팔·손(겨드랑이 아래 위팔 포함) 뼈가 BRIDGE 넘게, 다른 하나는 몸통 뼈가 BRIDGE 넘게 잡은 삼각형 (어깨 이음매 = 위팔은 그대로)
  const lower = new Set(["RightForeArm", "RightHand", "LeftForeArm", "LeftHand"].map(ji)), body = new Set(["Hips", "Spine", "Spine1", "Spine2", "LeftUpLeg", "RightUpLeg"].map(ji));
  // 위팔도 겨드랑이보다 PIT 아래 꼭짓점이면 아래팔과 같이 본다 (위팔 안쪽 소매도 옆구리에 붙어 있다)
  const upper = new Set(["RightArm", "LeftArm"].map(ji)), pitY = Math.min(jp("RightArm")[1], jp("LeftArm")[1]) - ARMPIT - PIT;
  const share = (i, set) => { let t = 0; for (let k = 0; k < 4; k++) if (set.has(ja[i * 4 + k]) || (set === lower && upper.has(ja[i * 4 + k]) && pos(i)[1] < pitY)) t += wa[i * 4 + k]; return t; };
  const idx = prim.getIndices().getArray(), keep = [];
  let cut = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    if (tri.some((i) => share(i, lower) > BRIDGE) && tri.some((i) => share(i, body) > BRIDGE)) { cut++; continue; }
    keep.push(...tri);
  }
  prim.setIndices(prim.getIndices().setArray(new idx.constructor(keep)));
  console.log("팔 무게 고침: 팔-몸통 삼각형", cut, "개 지움 · 몸통 옷", moved, "꼭짓점 · 손→아래팔", handMoved, "· 손에서 허벅지·허리 뼈 뺌", legMoved, "· 어깨에서 머리 뼈 뺌", headMoved, "꼭짓점");
}
if (FLAGS.includes("armweights")) await fixArmWeights(root.listMeshes()[0].listPrimitives()[0], root.listSkins()[0].listJoints(), root.listSkins()[0]);
/**
 * hemweights: 허리 아래로 내려오는 밝은 윗옷(조끼) 아랫단을 자동 리깅이 허벅지 뼈에 크게 붙여서, 앉으면(허벅지를 들면) 등 쪽 옷자락이 뒤로 부풀어 오른다.
 * 무릎(+KNEE) 위 밝은 꼭짓점의 허벅지·종아리 뼈 무게를: 골반 관절보다 위는 모두, 아래는 엉덩이 쪽(골반 관절보다 뒤)만 빼서 Hips 로 (앞자락은 무릎을 따라 무릎 위에 덮이게 둔다)
 */
async function fixHemWeights(prim, joints, skin) {
  const LIGHT = 200, SMOOTH = 2, FRONT = [-0.02, 0.06], KNEE = 0.08;
  const sm = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const { pos, grp, dark } = await surfaceColor(prim, joints, skin, LIGHT, SMOOTH);
  const J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0"), n = J.getCount(), ja = J.getArray(), wa = W.getArray();
  const ji = (name) => joints.findIndex((j) => j.getName() === name), hips = ji("Hips"), [, hy, hz] = joints[hips].getWorldTranslation();
  const leg = new Set(["LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"].map(ji)), kneeY = joints[ji("LeftLeg")].getWorldTranslation()[1];
  let moved = 0;
  for (let i = 0; i < n; i++) {
    const light = 1 - dark[grp[i]]; if (light < 0.01) continue;
    const j = Array.from(ja.subarray(i * 4, i * 4 + 4)), w = Array.from(wa.subarray(i * 4, i * 4 + 4));
    if (!j.some((x, k) => w[k] > 0 && leg.has(x))) continue;
    const v = pos(i); if (v[1] < kneeY + KNEE) continue; // 신발·바짓단도 밝아서 무릎 아래는 그대로
    const keep = 1 - light * (v[1] > hy ? 1 : 1 - sm(v[2] - hz, ...FRONT));
    let cut = 0;
    for (let k = 0; k < 4; k++) if (leg.has(j[k]) && w[k] > 0) { const c = w[k] * (1 - keep); w[k] -= c; cut += c; }
    if (cut < 1e-4) continue;
    let k = j.findIndex((x, q) => x === hips && w[q] > 0); if (k < 0) { k = w.indexOf(Math.min(...w)); j[k] = hips; w[k] = 0; } w[k] += cut;
    ja.set(j, i * 4); wa.set(w, i * 4); moved++;
  }
  J.setArray(ja); W.setArray(wa);
  console.log("옷자락 무게 고침: 허벅지 → 골반", moved, "꼭짓점");
}
if (FLAGS.includes("hemweights")) await fixHemWeights(root.listMeshes()[0].listPrimitives()[0], root.listSkins()[0].listJoints(), root.listSkins()[0]);
if (FLAGS.includes("split")) await splitArms(root.listMeshes()[0].listPrimitives()[0], root.listSkins()[0].listJoints());
// 머리카락은 머리 뼈만, 가방은 등 뼈만 따라가게 (자동 리깅이 옆머리 끝·가방끈을 어깨·팔 뼈에도 붙인다).
// 꼭짓점 하나의 색은 텍스처 조각 가장자리에서 옆 색을 집을 수 있어, 둘러싼 삼각형이 모두 그 색인 꼭짓점만 고른다
{
  const prim = root.listMeshes()[0].listPrimitives()[0], tex = prim.getMaterial().getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const joints = root.listSkins()[0].listJoints().map((j) => j.getName());
  const uv = prim.getAttribute("TEXCOORD_0"), P = prim.getAttribute("POSITION"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0");
  const triColor = (a, b, c) => {
    const [u1, v1] = uv.getElement(a, []), [u2, v2] = uv.getElement(b, []), [u3, v3] = uv.getElement(c, []);
    const x = Math.round(Math.min(1, Math.max(0, (u1 + u2 + u3) / 3)) * (info.width - 1)), y = Math.round(Math.min(1, Math.max(0, (v1 + v2 + v3) / 3)) * (info.height - 1)), o = (y * info.width + x) * 4;
    return [data[o], data[o + 1], data[o + 2]];
  };
  if (FLAGS.includes("longhair")) bindLongHair(); // 꼭짓점을 늘리므로 아래 배열을 꺼내기 전에
  const ja = J.getArray(), wa = W.getArray(), idx = prim.getIndices().getArray();
  const bind = (test, bone, minY) => {
    const only = new Int8Array(P.getCount()), j = joints.indexOf(bone); let n = 0;
    for (let t = 0; t < idx.length; t += 3) { const h = test(...triColor(idx[t], idx[t + 1], idx[t + 2])); for (let k = 0; k < 3; k++) { const i = idx[t + k]; only[i] = !h ? -1 : only[i] === 0 ? 1 : only[i]; } }
    for (let i = 0; i < P.getCount(); i++) if (only[i] === 1 && P.getElement(i, [])[1] > minY) { ja.set([j, 0, 0, 0], i * 4); wa.set([1, 0, 0, 0], i * 4); n++; }
    console.log(`꼭짓점 → ${bone}:`, n);
  };
  if (!FLAGS.includes("longhair")) bind(HAIR_COLOR, "Head", +HAIR_Y);
  bind(BAG_COLOR, "Spine2", -Infinity);
  /**
   * 긴 머리: 등 뒤·팔 옆으로 무릎까지 늘어진 머리카락을 자동 리깅이 팔(어깨~손)·다리 뼈에 붙여서, 팔을 들면 옆머리가 끌려 나오고 걸으면 뒷머리가 다리를 따라간다.
   * 머리카락 색 삼각형 중 가장 큰 덩어리(위치로 이어 붙인다. 신발 밑창·바지 주름 같은 작은 조각은 뺀다)의 꼭짓점을
   * HAIR_Y 위는 Head 하나에, 그 아래는 높이에 따라 Head → Spine2 → Spine1 → Spine → Hips 사이에 섞어 붙인다 (Hips 아래는 Hips 하나).
   * 덩어리 가장자리 꼭짓점은 손·소매 같은 다른 삼각형과 같이 쓰여서, 그대로 바꾸면 그 삼각형이 손과 머리카락 사이로 길게 늘어난다:
   * 가장자리 꼭짓점은 복제해 머리카락 삼각형만 복제본(새 무게)을 쓰게 하고 다른 삼각형은 원래 무게를 둔다
   */
  function bindLongHair() {
    const idx = Array.from(prim.getIndices().getArray()), n0 = P.getCount();
    const key = (i) => P.getElement(i, []).map((x) => x.toFixed(5)).join(",");
    const par = new Map(), find = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    const tris = [];
    for (let t = 0; t < idx.length; t += 3) {
      if (!HAIR_COLOR(...triColor(idx[t], idx[t + 1], idx[t + 2]))) continue;
      const k = [0, 1, 2].map((q) => key(idx[t + q])); for (const x of k) if (!par.has(x)) par.set(x, x);
      par.set(find(k[0]), find(k[1])); par.set(find(k[1]), find(k[2])); tris.push(t);
    }
    const size = new Map(); for (const t of tris) { const c = find(key(idx[t])); size.set(c, (size.get(c) || 0) + 1); }
    const main = [...size].sort((a, b) => b[1] - a[1])[0][0];
    const hairTri = new Set(tris.filter((t) => find(key(idx[t])) === main));
    const other = new Uint8Array(n0); // 머리카락 덩어리 밖 삼각형도 쓰는 꼭짓점
    for (let t = 0; t < idx.length; t += 3) if (!hairTri.has(t)) for (let q = 0; q < 3; q++) other[idx[t + q]] = 1;
    const dup = new Map(), hair = new Set();
    for (const t of hairTri) for (let q = 0; q < 3; q++) {
      const i = idx[t + q];
      if (other[i]) { if (!dup.has(i)) dup.set(i, n0 + dup.size); idx[t + q] = dup.get(i); }
      hair.add(idx[t + q]);
    }
    const src = [...dup.keys()];
    for (const sem of prim.listSemantics()) {
      const acc = prim.getAttribute(sem), k = acc.getElementSize(), from = acc.getArray(), arr = new from.constructor((n0 + src.length) * k);
      arr.set(from); src.forEach((s, i) => arr.set(from.subarray(s * k, s * k + k), (n0 + i) * k)); acc.setArray(arr);
    }
    prim.setIndices(prim.getIndices().setArray(Uint32Array.from(idx)));
    // 뼈의 바인드 자세 높이 (inverseBindMatrices 의 역행렬 이동값)
    const ibm = root.listSkins()[0].getInverseBindMatrices();
    const bindY = (name) => { // [A | b] 의 역은 [A⁻¹ | −A⁻¹b]: A⁻¹ 의 y 줄(= 수반행렬 y 줄 / 행렬식)과 b 를 곱한다
      const m = ibm.getElement(joints.indexOf(name), []), a = (r, c) => m[c * 4 + r], b = [m[12], m[13], m[14]];
      const det = a(0, 0) * (a(1, 1) * a(2, 2) - a(1, 2) * a(2, 1)) - a(0, 1) * (a(1, 0) * a(2, 2) - a(1, 2) * a(2, 0)) + a(0, 2) * (a(1, 0) * a(2, 1) - a(1, 1) * a(2, 0));
      const row = [a(1, 2) * a(2, 0) - a(1, 0) * a(2, 2), a(0, 0) * a(2, 2) - a(0, 2) * a(2, 0), a(0, 2) * a(1, 0) - a(0, 0) * a(1, 2)];
      return -(row[0] * b[0] + row[1] * b[1] + row[2] * b[2]) / det;
    };
    const chain = ["Hips", "Spine", "Spine1", "Spine2"].map((b) => [joints.indexOf(b), bindY(b)]).concat([[joints.indexOf("Head"), +HAIR_Y]]);
    const ja = J.getArray(), wa = W.getArray();
    for (const i of hair) {
      const y = P.getElement(i, [])[1], k = chain.findIndex(([, by]) => by > y);
      if (k === 0) { ja.set([chain[0][0], 0, 0, 0], i * 4); wa.set([1, 0, 0, 0], i * 4); }
      else if (k < 0) { ja.set([chain.at(-1)[0], 0, 0, 0], i * 4); wa.set([1, 0, 0, 0], i * 4); }
      else { const [j0, y0] = chain[k - 1], [j1, y1] = chain[k], s = (y - y0) / (y1 - y0); ja.set([j0, j1, 0, 0], i * 4); wa.set([1 - s, s, 0, 0], i * 4); }
    }
    J.setArray(ja); W.setArray(wa);
    console.log("긴 머리 꼭짓점 → Head~Hips:", hair.size, "(가장자리 복제", src.length, "· 삼각형", hairTri.size, "/", tris.length, ")");
  }
  J.setArray(ja); W.setArray(wa);
}
/**
 * skin: 얼굴·손이 연보라빛 흰색이라 게임 음영(밝은 쪽 0.78)에서 회색으로 보인다. 다른 인형의 살색(SKIN)으로 옮긴다.
 * 머리 뼈(얼굴 앞 headfront 포함)·손·아래팔 뼈에 붙은 흰 삼각형(살. 소매는 색이 달라 빠진다) 안의 밝은 칸만 평균 색 → SKIN 비율로 곱한다 (눈·외곽선 같은 어두운 칸, 머리카락·털 깃은 그대로)
 */
/**
 * paint: 니트 맨투맨 인형(헤어롤) 색 다듬기. 원본은 조끼(255,237,227)·살(252,236,227)이 거의 같은 색이고 소매도 옅어서, 게임 툰 음영에서는
 * 얼굴·목·몸통이 한 덩어리 흰색으로 보이고 팔과 옷 경계가 흐리다 (기준 그림: 크림 맨투맨 · 라벤더 래글런 소매 · 골지 목깃·소매 끝·밑단).
 * 삼각형을 뼈 무게·색으로 나눠(맨투맨 = 밝고 몸통 뼈, 소매 = 라벤더) UV 위에 칠한다. 칸마다 3D 위치를 보간해 골지 줄무늬(목·팔 둘레 각도)를 넣는다.
 * - 맨투맨: 따뜻한 크림 BODY · 목깃(맨투맨 맨 위 COLLAR 높이)·밑단(맨 아래 HEM 높이): 조금 진한 크림 + 골지
 * - 소매: 진한 라벤더 SLEEVE · 소매 끝(위팔→손 축 비율 CUFF 넘게): 크림 골지
 * 원래 칸의 밝기 변화(주름·음영)는 남긴다 (목표색 × 칸 밝기 / 무리 평균 밝기)
 */
if (FLAGS.includes("paint")) {
  const BODY = [238, 224, 200], RIB = [222, 203, 178], SLEEVE = [150, 136, 198], COLLAR = 0.04, HEM = 0.035, CUFF = 0.84, RIBN = 60, RIBA = 0.12, PAD = 6;
  const prim = root.listMeshes()[0].listPrimitives()[0], skin = root.listSkins()[0], joints = skin.listJoints(), tex = prim.getMaterial().getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const Wd = info.width, Ht = info.height, { pos } = await surfaceColor(prim, joints, skin, 200, 0);
  const names = joints.map((j) => j.getName()), ji = (n) => names.indexOf(n), jp = (n) => joints[ji(n)].getWorldTranslation();
  const uv = prim.getAttribute("TEXCOORD_0"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0"), idx = prim.getIndices().getArray();
  const group = (n) => (/Arm|Hand/.test(n) ? "arm" : /Spine|Hips|Shoulder/.test(n) ? "body" : /Head|Neck|headfront/.test(n) ? "head" : "leg");
  const share = (i) => { const j = J.getElement(i, []), w = W.getElement(i, []), s = { arm: 0, body: 0, head: 0, leg: 0 }; j.forEach((x, k) => (s[group(names[x])] += w[k])); return s; };
  const px = (i) => { const [u, v] = uv.getElement(i, []); return [Math.min(1, Math.max(0, u)) * (Wd - 1), Math.min(1, Math.max(0, v)) * (Ht - 1)]; };
  const at = (x, y) => (Math.round(y) * Wd + Math.round(x)) * 4;
  const segT = (v, a, b) => { const ab = b.map((x, i) => x - a[i]); return v.reduce((s, x, i) => s + (x - a[i]) * ab[i], 0) / ab.reduce((s, x) => s + x * x, 0); };
  const kneeY = jp("LeftLeg")[1], pitY = Math.min(jp("RightArm")[1], jp("LeftArm")[1]) - 0.03, arms = ["Right", "Left"].map((s) => ({ A: jp(s + "Arm"), H: jp(s + "Hand"), out: s === "Right" ? -1 : 1 }));
  // 삼각형 나누기: 1 맨투맨 · 2 소매
  const cls = new Uint8Array(idx.length / 3);
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]], c = v.map(px), m = at((c[0][0] + c[1][0] + c[2][0]) / 3, (c[0][1] + c[1][1] + c[2][1]) / 3), [r, g, b] = [data[m], data[m + 1], data[m + 2]];
    const s = v.map(share).reduce((a, x) => { for (const k in a) a[k] += x[k] / 3; return a; }), y = v.reduce((a, i) => a + pos(i)[1], 0) / 3;
    if (Math.min(r, g, b) > 200 && s.body + s.leg > 0.5 && s.head < 0.3 && y > kneeY + 0.08) cls[t / 3] = 1;
    // 소매: 라벤더면서 팔 뼈가 잡았거나 겨드랑이 위(래글런 어깨). 가슴의 라벤더 구름 무늬는 몸통 뼈·가슴 높이라 빠진다
    else if (b > r + 10 && r > 120 && r < 215 && y > kneeY + 0.08 && s.leg < 0.5 && (s.arm > 0.3 || y > pitY)) cls[t / 3] = 2;
  }
  // 맨투맨 맨 위(목)·맨 아래(밑단) 높이: 가운데(|x| < 0.1) 맨투맨 꼭짓점에서
  let top = -1e9, bottom = 1e9;
  for (let t = 0; t < idx.length; t += 3) if (cls[t / 3] === 1) for (let k = 0; k < 3; k++) { const p = pos(idx[t + k]); if (Math.abs(p[0]) < 0.1) { top = Math.max(top, p[1]); bottom = Math.min(bottom, p[1]); } }
  // 칸마다 목표색 · 3D 위치 (삼각형을 UV 위에 그린다)
  const kind = new Uint8Array(Wd * Ht), rib = new Float32Array(Wd * Ht); // kind: 1 몸 · 2 골지(목깃·밑단) · 3 소매 · 4 소매 끝
  for (let t = 0; t < idx.length; t += 3) {
    const k0 = cls[t / 3]; if (!k0) continue;
    const v = [idx[t], idx[t + 1], idx[t + 2]], [a, b, c] = v.map(px), P = v.map(pos), d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (!d) continue;
    for (let y = Math.floor(Math.min(a[1], b[1], c[1])) - 1; y <= Math.ceil(Math.max(a[1], b[1], c[1])) + 1; y++)
      for (let x = Math.floor(Math.min(a[0], b[0], c[0])) - 1; x <= Math.ceil(Math.max(a[0], b[0], c[0])) + 1; x++) {
        if (x < 0 || y < 0 || x >= Wd || y >= Ht) continue;
        const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d, l3 = 1 - l1 - l2;
        if (l1 < -0.05 || l2 < -0.05 || l3 < -0.05) continue;
        const p = [0, 1, 2].map((i) => P[0][i] * l1 + P[1][i] * l2 + P[2][i] * l3), q = y * Wd + x;
        if (k0 === 1) {
          const band = p[1] > top - COLLAR || p[1] < bottom + HEM;
          kind[q] = band ? 2 : 1; if (band) rib[q] = Math.atan2(p[0], p[2] - 0.03); // 몸 둘레 각도
        } else {
          const arm = arms.find((s) => Math.sign(p[0]) === s.out) || arms[0], tt = segT(p, arm.A, arm.H);
          kind[q] = tt > CUFF ? 4 : 3;
          if (tt > CUFF) { const ax = arm.H.map((x, i) => x - arm.A[i]), r = p.map((x, i) => x - arm.H[i]), n = Math.hypot(...ax); const e1 = [0, 0, 1], e2 = [ax[1] / n, -ax[0] / n, 0]; rib[q] = Math.atan2(r[0] * e2[0] + r[1] * e2[1], r[2] * e1[2]); }
        }
      }
  }
  // 조각 가장자리 번짐: 칠한 칸 옆 빈 칸을 PAD 칸 넓힌다
  // (원래 색이 이웃 칠한 칸과 비슷한 칸만: 가슴 구름 무늬처럼 다른 색 그림은 먹지 않게)
  const near = (q, o) => Math.abs(data[q * 4] - data[o * 4]) + Math.abs(data[q * 4 + 1] - data[o * 4 + 1]) + Math.abs(data[q * 4 + 2] - data[o * 4 + 2]) < 45;
  for (let s = 0; s < PAD; s++) {
    const add = [];
    for (let q = Wd; q < kind.length - Wd; q++) if (!kind[q]) for (const o of [q - 1, q + 1, q - Wd, q + Wd]) if (kind[o] && near(q, o)) { add.push([q, kind[o], rib[o]]); break; }
    for (const [q, n, r] of add) { kind[q] = n; rib[q] = r; }
  }
  const lum = (o) => data[o] * 0.3 + data[o + 1] * 0.59 + data[o + 2] * 0.11, mean = [0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0];
  for (let q = 0; q < kind.length; q++) if (kind[q]) { mean[kind[q]] += lum(q * 4); cnt[kind[q]]++; }
  const target = [null, BODY, RIB, SLEEVE, RIB], out = Buffer.from(data);
  for (let q = 0; q < kind.length; q++) {
    const k = kind[q]; if (!k) continue;
    const shade = Math.min(1.15, Math.max(0.75, lum(q * 4) / (mean[k] / cnt[k]))) * (k === 2 || k === 4 ? 1 - RIBA * (0.5 + 0.5 * Math.sin(rib[q] * RIBN)) : 1);
    for (let c = 0; c < 3; c++) out[q * 4 + c] = Math.min(255, Math.round(target[k][c] * shade));
  }
  tex.setImage(new Uint8Array(await sharp(out, { raw: { width: Wd, height: Ht, channels: 4 } }).png().toBuffer())).setMimeType("image/png");
  console.log("색 칠하기: 맨투맨", cnt[1], "· 목깃·밑단", cnt[2], "· 소매", cnt[3], "· 소매 끝", cnt[4], "칸 (맨투맨 높이", bottom.toFixed(3), "~", top.toFixed(3) + ")");
}
if (FLAGS.includes("skin")) {
  const SKIN = [250, 226, 205]; // 곱슬머리 인형(meshy-child) 얼굴 평균
  const prim = root.listMeshes()[0].listPrimitives()[0], tex = prim.getMaterial().getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const names = root.listSkins()[0].listJoints().map((j) => j.getName());
  const uv = prim.getAttribute("TEXCOORD_0"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0"), idx = prim.getIndices().getArray();
  const main = (i) => { const w = W.getElement(i, []); return names[J.getElement(i, [])[w.indexOf(Math.max(...w))]]; };
  const px = (i) => { const [u, v] = uv.getElement(i, []); return [Math.min(1, Math.max(0, u)) * (info.width - 1), Math.min(1, Math.max(0, v)) * (info.height - 1)]; };
  // 살: 밝고 거의 무채색이거나 분홍 (털 깃은 노란 크림이라 초록 > 파랑)
  const isSkin = (o) => data[o] > 215 && data[o + 1] > 195 && data[o + 2] >= data[o + 1] - 10 && data[o] - data[o + 2] < 60;
  const mark = new Uint8Array(info.width * info.height);
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]]; if (!v.every((i) => /^(Head|headfront|(Left|Right)(Hand|ForeArm))$/.test(main(i)))) continue;
    const [a, b, c] = v.map(px), d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (!d) continue;
    const mid = Math.round((a[1] + b[1] + c[1]) / 3) * info.width + Math.round((a[0] + b[0] + c[0]) / 3); if (!isSkin(mid * 4)) continue;
    for (let y = Math.floor(Math.min(a[1], b[1], c[1])) - 1; y <= Math.ceil(Math.max(a[1], b[1], c[1])) + 1; y++)
      for (let x = Math.floor(Math.min(a[0], b[0], c[0])) - 1; x <= Math.ceil(Math.max(a[0], b[0], c[0])) + 1; x++) {
        const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
        if (l1 < -0.05 || l2 < -0.05 || 1 - l1 - l2 < -0.05 || x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
        mark[y * info.width + x] = 1;
      }
  }
  // 텍스처 조각 가장자리 칸(삼각형 바로 바깥)도 화면에 섞여 보이므로, 살 칸이면 몇 칸 넓힌다
  for (let s = 0; s < 4; s++) {
    const add = [];
    for (let p = 0; p < mark.length; p++) if (!mark[p] && isSkin(p * 4) && (mark[p - 1] || mark[p + 1] || mark[p - info.width] || mark[p + info.width])) add.push(p);
    for (const p of add) mark[p] = 1;
  }
  const mean = [0, 0, 0]; let n = 0;
  for (let p = 0; p < mark.length; p++) if (mark[p] && isSkin(p * 4)) { for (let k = 0; k < 3; k++) mean[k] += data[p * 4 + k]; n++; }
  const gain = mean.map((s, k) => SKIN[k] / (s / n));
  // 얼굴 텍스처에 그려진 가는 긁힘 선이 음영과 겹쳐 지저분해 보여서, 밝은 살 칸끼리만 평균(반지름 R 칸 상자)해 고르게 한다 (눈·볼터치 가장자리는 어두운 칸이 빠져서 번지지 않는다)
  const R = Math.round(info.width / 512), Wd = info.width, bright = (p) => mark[p] && data[p * 4] + data[p * 4 + 1] + data[p * 4 + 2] > 450;
  const sum = new Float64Array((Wd + 1) * (info.height + 1) * 4); // 적분 영상: [r, g, b, 개수]
  for (let y = 0; y < info.height; y++) for (let x = 0; x < Wd; x++) {
    const p = y * Wd + x, o = ((y + 1) * (Wd + 1) + x + 1) * 4, up = (y * (Wd + 1) + x + 1) * 4, left = ((y + 1) * (Wd + 1) + x) * 4, ul = (y * (Wd + 1) + x) * 4, on = bright(p);
    for (let k = 0; k < 4; k++) sum[o + k] = (on ? (k < 3 ? data[p * 4 + k] : 1) : 0) + sum[up + k] + sum[left + k] - sum[ul + k];
  }
  const out = Buffer.from(data);
  for (let y = 0; y < info.height; y++) for (let x = 0; x < Wd; x++) {
    const p = y * Wd + x; if (!bright(p)) continue;
    const x0 = Math.max(0, x - R), x1 = Math.min(Wd, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(info.height, y + R + 1), at = (yy, xx) => (yy * (Wd + 1) + xx) * 4;
    const box = [0, 1, 2, 3].map((k) => sum[at(y1, x1) + k] - sum[at(y0, x1) + k] - sum[at(y1, x0) + k] + sum[at(y0, x0) + k]);
    for (let k = 0; k < 3; k++) out[p * 4 + k] = Math.min(255, (box[k] / box[3]) * gain[k]);
  }
  out.copy(data);
  tex.setImage(new Uint8Array(await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer())).setMimeType("image/png");
  console.log("살색:", n, "px", mean.map((s) => Math.round(s / n)).join(","), "→", SKIN.join(","));
}
/**
 * smooth: Meshy 노멀은 면마다 꺾여 있어 툰 음영에 폴리곤 모양 얼룩이 진다. 같은 위치 꼭짓점(UV 이음매·머리카락 가장자리 복제)의 노멀을 합치고,
 * 이웃 꼭짓점 노멀과 SMOOTH 번 평균해 음영이 부드럽게 이어지게 한다 (모양은 그대로, 빛 받는 방향만)
 */
if (FLAGS.includes("smooth")) {
  const SMOOTH = 3;
  const prim = root.listMeshes()[0].listPrimitives()[0], P = prim.getAttribute("POSITION"), N = prim.getAttribute("NORMAL"), idx = prim.getIndices().getArray();
  const id = new Map(), of = new Int32Array(P.getCount());
  for (let i = 0; i < P.getCount(); i++) { const k = P.getElement(i, []).map((x) => x.toFixed(5)).join(","); if (!id.has(k)) id.set(k, id.size); of[i] = id.get(k); }
  let nrm = new Float64Array(id.size * 3); const nb = Array.from({ length: id.size }, () => new Set());
  for (let i = 0; i < P.getCount(); i++) { const v = N.getElement(i, []); for (let k = 0; k < 3; k++) nrm[of[i] * 3 + k] += v[k]; }
  for (let t = 0; t < idx.length; t += 3) for (let q = 0; q < 3; q++) { const a = of[idx[t + q]], b = of[idx[t + (q + 1) % 3]]; if (a !== b) { nb[a].add(b); nb[b].add(a); } }
  const norm = (arr) => { for (let i = 0; i < arr.length; i += 3) { const l = Math.hypot(arr[i], arr[i + 1], arr[i + 2]) || 1; arr[i] /= l; arr[i + 1] /= l; arr[i + 2] /= l; } };
  norm(nrm);
  for (let s = 0; s < SMOOTH; s++) {
    const next = new Float64Array(nrm);
    nb.forEach((set, a) => { for (const b of set) for (let k = 0; k < 3; k++) next[a * 3 + k] += nrm[b * 3 + k]; });
    norm(next); nrm = next;
  }
  const arr = N.getArray(); for (let i = 0; i < P.getCount(); i++) for (let k = 0; k < 3; k++) arr[i * 3 + k] = nrm[of[i] * 3 + k];
  N.setArray(arr); console.log("노멀 부드럽게:", id.size, "점,", SMOOTH, "번");
}
// 툰 음영에는 색 텍스처만 쓴다: 금속·거칠기 텍스처와 접선은 지운다
for (const m of root.listMaterials()) m.setMetallicRoughnessTexture(null).setNormalTexture(null);
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const t = p.getAttribute("TANGENT"); if (t) { p.setAttribute("TANGENT", null); t.dispose(); } }
// tex1024: 얼굴 텍스처의 가는 선·이음매가 512 에서 거칠게 보이는 인형은 1024 로 (약 +100KB)
const TEX = FLAGS.includes("tex1024") ? 1024 : 512;
await doc.transform(textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [TEX, TEX], quality: 85 }), resample({ tolerance: 0.0005 }), prune(), dedup(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
await io.write(OUT, doc);
console.log(OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + " KB", root.listAnimations().map((a) => a.getName()).join(", "));
