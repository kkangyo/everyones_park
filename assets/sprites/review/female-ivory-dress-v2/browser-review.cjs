// Requires Playwright + Chromium in the review environment, not a game dependency.
const { chromium }=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname;
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1150}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('file://'+path.join(root,'review.html'));
    await page.waitForFunction(()=>document.querySelectorAll('canvas').length===28);
    await page.waitForTimeout(100);
    const states=Array.from({length:28},()=>new Set());
    for(let k=0;k<20;k++){
      const hashes=await page.evaluate(()=>Array.from(document.querySelectorAll('canvas'),c=>{
        const d=c.getContext('2d').getImageData(0,0,32,32).data;let h=2166136261;
        for(const p of d)h=Math.imul(h^p,16777619);return h>>>0;
      }));
      hashes.forEach((h,i)=>states[i].add(h));await page.waitForTimeout(167);
    }
    assert.ok(states.every(s=>s.size>=2),'Some pose rows did not animate');
    await page.selectOption('#column','0');
    await page.waitForTimeout(40);
    await page.locator('.grid').screenshot({path:path.join(root,'contact-sheet.png')});
    for(let col=0;col<4;col++){
      await page.selectOption('#column',String(col));await page.waitForTimeout(30);
      await page.locator('.grid').screenshot({path:path.join(root,`column-${col}.png`)});
    }
    for(const layer of ['body','outfit']){
      await page.selectOption('#layer',layer);await page.locator('.grid').screenshot({path:path.join(root,`${layer}-review.png`)});
    }
    await page.selectOption('#layer','both');
    const snapshots=[];
    for(let stage=0;stage<3;stage++){
      await page.selectOption('#stage',String(stage));const tiles=[];
      for(let col=0;col<4;col++)for(const held of ['none','right','left','both']){
        await page.selectOption('#column',String(col));await page.selectOption('#held',held);await page.waitForTimeout(20);
        const tile=await page.evaluate(()=>{
          const cs=Array.from(document.querySelectorAll('canvas')),m=document.createElement('canvas');m.width=128;m.height=96;const ctx=m.getContext('2d');
          [8,9,10,11,12,13,14,15,20,21,22,23].forEach((r,i)=>ctx.drawImage(cs[r],i%4*32,Math.floor(i/4)*32));return m.toDataURL();
        });tiles.push(tile);snapshots.push({stage,col,held});
      }
      const matrix=await page.evaluate(async urls=>{
        const m=document.createElement('canvas');m.width=1536;m.height=1152;const ctx=m.getContext('2d');ctx.imageSmoothingEnabled=false;
        for(let i=0;i<urls.length;i++){const im=new Image();im.src=urls[i];await im.decode();ctx.drawImage(im,i%4*384,Math.floor(i/4)*288,384,288);}return m.toDataURL();
      },tiles);
      fs.writeFileSync(path.join(root,`food-stage-${stage}.png`),Buffer.from(matrix.split(',')[1],'base64'));
    }
    await page.selectOption('#stage','0');await page.selectOption('#column','0');await page.selectOption('#held','both');await page.check('#grips');
    await page.locator('.grid').screenshot({path:path.join(root,'grip-review.png')});
    assert.equal(errors.length,0,errors.join('\n'));
    const report={browser:'Chromium',poseRows:28,animatedRows:states.filter(s=>s.size>=2).length,distinctFramesPerRow:states.map(s=>s.size),foodCombinations:snapshots.length,foodFramesRendered:snapshots.length*12,layerViews:['body','outfit','both'],pageErrors:errors};
    fs.writeFileSync(path.join(root,'browser-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
