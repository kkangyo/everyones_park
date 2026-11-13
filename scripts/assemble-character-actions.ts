/** Assemble actual generated frames without repainting sprites. Source paths in actions-sources.json. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {Canvas,decodePng,encodePng} from './lib/png';
import {handGrip} from '../packages/shared/src/hand-rig';
import type {Facing} from '../packages/shared/src/movement';
const solid=(p:number[])=>p[3]!>220&&Math.max(...p.slice(0,3))-Math.min(...p.slice(0,3))<155;
const root='docs/character-remake',sources=JSON.parse(readFileSync(`${root}/actions-sources.json`,'utf8'));
const directions:Facing[]=['down','left','right','up','down-left','down-right','up-left','up-right'];
const gripData:Record<string,Record<string,unknown>>={},report:unknown[]=[];
for(const sex of ['female','male']){
 const id=sex==='female'?'female-longhair':'male-handsome',outfitId=sex==='female'?'ivory-sleeveless':'black-blazer-handsome';
 const body=new Canvas(256,1792),outfit=new Canvas(256,1792),preview=new Canvas(256,1792);gripData[id]={};
 for(const [group,rows,offset]of [['walk',8,0],['carry',8,8],['rest',12,16]] as const){
  let src=decodePng(readFileSync(sources[`${sex}-${group}`])).canvas;
  writeFileSync(`${root}/${sex}-${group}-source.png`,readFileSync(sources[`${sex}-${group}`]));
  // Detect horizontal figure bands rather than trusting generated canvas aspect ratio.
  const bands:number[][]=[];let start=-1;
  for(let y=0;y<=src.height;y++){let count=0;if(y<src.height)for(let x=0;x<src.width;x++)if(solid(src.get(x,y)))count++;
   if(count>5&&start<0)start=y;
   if(count<=5&&start>=0){if(y-start>5)bands.push([start,y]);start=-1;}
  }
  if(bands.length!==rows)throw Error(`${sex}-${group}: detected ${bands.length} rows, expected ${rows}`);
  const originalSrc=src;
  for(let r=0;r<rows;r++){
   src=originalSrc;
   let band=bands[group==='rest'&&sex==='female'&&r<8?(r+4)%8:r]!;
   if(group==='rest'&&r===11){src=decodePng(readFileSync(`${root}/lie-up-source.png`)).canvas;band=sex==='female'?[0,Math.floor(src.height/2)]:[Math.floor(src.height/2),src.height];}

   const cells=[];
   for(let col=0;col<4;col++){
    const left=Math.floor(col*src.width/4),right=Math.floor((col+1)*src.width/4);let x0=right,x1=left,y0=src.height,y1=0;
    for(let y=band[0]!;y<band[1]!;y++)for(let x=left;x<right;x++)if(solid(src.get(x,y))){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    if(x1<=x0||y1<=y0)throw Error(`Empty ${sex} ${group} ${r}:${col}`);
    cells.push({x0,x1,y0,y1,w:x1-x0+1,h:y1-y0+1});
   }
   const lying=group==='rest'&&r>=8,seated=group==='rest'&&r<8;
   const scale=Math.min((seated?48:58)/Math.max(...cells.map(c=>lying&&(r===9||r===10)?c.w:c.h)),(lying?36:48)/Math.max(...cells.map(c=>lying&&(r===9||r===10)?c.h:c.w)));
   for(let col=0;col<4;col++){
    const c=cells[col]!,w=Math.round(c.w*scale),h=Math.round(c.h*scale),ox=Math.floor((64-w)/2),oy=lying?Math.floor((64-h)/2):62-h,frame=new Canvas(64,64);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     const p=src.get(Math.min(c.x1,c.x0+Math.floor((x+.5)/scale)),Math.min(c.y1,c.y0+Math.floor((y+.5)/scale)));
     if(!solid(p))continue;p[3]=255;frame.set(ox+x,oy+y,p);
    }
    const row=offset+r;
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
     const p=frame.get(x,y);if(!p[3])continue;
     const hair=sex==='female'&&p[0]<100&&p[1]<100&&p[2]<115;
     const onBody=lying?(r===8?y>40||y<20:r===11?y<25||y>48:r===9?x<24||x>52:x>40||x<12):(y<(seated?37:29)||y>=59||hair);
     (onBody?body:outfit).set(col*64+x,row*64+y,p);preview.set(col*64+x,row*64+y,p);
    }
    if(group==='carry'||group==='rest'&&r>=4&&r<8){
     const facing=directions[group==='carry'?r:r-4]!,hands:Record<string,unknown>={};
     for(const side of ['left','right'] as const){
      const expected=handGrip(facing,side,seated,col);let best={x:expected.x*2,y:expected.y*2},score=Infinity;
      for(let y=32;y<58;y++)for(let x=10;x<54;x++){
       const p=frame.get(x,y);if(!p[3]||p[0]<130||p[0]-p[1]<14||p[1]-p[2]<8)continue;
       const dist=(x-expected.x*2)**2+(y-expected.y*2)**2;
       if(dist<score){score=dist;best={x,y};}
      }
      hands[side]={x:best.x/2-16,y:best.y/2-32};
     }
     gripData[id][`${row}:${col}`]=hands;
    }
   }
  }
  report.push({sex,group,detectedRows:bands.length,source:[originalSrc.width,originalSrc.height]});
 }
 for(const [path,canvas]of [[`assets/sprites/body-${id}.png`,body],[`assets/sprites/outfit-${outfitId}.png`,outfit],[`${root}/${sex}-actions-preview.png`,preview]] as const){
  const backup=`${root}/${path.split('/').pop()}-pre-actions.png`;if(!existsSync(backup)&&existsSync(path))writeFileSync(backup,readFileSync(path));writeFileSync(path,encodePng(canvas));
 }
}
writeFileSync('apps/client/src/character-art-grips.json',JSON.stringify(gripData,null,2)+'\n');writeFileSync(`${root}/actions-assembly.json`,JSON.stringify(report,null,2));
console.log(report);
