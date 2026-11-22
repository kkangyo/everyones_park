// Little Dreamer(파란 후드 긴 머리 소녀, Meshy 자동 리깅) 리깅 수정 (docs/meshy-character.md). 결과는 meshy-doll-clips.mjs 에 넣는다.
//   node scripts/fix-dreamer-rig.mjs <in.glb> <out.glb>
// 1. 소매가 딸려 올라감: 자동 리깅이 어깨·소매·후드 윗부분을 머리 뼈에 60~80% 붙여 놓아(기본 자세가 팔을 옆으로 편 T 자라 머리카락과 소매가 같은 높이),
//    걸으면서 팔을 내리면 소매 윗부분이 머리 쪽에 남아 위로 끌려 올라갔다. 옆머리 끝은 반대로 팔 뼈에 붙어 있었다.
//    머리카락(텍스처 갈색)이 아닌 꼭짓점 중 턱 아래(목~엉덩이 위)는 위치로 새로 칠한다:
//    몸통은 척추 높이 순, 소매는 팔 축을 따라 위팔 → 아래팔 → 손, 겨드랑이 사이는 섞는다. 엉덩이 아래로 갈수록 원래 무게로 되돌린다.
//    머리카락은 HAIR_Y 위는 머리 뼈 하나, 그 아래(등 뒤로 늘어진 끝)는 Spine2 → Spine1 쪽으로 섞는다.
//    같은 자리 꼭짓점(UV 이음매)은 위치로 칠하므로 같은 무게를 받는다.
// 2. 서 있기 동작이 없어(Walking · Running · Hello_Run 뿐) 기본 자세에서 팔을 몸 옆으로 내린 한 장면 Idle 을 만든다. 다리는 기본 자세 그대로.
// 필요한 패키지: @gltf-transform/core · extensions · sharp · three (저장소 의존성에 없어 따로 설치)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import * as THREE from "three";

const [IN, OUT] = process.argv.slice(2);
if (!IN || !OUT) throw new Error("사용법은 파일 머리 주석 참고");
const HAIR_Y = 0.64;   // 이 높이 위 머리카락은 머리 뼈 하나 (meshy-doll-clips.mjs 의 머리카락 최저 높이 인자와 같게)
const CHIN_Y = 0.69;   // 이 위(얼굴·후드 모자)는 원래 무게
const ARM_DOWN = 0.32; // 서 있기에서 위팔이 수직에서 벌어지는 각 (rad, 통통한 후드 옆에 닿을 만큼)

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(IN), root = doc.getRoot(), buf = root.listBuffers()[0];
const skin = root.listSkins()[0], joints = skin.listJoints();
const short = (n) => n.getName().replace(/^mixamorig:/, "");
const JI = Object.fromEntries(joints.map((j, k) => [short(j), k]));
// 기본 자세 뼈 위치(메시 좌표): 역바인드 행렬의 역
const ibm = skin.getInverseBindMatrices();
const B = Object.fromEntries(joints.map((j, k) => [short(j), new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm.getElement(k, [])).invert())]));
const sym = (n) => { const l = B["Left" + n], r = B["Right" + n]; return { x: (l.x - r.x) / 2, y: (l.y + r.y) / 2, z: (l.z + r.z) / 2 }; };
const ARM = sym("Arm"), ELB = sym("ForeArm"), WRI = sym("Hand");
const [yH, ySp, ySp1, ySp2, yNk] = ["Hips", "Spine", "Spine1", "Spine2", "Neck"].map((n) => B[n].y);
console.log("팔", ARM, "팔꿈치", ELB, "손목", WRI);

const sm = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
function chain(t, pts) {   // pts = [[값, 뼈]...] 오름차순, 이웃 두 뼈로 나눈다
  if (t <= pts[0][0]) return { [pts[0][1]]: 1 };
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, na] = pts[i], [b, nb] = pts[i + 1];
    if (t <= b) { const u = sm(a, b, t), d = { [na]: 1 - u }; d[nb] = (d[nb] || 0) + u; return d; }
  }
  return { [pts.at(-1)[1]]: 1 };
}
const add = (d, e, s) => { for (const [k, v] of Object.entries(e)) d[k] = (d[k] || 0) + v * s; };

