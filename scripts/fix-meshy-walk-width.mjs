// Meshy 인형의 걷기 동작을 11자로 (docs/meshy-character.md). 알파카(fix-alpaca-rig.py 4번)와 같은 방법.
// Mixamo 걷기는 다리를 엉덩이 관절 바로 밑으로 곧게 내려서 통통한 허벅지·바지가 가운데서 겹쳐 X 자로 걷는 것처럼 보인다.
// 키마다 허벅지를 엉덩이 관절에서 앞뒤 축(z)으로 돌려 무릎을 목표 너비로 옮기고, 정강이·발은 원래 방향을 그대로 둔다
// (발 차올림 높이·발바닥 각도 유지). 다리가 벌어져 뜬 만큼 골반을 내려 땅을 딛는 발이 원래 높이에 오게 한다.
//   node scripts/fix-meshy-walk-width.mjs <in.glb> <out.glb> [무릎 너비(골반 중심에서 m, 기본: 서 있기 발목 너비)] [동작 이름들(기본 walk)]
//   예: node scripts/fix-meshy-walk-width.mjs assets/models/meshy-child.glb assets/models/meshy-child.glb
// 필요한 패키지: @gltf-transform/core · extensions · meshoptimizer · three (저장소 의존성에 없어 따로 설치)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import * as THREE from "three";

const [IN, OUT, WIDTH, CLIPS = "walk"] = process.argv.slice(2);
if (!IN || !OUT) throw new Error("사용법은 파일 머리 주석 참고");
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(IN), root = doc.getRoot(), buf = root.listBuffers()[0];
const by = Object.fromEntries(root.listNodes().map((n) => [n.getName().replace(/^mixamorig:/, ""), n]));
const parent = new Map(); for (const n of root.listNodes()) for (const c of n.listChildren()) parent.set(c, n);

const SIDES = ["Left", "Right"];
const LEG = (s) => [by[s + "UpLeg"], by[s + "Leg"], by[s + "Foot"]];

// 한 장면의 뼈 자세. over: 노드 -> { t, r } (없으면 기본 자세)
function poser(over) {
  const cache = new Map();
  const local = (n) => { const o = over.get(n) ?? {}; return new THREE.Matrix4().compose(new THREE.Vector3(...(o.t ?? n.getTranslation())), new THREE.Quaternion(...(o.r ?? n.getRotation())), new THREE.Vector3(...n.getScale())); };
  const wm = (n) => { if (!cache.has(n)) { const p = parent.get(n); cache.set(n, p ? wm(p).clone().multiply(local(n)) : local(n)); } return cache.get(n); };
  const wp = (n) => new THREE.Vector3().setFromMatrixPosition(wm(n));
  const wq = (n) => { const q = new THREE.Quaternion(); wm(n).decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };
  const ws = (n) => { const v = new THREE.Vector3(); wm(n).decompose(new THREE.Vector3(), new THREE.Quaternion(), v); return v; };
  return { wp, wq, ws, reset: () => cache.clear() };
}
function sample(ch, t) {
  const s = ch.getSampler(), inp = s.getInput(), o = s.getOutput(), n = inp.getCount();
  let i = 0; while (i < n - 1 && inp.getElement(i + 1, [])[0] <= t) i++;
  const a = o.getElement(i, []), b = o.getElement(Math.min(i + 1, n - 1), []);
  const t0 = inp.getElement(i, [])[0], t1 = inp.getElement(Math.min(i + 1, n - 1), [])[0];
  const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  if (ch.getTargetPath() === "rotation") return new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), u).toArray();
  return a.map((v, k) => v + (b[k] - v) * u);
}
const KEY = { translation: "t", rotation: "r", scale: "s" };
function frame(anim, t) {
  const over = new Map();
  for (const ch of anim.listChannels()) {
    const n = ch.getTargetNode(), e = over.get(n) ?? {}; e[KEY[ch.getTargetPath()]] = sample(ch, t); over.set(n, e);
  }
  return over;
}

// 목표 너비: 서 있기(idle) 첫 장면의 발목 너비 평균
const anims = Object.fromEntries(root.listAnimations().map((a) => [a.getName(), a]));
let width = +WIDTH;
if (!width) {
  const p = poser(frame(anims.idle, 0)), hx = p.wp(by.Hips).x;
  width = (Math.abs(p.wp(by.LeftFoot).x - hx) + Math.abs(p.wp(by.RightFoot).x - hx)) / 2;
}
console.log("무릎 목표 너비 ±" + width.toFixed(3));

