// Optional local smoke review. Requires Playwright/Chromium in the review environment.
const{chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const out=path.resolve('docs/park-layout');fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1200,height:1240}});
    await page.goto('file://'+path.join(out,'winter-layout.svg'));
    await page.locator('svg').screenshot({path:path.join(out,'winter-layout.png')});
    const errors=[],assetFailures=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)assetFailures.push({url:r.url(),status:r.status()});});
    await page.setViewportSize({width:1280,height:1100});
    await page.goto(process.env.ONEPARK_REVIEW_URL||'http://127.0.0.1:5189');
    await page.waitForFunction(()=>window.game?.scene.isActive('Lobby'),{timeout:30000});
    await page.evaluate(async()=>{
      const nick='겨울정원'+Date.now().toString().slice(-4);
      await window.game.scene.getScene('Lobby').enter({mode:'signup',nickname:nick,pin:'1357',appearance:{gender:'female',face:'female-longhair',outfit:'ivory-sleeveless'}});
    });
    await page.waitForFunction(()=>window.game?.scene.isActive('Park')&&window.game.scene.getScene('Park').player,{timeout:30000});
    await page.waitForTimeout(800);
    const runtime=await page.evaluate(()=>{
      const scene=window.game.scene.getScene('Park');
      const result={width:scene.map.width,height:scene.map.height,widthPx:scene.map.widthInPixels,heightPx:scene.map.heightInPixels,landmarks:scene.map.getObjectLayer('landmarks').objects.length,trucks:scene.map.getObjectLayer('trucks').objects.length,seats:scene.seats.length,gridLength:scene.grid.blocked.length,entrance:scene.player.position};
      const cam=scene.cameras.main;cam.stopFollow();cam.removeBounds();cam.setZoom(.175);cam.centerOn(scene.map.widthInPixels/2,scene.map.heightInPixels/2);return result;
    });
    assert.equal(runtime.width,144);assert.equal(runtime.height,176);assert.equal(runtime.gridLength,144*176);assert.equal(runtime.trucks,8);assert.equal(runtime.seats,22);assert.equal(runtime.landmarks,10);
    await page.waitForTimeout(100);
    await page.screenshot({path:path.join(out,'in-game-overview.png')});
    for(const[name,x,y]of [['garden',64,94],['stage',52,38],['pond',105,85],['bridge',104,109]]){
      await page.evaluate(({x,y})=>{const s=window.game.scene.getScene('Park');s.cameras.main.setZoom(1.5).centerOn((x+.5)*32,(y+.5)*32);},{x,y});
      await page.waitForTimeout(80);await page.screenshot({path:path.join(out,`in-game-${name}.png`)});
    }
    const relevantFailures=assetFailures.filter(r=>!r.url.endsWith('/favicon.ico'));
    assert.deepEqual(errors,[]);assert.deepEqual(relevantFailures,[]);
    const report={runtime,pageErrors:errors,failedRequests:relevantFailures,serverConnected:true};
    fs.writeFileSync(path.join(out,'browser-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
