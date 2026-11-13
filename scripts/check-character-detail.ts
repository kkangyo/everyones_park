import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodePng} from './lib/png';
import {FACES,OUTFITS,readAppearance} from '../packages/shared/src/character';
const grips=JSON.parse(readFileSync('apps/client/src/character-art-grips.json','utf8'));
for(const gender of ['female','male'] as const){
 assert.equal(FACES[gender].length,1);assert.equal(OUTFITS[gender].length,1);
 const id=FACES[gender][0]!,b=decodePng(readFileSync(`assets/sprites/body-${id}.png`)),o=decodePng(readFileSync(`assets/sprites/outfit-${OUTFITS[gender][0]}.png`));
 for(const p of [b,o]){assert.equal(p.canvas.width,256);assert.equal(p.canvas.height,1792);assert.ok(p.hasAlpha);}
 let occupied=0;
 for(let row=0;row<28;row++)for(let col=0;col<4;col++){
  let count=0;
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
   const bp=b.canvas.get(col*64+x,row*64+y),op=o.canvas.get(col*64+x,row*64+y);
   assert.ok(!(bp[3]&&op[3]),`Layer overlap ${id} ${row}:${col}`);
   if(bp[3]||op[3])count++;
  }
  assert.ok(count>100,`Empty/small frame ${id} ${row}:${col}`);occupied++;
 }
 for(const [key,hands]of Object.entries(grips[id]) as [string,Record<string,{x:number;y:number}>][]){
  const [row,col]=key.split(':').map(Number);
  for(const p of Object.values(hands))assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<16&&p.y<0&&p.y>=-32,`${id} grip ${row}:${col}`);
 }
 console.log(`${id}: ${occupied} nonempty 64px frames, separate body/outfit layers, ${Object.keys(grips[id]).length} per-frame hand mappings`);
}
assert.equal(readAppearance({gender:'female',face:'female',outfit:'coat-pink'})?.face,'female-longhair');
assert.equal(readAppearance({gender:'male',face:'male',outfit:'padding-orange'})?.face,'male-handsome');
