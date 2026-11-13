import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Canvas, decodePng, encodePng, type RGBA } from "./lib/png";
import { HAND_SIDES, handGrip } from "../packages/shared/src/hand-rig";

const root = resolve("assets/sprites/reference-male/hand-rig-v1");
mkdirSync(root, { recursive: true });
for (const [source, backup] of [
  ["body-male-handsome.png", "before-body.png"],
  ["outfit-black-blazer-handsome.png", "before-outfit.png"],
] as const) {
  const path = resolve(root, backup);
  if (!existsSync(path)) writeFileSync(path, readFileSync(resolve("assets/sprites", source)));
}
const body = decodePng(readFileSync(resolve(root, "before-body.png"))).canvas;
const outfit = decodePng(readFileSync(resolve(root, "before-outfit.png"))).canvas;
const rows = [8,9,10,11,12,13,14,15,20,21,22,23];
const dirs = ["down","left","right","up","down-left","down-right","up-left","up-right","down","left","right","up"] as const;
const before = new Canvas(128,96);
const guide = new Canvas(128,96);
rows.forEach((row, i) => {
  const cx = i % 4 * 32, cy = Math.floor(i / 4) * 32;
  for (let y=0;y<32;y++) for(let x=0;x<32;x++) {
    const upper = outfit.get(x,row*32+y);
    const p = upper[3] ? upper : body.get(x,row*32+y);
    before.set(cx+x,cy+y,p);
    guide.set(cx+x,cy+y,p);
  }
  for (const side of HAND_SIDES) {
    const g = handGrip(dirs[i]!,side,row>=20);
    const color: RGBA = side === "left" ? [255,64,204,255] : [32,216,255,255];
    guide.set(cx+g.x,cy+g.y,color);
  }
});
function scale(canvas: Canvas, n: number): Canvas {
  const out = new Canvas(canvas.width*n,canvas.height*n);
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)out.rect(x*n,y*n,n,n,canvas.get(x,y));
  return out;
}
for(const [name,canvas] of [["carry-before.png",before],["carry-before-x8.png",scale(before,8)],["carry-grip-target-x8.png",scale(guide,8)]] as const)
  writeFileSync(resolve(root,name),encodePng(canvas));
console.log(root);
