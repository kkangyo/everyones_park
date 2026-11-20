// 원본 동작 GLB의 서 있기·안녕 하체만 수정. 텍스처와 다른 동작은 유지한다.
// 패키지 설치는 meshy-doll-clips.mjs 참고. 추가 패키지: three
// node scripts/fix-meshy-standing.mjs <in.glb> <out.glb>
import { NodeIO } from "@gltf-transform/core";
import { prune } from "@gltf-transform/functions";
import { applyStandingPose } from "./lib/standing-pose.mjs";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("입력·출력 GLB 경로를 지정하세요");
const io = new NodeIO(), doc = await io.read(input);
const animations = doc.getRoot().listAnimations().filter(a => ["Idle_9", "Wave_One_Hand"].includes(a.getName()));
if (animations.length !== 2) throw new Error("Idle_9·Wave_One_Hand 동작이 필요합니다");
console.log("서 있기·안녕 하체 보정:", applyStandingPose(doc, animations), "채널");
await doc.transform(prune());
await io.write(output, doc);
