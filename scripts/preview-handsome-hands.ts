/** Static atlases + standalone browser animation using the runtime grip contract. */
import { readFileSync, writeFileSync } from "node:fs";
import { Canvas, decodePng, encodePng } from "./lib/png";
import { HAND_RIG, handDrawOrder, handGrip } from "../packages/shared/src/hand-rig";

const root="assets/sprites/reference-male/hand-rig-v1";
const rows=[8,9,10,11,12,13,14,15,20,21,22,23];
const dirs=["down","left","right","up","down-left","down-right","up-left","up-right","down","left","right","up"] as const;
const files={body:"assets/sprites/body-male-handsome.png",outfit:"assets/sprites/outfit-black-blazer-handsome.png",before:`${root}/before-outfit.png`,left:"assets/sprites/food/dakkochi.png",right:"assets/sprites/food/sikhye.png"};
const images=Object.fromEntries(Object.entries(files).map(([k,file])=>[k,decodePng(readFileSync(file)).canvas]));
function over(dst:Canvas,src:Canvas,sx:number,sy:number,w:number,h:number,dx:number,dy:number):void {
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const p=src.get(sx+x,sy+y), old=dst.get(dx+x,dy+y), a=p[3]/255;
    if(a)dst.set(dx+x,dy+y,[Math.round(p[0]*a+old[0]*(1-a)),Math.round(p[1]*a+old[1]*(1-a)),Math.round(p[2]*a+old[2]*(1-a)),255]);
  }
}
for(const mode of ["after","food"] as const) {
  const atlas=new Canvas(128,96);
  atlas.rect(0,0,128,96,[75,85,100,255]);
  rows.forEach((row,i)=>{
    const dx=i%4*32,dy=Math.floor(i/4)*32,dir=dirs[i]!;
    const back=["up","up-left","up-right"].includes(dir);
    const food=()=>{if(mode!=="food")return;for(const side of handDrawOrder(dir)){
      const g=handGrip(dir,side,row>=20);
      over(atlas,images[side]!,0,0,12,12,dx+g.x-HAND_RIG.foodGrip.x,dy+g.y-HAND_RIG.foodGrip.y);
    }};
    if(back)food();
    over(atlas,images.body!,0,row*32,32,32,dx,dy);
    over(atlas,images.outfit!,0,row*32,32,32,dx,dy);
    if(!back)food();
  });
  const enlarged=new Canvas(1024,768);
  for(let y=0;y<96;y++)for(let x=0;x<128;x++)enlarged.rect(x*8,y*8,8,8,atlas.get(x,y));
  writeFileSync(`${root}/carry-${mode}-x8.png`,encodePng(enlarged));
}
const data=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,`data:image/png;base64,${readFileSync(p).toString("base64")}`]));
const rig=rows.map((row,i)=>({row,dir:dirs[i],behind:["up","up-left","up-right"].includes(dirs[i]!),order:handDrawOrder(dirs[i]!),grips:[0,1,2,3].map(col=>({left:handGrip(dirs[i]!,"left",row>=20,col),right:handGrip(dirs[i]!,"right",row>=20,col)}))}));
writeFileSync(`${root}/review.html`,`<!doctype html><html lang="ko"><meta charset="utf-8"><title>Handsome 손 부착점 검토</title>
<style>body{margin:24px;background:#202630;color:#eee;font:16px system-ui}canvas{image-rendering:pixelated;width:min(100%,1024px);height:auto;background:#4b5564}label{display:inline-block;margin:8px}button,select{font:inherit}p{max-width:1024px}</style>
<h1>Handsome 손·음식 부착점 검토</h1><p>위: 아래·왼쪽·오른쪽·위 / 가운데: 아래왼쪽·아래오른쪽·위왼쪽·위오른쪽 / 아래: 앉기 아래·왼쪽·오른쪽·위. 좌우는 캐릭터 자신의 손입니다. 원본의 프레임별 얼굴 변화와 눕기는 이번 보정 범위 밖입니다.</p>
<label>음식 <select id="held"><option value="both">양손</option><option value="right">오른손만</option><option value="left">왼손만</option><option value="none">없음</option></select></label>
<label>섭취 단계 <select id="stage"><option>0</option><option>1</option><option>2</option></select></label>
<label><input type="checkbox" id="grips">접점 표시 (자홍 왼손·청록 오른손)</label>
<label><input type="checkbox" id="before">보정 전 의상</label><button id="pause">일시정지</button>
<p>왼손 닭꼬치 / 오른손 식혜. 먹는 단계·음식 개수와 무관하게 같은 접점 유지. 화면 밖으로 그림을 움직이거나 음식을 입으로 올리지 않습니다.</p>
<canvas width="128" height="96"></canvas><script type="module">
const urls=${JSON.stringify(data)},rig=${JSON.stringify(rig)};
const imgs=Object.fromEntries(await Promise.all(Object.entries(urls).map(async([k,src])=>{const im=new Image();im.src=src;await im.decode();return[k,im]})));
const c=document.querySelector('canvas'),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
const held=document.querySelector('#held'),stage=document.querySelector('#stage'),grips=document.querySelector('#grips'),before=document.querySelector('#before');
let paused=false,time=0,last=performance.now();document.querySelector('#pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'재생':'일시정지'};
function frame(now){if(!paused)time+=now-last;last=now;ctx.fillStyle='#4b5564';ctx.fillRect(0,0,128,96);
rig.forEach((r,i)=>{const col=Math.floor(time/(r.row>=20?1000/1.5:1000/8))%4,x=i%4*32,y=Math.floor(i/4)*32;
const food=()=>r.order.forEach(side=>{if(held.value!=='both'&&held.value!==side)return;const g=r.grips[col][side];ctx.drawImage(imgs[side],Number(stage.value)*12,0,12,12,x+g.x-6,y+g.y-9,12,12)});
if(r.behind)food();ctx.drawImage(imgs.body,col*32,r.row*32,32,32,x,y,32,32);ctx.drawImage(before.checked?imgs.before:imgs.outfit,col*32,r.row*32,32,32,x,y,32,32);if(!r.behind)food();
if(grips.checked)for(const side of ['left','right']){const g=r.grips[col][side];ctx.fillStyle=side==='left'?'#ff40cc':'#20d8ff';ctx.fillRect(x+g.x,y+g.y,1,1)}
});requestAnimationFrame(frame)}requestAnimationFrame(frame);
</script></html>`);
console.log(`${root}/review.html; carry-after-x8.png; carry-food-x8.png`);
