/** Native-frame corrections from generated source groups; never resize the final atlas. */
import { readFileSync,writeFileSync,existsSync } from "node:fs";
import { Canvas,decodePng,encodePng,type RGBA } from "../../../../scripts/lib/png";
import { HAND_SIDES,handGrip,handDrawOrder } from "../../../../packages/shared/src/hand-rig";
const root="assets/sprites/review/female-photo-01";
const raw=decodePng(readFileSync(`${root}/sources/generated-body.png`)).canvas;
const P={
  hair0:[17,19,26,255],hair1:[29,31,40,255],hair2:[45,47,59,255],hair3:[65,68,82,255],hair4:[86,89,103,255],
  skin:[245,214,194,255],skinLight:[255,229,212,255],skinMid:[230,185,160,255],skinDark:[207,151,132,255],
  lip:[183,106,112,255],cheek:[235,157,148,255],gold:[194,155,76,255],
  shoe:[37,39,50,255],shoeLight:[59,62,72,255],baseLeg:[70,68,79,255],
  pants:[71,74,85,255],pantsLight:[94,97,108,255],pantsDark:[50,52,63,255],
  ivory:[246,240,224,255],ivoryLight:[255,251,238,255],ivoryMid:[221,213,192,255],ivoryDark:[190,179,157,255],
  shadow:[0,0,0,48],clear:[0,0,0,0],
} as const satisfies Record<string,RGBA>;
type Dir="down"|"left"|"right"|"up"|"down-left"|"down-right"|"up-left"|"up-right";
const dirs:Dir[]=["down","left","right","up","down-left","down-right","up-left","up-right"];
const hairColors=[P.hair0,P.hair1,P.hair2,P.hair3,P.hair4];
const skinColors=[P.skin,P.skinLight,P.skinMid,P.skinDark,P.lip,P.cheek];
const bodyColors=[...hairColors,...skinColors,P.gold];
const colorIs=(p:RGBA,q:readonly number[])=>p[3]===q[3]&&p[0]===q[0]&&p[1]===q[1]&&p[2]===q[2];
const isHair=(p:RGBA)=>p[3]>0&&hairColors.some(q=>colorIs(p,q));
const isSkin=(p:RGBA)=>p[3]>0&&skinColors.some(q=>colorIs(p,q));
function nearest(p:RGBA,palette:readonly (readonly number[])[]):RGBA {
  let q=palette[0]!,best=Infinity;
  for(const v of palette){const d=(v[0]!-p[0])**2+(v[1]!-p[1])**2+(v[2]!-p[2])**2;if(d<best){q=v;best=d;}}
  return [...q] as RGBA;
}
function sample(canvas:Canvas,cell:number,x:number,y:number,gridW:number,gridH:number,palette:readonly (readonly number[])[]):RGBA {
  const counts=new Map<string,{p:RGBA,n:number}>();
  for(const dy of [-.2,0,.2])for(const dx of [-.2,0,.2]) {
    const sx=Math.floor((cell%4*32+x+dx)*canvas.width/gridW);
    const sy=Math.floor((Math.floor(cell/4)*32+y+dy)*canvas.height/gridH);
    const r=canvas.get(sx,sy),p:RGBA=r[3]<160?[0,0,0,0]:nearest(r,palette),key=p.join();
    counts.set(key,{p,n:(counts.get(key)?.n??0)+1});
  }
  return [...counts.values()].sort((a,b)=>b.n-a.n)[0]!.p;
}
// A single mapping for every head: generated native y4..19 -> approved y6..18.
// This removes excess generated forehead rows without independent bbox fitting.
const headY=[4,5,6,7,9,10,11,13,14,15,17,18,19];
const heads:Canvas[]=[];
for(let i=0;i<8;i++) {
  const h=new Canvas(32,32),dir=dirs[i]!;
  for(let y=6;y<=18;y++)for(let x=8;x<=23;x++) {
    const sx=8+(x-8+.5)*17/16;
    h.set(x,y,sample(raw,i,sx,headY[y-6]!+.5,128,96,y<=10?hairColors:bodyColors));
  }
  // Long straight locks remain body-owned. Exclude generated gap artifacts.
  for(let y=19;y<=25;y++)for(let x=8;x<=23;x++) {
    const p=sample(raw,i,8+(x-8+.5)*17/16,y+1.5,128,96,bodyColors);
    if(!isHair(p))continue;
    const back=["up","up-left","up-right"].includes(dir);
    let allowed=back||dir==="left"&&x>=15||dir==="right"&&x<=16||["down","down-left","down-right"].includes(dir)&&(x<=10||x>=22);
    if(back&&y>=23)allowed=x>=11+(y-23)*2&&x<=20-(y-23)*2&&y<=24;
    if((dir==="left"||dir==="right")&&y>=24)allowed=dir==="left"?x>=18&&x<=21:x>=10&&x<=13;
    if(allowed)h.set(x,y,p);
  }
  // Anatomical face pixels remain in the body; clean isolated generation noise.
  // Leave the model's facial shape and hairline; lock open/closed eyes afterwards.
  const eyeXs:Record<Dir,number[]>={down:[13,18],left:[10],right:[21],up:[],"down-left":[11,15],"down-right":[16,20],"up-left":[],"up-right":[]};
  for(const ex of eyeXs[dir]) {
    for(let y=13;y<=16;y++)for(let x=ex-1;x<=ex+1;x++) {
      const p=h.get(x,y);
      if(isHair(p)&&[h.get(x-1,y),h.get(x+1,y),h.get(x,y+1)].some(isSkin))h.set(x,y,P.skin);
    }
    h.set(ex,14,P.hair0);h.set(ex,15,P.hair0);
    h.set(ex+1,14,P.skinLight);
  }
  const neckX:Record<Dir,number>={down:15,left:13,right:17,up:15,"down-left":13,"down-right":17,"up-left":14,"up-right":16};
  if(!["up","up-left","up-right"].includes(dir))h.rect(neckX[dir],19,2,2,P.skinMid);
  const earX:Record<Dir,number[]>={down:[10,21],left:[17],right:[14],up:[],"down-left":[19],"down-right":[12],"up-left":[8],"up-right":[23]};
  for(const x of earX[dir])h.set(x,17,P.gold);
  // Rounded black crown at y6 is mandatory even when source alpha lost a tip.
  if(!Array.from({length:16},(_,j)=>h.get(j+8,6)[3]).some(Boolean))h.rect(13,6,6,1,P.hair1);
  heads.push(h);
}
const body=new Canvas(128,896),outfit=new Canvas(128,896);
function blit(dst:Canvas,src:Canvas,ox:number,oy:number,dy=0):void {
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){const p=src.get(x,y);if(p[3])dst.set(ox+x,oy+y+dy,p);}
}
function blink(head:Canvas,dir:Dir):Canvas {
  const copy=new Canvas(32,32);copy.data.set(head.data);
  const eyes:Record<Dir,number[]>={down:[13,18],left:[10],right:[21],up:[],"down-left":[11,15],"down-right":[16,20],"up-left":[],"up-right":[]};
  for(const x of eyes[dir]){copy.set(x,14,P.hair1);copy.set(x,15,P.skin);}
  return copy;
}
function legs(c:Canvas,dir:Dir,col:number,seated:boolean,clothes:boolean):void {
  const pants=clothes?P.pants:P.baseLeg,shade=clothes?P.pantsDark:P.baseLeg;
  const px=(x:number,y:number,w:number,h:number,p:readonly number[])=>c.rect(x,y,w,h,[...p] as RGBA);
  if(seated) {
    if(dir==="up")return;
    if(dir==="left"||dir==="right"){
      const flip=dir==="right";const rect=(x:number,y:number,w:number,h:number,p:readonly number[])=>px(flip?32-x-w:x,y,w,h,p);
      rect(7,27,8,2,pants);rect(7,28,8,1,shade);if(!clothes){rect(6,29,4,2,P.shoe);rect(6,29,3,1,P.shoeLight);}return;
    }
    for(const x of [12,17]){px(x,27,3,2,pants);if(!clothes){px(x,29,3,2,P.shoe);px(x,29,2,1,P.shoeLight);}}return;
  }
  const stride=col===1?1:col===3?-1:0;
  const side=dir==="left"||dir==="right";
  const diag=dir.includes("-");
  const anatomicalLeftOnScreenLeft=dir==="up"||dir==="up-left"||dir==="up-right";
  for(let anatomical=0;anatomical<2;anatomical++) {
    const left=anatomical===0;
    let x=anatomicalLeftOnScreenLeft?(left?12:17):(left?17:12);
    if(diag)x+=(dir.endsWith("left")?-1:0);
    let lift=stride!==0&&left!==(stride===1)?1:0;
    if(side){const lead=left===(stride===1);x=stride===0?(left?13:16):(lead?10:18);if(dir==="right")x=29-x;lift=stride===0?0:lead?0:1;}
    px(x,27,3,2-lift,left?pants:shade);
    if(!clothes){px(x,29-lift,3,2,P.shoe);px(x,29-lift,2,1,P.shoeLight);}
  }
}
for(let row=0;row<24;row++)for(let col=0;col<4;col++) {
  const seated=row>=16,dir=dirs[seated?(row-16)%4:row%8]!;
  const cell=new Canvas(32,32);
  cell.rect(10,30,12,2,P.shadow);
  legs(cell,dir,col,seated,false);
  blit(cell,seated&&col===2?blink(heads[dirs.indexOf(dir)]!,dir):heads[dirs.indexOf(dir)]!,0,0,(seated?3:0)-col%2);
  blit(body,cell,col*32,row*32);
}
// Supine head projection: front-facing features rotate with the head's direction,
// not a standing frontal sprite used as a fake diagonal view.
function lieTransform(dir:Dir,x:number,y:number):[number,number] {
  if(dir==="left")return[x,y];if(dir==="right")return[31-x,y];
  if(dir==="down")return[y-7,32-x];return[38-y,x+4];
}
function lieBody(dir:Dir,col:number):Canvas {
  const c=new Canvas(32,32);const set=(x:number,y:number,p:RGBA)=>{const [tx,ty]=lieTransform(dir,x,y);c.set(tx,ty,p);};
  for(let x=3;x<=26;x++)set(x,31,P.shadow);
  const face=col===2?blink(heads[0]!,"down"):heads[0]!;
  for(let v=0;v<13;v++)for(let u=0;u<16;u++){const p=face.get(8+u,6+v);if(p[3])set(2+v,15+u,p);}
  for(let x=10;x<=19;x++)for(const y of [15,30])set(x,y,x<14?P.hair1:P.hair0);
  for(let x=15;x<=16;x++)for(let y=22;y<=23;y++)set(x,y,P.skinMid);
  for(const y0 of [18,24])for(let y=y0;y<y0+4;y++)for(let x=23;x<=26;x++)set(x,y,x>=25?P.shoe:P.baseLeg);
  return c;
}
for(let row=24;row<28;row++)for(let col=0;col<4;col++)blit(body,lieBody(dirs[row-24]!,col),col*32,row*32);
writeFileSync(`${root}/body-reference.png`,encodePng(body));

