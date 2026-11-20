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
const rename = new Map(MAP.split(",").map((p) => { const [from, to] = p.split("="); const [name, mode] = to.split("@"); return [from.trim(), { name, last: mode === "last" }]; }));
for (const a of root.listAnimations()) {
  const r = rename.get(a.getName());
  if (!r) { console.log("버림:", a.getName()); a.dispose(); continue; }
  a.setName(r.name);
  if (!r.last) continue;
  for (const ch of a.listChannels()) {
    const s = ch.getSampler(), out = s.getOutput(), k = out.getElementSize(), n = out.getCount();
    s.setInput(doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0])).setBuffer(buf));
    s.setOutput(doc.createAccessor().setType(out.getType()).setArray(out.getArray().slice((n - 1) * k, n * k)).setBuffer(buf)).setInterpolation("LINEAR");
  }
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
