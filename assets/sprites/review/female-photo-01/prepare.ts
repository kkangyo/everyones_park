import { readFileSync,writeFileSync } from "node:fs";
import { Canvas,decodePng,encodePng } from "../../../../scripts/lib/png";
const root="assets/sprites/review/female-photo-01";
const src=decodePng(readFileSync("docs/character-size-guide.png")).canvas;
const rows=[0,1,2,3,4,5,6,7,24,25,26,27];
const body=new Canvas(128,96);
for(let i=0;i<rows.length;i++)for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const p=src.get(x,rows[i]!*32+y);
  const bodyColors=["123,97,201","245,201,160","34,34,34","76,175,106","47,107,64","154,154,154"];
  if(bodyColors.includes(p.slice(0,3).join()))body.set(i%4*32+x,Math.floor(i/4)*32+y,p);
}
const enlarged=new Canvas(1024,768);
for(let y=0;y<96;y++)for(let x=0;x<128;x++)enlarged.rect(x*8,y*8,8,8,body.get(x,y));
writeFileSync(`${root}/sources/body-base-guide.png`,encodePng(body));
writeFileSync(`${root}/sources/body-base-guide-x8.png`,encodePng(enlarged));
console.log("Prepared 12 body-pose guide cells.");
const outfitRows=[0,1,2,3,4,5,6,7,16,17,18,19,24,25,26,27];
const outfitGuide=new Canvas(1024,1024);
for(let i=0;i<16;i++)for(let y=0;y<32;y++)for(let x=0;x<32;x++)
  outfitGuide.rect((i%4*32+x)*8,(Math.floor(i/4)*32+y)*8,8,8,src.get(x,outfitRows[i]!*32+y));
writeFileSync(`${root}/sources/outfit-base-guide-x8.png`,encodePng(outfitGuide));
