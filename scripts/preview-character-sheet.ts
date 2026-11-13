/** Any candidate body/outfit pair: pnpm preview:character body.png outfit.png --out review-dir */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { Canvas, decodePng, encodePng } from "./lib/png";
import { HAND_RIG, handDrawOrder, handGrip } from "../packages/shared/src/hand-rig";

const args=process.argv.slice(2);
if(args.length!==4||args[2]!=="--out") {
  console.error("사용법: pnpm preview:character <body.png> <outfit.png> --out <검토 폴더>");
  process.exit(2);
}
const bodyPath=resolve(args[0]!), outfitPath=resolve(args[1]!), outDir=resolve(args[3]!);
const files={body:bodyPath,outfit:outfitPath,left:resolve("assets/sprites/food/dakkochi.png"),right:resolve("assets/sprites/food/sikhye.png")};
function logical(path:string):Canvas { const src=decodePng(readFileSync(path)).canvas;
if(src.width!==256||src.height!==1792)return src;
const out=new Canvas(128,896);for(let y=0;y<896;y++)for(let x=0;x<128;x++)out.set(x,y,src.get(x*2+1,y*2+1));return out; }
const body=logical(bodyPath),outfit=logical(outfitPath);
for(const c of [body,outfit])if(c.width!==128||c.height!==896)throw Error("몸·의상 PNG는 각각 128×896이어야 합니다.");
const previewPath=join(outDir,"preview.png");
if([bodyPath,outfitPath].includes(previewPath))throw Error("출력 preview.png가 입력 PNG를 덮어쓸 수 없습니다.");
const composite=new Canvas(128,896);
for(let y=0;y<896;y++)for(let x=0;x<128;x++) {
  const b=body.get(x,y),o=outfit.get(x,y),a=o[3]/255,ba=b[3]/255,alpha=a+ba*(1-a);
  if(!alpha)continue;
  composite.set(x,y,[0,1,2].map(i=>Math.round((o[i]!*a+b[i]!*ba*(1-a))/alpha)).concat(Math.round(alpha*255)) as [number,number,number,number]);
}
const artGrips=JSON.parse(readFileSync(resolve('apps/client/src/character-art-grips.json'),'utf8'))[bodyPath.includes('female')?'female-longhair':'male-handsome'];
const dirs8=["down","left","right","up","down-left","down-right","up-left","up-right"] as const;
const dirs4=dirs8.slice(0,4);
const rows=[
  ...dirs8.map((dir,i)=>({row:i,dir,pose:"normal",carry:false})),
  ...dirs8.map((dir,i)=>({row:i+8,dir,pose:"carry",carry:true})),
  ...dirs4.map((dir,i)=>({row:i+16,dir,pose:"sit",carry:false})),
  ...dirs4.map((dir,i)=>({row:i+20,dir,pose:"sitCarry",carry:true})),
  ...dirs4.map((dir,i)=>({row:i+24,dir,pose:"lie (head)",carry:false})),
].map(r=>({...r,behind:["up","up-left","up-right"].includes(r.dir),order:handDrawOrder(r.dir),grips:[0,1,2,3].map(col=>({left:artGrips?.[r.row+':'+col]?.left?{x:artGrips[r.row+':'+col].left.x+16,y:artGrips[r.row+':'+col].left.y+32}:handGrip(r.dir,"left",r.row>=20&&r.row<24,col),right:artGrips?.[r.row+':'+col]?.right?{x:artGrips[r.row+':'+col].right.x+16,y:artGrips[r.row+':'+col].right.y+32}:handGrip(r.dir,"right",r.row>=20&&r.row<24,col)}))}));
const urls=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,`data:image/png;base64,${readFileSync(file).toString("base64")}`]));
mkdirSync(outDir,{recursive:true});
writeFileSync(previewPath,encodePng(composite));
writeFileSync(join(outDir,"review.html"),`<!doctype html><html lang="ko"><meta charset="utf-8"><title>캐릭터 28행 제작 검토</title>
<style>body{margin:24px;background:#202630;color:#eee;font:15px system-ui}label{display:inline-block;margin:8px}button,select{font:inherit}.grid{display:grid;grid-template-columns:repeat(auto-fit,150px);gap:12px}.card{padding:8px;background:#303946}canvas{width:128px;height:128px;image-rendering:pixelated}p{max-width:1000px}</style>
<h1>캐릭터 28행 검토</h1><p>각 카드의 몸·옷은 같은 열을 재생합니다. 걷기 8fps, 쉬기 1.5fps. 음식과 접점 표시는 carry/sitCarry에만 적용합니다. lie 방향은 머리 방향입니다. 이 페이지는 고개 돌리기·말풍선 등 게임 먹기 효과나 이름표를 재현하지 않습니다.</p>
<label>열 <select id="column"><option value="auto">자동</option><option>0</option><option>1</option><option>2</option><option>3</option></select></label>
<label>음식 <select id="held"><option value="none">없음</option><option value="both">양손</option><option value="left">왼손만</option><option value="right">오른손만</option></select></label>
<label>섭취 단계 <select id="stage"><option>0</option><option>1</option><option>2</option></select></label>
<label><input type="checkbox" id="grips">손 접점 (왼손 자홍·오른손 청록)</label>
<label>레이어 <select id="layer"><option value="both">합성</option><option value="body">몸</option><option value="outfit">옷</option></select></label>
<button id="pause">일시정지</button><p>왼손 닭꼬치 / 오른손 식혜. 몸·옷 소유권, 양손/한손, 단계 0→1→2, 뒤쪽 가려짐을 함께 확인하세요. 자동 검사 통과만으로 시각 검토가 완료되지는 않습니다.</p>
<div class="grid"></div><script type="module">
const urls=${JSON.stringify(urls)},rows=${JSON.stringify(rows)},grip=${JSON.stringify(HAND_RIG.foodGrip)};
const imgs=Object.fromEntries(await Promise.all(Object.entries(urls).map(async([k,src])=>{const im=new Image();im.src=src;await im.decode();return[k,im]})));
const grid=document.querySelector('.grid'),cards=rows.map(r=>{const card=document.createElement('div');card.className='card';const title=document.createElement('div');title.textContent=r.row+' '+r.pose+' '+r.dir;const canvas=document.createElement('canvas');canvas.width=canvas.height=32;card.append(title,canvas);grid.append(card);const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;return ctx});
const column=document.querySelector('#column'),held=document.querySelector('#held'),stage=document.querySelector('#stage'),grips=document.querySelector('#grips'),layer=document.querySelector('#layer');
let paused=false,time=0,last=performance.now();document.querySelector('#pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'재생':'일시정지'};
function frame(now){if(!paused)time+=now-last;last=now;rows.forEach((r,i)=>{const ctx=cards[i],col=column.value==='auto'?Math.floor(time/(r.row>=16?1000/1.5:1000/8))%4:Number(column.value);ctx.fillStyle='#4b5564';ctx.fillRect(0,0,32,32);
const food=()=>{if(!r.carry)return;r.order.forEach(side=>{if(held.value!=='both'&&held.value!==side)return;const g=r.grips[col][side];ctx.drawImage(imgs[side],Number(stage.value)*12,0,12,12,g.x-grip.x,g.y-grip.y,12,12)})};
if(r.behind)food();if(layer.value!=='outfit')ctx.drawImage(imgs.body,col*imgs.body.width/4,r.row*imgs.body.height/28,imgs.body.width/4,imgs.body.height/28,0,0,32,32);if(layer.value!=='body')ctx.drawImage(imgs.outfit,col*imgs.outfit.width/4,r.row*imgs.outfit.height/28,imgs.outfit.width/4,imgs.outfit.height/28,0,0,32,32);if(!r.behind)food();
if(r.carry&&grips.checked)for(const side of ['left','right']){const g=r.grips[col][side];ctx.fillStyle=side==='left'?'#ff40cc':'#20d8ff';ctx.fillRect(g.x,g.y,1,1)}
});requestAnimationFrame(frame)}requestAnimationFrame(frame);
</script></html>`);
console.log(`${previewPath}\n${join(outDir,"review.html")} (28 rows, synchronized 4 columns)`);
