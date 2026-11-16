// Optional visual review. Requires Playwright in the review environment.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PARK_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent('<html lang="ko"><meta charset="utf-8"><style>body{margin:0;background:#dfe5ec;font:16px sans-serif;color:#293540}h1{margin:24px 32px 4px;font-size:26px}p{margin:0 32px}canvas{display:block}#labels{position:absolute;inset:96px 0 0;pointer-events:none}.label{position:absolute;text-align:center;width:270px;font-size:16px}.label b{display:block;font-size:18px;margin-bottom:5px}</style><h1>겨울 공원 · 나무 10종</h1><p>갈라진 줄기와 잔가지, 수피의 색, 가지 위의 눈과 상고대</p><div id="labels"></div><canvas></canvas></html>');
    if (process.env.PARK_REVIEW_FONT) {
      const font = fs.readFileSync(process.env.PARK_REVIEW_FONT).toString('base64');
      await page.addStyleTag({ content: `@font-face{font-family:Review;src:url(data:font/ttf;base64,${font})}body{font-family:Review,sans-serif}` });
      await page.evaluate(() => document.fonts.load('16px Review'));
    }
    await page.addScriptTag({ path: path.resolve('apps/client/park3d/three.min.js') });
    await page.addScriptTag({ path: path.resolve('apps/client/park3d/trees.js') });
    const results = await page.evaluate(() => {
      const T = window.THREE, canvas = document.querySelector('canvas');
      const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(1440, 840); renderer.setClearColor(0xdfe5ec);
      const scene = new T.Scene(); scene.add(new T.HemisphereLight(0xf8fbff, 0x767b85, 0.9));
      const sun = new T.DirectionalLight(0xfff1df, 0.8); sun.position.set(-3, 8, 6); scene.add(sun);
      const camera = new T.OrthographicCamera(-12, 12, 7, -7, 0.1, 100); camera.position.set(0, 6, 24); camera.lookAt(0, 2.1, 0); camera.updateMatrixWorld();
      const material = new T.MeshLambertMaterial({ vertexColors: true });
      const results = [];
      window.ParkTrees.styles.forEach((style, i) => {
        const group = new T.Group(); group.position.set((i % 5 - 2) * 4.8, i < 5 ? 4 : -3.05, 0); scene.add(group);
        const parts = window.ParkTrees.geometry(T, style.id, 7919 + i * 101);
        let triangles = 0;
        for (const { geometry, part } of parts) {
          if (![...geometry.attributes.position.array, ...geometry.attributes.normal.array].every(Number.isFinite)) throw Error('Invalid tree geometry: ' + style.id);
          const mesh = new T.Mesh(geometry, material); group.add(mesh); triangles += geometry.attributes.position.count / 3;
          if (part === 'snow' && !geometry.attributes.color.array.some((c) => c > 0.9)) throw Error('Missing white snow');
        }
        group.updateMatrixWorld(true);
        const bounds = new T.Box3().setFromObject(group);
        if (bounds.max.y - bounds.min.y < 2) throw Error('Tree too short');
        const screen = group.position.clone().add(new T.Vector3(0, -0.25, 0)).project(camera);
        const label = document.createElement('div'); label.className = 'label'; label.style.left = ((screen.x + 1) * 720 - 135) + 'px'; label.style.top = ((1 - screen.y) * 420 + 4) + 'px';
        const [name, detail] = style.name.split(' · '); const title = document.createElement('b'); title.textContent = name; label.append(title, detail); document.getElementById('labels').append(label);
        results.push({ id: style.id, name: style.name, triangles, parts: parts.map((p) => p.part), height: +(bounds.max.y - bounds.min.y).toFixed(2) });
      });
      renderer.render(scene, camera);
      return results;
    });
    if (errors.length) throw Error(errors.join('\n'));
    const out = path.resolve('docs/park-trees'); fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, 'winter-tree-catalog.png') });
    fs.writeFileSync(path.join(out, 'browser-check.json'), JSON.stringify({ trees: results, errors }, null, 2) + '\n');
    console.log(JSON.stringify({ trees: results.length, errors, screenshot: 'docs/park-trees/winter-tree-catalog.png' }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
