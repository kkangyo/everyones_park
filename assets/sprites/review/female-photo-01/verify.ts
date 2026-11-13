import assert from "node:assert/strict";
import { readFileSync,writeFileSync } from "node:fs";
import { decodePng } from "../../../../scripts/lib/png";
import { HAND_SIDES,handGrip } from "../../../../packages/shared/src/hand-rig";
const root="assets/sprites/review/female-photo-01";
const load=(file:string)=>decodePng(readFileSync(`${root}/${file}`));
const body=load("body-reference.png"),outfit=load("outfit-reference.png");
const palette=new Set<string>();let semitransparent=0,transparent=0,grips=0;
for(const png of [body,outfit]){
  assert.equal(png.colorType,6);assert.equal(png.canvas.width,128);assert.equal(png.canvas.height,896);
  const d=png.canvas.data;
  for(let i=0;i<d.length;i+=4){const p=Array.from(d.subarray(i,i+4));if(!p[3]){transparent++;continue;}palette.add(p.join());if(p[3]!==255){assert.deepEqual(p,[0,0,0,48],"Only ground shadows may be translucent");semitransparent++;}}
  for(let row=0;row<28;row++)for(let col=0;col<4;col++){
    let count=0;for(let y=0;y<32;y++)for(let x=0;x<32;x++)count+=png.canvas.get(col*32+x,row*32+y)[3]>0?1:0;
    assert.ok(count>0,`Empty cell ${row}:${col}`);
  }
}
assert.ok(transparent>0);assert.ok(palette.size<=24,`Palette ${palette.size} >24`);
const dirs=["down","left","right","up","down-left","down-right","up-left","up-right"] as const;
for(const row of [...Array.from({length:8},(_,i)=>i+8),20,21,22,23]){
  const dir=dirs[row>=20?row-20:row-8]!;
  for(let col=0;col<4;col++){
    if(!["up","up-left","up-right"].includes(dir))for(const hand of HAND_SIDES){
      const g=handGrip(dir,hand,row>=20,col);
      assert.deepEqual(outfit.canvas.get(col*32+g.x,row*32+g.y),[245,214,194,255],`${row}:${col} ${hand}`);grips++;
    }
    const source=row>=20?row-4:row-8;
    for(let y=0;y<32;y++)for(let x=0;x<32;x++)assert.deepEqual(body.canvas.get(col*32+x,row*32+y),body.canvas.get(col*32+x,source*32+y),"Body changed for a carry pose");
  }
}
for(let row=0;row<24;row++)for(let col=0;col<4;col++){
  const chin=(row>=16?21:18)-col%2;
  for(let y=0;y<=chin;y++)for(let x=0;x<32;x++)assert.equal(outfit.canvas.get(col*32+x,row*32+y)[3],0,"Garment overlaps head/face");
}
for(let row=0;row<16;row++)for(const png of [body,outfit])for(let y=0;y<32;y++)for(let x=0;x<32;x++)assert.deepEqual(png.canvas.get(x,row*32+y),png.canvas.get(64+x,row*32+y),"Neutral columns 0/2 differ");
assert.equal(grips,64);
const report={format:"RGBA8",dimensions:[128,896],cellsPerLayer:112,visibleGrips:grips,paletteColors:palette.size,transparentPixels:transparent,shadowPixels:semitransparent,headOutfitOverlap:0,carryBodyMatchesNormal:true,neutralColumnsMatch:true};
writeFileSync(`${root}/pixel-check.json`,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report));