// The outfit imagegen pass is performed only after the body checks pass.
const outfitSourcePath=`${root}/sources/generated-outfit.png`;
if(!existsSync(outfitSourcePath)){
  const base=new Canvas(128,128);const rows=[0,1,2,3,4,5,6,7,16,17,18,19,24,25,26,27];
  for(let i=0;i<16;i++)for(let y=0;y<32;y++)for(let x=0;x<32;x++)base.set(i%4*32+x,Math.floor(i/4)*32+y,body.get(x,rows[i]!*32+y));
  const big=new Canvas(1024,1024);for(let y=0;y<128;y++)for(let x=0;x<128;x++)big.rect(x*8,y*8,8,8,base.get(x,y));
  writeFileSync(`${root}/sources/approved-body-bases-x8.png`,encodePng(big));
  console.log("Body assembled; outfit pass pending.");
}else{
  const garment=decodePng(readFileSync(outfitSourcePath)).canvas;
  const ivories=[P.ivory,P.ivoryLight,P.ivoryMid,P.ivoryDark];
  const torso:Record<Dir,[number,number]>={down:[10,12],left:[12,9],right:[11,9],up:[10,13],"down-left":[10,11],"down-right":[11,11],"up-left":[11,11],"up-right":[10,11]};
  const shoulders:Record<Dir,Record<"left"|"right",number>>={down:{left:22,right:9},left:{left:16,right:13},right:{left:19,right:15},up:{left:9,right:22},"down-left":{left:21,right:9},"down-right":{left:22,right:10},"up-left":{left:9,right:22},"up-right":{left:9,right:22}};
  function upper(dir:Dir,seated:boolean,carry:boolean,col:number):Canvas {
    const c=new Canvas(32,32),arms=new Canvas(32,32),idx=dirs.indexOf(dir),top=seated?22:19,bottom=seated?28:26;
    const [tx,tw]=torso[dir],baseIdx=seated?8+idx:idx;
    for(let y=top;y<=bottom;y++)for(let x=tx;x<tx+tw;x++) {
      const p=sample(garment,baseIdx,x+.5,y+.5,128,128,ivories);
      c.set(x,y,seated&&y>=26?P.ivoryMid:p[3]?p:P.ivory);
    }
    const neck=dir==="down"?15:dir==="left"||dir==="down-left"?13:17;
    if(!["up","up-left","up-right"].includes(dir)){
      c.rect(neck,top,2,2,P.clear);
      if(dir==="down"||dir.startsWith("down-"))c.set(neck+1,top+2,P.gold);
    }
    const hand=(x:number,y:number)=>{
      arms.set(x-1,y,P.skinMid);arms.set(x,y-1,P.skinLight);arms.set(x,y,P.skin);arms.set(x+1,y,P.skin);
    };
    const back=["up","up-left","up-right"].includes(dir);
    if(carry) {
      for(const side of handDrawOrder(dir)){
        const g=handGrip(dir,side,seated),sx=shoulders[dir][side];
        if(back){arms.rect(sx,top+1,1,3,P.skinMid);continue;}
        const ey=g.y-2;
        arms.rect(sx,top,1,Math.max(1,ey-top+1),P.skinMid);
        arms.rect(Math.min(sx,g.x),ey,Math.abs(sx-g.x)+1,2,P.skinMid);
        arms.set(g.x,ey,P.skin);
      }
      if(!back)for(const side of HAND_SIDES){const g=handGrip(dir,side,seated);hand(g.x,g.y);}
    }else{
      const swing=seated?0:col===1?1:col===3?-1:0;
      if(dir==="left"||dir==="right") {
        const x=dir==="left"?16:15,y=seated?27:25;
        arms.rect(x,top,1,y-top+1,P.skinMid);arms.set(x,y,P.skin);arms.set(x,y+1,P.skinMid);
      }else for(const side of HAND_SIDES){
        const screenLeft=side==="left"?(dir==="up"||dir.startsWith("up-")):!(dir==="up"||dir.startsWith("up-"));
        const x=screenLeft?9:22,y=(seated?27:25)+(screenLeft?swing:-swing);
        arms.rect(x,top,1,Math.max(1,y-top+1),P.skinMid);arms.set(x,y,P.skin);arms.set(x,y+1,P.skinMid);
      }
    }
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      const bp=heads[idx]!.get(x,y-(seated?3:0));
      if(isHair(bp)||isSkin(bp))c.set(x,y,P.clear);
      const a=arms.get(x,y);if(a[3])c.set(x,y,a);
    }
    return c;
  }
  for(let row=0;row<24;row++)for(let col=0;col<4;col++) {
    const seated=row>=16,carry=row>=8&&row<16||row>=20,dir=dirs[seated?(row-16)%4:row%8]!;
    const cell=new Canvas(32,32);
    legs(cell,dir,col,seated,true);
    blit(cell,upper(dir,seated,carry,col),0,0,-col%2);
    // Bent knees are in front of the hem, not painted underneath the shirt.
    if(seated){legs(cell,dir,col,true,true);if(dir==="up")cell.rect(11,28,11,1,P.pantsDark);}
    // Palms rest above the knees. A trouser pixel at the grip would pass the
    // generic alpha check, but is not a hand and must not occlude the food grip.
    if(seated&&carry&&dir!=="up")for(const side of HAND_SIDES){
      const g=handGrip(dir,side,true,col);
      cell.set(g.x-1,g.y,P.skinMid);cell.set(g.x,g.y-1,P.skinLight);
      cell.set(g.x,g.y,P.skin);cell.set(g.x+1,g.y,P.skin);
    }
    // Never put garment pixels over actual face/neck; long hair is body-owned.
    const chin=(seated?21:18)-col%2;
    for(let y=0;y<=chin;y++)for(let x=0;x<32;x++)cell.set(x,y,P.clear);
    blit(outfit,cell,col*32,row*32);
  }
  for(let row=24;row<28;row++)for(let col=0;col<4;col++) {
    const dir=dirs[row-24]!,cell=new Canvas(32,32),set=(x:number,y:number,p:RGBA)=>{const [tx,ty]=lieTransform(dir,x,y);cell.set(tx,ty,p);};
    for(let y=17;y<=29;y++)for(let x=15;x<=22;x++) {
      const p=sample(garment,13,x+.5,y+.5,128,128,ivories);
      set(x,y,p[3]?p:P.ivory);
    }
    for(let x=15;x<=16;x++)for(let y=22;y<=23;y++)set(x,y,P.clear);
    set(17,23,P.gold);
    for(const y0 of [18,24])for(let x=23;x<=24;x++)for(let y=y0;y<y0+4;y++)set(x,y,y%2?P.pantsDark:P.pants);
    for(const y of [16,30])for(let x=16;x<=22;x++)set(x,y,x===22?P.skin:P.skinMid);
    if(col%2===1)for(let x=17;x<=20;x++)set(x,16,P.ivoryLight);
    blit(outfit,cell,col*32,row*32);
  }
  writeFileSync(`${root}/outfit-reference.png`,encodePng(outfit));
  console.log("Body/outfit: 128x896 RGBA, 112 synchronized frames each.");
}
