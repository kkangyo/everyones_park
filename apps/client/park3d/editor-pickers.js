// Image choices use the same surface textures, trees and lamps as the park.
(function () {
  function modelImages(THREE) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(128, 128);
    renderer.setClearColor(0xe5eaf0, 1);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf8fbff, 0x767b85, 0.9));
    const sun = new THREE.DirectionalLight(0xfff1df, 0.8); sun.position.set(-3, 8, 6); scene.add(sun);
    const camera = new THREE.OrthographicCamera(-2.5, 2.5, 2.5, -2.5, 0.1, 50);
    camera.position.set(6, 4.5, 9); camera.lookAt(0, 2, 0);
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const images = { trees: new Map(), lamps: new Map() };
    try {
      window.ParkTrees.styles.forEach((style, i) => {
        const group = new THREE.Group(), parts = window.ParkTrees.geometry(THREE, style.id, 7919 + i * 101);
        for (const { geometry } of parts) group.add(new THREE.Mesh(geometry, material));
        scene.add(group);
        renderer.render(scene, camera);
        images.trees.set(style.id, renderer.domElement.toDataURL());
        scene.remove(group);
        for (const { geometry } of parts) geometry.dispose();
      });
      Object.assign(camera, { left: -1.8, right: 1.8, top: 1.8, bottom: -1.8 });
      camera.position.set(4, 2.8, 9); camera.lookAt(0, 1.5, 0); camera.updateProjectionMatrix();
      for (const style of window.ParkLamps.styles) {
        const lamp = window.ParkLamps.create(THREE, style.id);
        scene.add(lamp);
        renderer.render(scene, camera);
        images.lamps.set(style.id, renderer.domElement.toDataURL());
        scene.remove(lamp); window.ParkLamps.dispose(lamp);
      }
    } finally {
      material.dispose(); renderer.dispose(); renderer.forceContextLoss();
    }
    return images;
  }
  function picker(select, styles, images) {
    const panel = document.createElement('details'); panel.className = 'ePicker'; panel.id = select.id + 'Picker';
    panel.addEventListener('keydown', (event) => event.stopPropagation());
    const summary = document.createElement('summary');
    const current = document.createElement('img'); current.alt = ''; current.width = current.height = 48;
    const name = document.createElement('span');
    const label = select.closest('label').textContent.trim();
    summary.append(current, name); panel.append(summary);
    const list = document.createElement('div'); list.className = 'eChoices'; list.setAttribute('aria-label', select.closest('label').textContent.trim() + ' 이미지 선택');
    const buttons = new Map();
    let lastGroup;
    for (const style of styles) {
      if (style.group && style.group !== lastGroup) {
        const heading = document.createElement('strong'); heading.textContent = style.group; list.append(heading); lastGroup = style.group;
      }
      const button = document.createElement('button'); button.type = 'button'; button.dataset.value = style.id;
      const image = document.createElement('img'); image.src = images.get(style.id); image.alt = ''; image.width = image.height = 48;
      const text = document.createElement('span'); text.textContent = style.name;
      button.append(image, text); list.append(button); buttons.set(style.id, button);
      button.onclick = () => { select.value = style.id; select.dispatchEvent(new Event('change', { bubbles: true })); panel.open = false; summary.focus(); };
    }
    function sync() {
      current.src = images.get(select.value);
      name.textContent = styles.find((s) => s.id === select.value).name;
      summary.setAttribute('aria-label', label + ' 이미지 선택: ' + name.textContent);
      for (const [id, button] of buttons) button.setAttribute('aria-pressed', String(id === select.value));
    }
    select.addEventListener('change', sync);
    panel.append(list); select.closest('label').after(panel);
    sync();
  }
  window.ParkEditorPickers = {
    install(THREE, setTool) {
      const images = new Map();
      for (const style of window.ParkGround.styles) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
        window.ParkGround.preview(canvas, style.id); images.set(style.id, canvas.toDataURL());
      }
      picker(document.getElementById('eTile'), window.ParkGround.styles, images);
      const tree = document.getElementById('eTree');
      tree.addEventListener('change', () => setTool('tree'));
      const models = modelImages(THREE);
      picker(tree, window.ParkTrees.styles, models.trees);
      picker(document.getElementById('eLamp'), window.ParkLamps.styles, models.lamps);
    },
  };
})();
