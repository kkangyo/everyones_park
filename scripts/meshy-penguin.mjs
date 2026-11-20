// Meshy 웹에서 받은 펭귄(걷기 하나만 든 assets/models/Meshy_AI_Penguin_motion.glb)을 게임용 GLB 로 (docs/meshy-character.md).
// 1. 텍스처: UV 조각 가장자리에 이웃 조각(노란 옷) 색이 번진 줄이 있어, 축소(밉맵)하면 남색 몸 둘레에 노란 선이 보인다.
//    조각 사이에 여백을 두어 다시 배치한다 (cleanSeams). 조각 가장자리 그림은 건드리지 않는다
//    (가장자리 띠를 안쪽 색으로 덮어 봤더니 조각 경계가 지나가는 눈·얼굴 경계가 잘렸다)
// 2. 동작: Meshy 걷기는 버리고 뼈를 돌려 idle · walk(아장아장) · wave · sit 을 만든다 (makeClips). 몸통은 움직이지 않는다
// 3. 뼈 이름의 mixamorig: 를 떼고 텍스처 1024 JPEG(색만) · 양자화 · meshopt 로 줄인다
// node scripts/meshy-penguin.mjs <in.glb> <out.glb>
//   예: node scripts/meshy-penguin.mjs assets/models/Meshy_AI_Penguin_motion.glb assets/models/meshy-penguin.glb
// 필요한 패키지는 meshy-doll-clips.mjs 와 같다 (three 포함, 저장소 의존성에 없어 따로 설치).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, quantize, meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import * as THREE from "three";
import sharp from "sharp";

const [IN, OUT] = process.argv.slice(2);
if (!IN || !OUT) throw new Error("사용법은 파일 머리 주석 참고");
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(IN), root = doc.getRoot(), buf = root.listBuffers()[0];
for (const n of root.listNodes()) n.setName(n.getName().replace(/^mixamorig:/, ""));
const prim = root.listMeshes()[0].listPrimitives()[0];

/**
 * 조각 사이 번짐 막기. 삼각형을 UV 꼭짓점으로 이어 조각을 나누고 픽셀마다 조각 번호를 칠한 뒤,
 * 조각마다 사방에 GAP 픽셀 여백을 두고 새 텍스처에 다시 배치한다 (축소해도 이웃 조각 색이 섞이지 않게)
 */
