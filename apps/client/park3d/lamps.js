// Shared by the standalone map editor and the main 3D park.
(function () {
  const styles = [
    { id: "basic", name: "기존 사각등", color: 0x55607a },
    { id: "copper", name: "동색 클래식 랜턴", color: 0x785448 },
    { id: "globe", name: "청록 유리구형", color: 0x28575b },
    { id: "ornate", name: "검정 장식 랜턴", color: 0x30363d },
    { id: "hanging", name: "옆걸이 랜턴", color: 0x303b3d },
    { id: "twin", name: "양팔 랜턴", color: 0x304943 },
    { id: "shade", name: "원형 갓 가로등", color: 0x65504d },
    { id: "triple", name: "세 갈래 랜턴", color: 0x514742 },
    { id: "modern", name: "청록 꽃봉오리형", color: 0x28756e },
  ];
  function create(THREE, id = "basic") {
    const style = styles.find((s) => s.id === id) || styles[0], root = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: style.color });
    const light = new THREE.MeshBasicMaterial({ color: 0xffe4af });
    const glass = new THREE.MeshLambertMaterial({ color: 0xc8e5df, emissive: 0x6c5731, emissiveIntensity: 0.45 });
    function mesh(geo, mat, x, y, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = mat === metal; m.receiveShadow = true; root.add(m); return m; }
    const cylinder = (rt, rb, h, x, y, mat = metal, sides = 10) => mesh(new THREE.CylinderGeometry(rt, rb, h, sides), mat, x, y);
    const ball = (r, x, y, mat = metal) => mesh(new THREE.SphereGeometry(r, 10, 8), mat, x, y);
    function bar(a, b, r = 0.025) { const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start); const m = mesh(new THREE.CylinderGeometry(r, r, delta.length(), 6), metal, ...start.clone().add(end).multiplyScalar(0.5).toArray()); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); }
    function lantern(x, y, ornate = false) {
      cylinder(0.14, 0.09, 0.34, x, y, glass, ornate ? 6 : 4);
      cylinder(0.16, 0.10, 0.06, x, y - 0.19);
      cylinder(0.035, 0.23, 0.18, x, y + 0.27, metal, ornate ? 6 : 4);
      cylinder(0.24, 0.24, 0.035, x, y + 0.18, metal, ornate ? 6 : 4);
      ball(0.045, x, y + 0.4); ball(0.055, x, y, light);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar([x + sx * 0.065, y - 0.17, sz * 0.065], [x + sx * 0.10, y + 0.16, sz * 0.10], 0.014);
      if (ornate) for (const sign of [-1, 1]) { bar([x + sign * 0.1, y - 0.15, 0], [x + sign * 0.22, y + 0.02, 0], 0.018); bar([x + sign * 0.22, y + 0.02, 0], [x + sign * 0.12, y + 0.14, 0], 0.018); }
    }
    if (style.id === "basic") {
      cylinder(0.05, 0.07, 1.9, 0, 0.95);
      mesh(new THREE.BoxGeometry(0.28, 0.32, 0.28), metal, 0, 2);
      mesh(new THREE.BoxGeometry(0.205, 0.245, 0.29), light, 0, 2);
      root.userData.lightHeight = 2; return root;
    }
    cylinder(0.18, 0.23, 0.09, 0, 0.045);
    cylinder(0.07, 0.17, 0.35, 0, 0.22);
    const top = ["hanging", "twin", "triple"].includes(style.id) ? 2.65 : 2.35;
    cylinder(0.035, 0.065, top - 0.32, 0, (top + 0.32) / 2);
    for (const y of [0.4, 1.45, 2.18]) cylinder(0.075, 0.075, 0.045, 0, y);
    if (style.id === "globe") {
      ball(0.18, 0, 2.53, glass); cylinder(0.04, 0.24, 0.11, 0, 2.77); ball(0.045, 0, 2.86);
      for (const x of [-0.15, 0.15]) bar([0, 2.31, 0], [x, 2.65, 0], 0.018);
    } else if (style.id === "shade") {
      cylinder(0.025, 0.30, 0.13, 0, 2.54); cylinder(0.31, 0.31, 0.035, 0, 2.47); ball(0.085, 0, 2.39, light); ball(0.035, 0, 2.65);
    } else if (style.id === "modern") {
      ball(0.085, 0, 2.45, light);
      for (const sign of [-1, 1]) { bar([0, 2.25, 0], [sign * 0.15, 2.41, 0], 0.028); bar([sign * 0.15, 2.41, 0], [sign * 0.19, 2.57, 0], 0.025); }
    } else if (["hanging", "twin"].includes(style.id)) {
      ball(0.05, 0, 2.78);
      for (const sign of style.id === "twin" ? [-1, 1] : [1]) {
        bar([0, 2.59, 0], [sign * 0.44, 2.68, 0], 0.035);
        bar([sign * 0.44, 2.68, 0], [sign * 0.44, 2.56, 0]);
        bar([0, 2.27, 0], [sign * 0.32, 2.65, 0], 0.02);
        lantern(sign * 0.44, 2.16);
      }
    } else if (style.id === "triple") {
      lantern(0, 2.64, true);
      for (const sign of [-1, 1]) { bar([0, 2.15, 0], [sign * 0.43, 2.3, 0], 0.035); bar([sign * 0.43, 2.3, 0], [sign * 0.48, 2.51, 0], 0.03); lantern(sign * 0.48, 2.67); }
    } else lantern(0, 2.56, style.id === "ornate");
    root.userData.lightHeight = 2.5;
    return root;
  }
  function dispose(root) {
    const geometries = new Set(), materials = new Set();
    root.traverse((o) => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose());
  }
  window.ParkLamps = { styles, create, dispose };
})();
