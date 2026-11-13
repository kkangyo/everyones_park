import { readFileSync,writeFileSync } from "node:fs";
import { Canvas,decodePng,encodePng } from "../../../../scripts/lib/png";
const root="assets/sprites/review/female-ivory-dress-v2";
const body=decodePng(readFileSync(`${root}/body-reference.png`)).canvas;
const before=decodePng(readFileSync(`${root}/sources/before-outfit.png`)).canvas;
const male=decodePng(readFileSync("assets/sprites/outfit-black-blazer-handsome.png")).canvas;
const rows=[0,1,2,3,4,5,6,7,16,17,18,19,24,25,26,27];
for(const mode of ["before","body","blazer-detail"] as const){
  const atlas=new Canvas(1024,1024);
  for(let i=0;i<16;i++)for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const upper=(mode==="blazer-detail"?male:before).get(x,rows[i]!*32+y);
    const lower=body.get(x,rows[i]!*32+y);
    const p=mode==="body"?lower:mode==="blazer-detail"?upper:upper[3]?upper:lower;
    atlas.rect((i%4*32+x)*8,(Math.floor(i/4)*32+y)*8,8,8,p);
  }
  writeFileSync(`${root}/sources/${mode}-x8.png`,encodePng(atlas));
}
console.log("Prepared 16 base views and black blazer detail reference.");