// ---------- 1. 무게 ----------
const prim = root.listMeshes()[0].listPrimitives()[0];
const tex = prim.getMaterial().getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const UV = prim.getAttribute("TEXCOORD_0"), P = prim.getAttribute("POSITION"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0");
const idx = prim.getIndices().getArray(), N = P.getCount();
const color = (u, v) => { const x = Math.round(Math.min(1, Math.max(0, u)) * (info.width - 1)), y = Math.round(Math.min(1, Math.max(0, v)) * (info.height - 1)), o = (y * info.width + x) * 3; return [data[o], data[o + 1], data[o + 2]]; };
// 머리카락: 어두운 갈색 (피부는 빨강이 200 넘고, 후드·신발은 파랑이 빨강보다 크다)
const isHair = ([r, g, b]) => r < 175 && r - b > 35 && r >= g && g >= b - 5;
// 삼각형마다 가운데 색으로 머리카락인지 정한다.
// 어깨에 얹힌 머리카락 끝은 소매와 같은 꼭짓점을 쓰는 삼각형으로 이어져 있어, 머리카락은 머리·소매는 팔을 따라가면 그 사이가 막처럼 늘어난다:
// 머리카락 삼각형과 다른 삼각형이 같이 쓰는 꼭짓점은 복제해서 머리카락 삼각형만 복제본(머리카락 무게)을 쓰게 한다
const hairTri = new Uint8Array(idx.length / 3), use = new Uint8Array(N);   // use: 1 머리카락 삼각형 · 2 다른 삼각형
for (let t = 0; t < idx.length; t += 3) {
  const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]], ua = UV.getElement(a, []), ub = UV.getElement(b, []), uc = UV.getElement(c, []);
  const h = isHair(color((ua[0] + ub[0] + uc[0]) / 3, (ua[1] + ub[1] + uc[1]) / 3));
  hairTri[t / 3] = h ? 1 : 0;
  for (const i of [a, b, c]) use[i] |= h ? 1 : 2;
}
const clone = new Map();   // 원래 꼭짓점 -> 복제본 번호 (머리카락 쪽)
const both = [...use.keys()].filter((i) => use[i] === 3 && P.getElement(i, [])[1] < CHIN_Y + 0.05);
for (const [k, i] of both.entries()) clone.set(i, N + k);
for (const name of prim.listSemantics()) {   // 모든 꼭짓점 속성 끝에 복제본을 붙인다
  const a = prim.getAttribute(name), n = a.getElementSize(), src = a.getArray(), dst = new src.constructor((N + both.length) * n);
  dst.set(src); both.forEach((i, k) => dst.set(src.subarray(i * n, i * n + n), (N + k) * n)); a.setArray(dst);
}
const newIdx = new (both.length + N > 65535 ? Uint32Array : idx.constructor)(idx);
for (let t = 0; t < idx.length; t++) if (hairTri[(t / 3) | 0] && clone.has(idx[t])) newIdx[t] = clone.get(idx[t]);
prim.getIndices().setArray(newIdx);
const NN = N + both.length, isHairV = (i) => i >= N || use[i] === 1;
console.log(`머리카락·옷 경계 꼭짓점 복제 ${both.length}`);
function paint(p) {   // 턱 아래 몸통·소매·손의 새 무게
  const [x, y] = p, ax = Math.abs(x), side = x > 0 ? "Left" : "Right", w = {};
  const arm = sm(ARM.x - 0.035, ARM.x + 0.025, ax);
  if (arm > 0) add(w, chain(ax, [[ARM.x + 0.01, side + "Arm"], [ELB.x - 0.03, side + "Arm"], [ELB.x + 0.03, side + "ForeArm"], [WRI.x - 0.02, side + "ForeArm"], [WRI.x + 0.03, side + "Hand"]]), arm);
  const body = 1 - arm;
  if (body > 0) {
    // 어깨 위쪽 바깥은 쇄골 뼈가 조금 든다
    const sh = 0.4 * sm(0.06, ARM.x - 0.02, ax) * sm(ySp2 - 0.06, ySp2 + 0.02, y);
    add(w, chain(y, [[yH + 0.03, "Hips"], [ySp, "Spine"], [ySp1, "Spine1"], [ySp2, "Spine2"], [yNk + 0.01, "Neck"]]), body * (1 - sh));
    add(w, { [side + "Shoulder"]: 1 }, body * sh);
  }
  return w;
}
function hairW(y) {
  if (y >= HAIR_Y) return { Head: 1 };
  return chain(y, [[ySp1, "Spine1"], [ySp2 - 0.02, "Spine2"], [HAIR_Y, "Head"]]);
}
let nHair = 0, nBody = 0;
const ja = J.getArray(), wa = W.getArray();
for (let i = 0; i < NN; i++) {
  const p = P.getElement(i, []), hair = isHairV(i);
  let w;
  if (hair && p[1] > ySp1) { w = hairW(p[1]); nHair++; }
  else if (!hair && p[1] < CHIN_Y) {
    const k = sm(yH + 0.02, yH + 0.09, p[1]);   // 엉덩이 아래로 갈수록 원래 무게 (치마처럼 내려온 후드 밑단·다리)
    if (k <= 0) continue;
    const old = {}; for (let q = 0; q < 4; q++) if (W.getElement(i, [])[q] > 0) old[short(joints[J.getElement(i, [])[q]])] = (old[short(joints[J.getElement(i, [])[q]])] || 0) + W.getElement(i, [])[q];
    w = {}; add(w, old, 1 - k); add(w, paint(p), k); nBody++;
  } else continue;
  const top = Object.entries(w).filter(([, v]) => v > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4), s = top.reduce((a, [, v]) => a + v, 0);
  for (let q = 0; q < 4; q++) { const e = top[q]; ja[i * 4 + q] = e ? JI[e[0]] : JI[top[0][0]]; wa[i * 4 + q] = e ? e[1] / s : 0; }
}
J.setArray(ja); W.setArray(wa);
console.log(`머리카락 꼭짓점 ${nHair} · 다시 칠한 몸통·소매 꼭짓점 ${nBody} / ${NN}`);

