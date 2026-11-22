// 게임용 Meshy 인형(.glb)의 크림색 털을 흰색 쪽으로 (docs/meshy-character.md). 텍스처 색만 바꾸고 메시·동작은 그대로.
// 따뜻한 크림(빨강 >= 초록 >= 파랑, 밝고 파랑도 어느 정도 있는 색)만 채도를 줄이고 밝기를 올린다.
// 노란 옷처럼 파랑이 거의 없는 진한 노랑, 분홍 볼, 주황 부리·발, 남색·빨강은 건드리지 않는다.
//   node scripts/whiten-meshy-fur.mjs <in.glb> <out.glb> [남길 채도(기본 0.25)] [흰색 쪽으로 올릴 밝기(기본 0.5)]
//   예: node scripts/whiten-meshy-fur.mjs assets/models/meshy-penguin.glb assets/models/meshy-penguin.glb
// 필요한 패키지: @gltf-transform/core · extensions · meshoptimizer · sharp (저장소 의존성에 없어 따로 설치)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";

const [IN, OUT, CHROMA = "0.25", LIFT = "0.5"] = process.argv.slice(2);
if (!IN || !OUT) throw new Error("사용법은 파일 머리 주석 참고");
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(IN);
const sm = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };

for (const mat of doc.getRoot().listMaterials()) {
  const tex = mat.getBaseColorTexture(); if (!tex) continue;
  const { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let changed = 0;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!(r >= g && g >= b)) continue;
    // 크림: 초록이 밝고(노란 옷 176 근처는 빠짐) 파랑이 110 이상. 경계는 부드럽게 줄인다
    const k = sm(185, 205, g) * sm(100, 135, b) * (g - b >= 0.35 * (r - b) ? 1 : 0);
    if (k <= 0) continue;
    const L = 0.299 * r + 0.587 * g + 0.114 * b, L2 = L + (255 - L) * +LIFT;
    for (let c = 0; c < 3; c++) {
      const v = data[i + c], nv = L2 + (v - L) * +CHROMA;
      data[i + c] = Math.max(0, Math.min(255, Math.round(v + (nv - v) * k)));
    }
    changed++;
  }
  tex.setImage(await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer()).setMimeType("image/jpeg");
  console.log(`${mat.getName()}: 털 화소 ${changed} / ${info.width * info.height}`);
}
await io.write(OUT, doc);
console.log("저장", OUT);
