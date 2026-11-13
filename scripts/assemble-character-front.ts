/** Assemble imagegen's actual artwork into 64px game frames; no procedural repainting. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {Canvas,decodePng,encodePng,type RGBA} from './lib/png';
const file=process.argv[2];if(!file)throw Error('Provide the generated transparent PNG');
const src=decodePng(readFileSync(file)).canvas;
mkdirSync('assets/sprites/remake',{recursive:true});mkdirSync('docs/character-remake',{recursive:true});
writeFileSync('docs/character-remake/generated-front-source.png',readFileSync(file));
const report=[];
for(const [index,id] of ['female-longhair','male-handsome'].entries()){
 const left=Math.floor(index*src.width/2),right=Math.floor((index+1)*src.width/2);
 let x0=right,y0=src.height,x1=left,y1=0;
 for(let y=0;y<src.height;y++)for(let x=left;x<right;x++)if(src.get(x,y)[3]>=180){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 if(x1<=x0||y1<=y0)throw Error('Missing figure / invalid alpha');
 const scale=Math.min(58/(y1-y0+1),48/(x1-x0+1));
 const w=Math.round((x1-x0+1)*scale),h=Math.round((y1-y0+1)*scale),ox=Math.floor((64-w)/2),oy=62-h;
 const composite=new Canvas(64,64),body=new Canvas(64,64),outfit=new Canvas(64,64);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=src.get(Math.min(x1,x0+Math.floor((x+.5)/scale)),Math.min(y1,y0+Math.floor((y+.5)/scale)));
  if(p[3]<180)continue;
  const color:RGBA=[p[0],p[1],p[2],255],tx=ox+x,ty=oy+y;
  composite.set(tx,ty,color);
  // Long dark hair remains on body, including its side lengths. Outfit owns arms.
  const hair=index===0&&p[0]<100&&p[1]<100&&p[2]<115;
  const onBody=ty<29||ty>=59||hair;
  (onBody?body:outfit).set(tx,ty,color);
 }
 for(const [suffix,canvas]of [['composite',composite],['body',body],['outfit',outfit]] as const)writeFileSync(`assets/sprites/remake/${id}-front-${suffix}.png`,encodePng(canvas));
 report.push({id,sourceBounds:{x0,y0,x1,y1},frame:64,visible:{w,h},anchor:[32,64]});
}
writeFileSync('docs/character-remake/assembly.json',JSON.stringify(report,null,2)+'\n');
console.log(report);