async function cleanSeams(tex) {
  const GAP = 32;
  const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const uv = prim.getAttribute("TEXCOORD_0"), idx = prim.getIndices().getArray(), nt = idx.length / 3;
  // UV 가 같은 꼭짓점을 같은 점으로 묶어 삼각형을 조각으로 잇는다
  const par = Int32Array.from({ length: nt }, (_, i) => i), find = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  const owner = new Map(), t = [0, 0];
  for (let f = 0; f < nt; f++) for (let k = 0; k < 3; k++) {
    uv.getElement(idx[f * 3 + k], t); const key = Math.round(t[0] * 16384) + "," + Math.round(t[1] * 16384);
    const o = owner.get(key); if (o === undefined) owner.set(key, f); else par[find(f)] = find(o);
  }
  // 픽셀 가운데가 삼각형 안이면 그 조각 번호(+1). 0 은 여백
  const id = new Int32Array(N);
  const P = [[0, 0], [0, 0], [0, 0]];
  for (let f = 0; f < nt; f++) {
    for (let k = 0; k < 3; k++) { uv.getElement(idx[f * 3 + k], t); P[k][0] = t[0] * W - 0.5; P[k][1] = t[1] * H - 0.5; }
    const [a, b, c] = P, area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const g = find(f) + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const w0 = ((b[0] - x) * (c[1] - y) - (c[0] - x) * (b[1] - y)) / area, w1 = ((c[0] - x) * (a[1] - y) - (a[0] - x) * (c[1] - y)) / area;
      if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) id[y * W + x] = g;
    }
  }
  const out = data;
  // 다시 배치: Meshy 텍스처는 조각끼리 맞닿아 있어 여백을 채워도 축소하면 옆 조각 색이 섞인다.
  // 조각마다 상자(조각 + 사방 GAP)를 잘라 새 텍스처에 줄지어 놓고 UV 를 옮긴다. 상자 안 남는 자리는 이 조각 색으로 번져 채운다
  const vIsland = new Int32Array(uv.getCount());
  for (let f = 0; f < nt; f++) for (let k = 0; k < 3; k++) vIsland[idx[f * 3 + k]] = find(f) + 1;
  const boxes = new Map();
  for (let v = 0; v < uv.getCount(); v++) {
    const g = vIsland[v]; if (!g) continue; uv.getElement(v, t);
    const b = boxes.get(g) || [Infinity, Infinity, -Infinity, -Infinity]; boxes.set(g, b);
    b[0] = Math.min(b[0], t[0] * W); b[1] = Math.min(b[1], t[1] * H); b[2] = Math.max(b[2], t[0] * W); b[3] = Math.max(b[3], t[1] * H);
  }
  const rects = [...boxes].map(([g, [x0, y0, x1, y1]]) => { x0 = Math.floor(x0) - GAP; y0 = Math.floor(y0) - GAP; return { g, x0, y0, w: Math.ceil(x1) + GAP - x0, h: Math.ceil(y1) + GAP - y0 }; });
  rects.sort((a, b) => b.h - a.h);
  // 선반 쌓기: 너비 A 로 줄을 채우고, 높이가 A 를 넘지 않는 가장 작은 A
  let A = Math.ceil(Math.sqrt(rects.reduce((s, r) => s + r.w * r.h, 0)) / 64) * 64;
  for (;; A += 64) {
    let x = 0, y = 0, rowH = 0;
    for (const r of rects) { if (x + r.w > A) { x = 0; y += rowH; rowH = 0; } r.ax = x; r.ay = y; x += r.w; rowH = Math.max(rowH, r.h); }
    if (y + rowH <= A) break;
  }
  const atlas = Buffer.alloc(A * A * 3, 128);
  for (const { g, x0, y0, w, h, ax, ay } of rects) {
    const got = new Uint8Array(w * h), col = new Uint8Array(w * h * 3); let q = [];
    const src = (x, y) => (Math.min(H - 1, Math.max(0, y0 + y)) * W + Math.min(W - 1, Math.max(0, x0 + x)));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = src(x, y); if (id[p] === g && x0 + x === p % W && y0 + y === Math.floor(p / W)) { const l = y * w + x; got[l] = 1; col.set(out.subarray(p * 4, p * 4 + 3), l * 3); q.push(l); } }
    // 픽셀 가운데를 하나도 덮지 못한 아주 작은 조각은 원래 자리 색을 그대로 쓴다
    if (!q.length) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const l = y * w + x, p = src(x, y); got[l] = 1; col.set(out.subarray(p * 4, p * 4 + 3), l * 3); }
    while (q.length) {
      const next = [];
      for (const l of q) { const x = l % w; for (const r of [x > 0 ? l - 1 : -1, x < w - 1 ? l + 1 : -1, l - w, l + w]) if (r >= 0 && r < w * h && !got[r]) { got[r] = 1; col.copyWithin(r * 3, l * 3, l * 3 + 3); next.push(r); } }
      q = next;
    }
    for (let y = 0; y < h; y++) Buffer.from(col.buffer, y * w * 3, w * 3).copy(atlas, ((ay + y) * A + ax) * 3);
    boxes.get(g).push(ax - x0, ay - y0);
  }
  const moved = new Float32Array(uv.getCount() * 2);
  for (let v = 0; v < uv.getCount(); v++) {
    uv.getElement(v, t); const b = boxes.get(vIsland[v]), dx = b ? b[4] : 0, dy = b ? b[5] : 0;
    moved[v * 2] = (t[0] * W + dx) / A; moved[v * 2 + 1] = (t[1] * H + dy) / A;
  }
  uv.setArray(moved);
  tex.setImage(await sharp(atlas, { raw: { width: A, height: A, channels: 3 } }).png().toBuffer()).setMimeType("image/png");
  console.log("텍스처 조각", boxes.size, "개를 간격", GAP, "으로 다시 배치:", W, "→", A);
}
const mat = root.listMaterials()[0];
await cleanSeams(mat.getBaseColorTexture());

/**
 * 동작 만들기: 기본(리깅) 자세에서 뼈를 인형 기준 축(+x 왼쪽 · +y 위 · +z 앞)으로 돌려 장면마다 뼈 회전을 적는다.
 * 모든 동작이 모든 뼈 회전과 엉덩이 위치를 가진다 (동작끼리 무게로 섞을 때 빠진 뼈가 남지 않게)
 */
