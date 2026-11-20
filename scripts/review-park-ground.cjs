// Optional asset export and visual review. Requires Playwright in the review environment.
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PARK_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1700 }, deviceScaleFactor: 1 }), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent('<html lang="ko"><meta charset="utf-8"><style>body{margin:0;padding:26px;background:#eff1f3;color:#344047;font:15px sans-serif}h1{margin:0 0 8px;font-size:28px}p{margin:0 0 20px}#catalog{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.tile{background:white;border:1px solid #d4dadd;border-radius:12px;padding:10px;text-align:center}.tile canvas{display:block;margin:0 auto 8px;border-radius:6px}.tile small{display:block;color:#78858b;margin-bottom:4px}.tile b{font-size:14px}h2{font-size:20px;margin:22px 0 10px}#connection{display:block;border-radius:10px}</style><h1>겨울 공원 · 바닥 타일 25종</h1><p>눈의 양이 다른 잔디 / 벽돌과 블록 산책로 / 잔디 연결 / 호숫가 재질</p><div id="catalog"></div><h2>연결 예시 · 잔디 → 벽돌길 → 눈과 조약돌 호숫가 → 얼음</h2><canvas id="connection" width="1024" height="256"></canvas></html>');
    if (process.env.PARK_REVIEW_FONT) {
      const font = fs.readFileSync(process.env.PARK_REVIEW_FONT).toString('base64');
      await page.addStyleTag({ content: `@font-face{font-family:Review;src:url(data:font/ttf;base64,${font})}body{font-family:Review,sans-serif}` });
      await page.evaluate(() => document.fonts.load('16px Review'));
    }
    await page.addScriptTag({ path: path.resolve('apps/client/park3d/ground.js') });
    const result = await page.evaluate(() => {
      const api = window.ParkGround, manifest = [], atlas = document.createElement('canvas'); atlas.width = atlas.height = 160;
      const atlasG = atlas.getContext('2d'); atlasG.imageSmoothingEnabled = false;
      let custom = 0;
      api.styles.forEach((style, index) => {
        const card = document.createElement('div'); card.className = 'tile';
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 144; api.preview(canvas, style.id);
        const group = document.createElement('small'); group.textContent = style.group;
        const title = document.createElement('b'); title.textContent = style.name;
        card.append(canvas, group, title); document.getElementById('catalog').append(card);
        const tile = document.createElement('canvas'); tile.width = tile.height = 16;
        const g = tile.getContext('2d'), image = g.createImageData(16,16);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const col = api.sample(style, (x+0.5)/16, (y+0.5)/16);
          if (!col.every(Number.isFinite)) throw Error('Invalid texture sample: ' + style.id);
          image.data.set([...col.map(Math.round),255], (y*16+x)*4);
        }
        g.putImageData(image,0,0); const x = index%5*32, y = Math.floor(index/5)*32; atlasG.drawImage(tile,x,y,32,32);
        manifest.push({id:style.id,name:style.name,group:style.group,baseTile:style.base,x,y,width:32,height:32});
        if (style.id !== String(style.base)) custom++;
      });
      const map = {width:32,height:8,layers:[{name:'ground',data:[]}],editor3d:{groundStyles:{}}};
      for (let z = 0; z < map.height; z++) for (let x = 0; x < map.width; x++) {
        const id = x < 10 ? ['grass-bare','grass-dusting','grass-patchy','grass-deep'][Math.floor(z/2)] : x === 10 || x === 17 ? 'edge-brick' : x < 18 ? 'brick-brown' : x < 22 ? 'grass-deep' : x < 24 ? 'shore-reeds' : x < 26 ? 'shore-pebbles' : x < 27 ? 'shore-stone' : '5';
        map.layers[0].data.push(api.byId.get(id).base); map.editor3d.groundStyles[z*map.width+x]=id;
      }
      const base = document.createElement('canvas'); base.width=map.width*8;base.height=map.height*8;
      const combined=api.compose(base,map);const g=document.getElementById('connection').getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(combined,0,0,1024,256);
      const grass=api.byId.get('grass-patchy'),edge=api.byId.get('edge-brick');
      for(const [x,z,side] of [[0.01,0.5,0],[0.99,0.5,1],[0.5,0.01,2],[0.5,0.99,3]]){const neighbors=[edge,edge,edge,edge];neighbors[side]=grass;const a=api.sample(edge,x,z,neighbors),b=api.sample(grass,x,z);if(a.some((v,i)=>Math.abs(v-b[i])>0.01))throw Error('Edge orientation failed');}
      const snowAverages=['grass-bare','grass-dusting','grass-patchy','grass-deep'].map(id=>{let sum=0;for(let z=0;z<64;z++)for(let x=0;x<64;x++){const c=api.sample(api.byId.get(id),(x+.5)/16,(z+.5)/16);sum+=(c[0]+c[1]+c[2])/3;}return sum/4096;});
      if(snowAverages.some((v,i)=>i>0&&v<=snowAverages[i-1]))throw Error('Snow coverage is not increasing');
      return {manifest,atlas:atlas.toDataURL(),custom,snowAverages};
    });
    assert.deepEqual(errors, []);
    const out=path.resolve('docs/park-ground');fs.mkdirSync(out,{recursive:true});
    await page.screenshot({path:path.join(out,'winter-ground-catalog.png'),fullPage:true});
    fs.writeFileSync('assets/tiles/winter-surfaces.png',Buffer.from(result.atlas.split(',')[1],'base64'));
    fs.writeFileSync('assets/tiles/winter-surfaces.json',JSON.stringify({tileSize:32,columns:5,tiles:result.manifest},null,2)+'\n');
    fs.writeFileSync(path.join(out,'browser-check.json'),JSON.stringify({styles:result.manifest.length,customStyles:result.custom,snowAverages:result.snowAverages,edgeDirections:4,errors},null,2)+'\n');
    console.log(JSON.stringify({styles:result.manifest.length,customStyles:result.custom,edgeDirections:4,errors}));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
