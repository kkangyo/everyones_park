import { readFileSync,writeFileSync } from "node:fs";
import { Canvas,decodePng,encodePng } from "../../../../scripts/lib/png";
const root="assets/sprites/review/female-ivory-dress-v2";
const load=(p:string)=>decodePng(readFileSync(`${root}/${p}`)).canvas;
const body=load("body-reference.png"),old=load("sources/before-outfit.png"),current=load("outfit-reference.png");
const rows=[0,1,4,16],comparison=new Canvas(1024,512);
comparison.rect(0,0,1024,512,[75,85,100,255]);
for(let version=0;version<2;version++)for(let i=0;i<4;i++)for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const b=body.get(x,rows[i]!*32+y),o=(version?current:old).get(x,rows[i]!*32+y),p=o[3]?o:b;
  const bg=[75,85,100],a=p[3]/255;
  const rgb=[0,1,2].map(k=>Math.round(p[k]!*a+bg[k]!*(1-a)));
  comparison.rect((i*32+x)*8,(version*32+y)*8,8,8,[rgb[0]!,rgb[1]!,rgb[2]!,255]);
}
writeFileSync(`${root}/before-after.png`,encodePng(comparison));
console.log("before-after.png: upper row before; lower row detailed dress.");
