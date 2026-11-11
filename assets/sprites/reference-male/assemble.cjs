// Run with NODE_PATH pointing to an installation of pngjs.
// Assemble individual generated poses at a uniform 1/3 scale, never resize an atlas.
const { PNG } = require('pngjs');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'generated-source.png')));
const spans = [[7,83],[90,162],[169,240],[247,323],[329,402],[409,483],[489,562],[569,643],[654,729],[737,810],[815,891],[899,973],[979,1054],[1059,1135],[1141,1205],[1212,1276],[1282,1348],[1355,1416],[1421,1483],[1488,1551],[1556,1620],[1627,1687],[1693,1737],[1748,1780],[1790,1823],[1831,1873]];
const centers = [260,365,470,575];
const rows = [0,1,2,3,4,5,6,7,8,9,10,3,11,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25];
const preview = new PNG({width:128,height:896});
const body = new PNG({width:128,height:896});
const outfit = new PNG({width:128,height:896});
for(let row=0;row<28;row++) for(let col=0;col<4;col++) {
  const sourceRow=rows[row], [top,bottom]=spans[sourceRow];
  const resting=row>=16, lying=row>=24;
  const sourceCol=col===2&&!resting?0:col;
  const sourceTop=lying?Math.round((top+bottom)/2)-48:top-3;
  const targetTop=lying?0:resting?6:3;
  const bob=col%2===1?-1:0;
  for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
    const mirror=row===13;
    const localX=mirror?31-x:x;
    let sy=sourceTop+(y-targetTop)*3+1;
    if(!lying&&y<25)sy-=bob*3;
    if(lying&&y>=13&&y<=20)sy-=bob*3;
    const sx=centers[sourceCol]-48+localX*3+1;
    if(sy<top||sy>=bottom||sx<0||sx>=src.width)continue;
    const i=(sy*src.width+sx)*4;
    if(src.data[i+3]<160)continue;
    // Native opaque pixel palette; no antialiased outline or matte fringe.
    const color=[...src.data.subarray(i,i+3)].map(v=>Math.round(v/16)*16).map(v=>Math.min(255,v));
    const dst=((row*32+y)*128+col*32+x)*4;
    preview.data.set([...color,255],dst);
    // Outfit owns every sleeve and hand; body owns head/neck and shoes.
    let onBody = y<16 || y>=29;
    if(lying){
      onBody=row===24?y>=20||y<10:row===27?y<12||y>=24:row===25?x<13||x>=26:x>=20||x<7;
    }
    (onBody?body:outfit).data.set([...color,255],dst);
  }
}
for(const [name,png] of [['preview-male-reference.png',preview],['body-male-reference.png',body],['outfit-black-blazer-reference.png',outfit]]) {
  const dest=path.join(root,'..',name);
  fs.writeFileSync(dest,PNG.sync.write(png));
  const check=PNG.sync.read(fs.readFileSync(dest));
  if(check.width!==128||check.height!==896)throw Error('Invalid size');
  for(let r=0;r<28;r++)for(let c=0;c<4;c++){
    let count=0;
    for(let y=0;y<32;y++)for(let x=0;x<32;x++)count+=check.data[((r*32+y)*128+c*32+x)*4+3]>0;
    if(!count)throw Error(`Empty frame ${r*4+c}`);
  }
  console.log(name,check.width,check.height,'RGBA, 112 nonempty cells');
}