// ---------- 2. 서 있기(Idle) 한 장면 ----------
{
  const nodes = root.listNodes(), obj = new Map();
  for (const n of nodes) { const o = new THREE.Object3D(); o.position.fromArray(n.getTranslation()); o.quaternion.fromArray(n.getRotation()); o.scale.fromArray(n.getScale()); obj.set(n, o); }
  for (const n of nodes) for (const c of n.listChildren()) obj.get(n).add(obj.get(c));
  for (const n of nodes) if (!nodes.some((m) => m.listChildren().includes(n))) obj.get(n).updateWorldMatrix(false, true);
  const find = (s) => obj.get(nodes.find((n) => short(n) === s));
  const wp = (o) => o.getWorldPosition(new THREE.Vector3()), wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const aim = (bone, tip, dir) => {
    const from = wp(tip).sub(wp(bone)).normalize();
    const world = new THREE.Quaternion().setFromUnitVectors(from, dir.clone().normalize()).multiply(wq(bone));
    bone.quaternion.copy(wq(bone.parent).invert().multiply(world)); bone.updateWorldMatrix(false, true);
  };
  for (const [side, s] of [["Left", 1], ["Right", -1]]) {
    const arm = find(side + "Arm"), fore = find(side + "ForeArm"), hand = find(side + "Hand");
    aim(arm, fore, new THREE.Vector3(s * Math.sin(ARM_DOWN), -Math.cos(ARM_DOWN), 0));
    aim(fore, hand, new THREE.Vector3(s * Math.sin(ARM_DOWN * 0.6), -Math.cos(ARM_DOWN * 0.6), 0.12));   // 아래팔은 조금 안쪽·앞으로
  }
  const anim = doc.createAnimation("Idle");
  const time = doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0])).setBuffer(buf);
  for (const n of joints) {
    const o = obj.get(n);
    for (const [path, v, type] of [["rotation", o.quaternion.toArray(), "VEC4"], ...(short(n) === "Hips" ? [["translation", o.position.toArray(), "VEC3"]] : [])]) {
      const s = doc.createAnimationSampler().setInput(time).setInterpolation("LINEAR").setOutput(doc.createAccessor().setType(type).setArray(new Float32Array(v)).setBuffer(buf));
      anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(n).setTargetPath(path).setSampler(s));
    }
  }
}
await io.write(OUT, doc);
console.log("저장", OUT);
