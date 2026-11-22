// Optional visual/numerical review using the production model, pose code and bench builder.
// NODE_PATH=<playwright modules> PARK_REVIEW_URL=http://localhost:5173 node scripts/review-alpaca-seat.cjs
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = process.env.PARK_REVIEW_URL || 'http://localhost:5173';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 720 } }), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/__alpaca-seat-review', (route) => route.fulfill({ contentType: 'text/html', body: '<html><style>body{margin:0;background:#e7edf3}canvas{display:block}</style></html>' }));
    await page.goto(base + '/__alpaca-seat-review');
    for (const file of ['three.min.js', 'GLTFLoader.js', 'SkeletonUtils.js', 'meshopt_decoder.js', 'lamps.js', 'trees.js', 'ground.js', 'world.js']) await page.addScriptTag({ url: base + '/park3d/' + file });
    const source = fs.readFileSync(path.resolve('apps/client/src/sd/main.js'), 'utf8');
    const ramp = source.slice(source.indexOf('const DOLL_RAMP ='), source.indexOf('const mats ='));
    const dolls = source.slice(source.indexOf('const DOLL_H ='), source.indexOf('// 두 인형 모두 같은 손 앵커')).replace('const kinds = Object.keys(DOLL_KINDS)', "const kinds = ['girl', 'alpaca']");
    const person = source.slice(source.indexOf('function posePerson('), source.indexOf('/** 고양이 자세:', source.indexOf('function posePerson(')));
    await page.addScriptTag({ content: `(async () => {
      const THREE = window.THREE, MESHY_DOLL = true;
      const { createArmIK } = await import('/src/sd/arm-ik.js');
      const pivot = (x,y,z,p) => { const g = new THREE.Group(); g.position.set(x,y,z); p.add(g); return g; };
      const ease = (a,b,k) => a+(b-a)*Math.min(1,k);
      const yawOf = (f) => ({down:0,right:Math.PI/2,up:Math.PI,left:-Math.PI/2})[f];
      const turn = (a,b,k) => a+(((b-a)%(Math.PI*2)+Math.PI*3)%(Math.PI*2)-Math.PI)*Math.min(1,k);
      const actOffset = () => [0,0], ART = 1, camRight = new THREE.Vector3(1,0,0);
      ${ramp}\n${dolls}\n${person}
      window.__seatReview = { buildDoll, posePerson, DOLL_KINDS };
    })().catch(e => { throw e; });` });
    await page.waitForFunction(() => window.__seatReview);
    if (process.env.PARK_SEAT_DOWN !== undefined || process.env.PARK_SEAT_FWD !== undefined) await page.evaluate((offset) => Object.assign(window.__seatReview.DOLL_KINDS.alpaca.sit, offset), {
      ...(process.env.PARK_SEAT_DOWN !== undefined ? { down: Number(process.env.PARK_SEAT_DOWN) } : {}),
      ...(process.env.PARK_SEAT_FWD !== undefined ? { fwd: Number(process.env.PARK_SEAT_FWD) } : {}),
    });
    const report = await page.evaluate(() => {
      const T = THREE, r = window.__seatReview;
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(900,720); document.body.append(renderer.domElement);
      const scene = new T.Scene(); scene.background = new T.Color(0xe7edf3); scene.add(new T.HemisphereLight(0xf8fbff,0x8e8790,0.62));
      const sun = new T.DirectionalLight(0xfff1dc,0.75); sun.position.set(-3,6,4); scene.add(sun);
      const map = { width:24,height:24,layers:[{name:'ground',data:Array(576).fill(1)},{name:'obstacles',data:Array(576).fill(0)},...['trucks','landmarks','spawns','animals','tables'].map(name=>({name,objects:[]})),{name:'seats',objects:[{name:'review-bench',x:10*32,y:10*32,width:64,height:32,properties:[{name:'kind',value:'bench'},{name:'slots',value:2},{name:'facing',value:'down'}]}]}] };
      let world = window.ParkWorld.create(T,map,new Map(),renderer); scene.add(world.root); let seat = world.SEATS[0];
      const model = r.buildDoll('alpaca'); scene.add(model.root);
      const c = {model,seat,pos:new T.Vector3(seat.slots[0].x,seat.group.position.y,seat.slots[0].z),yaw:seat.yaw,facing:'down',moving:false,walkT:0,hop:0,hands:[],act:null,eating:null};
      for(let i=0;i<180;i++)r.posePerson(c,1/60,i/60);
      scene.updateMatrixWorld(true);
      const hips = model.root.getObjectByName('Hips').getWorldPosition(new T.Vector3());
      const local = seat.group.worldToLocal(hips.clone());
      const camera = new T.PerspectiveCamera(34,900/720,0.1,80); const center = seat.group.position.clone().add(new T.Vector3(0,.8,0));
      function view(side) { camera.position.copy(center).add(new T.Vector3(side?3.5:2.7,1.2,side?.4:3.6)); camera.lookAt(center); renderer.render(scene,camera); }
      view(false);
      function validateDirections() {
        const report = [];
        for (const facing of ['down','right','up','left']) {
          world.dispose();
          const object = map.layers.find(l=>l.name==='seats').objects[0], side = facing==='left'||facing==='right';
          object.width=(side?1:2)*32; object.height=(side?2:1)*32; object.properties.find(p=>p.name==='facing').value=facing;
          world=window.ParkWorld.create(T,map,new Map(),renderer); scene.add(world.root); seat=world.SEATS[0];
          c.seat=seat; c.pos.set(seat.slots[0].x,seat.group.position.y,seat.slots[0].z); c.yaw=seat.yaw; c.facing=facing; c.moving=false;
          for(let i=0;i<180;i++)r.posePerson(c,1/60,i/60);
          scene.updateMatrixWorld(true);
          const hip=seat.group.worldToLocal(model.root.getObjectByName('Hips').getWorldPosition(new T.Vector3()));
          const slot=seat.group.worldToLocal(new T.Vector3(seat.slots[0].x,seat.group.position.y,seat.slots[0].z));
          const offset=hip.clone().sub(slot);
          c.seat=null;
          for(let i=0;i<180;i++)r.posePerson(c,1/60,i/60);
          const standingOffset=model.body.position.toArray();
          c.moving=true;
          for(let i=0;i<60;i++){c.walkT+=1/60;r.posePerson(c,1/60,i/60);}
          report.push({facing,hipHeight:hip.y,offsetFromSlot:offset.toArray(),standingOffset,walkingOffset:model.body.position.toArray()});
        }
        return report;
      }
      window.__seatView={renderer,scene,model,c,camera,view,validateDirections,config:r.DOLL_KINDS.alpaca};
      return { hipsRelativeToBench:local.toArray(), seatTop:.42, bodyOffset:model.body.position.toArray(), config:r.DOLL_KINDS.alpaca.sit, clips:Object.keys(model.doll.act) };
    });
    const out = process.env.PARK_SEAT_REVIEW_OUT || '/tmp/alpaca-seat';
    await page.screenshot({ path: out + '-front.png' });
    await page.evaluate(() => window.__seatView.view(true));
    await page.screenshot({ path: out + '-side.png' });
    const directions = await page.evaluate(() => window.__seatView.validateDirections());
    for (const result of directions) {
      assert.ok(result.hipHeight > .44 && result.hipHeight < .56, result.facing + ': hips should rest over the seat');
      assert.ok(Math.abs(result.offsetFromSlot[0]) < .04 && Math.abs(result.offsetFromSlot[2]) < .04, result.facing + ': pelvis should align with the assigned slot');
      assert.ok(result.standingOffset.every(n=>Math.abs(n)<.00001), 'Standing must not retain the sitting offset');
      assert.ok(result.walkingOffset.every(n=>Math.abs(n)<.00001), 'Walking must not retain the sitting offset');
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ...report, directions, errors }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
