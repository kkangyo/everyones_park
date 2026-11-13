/** Verify the persisted PNG edit, independent of the assembly execution. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodePng } from "./lib/png";
import { HAND_SIDES, handGrip } from "../packages/shared/src/hand-rig";
const root="assets/sprites/reference-male/hand-rig-v1";
const bodyBytes=readFileSync("assets/sprites/body-male-handsome.png");
assert.deepEqual(bodyBytes,readFileSync(`${root}/before-body.png`),"Original body/head/shoes changed");
const body=decodePng(bodyBytes).canvas;
const before=decodePng(readFileSync(`${root}/before-outfit.png`)).canvas;
const result=decodePng(readFileSync("assets/sprites/outfit-black-blazer-handsome.png"));
const outfit=result.canvas;
assert.equal(outfit.width,128);assert.equal(outfit.height,896);assert.ok(result.hasAlpha);
const preview=decodePng(readFileSync("assets/sprites/preview-male-handsome.png")).canvas;
const rows=[8,9,10,11,12,13,14,15,20,21,22,23];
const dirs=["down","left","right","up","down-left","down-right","up-left","up-right","down","left","right","up"] as const;
let visibleGrips=0, warmPixels=0, changedPixels=0;
for(let y=0;y<896;y++)for(let x=0;x<128;x++) {
  const row=Math.floor(y/32),col=Math.floor(x/32),ly=y%32;
  const band=rows.includes(row)&&ly>=(row>=20?22:19)-col%2&&ly<=(row>=20?28:26);
  const p=outfit.get(x,y), old=before.get(x,y), b=body.get(x,y);
  if(!band)assert.deepEqual(p,old,`Unrelated pixel changed: ${x},${y}`);
  if(p.some((c,i)=>c!==old[i]))changedPixels++;
  assert.deepEqual(preview.get(x,y),p[3]?p:b,`Preview mismatch: ${x},${y}`);
  if(band&&p[3]&&p[0]>100&&p[0]-p[2]>32) {
    warmPixels++;
    const dir=dirs[rows.indexOf(row)]!;
    assert.ok(!["up","up-left","up-right"].includes(dir),`Visible hand over back: ${row}:${col}`);
    const nearGrip=HAND_SIDES.some(side=>{const g=handGrip(dir,side,row>=20,col);return Math.abs(x%32-g.x)<=1&&Math.abs(ly-g.y)<=1});
    assert.ok(nearGrip,`Obsolete skin hand remains at ${row}:${col} ${x%32},${ly}`);
  }
}
for(let i=0;i<rows.length;i++)for(let col=0;col<4;col++) {
  const row=rows[i]!,dir=dirs[i]!;
  if(["up","up-left","up-right"].includes(dir))continue;
  for(const side of HAND_SIDES) {
    const g=handGrip(dir,side,row>=20,col);
    assert.deepEqual(outfit.get(col*32+g.x,row*32+g.y),[224,192,160,255]);
    assert.equal(body.get(col*32+g.x,row*32+g.y)[3],0,"Palm incorrectly belongs to body layer");
    visibleGrips++;
  }
}
assert.equal(visibleGrips,64);
assert.ok(changedPixels>0);assert.ok(warmPixels>0);
console.log(`OK: ${visibleGrips} visible grips, ${warmPixels} skin pixels at valid palms, ${changedPixels} corrected pixels; original body/other poses preserved`);
