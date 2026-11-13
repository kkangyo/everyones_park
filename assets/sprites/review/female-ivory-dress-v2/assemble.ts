/** Detailed dress assembly. The existing female body and every carry grip are fixed. */
import { readFileSync,writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { Canvas,decodePng,encodePng,type RGBA } from "../../../../scripts/lib/png";
const root="assets/sprites/review/female-ivory-dress-v2";
const body=decodePng(readFileSync(`${root}/body-reference.png`)).canvas;
const before=decodePng(readFileSync(`${root}/sources/before-outfit.png`)).canvas;
const art=decodePng(readFileSync(`${root}/sources/generated-dress.png`)).canvas;
const outfit=new Canvas(128,896);
const C={edge:[108,87,73,255],fold:[157,135,108,255],mid:[198,178,146,255],cream:[227,211,181,255],ivory:[245,235,213,255],shine:[255,250,235,255],gold:[194,155,76,255],clear:[0,0,0,0]} as const satisfies Record<string,RGBA>;
const cloth=[C.edge,C.fold,C.mid,C.cream,C.ivory,C.shine];
const skin=new Set(["245,214,194","255,229,212","230,185,160","207,151,132"]);
const hair=new Set(["17,19,26","29,31,40","45,47,59","65,68,82","86,89,103"]);
const shoes=new Set(["37,39,50","59,62,72"]);
const dirs=["down","left","right","up","down-left","down-right","up-left","up-right"] as const;
type Dir=(typeof dirs)[number];
const torso:Record<Dir,[number,number]>={down:[10,12],left:[12,9],right:[11,9],up:[10,13],"down-left":[10,11],"down-right":[11,11],"up-left":[11,11],"up-right":[10,11]};
function sample(cell:number,x:number,y:number):RGBA {
  const p=art.get(Math.floor((cell%4*32+x+.5)*art.width/128),Math.floor((Math.floor(cell/4)*32+y+.5)*art.height/128));
  if(p[3]<180)return [...C.ivory];
  let q=cloth[0]!,best=Infinity;
  for(const v of cloth){const d=(v[0]-p[0])**2+(v[1]-p[1])**2+(v[2]-p[2])**2;if(d<best){q=v;best=d;}}
  return [...q] as RGBA;
}
function skirtRange(dir:Dir,y:number):[number,number] {
  const k=Math.max(0,Math.min(3,y-24));
  if(dir==="left")return [13-k,20+Math.min(2,k)];
  if(dir==="right"){const [l,r]=skirtRange("left",y);return[31-r,31-l];}
  if(dir==="down-left")return[11-k,19+k];
  if(dir==="down-right"){const[l,r]=skirtRange("down-left",y);return[31-r,31-l];}
  if(dir==="up-left")return[12-k,20+k];
  if(dir==="up-right"){const[l,r]=skirtRange("up-left",y);return[31-r,31-l];}
  return[11-k,20+k];
}
function paintSkirt(c:Canvas,dir:Dir,col:number,seated:boolean,source:number):void {
  const lift=col%2;
  for(let y=(seated?27:24)-lift;y<=28;y++){
    let [l,r]=skirtRange(dir,Math.max(24,y));
    if(seated){
      if(dir==="left"){l=y>=27?7:12;r=y===28?21:20;}
      else if(dir==="right"){const left=y>=27?7:12,right=y===28?21:20;l=31-right;r=31-left;}
      else{l=y===28?9:10;r=y===28?22:21;}
    }
    for(let x=l;x<=r;x++){
      const p=sample(source,x,y);
      // Intentional continuous pleats, not a flat rectangle or random dither.
      const span=r-l,first=l+Math.max(2,Math.round(span*.27)),second=l+Math.round(span*.66);
      const fold=x===first||x===second;
      const highlight=x===first-1||x===second-1;
      let color:RGBA=p;
      if(x===l||x===r)color=[...C.fold];
      else if(fold)color=[...C.mid];
      else if(highlight)color=[...C.shine];
      if(y===28)color=[...((x===l||x===r||fold)?C.edge:C.fold)];
      if(y===27&&!fold&&x>l&&x<r)color=[...C.ivory];
      c.set(x,y,color);
    }
    if(seated&&y===27){
      // Fold following the lap/thigh projection; keep this hem stationary.
      if(dir==="left")c.rect(8,27,7,1,C.fold);
      if(dir==="right")c.rect(17,27,7,1,C.fold);
    }
  }
}
function dress(dir:Dir,col:number,seated:boolean):Canvas {
  const c=new Canvas(32,32),lift=col%2,source=seated?8+dirs.indexOf(dir):dirs.indexOf(dir);
  const [tx,tw]=torso[dir],top=seated?22:19,waist=seated?26:23;
  for(let sy=top;sy<=waist;sy++){
    const inset=Math.min(2,Math.floor((sy-top+1)/2)),l=tx+inset,r=tx+tw-1-inset;
    for(let x=l;x<=r;x++){
      let color=sample(source,x,sy);
      if(x===l||x===r)color=[...C.fold];
      if(x===l+1&&sy<waist)color=[...C.shine];
      if(x===r-1&&sy>top)color=[...C.mid];
      if(sy===waist)color=[...((x===l||x===r)?C.edge:C.fold)];
      c.set(x,sy-lift,color);
    }
  }
  const back=dir==="up"||dir.startsWith("up-");
  if(!back){
    const nx=dir==="down"?15:dir==="left"||dir==="down-left"?13:17;
    c.rect(nx,top-lift,2,2,C.clear);
    c.set(nx-1,top+1-lift,C.mid);c.set(nx+2,top+1-lift,C.fold);
    c.set(nx,top+2-lift,C.cream);c.set(nx+1,top+2-lift,C.gold);
  }
  paintSkirt(c,dir,col,seated,source);
  return c;
}
function lieXY(dir:Dir,x:number,y:number):[number,number]{
  return dir==="left"?[x,y]:dir==="right"?[31-x,y]:dir==="down"?[y-7,32-x]:[38-y,x+4];
}
for(let row=0;row<28;row++)for(let col=0;col<4;col++){
  const seated=row>=16&&row<24,dir=dirs[row>=24?row-24:seated?(row-16)%4:row%8]!;
  let cell:Canvas;
  if(row<24)cell=dress(dir,col,seated);
  else{
    cell=new Canvas(32,32);const set=(x:number,y:number,p:RGBA)=>{const[xx,yy]=lieXY(dir,x,y);cell.set(xx,yy,p);};
    // Same fitted bodice and flared skirt, projected along the lying body axis.
    for(let x=15;x<=24;x++){
      const half=x<19?5:x===19?3:Math.min(7,x-16),l=23-half,r=23+half;
      for(let y=l;y<=r;y++){
        let p=sample(13,x,y);
        if(y===l||y===r)p=[...C.fold];
        if(x===19)p=[...C.edge];
        if(x>=20&&(y===20||y===26))p=[...C.mid];
        if(x>=20&&(y===19||y===25))p=[...C.shine];
        if(x===24)p=[...(y%3===0?C.edge:C.fold)];
        set(x,y,p);
      }
    }
    for(let x=15;x<=16;x++)for(let y=22;y<=23;y++)set(x,y,[...C.clear]);
    set(17,23,[...C.gold]);
    // Chest highlight lifts internally; arms and hem do not slide when inhaling.
    if(col%2===1){set(17,18,[...C.shine]);set(18,18,[...C.shine]);}
  }
  const chin=(seated?21:18)-col%2;
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const b=body.get(col*32+x,row*32+y),key=b.slice(0,3).join();
    if(b[3]&&(hair.has(key)||skin.has(key)||shoes.has(key)))cell.set(x,y,[...C.clear]);
    if(row<24&&y<=chin)cell.set(x,y,[...C.clear]);
    // Existing exposed arms/palms stay exact. Supine uses the base resting arms.
    const arm=before.get((row>=24?0:col)*32+x,row*32+y);
    if(arm[3]&&skin.has(arm.slice(0,3).join()))cell.set(x,y,arm);
    const p=cell.get(x,y);if(p[3])outfit.set(col*32+x,row*32+y,p);
  }
}
assert.equal(outfit.width,128);assert.equal(outfit.height,896);
writeFileSync(`${root}/outfit-reference.png`,encodePng(outfit));
console.log("Detailed ivory dress: 112 frames; body unchanged; original arm/grip pixels retained.");