for (const name of CLIPS.split(",")) {
  const anim = anims[name]; if (!anim) throw new Error("동작 없음: " + name);
  const chan = (node, path) => anim.listChannels().find((c) => c.getTargetNode() === node && c.getTargetPath() === path);
  // 다리 · 골반 채널의 키 시각을 모두 모은다
  const targets = [...SIDES.flatMap((s) => LEG(s).map((n) => [n, "rotation"])), [by.Hips, "translation"]];
  const times = new Set();
  for (const [n, p] of targets) { const c = chan(n, p); if (!c) throw new Error(`${name}: ${n.getName()} ${p} 채널 없음`); const inp = c.getSampler().getInput(); for (let i = 0; i < inp.getCount(); i++) times.add(+inp.getElement(i, [])[0].toFixed(5)); }
  const T = [...times].sort((a, b) => a - b);
  const out = new Map(targets.map(([n, p]) => [n.getName() + p, []]));
  let before = 0, after = 0;
  for (const t of T) {
    const over = frame(anim, t), p = poser(over);
    const hx = p.wp(by.Hips).x;
    const lift = {};
    for (const s of SIDES) {
      const [up, leg, foot] = LEG(s), sign = s === "Left" ? 1 : -1;
      before += Math.abs(p.wp(leg).x - hx);
      const oldY = p.wp(foot).y, qLeg = p.wq(leg), qFoot = p.wq(foot);
      // 허벅지: 엉덩이 관절에서 무릎까지의 xy 방향을 돌려 무릎 x 를 목표로 (z 축 회전)
      const o = p.wp(up), k = p.wp(leg), vx = k.x - o.x, vy = k.y - o.y, L = Math.hypot(vx, vy);
      const th = Math.asin(Math.max(-0.95, Math.min(0.95, (hx + sign * width - o.x) / L))) - Math.atan2(vx, -vy);
      const rz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), th);
      const setWorld = (n, qw) => { const e = over.get(n) ?? {}; e.r = p.wq(parent.get(n)).invert().multiply(qw).normalize().toArray(); over.set(n, e); p.reset(); };
      setWorld(up, rz.multiply(p.wq(up)));
      setWorld(leg, qLeg);     // 정강이는 원래 방향 그대로 옆으로만
      setWorld(foot, qFoot);   // 발 방향도 원래대로 (발바닥 수평)
      after += Math.abs(p.wp(leg).x - hx);
      lift[s] = [oldY, p.wp(foot).y];
    }
    const stance = SIDES.reduce((a, b) => (lift[a][0] <= lift[b][0] ? a : b)); // 땅을 딛는 발(원래 더 낮은 발)
    // 골반 이동은 부모 좌표(뼈대 배율 0.01 이면 cm)로 바꿔서 뺀다
    const ht = [...(over.get(by.Hips).t)]; ht[1] -= (lift[stance][1] - lift[stance][0]) / p.ws(parent.get(by.Hips)).y;
    for (const [n, path] of targets) out.get(n.getName() + path).push(...(path === "translation" ? ht : over.get(n).r));
  }
  // 고친 채널은 새 float 키로 바꾼다 (원래 키는 양자화돼 있을 수 있다)
  const input = doc.createAccessor().setType("SCALAR").setArray(new Float32Array(T)).setBuffer(buf);
  for (const [n, path] of targets) {
    const s = chan(n, path).getSampler();
    s.setInput(input).setInterpolation("LINEAR")
      .setOutput(doc.createAccessor().setType(path === "translation" ? "VEC3" : "VEC4").setArray(new Float32Array(out.get(n.getName() + path))).setBuffer(buf));
  }
  console.log(`${name}: 키 ${T.length} · 무릎 평균 너비 ${(before / T.length / 2).toFixed(3)} → ${(after / T.length / 2).toFixed(3)}`);
}
for (const a of root.listAccessors()) if (!a.listParents().some((p) => p !== root)) a.dispose();   // 안 쓰는 옛 키
await io.write(OUT, doc);
console.log("저장", OUT);
