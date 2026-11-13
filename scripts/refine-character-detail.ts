/** Enrich the approved 32px animation geometry at 2x art resolution.
 * Stable local coordinates preserve animation phase, silhouettes and hand contacts.
 * Re-running on a refined sheet is deliberately refused.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Canvas, decodePng, encodePng, type RGBA } from './lib/png';
const ids=['body-female-longhair','outfit-ivory-sleeveless','body-male-handsome','outfit-black-blazer-handsome'];
const shift=(p:RGBA,n:number):RGBA=>[Math.max(0,Math.min(255,p[0]+n)),Math.max(0,Math.min(255,p[1]+n)),Math.max(0,Math.min(255,p[2]+n)),p[3]];
mkdirSync('docs/character-detail',{recursive:true});
for(const id of ids){
 const file=`assets/sprites/${id}.png`,src=decodePng(readFileSync(file)).canvas;
 if(src.width!==128||src.height!==896)throw Error(`${id}: expected original 128×896 sheet`);
 writeFileSync(`docs/character-detail/${id}-before.png`,encodePng(src));
 const dst=new Canvas(256,1792),body=id.startsWith('body'),ivory=id.includes('ivory');
 for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++){
  const p=src.get(x,y),lx=x%32,ly=y%32,row=Math.floor(y/32),col=Math.floor(x/32),lift=col%2;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   let q=p;
   if(p[3]===255){
    const skin=p[0]>100&&p[0]-p[2]>25,lum=(p[0]+p[1]+p[2])/3;
    const inside=src.get(x-1,y)[3]===255&&src.get(x+1,y)[3]===255;
    // Follow existing tonal boundaries, no random noise or frame-dependent flicker.
    if(body&&!skin&&lum>16&&ly<22&&inside){
     const strand=(lx*2+dx)%7;
     if(strand===2&&dy===0)q=shift(p,12);
     else if(strand===5&&dy===1)q=shift(p,-6);
    }else if(!body&&!skin&&inside){
     if(ivory&&lum>100){
      if((lx*2+dx)%9===3)q=shift(p,-13);
      else if(dx===0&&dy===0)q=shift(p,5);
     }else if(!ivory&&lum>12&&lum<110){
      if(dx===0&&dy===0)q=shift(p,9);
      else if(dx===1&&dy===1)q=shift(p,-4);
     }
    }
    if(skin&&dx===0&&dy===0&&inside)q=shift(p,5);
    // Tiny warm metal buttons down the front, aligned to torso breathing.
    const direction=row<16?row%8:(row-16)%4;
    const torsoY=ly+lift-(row>=16&&row<24?3:0);
    if(!body&&!ivory&&direction===0&&row<24&&lx===17&&[23,26].includes(torsoY)&&dx===0&&dy===0&&!skin&&lum<100)q=[205,178,123,255];
   }
   dst.set(x*2+dx,y*2+dy,q);
  }
 }
 writeFileSync(file,encodePng(dst));
}
// Review uses actual runtime scale: 64px art displayed at 48 world pixels.
const urls=ids.map(id=>`data:image/png;base64,${readFileSync(`assets/sprites/${id}.png`).toString('base64')}`);
writeFileSync('docs/character-detail/review.html',`<!doctype html><html lang="ko"><meta charset="utf-8"><title>캐릭터 디테일 검토</title><style>body{background:#333e49;color:#fff;font:16px system-ui;margin:24px}canvas{image-rendering:pixelated;width:768px;height:384px;max-width:100%}img{max-width:768px}</style><h1>두 캐릭터 · 64px 디테일</h1><p>28행 전체 애니메이션 순환 · 몸/옷 동기화 · 걷기 8fps / 휴식 1.5fps</p><canvas width="384" height="192"></canvas><p>아트 방향 참고</p><img src="art-direction.png"><script>const urls=${JSON.stringify(urls)};Promise.all(urls.map(src=>new Promise(r=>{const i=new Image;i.onload=()=>r(i);i.src=src}))).then(imgs=>{const c=document.querySelector('canvas'),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;function draw(t){ctx.clearRect(0,0,384,192);const group=Math.floor(t/4000)%4;for(let d=0;d<8;d++){const row=group<2?group*8+d:16+(group-2)*4+d%4,col=Math.floor(t/(row<16?125:667))%4;for(let person=0;person<2;person++){const x=d*48,y=person*96;for(const im of imgs.slice(person*2,person*2+2))ctx.drawImage(im,col*64,row*64,64,64,x,y,48,48);}}requestAnimationFrame(draw)}requestAnimationFrame(draw)})</script>`);
