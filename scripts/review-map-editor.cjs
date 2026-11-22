// Optional browser regression: npm install playwright in the review environment.
// PARK_REVIEW_URL=http://localhost:3100 node scripts/review-map-editor.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.PARK_REVIEW_URL || 'http://localhost:3100';
async function signature(page, getWorld) {
  return page.evaluate((expression) => {
    const world = (0, eval)(expression), nodes = [];
    world.root.updateMatrixWorld(true);
    function hash(array) {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      let h = 2166136261;
      for (const b of bytes) h = Math.imul(h ^ b, 16777619);
      return h >>> 0;
    }
    world.root.traverse((o) => {
      if (!o.geometry) return;
      nodes.push({ type: o.type, matrix: o.matrixWorld.elements, position: hash(o.geometry.attributes.position.array),
        normal: o.geometry.attributes.normal && hash(o.geometry.attributes.normal.array),
        index: o.geometry.index && hash(o.geometry.index.array), count: o.count,
        instances: o.instanceMatrix && hash(o.instanceMatrix.array), color: o.material.color?.getHex(),
        map: o.material.map ? [o.material.map.minFilter, o.material.map.magFilter, o.material.map.anisotropy] : null });
    });
    return { nodes, heights: [[20, 20], [60.5, 70.5], [100, 140], [72, 88]].map(([x, z]) => world.heightAt(x, z)),
      seats: world.SEATS.map((s) => [s.id, s.slots, s.group.position.toArray()]),
      trucks: world.trucks.map((t) => [t.id, t.front.toArray(), t.group.position.toArray()]) };
  }, getWorld);
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PARK_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    const main = await browser.newPage(), editor = await browser.newPage(), errors = [];
    for (const page of [main, editor]) page.on('pageerror', (e) => errors.push(e.message));
    await main.route('**/src/sd/main.js*', async (route) => {
      let source = await (await route.fetch()).text();
      source = source.replaceAll('requestAnimationFrame(frame);', 'void 0;')
        .replace('scene.add(world.root);', 'scene.add(world.root); window.__worldReview = world;');
      await route.fulfill({ body: source, contentType: 'text/javascript' });
    });
    await editor.route('**/park3d/?edit', async (route) => {
      let source = await (await route.fetch()).text();
      source = source.replaceAll('requestAnimationFrame(frame);', 'void 0;')
        .replace('  setTool("tree"); $("eGrid")', '  window.__editorReview = { world: () => world, MAP, EDIT, paint, install, pick, moveSel, turnBench, undo, redo, mark, rebuildAll, heightAt, setTool, canPlace, camera, reloadWorld: () => window.ParkWorld.create(THREE, JSON.parse(JSON.stringify(MAP)), TRUCK_DEF, renderer), aim: (x, z) => { EDIT.focus.set(x, heightAt(x, z) + 0.4, z); updateCamera(1); const p = new THREE.Vector3(x, heightAt(x, z), z).project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; } };\n  setTool("tree"); $("eGrid")');
      await route.fulfill({ body: source, contentType: 'text/html' });
    });
    await main.goto(base, { waitUntil: 'domcontentloaded' });
    await main.waitForFunction(() => window.__worldReview);
    await editor.goto(base + '/park3d/?edit', { waitUntil: 'domcontentloaded' });
    await editor.waitForFunction(() => window.__editorReview);
    const original = await signature(main, 'window.__worldReview');
    assert.deepEqual(await signature(editor, 'window.__editorReview.world()'), original, 'Main and editor scenery must match');
    await main.close(); // The retained signature is sufficient for later editor comparisons.
    assert.equal(await editor.locator('#eTreeSize').getAttribute('step'), '1');
    await editor.locator('#eTreeSize').evaluate((slider) => { slider.value = '62'; slider.dispatchEvent(new Event('input')); });
    assert.equal(await editor.locator('#eTreeSizeLabel').textContent(), '62%');
    await editor.locator('#eTreeSize').evaluate((slider) => { slider.value = '100'; slider.dispatchEvent(new Event('input')); });
    async function chooseImage(id, value) {
      const picker = editor.locator('#' + id + 'Picker');
      if (await picker.getAttribute('open') === null) await picker.locator('summary').click();
      await picker.locator('button[data-value="' + value + '"]').click();
    }
    assert.equal(await editor.locator('#eTree, #eTile, #eLamp').evaluateAll((inputs) => inputs.every((input) => input.type === 'hidden')), true);
    async function cameraPitch() {
      return editor.evaluate(() => {
        const direction = window.__editorReview.camera.getWorldDirection(new THREE.Vector3());
        return Math.asin(-direction.y) * 180 / Math.PI;
      });
    }
    assert.ok(Math.abs(await cameraPitch() - 55) < 0.01, 'Editor starts above the park');
    for (const pitch of [85, 35, 55]) {
      await editor.locator('#ePitch').evaluate((slider, value) => { slider.value = value; slider.dispatchEvent(new Event('input')); }, String(pitch));
      assert.ok(Math.abs(await cameraPitch() - pitch) < 0.01, 'Camera elevation follows slider');
      assert.equal(await editor.locator('#ePitchLabel').textContent(), pitch + '°');
    }
    // Every choice shows its actual surface/model beside its name and selects the matching tool.
    for (const [id, count, value, tool] of [['eTree', 10, 'bare3', 'tree'], ['eTile', 25, 'brick-brown', 'tile'], ['eLamp', 9, 'twin', 'lamp']]) {
      const picker = editor.locator('#' + id + 'Picker');
      await picker.locator('summary').click();
      assert.equal(await picker.locator('button').count(), count);
      assert.equal(await picker.locator('button img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)), true);
      assert.equal(await picker.locator('button img').evaluateAll((images) => new Set(images.map((image) => image.src)).size), count, 'Previews must be distinct');
      await picker.locator('button[data-value="' + value + '"]').click();
      assert.equal(await editor.locator('#' + id).inputValue(), value);
      assert.equal(await picker.getAttribute('open'), null);
      assert.equal(await picker.locator('button[aria-pressed="true"]').getAttribute('data-value'), value);
      assert.equal(await editor.evaluate(() => window.__editorReview.EDIT.tool), tool);
    }
    await chooseImage('eLamp', 'copper');
    await chooseImage('eTree', 'pine');
    await chooseImage('eTile', '1');
    const edits = await editor.evaluate(async () => {
      const t = window.__editorReview, m = t.MAP, obstacles = m.layers.find((l) => l.name === 'obstacles').data;
      if (!t.camera.isPerspectiveCamera) throw Error('Editor must use perspective');
      if (document.querySelectorAll('#eTreePicker button').length !== 10) throw Error('Missing main tree species');
      let p;
      for (let z = 10; z < m.height - 10 && !p; z++) for (let x = 10; x < m.width - 10; x++) if (t.canPlace(x, z, 3, 3)) { p = { x, z }; break; }
      const i = p.z * m.width + p.x;
      const water = () => t.world().root.getObjectByName('flowing-water');
      const deck = () => t.world().root.getObjectByName('bridge-deck');
      const ground = m.layers.find((l) => l.name === 'ground').data;
      const wetTiles = ground.filter((tile) => tile === 5 || tile === 15).length;
      if (water().geometry.index.count < wetTiles * 6) throw Error('Water must continue below every bridge tile');
      t.world().update(2.5);
      if (water().material.uniforms.uTime.value !== 2.5) throw Error('Water animation is not updated');
      t.world().update(0);
      const terrain = t.world().root.getObjectByName('park-terrain'), terrainPoints = terrain.geometry.attributes.position;
      const terrainHeights = new Map();
      for (let vertex = 0; vertex < terrainPoints.count; vertex++) terrainHeights.set((terrainPoints.getX(vertex) + m.width / 2) + ',' + (terrainPoints.getZ(vertex) + m.height / 2), terrainPoints.getY(vertex));
      const railCenters = new Set();
      t.world().root.traverse((mesh) => { if (mesh.name === 'bridge-rail') railCenters.add(mesh.position.x + ',' + mesh.position.z); });
      for (let tile = 0; tile < ground.length; tile++) if (ground[tile] === 15) {
        const x = tile % m.width, z = Math.floor(tile / m.width);
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          if (![3,4,16].includes(ground[(z + dz) * m.width + x + dx])) continue;
          if (railCenters.has((x + 0.5 + dx * 0.5) + ',' + (z + 0.5 + dz * 0.5))) throw Error('A bridge entrance rail narrows the road');
          const cx = x + 0.5 + dx * 0.5, cz = z + 0.5 + dz * 0.5;
          for (const offset of [-0.5, 0, 0.5]) {
            const px = cx + (dz ? offset : 0), pz = cz + (dx ? offset : 0);
            const actual = terrainHeights.get(px + ',' + pz);
            if (!Number.isFinite(actual) || Math.abs(actual - t.heightAt(px, pz)) > 0.0001) throw Error('The full road entrance must meet the deck without a drop');
          }
        }
      }
      const timber = deck().geometry.attributes.position;
      for (let plank = 0; plank < timber.count; plank += 36) for (let corner = plank; corner < plank + 6; corner++) {
        if (Math.abs(timber.getY(corner) - t.heightAt(timber.getX(corner), timber.getZ(corner))) > 0.0001) throw Error('Bridge walking height must match the arched timber');
      }
      const oldDeck = timber.count;
      t.setTool('tile'); document.getElementById('eTile').value = '15'; t.mark(); t.paint(p.x, p.z); t.rebuildAll();
      if (deck().geometry.attributes.position.count !== oldDeck + 144 || water().material.uniforms.uMask.value.image.data[i * 4] !== 255 || obstacles[i] !== 0) throw Error('Painting a bridge must add timber over walkable water');
      const restoredBridge = t.reloadWorld();
      if (restoredBridge.root.getObjectByName('bridge-deck').geometry.attributes.position.count !== oldDeck + 144) throw Error('Bridge was lost on map reload');
      restoredBridge.dispose(); t.undo();
      t.setTool('tree'); document.getElementById('eTree').value = 'bare3'; t.mark(); t.paint(p.x, p.z); t.rebuildAll();
      if (m.editor3d.trees[i] !== 'bare3' || obstacles[i] !== 7) throw Error('Birch placement failed');
      const response = await fetch('/__mapedit/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) });
      if (!response.ok) throw Error('Birch map validation failed');
      t.undo(); if (obstacles[i] !== 0) throw Error('Undo failed');
      t.redo(); t.EDIT.sel = t.pick(p); t.moveSel(1, 0);
      if (obstacles[i] || m.editor3d.trees[i + 1] !== 'bare3') throw Error('Tree move failed');
      t.EDIT.key('delete', { preventDefault() {} });
      t.setTool('bench'); document.getElementById('eBenchFacing').value = 'down'; t.install(p);
      for (const facing of ['down','right','up','left']) {
        const seat = t.world().SEATS.find((s) => s.id === t.EDIT.sel.o.name);
        if (seat.facing !== facing || Math.abs(Math.sin(seat.yaw) - ({down:0,right:1,up:0,left:-1}[facing])) > 0.001) throw Error('Bench rotation/facing mismatch');
        t.turnBench();
      }
      t.EDIT.key('delete', { preventDefault() {} });
      const tablesBefore = m.layers.find((l) => l.name === 'tables').objects.length;
      t.setTool('table'); t.install(p);
      if (m.layers.find((l) => l.name === 'tables').objects.length !== tablesBefore + 1) throw Error('Table installation failed');
      t.turnBench(); if (t.EDIT.sel.o.width !== 32 || t.EDIT.sel.o.height !== 96) throw Error('Table rotation failed');
      t.moveSel(1, 0); t.EDIT.key('delete', { preventDefault() {} });
      t.undo(); if (m.layers.find((l) => l.name === 'tables').objects.length !== tablesBefore + 1) throw Error('Table undo failed'); t.redo();
      t.setTool('lamp'); t.install(p); t.EDIT.sel = t.pick(p); t.moveSel(1, 0); t.EDIT.key('delete', { preventDefault() {} });
      const height = t.heightAt(p.x + 0.5, p.z + 0.5);
      t.setTool('raise'); t.mark(); t.paint(p.x, p.z); t.rebuildAll();
      if (Math.abs(t.heightAt(p.x + 0.5, p.z + 0.5) - height - 0.25) > 0.001) throw Error('Sculpt failed');
      t.undo();
      t.setTool('tile'); document.getElementById('eTile').value = '5'; t.mark(); t.paint(p.x, p.z); t.rebuildAll();
      if (obstacles[i] !== 5) throw Error('Ice collision failed');
      t.undo();
      return { treeSpecies: window.ParkWorld.trees.length, perspective: t.camera.isPerspectiveCamera };
    });
    assert.deepEqual(await signature(editor, 'window.__editorReview.world()'), original, 'Rebuilt scenery must match after undo/delete');
    // Exercise the reported UI sequence with actual pointer events, not direct deletion calls.
    async function clickTile(x, z, button = 'left') {
      const screen = await editor.evaluate(([x, z]) => window.__editorReview.aim(x, z), [x, z]);
      await editor.mouse.click(screen.x, screen.y, { button });
    }
    const point = await editor.evaluate(() => {
      const t = window.__editorReview;
      for (let z = 10; z < t.MAP.height - 10; z++) for (let x = 10; x < t.MAP.width - 10; x++) if (t.canPlace(x, z, 3, 3)) {
        t.setTool('tree'); t.mark(); t.paint(x, z); t.rebuildAll(); return { x, z };
      }
    });
    await editor.locator('#eDelete').click();
    assert.equal(await editor.evaluate(() => window.__editorReview.EDIT.tool), 'erase');
    await clickTile(point.x + 0.5, point.z + 0.5, 'right');
    assert.equal(await editor.evaluate(({x,z}) => window.__editorReview.MAP.layers.find(l => l.name === 'obstacles').data[z * window.__editorReview.MAP.width + x], point), 7);
    await clickTile(point.x + 0.5, point.z + 0.5);
    assert.equal(await editor.evaluate(({x,z}) => window.__editorReview.MAP.layers.find(l => l.name === 'obstacles').data[z * window.__editorReview.MAP.width + x], point), 0);
    const history = await editor.evaluate(() => window.__editorReview.EDIT.undo.length);
    await clickTile(point.x + 0.5, point.z + 0.5);
    assert.equal(await editor.evaluate(() => window.__editorReview.EDIT.undo.length), history, 'Empty deletion must not add undo history');
    await editor.evaluate(() => { const t = window.__editorReview; t.undo(); t.redo(); });
    for (const tool of ['bench', 'lamp', 'table']) {
      const count = await editor.evaluate(({tool, point}) => { const t = window.__editorReview; t.setTool(tool); t.install(point); return tool === 'lamp' ? t.MAP.editor3d.lamps.length : t.MAP.layers.find(l => l.name === (tool === 'bench' ? 'seats' : 'tables')).objects.length; }, {tool, point});
      await editor.locator('#eDelete').click();
      await clickTile(point.x + (tool === 'lamp' ? 0.5 : 1.5), point.z + 0.5);
      assert.equal(await editor.evaluate((tool) => { const t = window.__editorReview; return tool === 'lamp' ? t.MAP.editor3d.lamps.length : t.MAP.layers.find(l => l.name === (tool === 'bench' ? 'seats' : 'tables')).objects.length; }, tool), count - 1, tool + ' click deletion');
    }
    // Editing an installed lamp keeps its selection while changing its image choice.
    await chooseImage('eLamp', 'triple');
    await clickTile(point.x + 0.5, point.z + 0.5);
    await editor.evaluate(() => window.__editorReview.setTool('move'));
    await clickTile(point.x + 0.5, point.z + 0.5);
    assert.equal(await editor.locator('#eLampPicker summary span').textContent(), '세 갈래 랜턴');
    await chooseImage('eLamp', 'globe');
    assert.equal(await editor.evaluate(() => window.__editorReview.EDIT.sel?.kind), 'lamp');
    await editor.locator('#eLampApply').click();
    assert.equal(await editor.evaluate(() => window.__editorReview.MAP.editor3d.lamps.at(-1).style), 'globe');
    await editor.evaluate(() => { const t = window.__editorReview; t.undo(); t.undo(); });
    // Check installed size, editing existing trees, persistence and actual instance transforms.
    async function treeSize(point, reload = false) {
      return editor.evaluate(({point, reload}) => {
        const t = window.__editorReview, world = reload ? t.reloadWorld() : t.world();
        let scale;
        world.root.traverse((mesh) => {
          if (mesh.userData.treeStyle !== 'pine' || mesh.userData.treePart !== 'bark') return;
          const a = mesh.instanceMatrix.array;
          for (let i = 0; i < mesh.count; i++) {
            const k = i * 16;
            if (Math.abs(a[k + 12] - point.x - 0.5) < 0.01 && Math.abs(a[k + 14] - point.z - 0.5) < 0.01) scale = Math.hypot(a[k], a[k + 1], a[k + 2]);
          }
        });
        if (reload) world.dispose();
        return scale;
      }, {point, reload});
    }
    await editor.evaluate((point) => {
      const t = window.__editorReview; t.setTool('tree');
      document.getElementById('eTree').value = 'pine';
      const slider = document.getElementById('eTreeSize'); slider.value = '150'; slider.dispatchEvent(new Event('input'));
      t.mark(); t.paint(point.x, point.z); t.rebuildAll(); t.setTool('move');
    }, point);
    assert.equal(await treeSize(point), 1.5, 'New tree must render at 150%');
    assert.equal(await treeSize(point, true), 1.5, 'Size must survive JSON map reload');
    await clickTile(point.x + 0.5, point.z + 0.5);
    assert.equal(await editor.locator('#eTreeSize').inputValue(), '150');
    await editor.locator('#eTreeSize').evaluate((slider) => { slider.value = '200'; slider.dispatchEvent(new Event('input')); });
    await editor.locator('#eTreeSizeApply').click();
    assert.equal(await treeSize(point), 2, 'Existing tree must render at 200%');
    await editor.evaluate(() => window.__editorReview.undo());
    assert.equal(await treeSize(point), 1.5, 'Undo must restore size');
    await editor.evaluate(() => window.__editorReview.redo());
    assert.equal(await treeSize(point), 2, 'Redo must restore size');
    await editor.evaluate(async (point) => {
      const t = window.__editorReview; t.EDIT.sel = t.pick(point); t.moveSel(1, 0);
      const i = point.z * t.MAP.width + point.x;
      if (t.MAP.editor3d.treeScales[i] !== undefined || t.MAP.editor3d.treeScales[i + 1] !== 2) throw Error('Move lost size metadata');
      const response = await fetch('/__mapedit/check', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(t.MAP) });
      if (!response.ok) throw Error('Sized tree failed map validation');
      t.EDIT.key('delete', { preventDefault() {} });
      if (t.MAP.editor3d.treeScales[i + 1] !== undefined) throw Error('Delete left size metadata');
    }, point);
    // Ground variants share base tile IDs but must retain distinct saved textures.
    assert.equal(await editor.locator('#eTilePicker button').count(), 25);
    await chooseImage('eTile', 'grass-bare');
    assert.equal(await editor.evaluate(() => window.__editorReview.EDIT.tool), 'tile');
    await clickTile(point.x + 0.5, point.z + 0.5);
    await editor.evaluate(() => window.__editorReview.rebuildAll());
    assert.equal(await editor.evaluate((p) => { const t = window.__editorReview; return t.MAP.editor3d.groundStyles[p.z*t.MAP.width+p.x]; },point),'grass-bare');
    await chooseImage('eTile', 'grass-deep');
    await clickTile(point.x + 0.5, point.z + 0.5);
    assert.equal(await editor.evaluate((p) => { const t = window.__editorReview; return t.MAP.editor3d.groundStyles[p.z*t.MAP.width+p.x]; },point),'grass-deep');
    await editor.evaluate(() => {const t=window.__editorReview;t.undo();t.undo();});
    await chooseImage('eTile', 'brick-brown');
    await clickTile(point.x + 0.5, point.z + 0.5);
    await editor.evaluate(() => window.__editorReview.rebuildAll());
    const groundCheck = await editor.evaluate(async (p) => {
      const t=window.__editorReview, i=p.z*t.MAP.width+p.x, ground=t.MAP.layers.find(l=>l.name==='ground').data, obst=t.MAP.layers.find(l=>l.name==='obstacles').data;
      if(ground[i]!==3 || obst[i]!==0)throw Error('Paved ground changed collision');
      const read=(world)=>{let image;world.root.traverse(o=>{if(!image&&o.material?.map?.image?.width===t.MAP.width*16)image=o.material.map.image;});if(!image)throw Error('Ground texture missing');return [...image.getContext('2d').getImageData(p.x*16,p.z*16,16,16).data];};
      const expected=read(t.world()), restored=t.reloadWorld();const actual=read(restored);restored.dispose();
      if(expected.some((n,i)=>n!==actual[i]))throw Error('Ground texture lost on JSON reload');
      const r=await fetch('/__mapedit/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(t.MAP)});if(!r.ok)throw Error('New ground failed validation');
      t.undo(); t.redo(); if(t.MAP.editor3d.groundStyles[i]!=='brick-brown')throw Error('Ground redo failed');t.undo();
      return {persistentGround:true};
    },point);
    await chooseImage('eTile', '5');await clickTile(point.x+.5,point.z+.5);
    await chooseImage('eTile', 'shore-pebbles');await clickTile(point.x+.5,point.z+.5);
    assert.equal(await editor.evaluate(p=>{const t=window.__editorReview;return t.MAP.layers.find(l=>l.name==='obstacles').data[p.z*t.MAP.width+p.x];},point),0,'Replacing ice with shore must clear collision');
    await editor.evaluate(()=>{const t=window.__editorReview;t.undo();t.undo();});
    assert.deepEqual(await signature(editor, 'window.__editorReview.world()'), original, 'Click deletion must clear both objects and collision tiles');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ sceneryMatches: true, meshes: original.nodes.length, ...edits, ...groundCheck, errors }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
