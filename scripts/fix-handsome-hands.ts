/**
 * Assemble the imagegen arm correction into native cells, then snap visible palms
 * to hand-rig v1. Source heads, body, feet and non-carry poses are never rescaled.
 * Run prepare-handsome-hand-edit.ts once, generate carry-edited.png with the saved
 * edit-prompt.txt, then: pnpm exec tsx scripts/fix-handsome-hands.ts
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { HAND_SIDES, handDrawOrder, handGrip } from "../packages/shared/src/hand-rig";
import { Canvas, decodePng, encodePng, type RGBA } from "./lib/png";

const root = resolve("assets/sprites/reference-male/hand-rig-v1");
const load = (name: string) => decodePng(readFileSync(resolve(root,name))).canvas;
const body = load("before-body.png"), before = load("before-outfit.png"), edit = load("carry-edited.png");
const out = new Canvas(before.width,before.height);
out.data.set(before.data);
const preview = new Canvas(128,896);
const rows = [8,9,10,11,12,13,14,15,20,21,22,23];
const dirs = ["down","left","right","up","down-left","down-right","up-left","up-right","down","left","right","up"] as const;
const clear: RGBA = [0,0,0,0];
const ink: RGBA = [16,16,16,255], coat: RGBA = [32,32,32,255], seam: RGBA = [48,48,48,255];
const skin: RGBA = [224,192,160,255], skinLight: RGBA = [240,208,176,255], skinShade: RGBA = [192,144,112,255];
const palette = new Map<string,RGBA>();
for(let i=0;i<before.data.length;i+=4) {
  const p = Array.from(before.data.subarray(i,i+4)) as RGBA;
  if(p[3]===255 && Math.max(...p.slice(0,3))<=80)palette.set(p.join(),p);
}
function cloth(p: RGBA): RGBA {
  let best = ink, cost = Infinity;
  for(const q of palette.values()) {
    const d=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2;
    if(d<cost){cost=d;best=q;}
  }
  return best;
}
function sample(cell: number,x: number,y: number): RGBA {
  // Fixed atlas cells, not per-sprite bbox fitting. Small majority sample removes
  // generated edge antialiasing without moving any sprite or hand anchors.
  const votes = new Map<string,{color:RGBA,count:number}>();
  for(const dy of [0.25,0.5,0.75])for(const dx of [0.25,0.5,0.75]) {
    const sx=Math.floor((cell%4*32+x+dx)*edit.width/128);
    const sy=Math.floor((Math.floor(cell/4)*32+y+dy)*edit.height/96);
    const p=edit.get(sx,sy);
    const q=p[3]>=160?cloth(p):clear;
    const key=q.join(), old=votes.get(key);
    votes.set(key,{color:q,count:(old?.count??0)+1});
  }
  return [...votes.values()].sort((a,b)=>b.count-a.count)[0]!.color;
}
rows.forEach((row,i)=>{
  const dir=dirs[i]!, seated=row>=20;
  const top=seated?22:19, bottom=seated?28:26;
  const back=dir==="up"||dir==="up-left"||dir==="up-right";
  // The edited torso is a single locked base for the four upper-body phases.
  const patch = new Canvas(32,32);
  for(let y=top;y<=bottom;y++)for(let x=0;x<32;x++) {
    const p=sample(i,x,y);
    // Skin and coloured marker artifacts are deliberately not part of the cloth
    // palette. The exact palms below replace every generated hand in this band.
    patch.set(x,y,p);
  }
  const shoulders: Record<(typeof dirs)[number],Record<"left"|"right",number>> = {
    down:{left:22,right:10},left:{left:16,right:13},right:{left:19,right:16},up:{left:10,right:22},
    "down-left":{left:21,right:10},"down-right":{left:22,right:11},
    "up-left":{left:11,right:21},"up-right":{left:11,right:21},
  };
  // Reconstruct the clean black jacket at obsolete palm pixels, avoiding dark
  // floating fragments left by a generated skin silhouette outside the torso.
  const torsoBounds: Record<(typeof dirs)[number],readonly [number,number]> = {
    down:[12,20],left:[13,20],right:[12,19],up:[11,21],
    "down-left":[12,21],"down-right":[11,20],"up-left":[12,21],"up-right":[11,20],
  };
  const [l,r]=torsoBounds[dir];
  for(let y=top;y<=bottom;y++)for(let x=0;x<32;x++) {
    if(x<l||x>r)patch.set(x,y,clear);
    else if(!patch.get(x,y)[3])patch.set(x,y,coat);
  }
  // Render two connected bent sleeves in far-to-near order. Their geometry is
  // snapped after imagegen so every real food grip is pixel-exact.
  for(const side of handDrawOrder(dir)) {
    const g=handGrip(dir,side,seated), sx=shoulders[dir][side];
    if(back) {
      patch.rect(sx,top,1,4,ink);
      patch.rect(sx+(sx<16?1:-1),top+1,1,3,seam);
      continue;
    }
    const ey=g.y-2;
    patch.rect(sx-1,top,3,Math.max(1,ey-top+1),ink);
    patch.rect(sx,top,1,Math.max(1,ey-top),seam);
    patch.rect(Math.min(sx,g.x)-1,ey,Math.abs(sx-g.x)+3,2,ink);
    patch.rect(Math.min(sx,g.x),ey,Math.abs(sx-g.x)+1,1,coat);
    patch.rect(g.x-1,g.y-1,3,2,ink);
  }
  if(!back)for(const side of HAND_SIDES) {
    const g=handGrip(dir,side,seated);
    patch.set(g.x-1,g.y,skinShade);
    patch.set(g.x,g.y-1,skinLight);
    patch.set(g.x,g.y,skin);
    patch.set(g.x+1,g.y,skin);
    patch.set(g.x,g.y+1,skinShade);
  }
  for(let col=0;col<4;col++) {
    const lift=col%2;
    // Clear the union of old/new upper-body footprints. Lower legs and shoes
    // remain the original frame, with no change to the body layer's face/neck.
    for(let y=top-lift;y<=bottom;y++)for(let x=0;x<32;x++)out.set(col*32+x,row*32+y,clear);
    for(let y=top;y<=bottom;y++)for(let x=0;x<32;x++) {
      if(body.get(col*32+x,row*32+y-lift)[3])continue;
      out.set(col*32+x,row*32+y-lift,patch.get(x,y));
    }
    if(!back)for(const side of HAND_SIDES) {
      const g=handGrip(dir,side,seated,col);
      assert.deepEqual(out.get(col*32+g.x,row*32+g.y),skin,`${row}:${col} ${side} grip`);
    }
  }
});

// Scope guard: only these carry upper-body bands may change. Body is not written.
for(let y=0;y<896;y++)for(let x=0;x<128;x++) {
  const row=Math.floor(y/32), col=Math.floor(x/32), ly=y%32;
  const inBand=rows.includes(row)&&ly>=(row>=20?22:19)-col%2&&ly<=(row>=20?28:26);
  if(!inBand)assert.deepEqual(out.get(x,y),before.get(x,y),`Unexpected change ${x},${y}`);
  const upper=out.get(x,y), lower=body.get(x,y);
  preview.set(x,y,upper[3]?upper:lower);
}
assert.equal(out.width,128);assert.equal(out.height,896);
assert.deepEqual(readFileSync("assets/sprites/body-male-handsome.png"),readFileSync(resolve(root,"before-body.png")),"Body changed since backup; inspect before editing");
writeFileSync("assets/sprites/outfit-black-blazer-handsome.png",encodePng(out));
writeFileSync("assets/sprites/preview-male-handsome.png",encodePng(preview));
console.log("Corrected 48 carry/sitCarry frames; body, other poses and feet preserved; 64 visible grip centers verified.");
