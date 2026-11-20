// Run against the dev client; NODE_PATH may point to an external Playwright install.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const {resolve} = require('node:path');
const {writeFileSync} = require('node:fs');
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:process.env.PARK_REVIEW_CHROMIUM, args:['--no-sandbox']});
 try {
  const page = await browser.newPage({viewport:{width:1280,height:900}}), errors=[], failures=[];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('response', r=>{if(r.url().includes('/sprites/food-hd/') && r.status()!==200)failures.push(r.url());});
  await page.route('**/src/sd/main.js*', async route => {
   let code = await (await route.fetch()).text();
   code = code.replaceAll('requestAnimationFrame(frame);','/* paused for deterministic review */');
   code = code.replace('if (DOLL) return buildDoll(dollKind(l));', 'if (DOLL && !window.__reviewFallback) return buildDoll(dollKind(l));');
   code = code.replace('if (import.meta.env.DEV) window.__park =', 'window.__foodReview = { buildFood, buildPerson, posePerson, MENU, DEFAULT_LOOK }; if (import.meta.env.DEV) window.__park =');
   // Accept both Vite's transformed and untransformed dev flag.
   if (!code.includes('window.__foodReview')) code = code.replace('window.__park =', 'window.__foodReview = { buildFood, buildPerson, posePerson, MENU, DEFAULT_LOOK }; window.__park =');
   await route.fulfill({body:code,contentType:'text/javascript'});
  });
  await page.goto(process.env.PARK_REVIEW_URL || 'http://127.0.0.1:5191/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__foodReview,null,{timeout:60000});
  await page.waitForTimeout(600);
  const report = await page.evaluate(() => {
   const T=window.THREE, api=window.__foodReview;
   const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); renderer.setSize(1280,900);renderer.setClearColor(0xe7edf0);
   document.body.replaceChildren(renderer.domElement);
   const scene=new T.Scene(), camera=new T.PerspectiveCamera(30,1280/900,.1,50);camera.position.set(0,2.6,8);camera.lookAt(0,.8,0);
   scene.add(new T.HemisphereLight(0xffffff,0x999999,1));
   const characters=[], kinds=['long','short','curly','fallback'];
   for(let i=0;i<4;i++) {
    window.__reviewFallback=i===3;
    const model=api.buildPerson({...api.DEFAULT_LOOK,hair:i===3?'long':kinds[i]});
    model.root.position.x=(i-1.5)*1.25;scene.add(model.root);
    const c={model,pos:new T.Vector3((i-1.5)*1.25,0,0),facing:"down",yaw:0,hop:0,hands:[],eating:null,act:null,moving:false,walkT:0,seat:null};characters.push(c);
   }
   const materials=new Set();let compared=0;
   for(const id of api.MENU.keys())for(let stage=0;stage<3;stage++){
    const sprite=api.buildFood(id,stage);materials.add(sprite.material);
    if(!sprite.isSprite || sprite.material.map.image.width!==128 || sprite.center.y!==.25)throw Error('Invalid sprite '+id);
    if(api.buildFood(id,stage).material!==sprite.material)throw Error('Frame cache miss');
    const sheet=[...performance.getEntriesByType('resource')].find(r=>r.name.endsWith('/food-hd/'+id+'.png'));
    if(!sheet)throw Error('HD sheet was not fetched: '+id);
    const alpha=sprite.material.map.image.getContext('2d').getImageData(0,0,128,128).data;
    if(!alpha.some((v,i)=>i%4===3 && v===0)||!alpha.some((v,i)=>i%4===3 && v>200))throw Error('Transparency missing');
    compared++;
   }
   for(const c of characters) {
    c.hands=[{item:api.MENU.get('dakkochi'),side:'left',stage:0},{item:api.MENU.get('bungeoppang-red'),side:'right',stage:0}];
    for(let stage=0;stage<3;stage++){
     c.hands.forEach(h=>h.stage=stage);c.eating={h:c.hands[0],t:.3};
     for(let tick=0;tick<12;tick++)api.posePerson(c,.05,1);
     for(const side of ['left','right']){
      const anchor=c.model.food[side].anchor, sprite=anchor.children[0];
      if(anchor.children.length!==1 || !sprite.name.endsWith(':'+stage))throw Error('Hand stage mismatch');
      scene.updateMatrixWorld(true);
      if(!(sprite.getWorldPosition(new T.Vector3()).distanceTo(anchor.getWorldPosition(new T.Vector3()))<1e-6))throw Error('Grip drift');
     }
    }
    c.hands.forEach(h=>h.stage=0);c.eating=null;api.posePerson(c,.05,1);
   }
   window.__reviewRender={renderer,scene,camera,characters,api};
   renderer.render(scene,camera);
   return {foods:api.MENU.size,frames:compared,cachedMaterials:materials.size,characters:kinds,stages:3};
  });
  const motion=await page.evaluate(()=>{
   const {characters,api,renderer,scene,camera}=window.__reviewRender, T=window.THREE;
   const results=[];
   for(const c of characters) {
    for(let i=0;i<360;i++)api.posePerson(c,1/60,0);
    const hands={};
    for(const side of ['left','right']){
     const a=c.model.food[side].anchor;
     const armBone=c.model.doll?.bones.arms[side] || c.model.arms[side];
     const forearm=c.model.root.getObjectByName(side==='left'?'LeftForeArm':'RightForeArm') || armBone.userData.forearm;
     const elbowBefore=forearm.quaternion.clone();
     const before=a.getWorldPosition(new T.Vector3()), q=armBone.quaternion.clone();
     for(let i=0;i<180;i++)api.posePerson(c,1/60,0);
     const drift=before.distanceTo(a.getWorldPosition(new T.Vector3())), angle=q.angleTo(armBone.quaternion);
     if(drift>.002 || angle>.01)throw Error('Holding still drifts: '+JSON.stringify({side,drift,angle}));
     const other=side==='left'?'right':'left', otherBefore=c.model.food[other].anchor.getWorldPosition(new T.Vector3());
     const hold=before.clone();let maxStep=0, prev=hold.clone();
     c.eating={h:c.hands.find(h=>h.side===side),t:0};
     for(let i=0;i<60;i++){
      c.eating.t=i/60;api.posePerson(c,1/60,0);
      const p=a.getWorldPosition(new T.Vector3());maxStep=Math.max(maxStep,p.distanceTo(prev));prev.copy(p);
     }
     const eat=a.getWorldPosition(new T.Vector3()), head=(c.model.doll?.bones.head || c.model.head).getWorldPosition(new T.Vector3());
     const otherDrift=otherBefore.distanceTo(c.model.food[other].anchor.getWorldPosition(new T.Vector3()));
     if(elbowBefore.angleTo(forearm.quaternion)<.1)throw Error('Elbow did not bend');
     if(eat.y<hold.y+.06 || otherDrift>.005 || maxStep>.025)throw Error('Bad eating path: '+JSON.stringify({side,lift:eat.y-hold.y,otherDrift,maxStep}));
     hands[side]={drift,angle,lift:eat.y-hold.y,otherDrift,maxStep,headDistance:eat.distanceTo(head)};
     c.eating=null;for(let i=0;i<180;i++)api.posePerson(c,1/60,0);
    }
    c.eating={h:c.hands[0],t:1};for(let i=0;i<90;i++)api.posePerson(c,1/60,0);
    results.push(hands);
   }
   renderer.render(scene,camera);return results;
  });
  await page.screenshot({path:resolve('docs/food-remake/held-food-eating.png')});
  await page.evaluate(()=>{const {characters,api,renderer,scene,camera}=window.__reviewRender;for(const c of characters){c.eating=null;for(let i=0;i<180;i++)api.posePerson(c,1/60,0);}renderer.render(scene,camera);});
  await page.screenshot({path:resolve('docs/food-remake/held-food-holding.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);writeFileSync(resolve('docs/food-remake/held-food-motion-check.json'),JSON.stringify({...report,motion,errors,failures},null,2)+'\n');console.log(JSON.stringify({...report,motion,errors,failures}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