const obj = new Map();
for (const n of root.listNodes()) {
  const o = new THREE.Object3D(); o.name = n.getName();
  o.position.fromArray(n.getTranslation()); o.quaternion.fromArray(n.getRotation()); o.scale.fromArray(n.getScale()); obj.set(n, o);
}
for (const n of root.listNodes()) for (const c of n.listChildren()) obj.get(n).add(obj.get(c));
const skin = root.listSkins()[0], joints = skin.listJoints(), bone = Object.fromEntries(joints.map((j) => [j.getName(), obj.get(j)]));
const rest = new Map(joints.map((j) => [j, [obj.get(j).position.clone(), obj.get(j).quaternion.clone()]]));
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), _p = new THREE.Quaternion(), _q = new THREE.Quaternion();
/** 뼈를 인형 기준 축으로 ang 만큼 더 돌린다 (부모 뼈부터 차례로 부를 것) */
const turn = (name, axis, ang) => { const b = bone[name]; b.parent.getWorldQuaternion(_p); _q.setFromAxisAngle(axis, ang); b.quaternion.premultiply(_p.clone().invert().multiply(_q).multiply(_p)); };
const TAU = Math.PI * 2, sm = (x, a, b) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
// 서 있을 때 팔: 기본 자세(몸에서 45° 쯤)보다 조금 내려 몸 옆에. 걸을 때는 기본 자세보다 조금 더 벌린다 (+ 바깥)
const ARM_STAND = -0.3, ARM_WALK = 0.12;
const arms = (out) => { turn("LeftArm", Z, out); turn("RightArm", Z, -out); };
/** 다리 하나: swing(+ 앞으로 내딛기) · lift(발 들기, 무릎을 굽혀 발이 엉덩이 아래로 뜬다). 발바닥은 바닥과 나란히 둔다 */
const leg = (s, swing, lift) => { turn(s + "UpLeg", X, -(swing + lift)); turn(s + "Leg", X, 2 * lift); turn(s + "Foot", X, swing - lift); };
const POSES = {
  // 서 있기: 숨쉬듯 고개를 살짝 갸웃하고 팔(날개)을 아주 조금 들썩인다
  idle: { dur: 3.2, pose(t) { const w = Math.sin(TAU * t / 3.2); turn("Head", Z, 0.05 * w); arms(ARM_STAND + 0.04 * Math.max(0, Math.sin(TAU * t / 1.6))); } },
  // 아장아장: 몸통·머리·팔은 그대로(팔은 조금 벌림), 짧은 다리만 빠르게 번갈아 들었다 놓는다. 한 바퀴 = 두 걸음 (게임이 걸음에 맞춰 장면을 고른다)
  walk: { dur: 0.8, pose(t) {
    arms(ARM_WALK);
    for (const [s, ph] of [["Left", 0], ["Right", 0.5]]) { const a = TAU * (t / 0.8 + ph); leg(s, 0.28 * Math.sin(a), 0.32 * Math.max(0, Math.cos(a))); }
  } },
  // 안녕 (게임의 안녕 시간표 DOLL_WAVE_T 와 같게: 0.2~0.8 들기 · 2.7 까지 흔들기 · 3.4 까지 내리기, 4.1초). 첫·끝 장면은 서 있기와 같다
  wave: { dur: 4.1, pose(t) {
    const up = sm(t, 0.2, 0.8) * (1 - sm(t, 2.7, 3.4)), wag = Math.sin(TAU * (t - 0.8) * 2.2) * sm(t, 0.6, 0.9) * (1 - sm(t, 2.5, 2.8));
    turn("Head", Z, 0.08 * up);
    // 팔이 짧아 머리 옆까지 들면 귀마개에 가린다: 어깨 높이보다 조금 위로 옆으로 펴서 아래팔로 흔든다
    turn("LeftArm", Z, ARM_STAND); turn("RightArm", Z, -ARM_STAND - up * 1.75); turn("RightForeArm", Z, -up * 0.35 - wag * 0.5);
  } },
  // 털썩 앉기: 엉덩이를 내리고 짧은 다리를 앞으로 쭉 내밀어 발끝을 세운다 (아랫배가 허벅지 뼈에 붙어 있어 허벅지를 많이 들면 몸이 뒤로 젖혀진다).
  // 팔은 몸 옆에 두고 발을 번갈아 까딱인다
  sit: { dur: 3.2, hips: [0, -0.045, 0], pose(t) {
    turn("Head", Z, 0.04 * Math.sin(TAU * t / 3.2)); arms(ARM_STAND + 0.1);
    for (const [s, ph] of [["Left", 0], ["Right", 0.5]]) { turn(s + "UpLeg", X, -0.75); turn(s + "Leg", X, 0.1); turn(s + "Foot", X, -0.35 + 0.15 * Math.sin(TAU * (t / 1.6 + ph))); }
  } },
};
const FPS = 30;
for (const a of root.listAnimations()) { console.log("버림:", a.getName()); a.dispose(); }
for (const [name, { dur, pose, hips = [0, 0, 0] }] of Object.entries(POSES)) {
  const n = Math.round(dur * FPS) + 1, times = Float32Array.from({ length: n }, (_, i) => i / FPS);
  const rot = new Map(joints.map((j) => [j, new Float32Array(n * 4)])), hipsPos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (const [j, [p, r]] of rest) { obj.get(j).position.copy(p); obj.get(j).quaternion.copy(r); }
    bone.Hips.position.add(new THREE.Vector3(...hips).divideScalar(0.01)); // 뼈 단위는 cm (Armature 배율 0.01)
    pose(times[i]);
    for (const j of joints) obj.get(j).quaternion.toArray(rot.get(j), i * 4);
    bone.Hips.position.toArray(hipsPos, i * 3);
  }
  const anim = doc.createAnimation(name), input = doc.createAccessor().setType("SCALAR").setArray(times).setBuffer(buf);
  const add = (node, path, type, arr) => {
    const s = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType(type).setArray(arr).setBuffer(buf)).setInterpolation("LINEAR");
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(s));
  };
  for (const j of joints) add(j, "rotation", "VEC4", rot.get(j));
  add(joints.find((j) => j.getName() === "Hips"), "translation", "VEC3", hipsPos);
  console.log("동작", name, dur + "초");
}

for (const m of root.listMaterials()) m.setMetallicRoughnessTexture(null).setNormalTexture(null);
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const t = p.getAttribute("TANGENT"); if (t) { p.setAttribute("TANGENT", null); t.dispose(); } }
await doc.transform(textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [1024, 1024], quality: 88 }), prune(), dedup(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
await io.write(OUT, doc);
console.log("저장:", OUT);
