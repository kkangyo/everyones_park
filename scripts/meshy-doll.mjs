// Meshy 인형 한 벌을 게임용 GLB 하나로 (docs/meshy-character.md): 동작 묶음(sit·wave) + 걷기·뛰기를 합치고,
// 서 있기(idle)를 안녕 첫 장면으로 만들고, 머리카락을 머리 뼈에만 붙이고, 걷기·뛰기의 엉덩이·허리 흔들림을 줄인 뒤
// 텍스처 512 JPEG · 양자화 · meshopt 로 줄인다.
// node scripts/meshy-doll.mjs <merged.glb> <walking.glb> <running.glb> <out.glb>
// 필요한 패키지는 저장소 의존성에 없다. 따로 설치해서 쓴다:
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer sharp
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, quantize, meshopt, textureCompress, resample } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import fs from "node:fs";

const [MERGED, WALK, RUN, OUT] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const NAMES = { Idle: "idle", Chair_Sit_Idle_F: "sit", Wave_One_Hand: "wave" };
// 흔들림을 줄일 뼈와 남길 비율 (1 = 그대로, 0 = 평균 자세로 고정)
const CALM = { Hips: 0.35, Spine: 0.45, Spine01: 0.5, Spine02: 0.55 };

const doc = await io.read(MERGED);
const root = doc.getRoot(), buf = root.listBuffers()[0];
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
for (const a of root.listAnimations()) a.setName(NAMES[a.getName()] ?? a.getName());
const copy = (a) => doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setBuffer(buf);

/** 쿼터니언 배열을 평균 쪽으로 k 만큼만 남긴다 (nlerp) */
function calm(arr, k) {
  const n = arr.length / 4, m = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) { const s = Math.sign(arr[i * 4] * arr[0] + arr[i * 4 + 1] * arr[1] + arr[i * 4 + 2] * arr[2] + arr[i * 4 + 3] * arr[3]) || 1; for (let c = 0; c < 4; c++) m[c] += arr[i * 4 + c] * s; }
  let l = Math.hypot(...m); for (let c = 0; c < 4; c++) m[c] /= l;
  for (let i = 0; i < n; i++) {
    const q = arr.subarray(i * 4, i * 4 + 4), s = Math.sign(q[0] * m[0] + q[1] * m[1] + q[2] * m[2] + q[3] * m[3]) || 1;
    for (let c = 0; c < 4; c++) q[c] = m[c] + (q[c] * s - m[c]) * k;
    l = Math.hypot(q[0], q[1], q[2], q[3]); for (let c = 0; c < 4; c++) q[c] /= l;
  }
}
/**
 * 서 있기: Meshy Idle 은 고개·몸을 돌리며 둘러보고 첫 장면도 한 발이 앞에 있어서 쓰지 않는다.
 * 대신 안녕 동작의 첫 장면(0초: 정면을 보고 두 발을 나란히, 두 팔은 내림)을 한 장면짜리 idle 로 만든다 (숨쉬기는 게임 코드에서)
 */
{
  const anims = root.listAnimations(), wave = anims.find((a) => a.getName() === "wave");
  anims.find((a) => a.getName() === "idle")?.dispose();
  const idle = doc.createAnimation("idle");
  for (const ch of wave.listChannels()) {
    const out = ch.getSampler().getOutput(), k = out.getElementSize();
    const s = doc.createAnimationSampler().setInterpolation("LINEAR")
      .setInput(doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0])).setBuffer(buf))
      .setOutput(doc.createAccessor().setType(out.getType()).setArray(out.getArray().slice(0, k)).setBuffer(buf));
    idle.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(ch.getTargetPath()).setSampler(s));
  }
}
for (const [file, name] of [[WALK, "walk"], [RUN, "run"]]) {
  const src = (await io.read(file)).getRoot().listAnimations()[0], anim = doc.createAnimation(name);
  for (const ch of src.listChannels()) {
    const s = ch.getSampler(), node = byName.get(ch.getTargetNode().getName()); if (!node) continue;
    const out = copy(s.getOutput()), bone = node.getName();
    if (ch.getTargetPath() === "rotation" && CALM[bone] !== undefined) { const arr = out.getArray(); calm(arr, CALM[bone]); out.setArray(arr); }
    const sampler = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(out).setInterpolation(s.getInterpolation());
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(sampler));
  }
}
// 머리카락은 머리 뼈만 따라가게: 자동 리깅이 옆머리 끝을 팔뚝 뼈에도 붙여서, 팔을 들면 머리카락이 끌려 올라가 팔과 겹친다.
// 텍스처 색이 머리카락(어두운 갈색)이고 어깨보다 위(T자 자세 기준 y > 0.42)인 꼭짓점을 Head 하나에 붙인다
{
  const prim = root.listMeshes()[0].listPrimitives()[0], tex = prim.getMaterial().getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const head = root.listSkins()[0].listJoints().findIndex((j) => j.getName() === "Head");
  const uv = prim.getAttribute("TEXCOORD_0"), P = prim.getAttribute("POSITION"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0");
  const ja = J.getArray(), wa = W.getArray(), idx = prim.getIndices().getArray(); let n = 0;
  // 꼭짓점 하나의 색은 텍스처 조각 가장자리에서 옆 색(갈색)을 집을 수 있어, 삼각형 가운데 색으로 판정하고
  // 둘러싼 삼각형이 모두 머리카락인 꼭짓점만 고른다 (장갑·소맷단이 뾰족하게 끌려가지 않게)
  const hairTri = (a, b, c) => {
    const [u1, v1] = uv.getElement(a, []), [u2, v2] = uv.getElement(b, []), [u3, v3] = uv.getElement(c, []);
    const x = Math.round(Math.min(1, Math.max(0, (u1 + u2 + u3) / 3)) * (info.width - 1)), y = Math.round(Math.min(1, Math.max(0, (v1 + v2 + v3) / 3)) * (info.height - 1)), o = (y * info.width + x) * 4;
    const r = data[o], g = data[o + 1], bl = data[o + 2];
    return r < 205 && r - g > 45 && g - bl > 20;
  };
  const hair = new Int8Array(P.getCount()); // 0 = 아직, 1 = 머리카락만, −1 = 다른 것이 섞임
  for (let t = 0; t < idx.length; t += 3) { const h = hairTri(idx[t], idx[t + 1], idx[t + 2]); for (let k = 0; k < 3; k++) { const i = idx[t + k]; hair[i] = !h ? -1 : hair[i] === 0 ? 1 : hair[i]; } }
  for (let i = 0; i < P.getCount(); i++) {
    if (hair[i] !== 1 || P.getElement(i, [])[1] <= 0.42) continue;
    ja.set([head, 0, 0, 0], i * 4); wa.set([1, 0, 0, 0], i * 4); n++;
  }
  J.setArray(ja); W.setArray(wa); console.log("머리카락 꼭짓점 → Head:", n);
}
// 툰 음영에는 쓰지 않는 접선 지우기
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const t = p.getAttribute("TANGENT"); if (t) { p.setAttribute("TANGENT", null); t.dispose(); } }
await doc.transform(textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [512, 512], quality: 85 }), resample({ tolerance: 0.0005 }), prune(), dedup(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(OUT, doc);
console.log(OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + " KB", root.listAnimations().map((a) => a.getName()).join(", "));
