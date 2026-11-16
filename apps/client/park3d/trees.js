// Winter trees shared by the game and editor: branching deciduous trees and layered evergreen foliage.
(function () {
  const styles = [
    { id: 'pine', name: '설송 · 갈색 줄기와 눈 얹힌 솔가지', bark: 0x725343, evergreen: true, height: 3.2, width: 1.05 },
    { id: 'spruce', name: '가문비 · 짙은 회록색 침엽수', bark: 0x65594f, evergreen: true, height: 3.8, width: 0.8 },
    { id: 'bare0', name: '겨울 참나무 · 굵은 갈색 가지', bark: 0x655045, height: 3.3, width: 1.4, rise: 0.22, fork: 0.30, snow: 0.34 },
    { id: 'bare1', name: '느티나무 · 넓게 퍼진 회갈색 가지', bark: 0x77716a, height: 3.05, width: 1.75, rise: 0.16, fork: 0.30, snow: 0.22 },
    { id: 'bare2', name: '미루나무 · 좁고 곧은 수형', bark: 0x77716b, height: 4.1, width: 0.48, fork: 0.24, snow: 0.15 },
    { id: 'bare3', name: '자작나무 · 흰 수피와 검은 무늬', bark: 0xd9d6cd, height: 3.6, width: 0.78, fork: 0.34, snow: 0.35, birch: true },
    { id: 'bare4', name: '상고대 · 서리가 덮인 흰 가지', bark: 0x8b8984, height: 3.4, width: 1.55, rise: 0.22, fork: 0.24, snow: 0.95, frost: true },
    { id: 'bare5', name: '설화목 · 가지 위에 두껍게 쌓인 눈', bark: 0x58524e, height: 3.15, width: 1.6, rise: 0.19, fork: 0.28, snow: 0.85 },
    { id: 'bare6', name: '전정목 · 울퉁불퉁한 굵은 줄기', bark: 0x665950, height: 2.7, width: 0.88, fork: 0.38, snow: 0.25, pollard: true },
    { id: 'bare7', name: '어린 겨울나무 · 가는 회색 잔가지', bark: 0x8c8782, height: 2.75, width: 0.72, fork: 0.32, snow: 0.12, young: true },
  ];
  function geometry(THREE, id, seed = 1) {
    const style = styles.find((s) => s.id === id) || styles[2];
    let state = seed;
    const random = () => ((state = (state * 16807) % 2147483647) / 2147483647);
    const buckets = Object.fromEntries(['bark', 'snow', 'needles'].map((k) => [k, { position: [], normal: [], color: [] }]));
    const barkColor = new THREE.Color(style.bark), white = new THREE.Color(0xf2f5fa);
    const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
    function tube(a, b, r0, r1, bucket, color, sides = 5) {
      const d = b.clone().sub(a); if (d.lengthSq() < 0.000001) return;
      axis.copy(d).normalize(); u.crossVectors(axis, Math.abs(axis.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize(); v.crossVectors(axis, u).normalize();
      const rings = [a, b].map((p, ring) => Array.from({ length: sides }, (_, i) => {
        const angle = i / sides * Math.PI * 2;
        const n = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle));
        return { p: p.clone().addScaledVector(n, ring ? r1 : r0), n };
      }));
      const out = buckets[bucket];
      function vertex(q) { out.position.push(...q.p.toArray()); out.normal.push(...q.n.toArray()); out.color.push(color.r, color.g, color.b); }
      for (let i = 0; i < sides; i++) { const j = (i + 1) % sides; for (const q of [rings[0][i], rings[0][j], rings[1][i], rings[0][j], rings[1][j], rings[1][i]]) vertex(q); }
    }
    // Small irregular foliage cushions; snow follows only their upper surface.
    // These overlap along the boughs rather than forming one spherical crown.
    function cushion(center, rx, ry, rz, angle, color, snow = false) {
      const g = new THREE.SphereGeometry(1, 6, 4, 0, Math.PI * 2, 0, snow ? Math.PI * 0.46 : Math.PI);
      const pos = g.attributes.position, c = Math.cos(angle), n = Math.sin(angle);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const ripple = 1 + 0.07 * Math.sin(Math.atan2(z, x) * 3 + angle) * (1 - y * y);
        const xx = x * rx * ripple, zz = z * rz * ripple;
        pos.setXYZ(i, center.x + xx * c - zz * n, center.y + y * ry + (snow ? 0.02 : 0), center.z + xx * n + zz * c);
      }
      g.computeVertexNormals();
      const normal = g.attributes.normal, out = buckets[snow ? 'snow' : 'needles'];
      for (const i of g.index.array) {
        out.position.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        out.normal.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        out.color.push(color.r, color.g, color.b);
      }
      g.dispose();
    }
    function branch(a, b, r0, r1, level) {
      const color = barkColor.clone().multiplyScalar(0.84 + random() * 0.3);
      tube(a, b, r0, r1, 'bark', color, level < 1 ? 7 : 5);
      const slope = Math.abs(b.y - a.y) / a.distanceTo(b);
      if (style.frost && level >= 2) {
        tube(a, b, Math.max(0.016, r0 * 1.12), Math.max(0.008, r1 * 1.15), 'snow', white, 5);
        return;
      }
      if ((style.frost || slope < 0.96) && random() < style.snow) {
        const inset = 0.12 + random() * 0.18, start = a.clone().lerp(b, inset), end = a.clone().lerp(b, 0.94);
        start.y += r0 * 0.78 + 0.012; end.y += r1 * 0.8 + 0.008;
        const snowR = style.frost ? Math.max(0.012, r0 * 0.58) : Math.max(style.snow > 0.7 ? 0.026 : 0.014, r0 * 0.8);
        tube(start, end, snowR, Math.max(0.006, r1 * 0.6), 'snow', white, 5);
      }
    }
    const H = style.height;
    // Buttress roots and a gently crooked, tapering trunk.
    for (let i = 0; i < 5; i++) { const angle = i * Math.PI * 0.4; branch(new THREE.Vector3(Math.cos(angle) * 0.18, 0.015, Math.sin(angle) * 0.18), new THREE.Vector3(0, 0.24, 0), 0.035, 0.07, 0); }
    const lean = (random() - 0.5) * 0.22, trunkRadius = style.young ? 0.065 : style.pollard ? 0.19 : 0.125;
    const trunkTop = style.evergreen ? H * 0.86 : H * (style.pollard ? 0.65 : 0.85);
    const trunk = [];
    for (let i = 0; i <= 5; i++) trunk.push(new THREE.Vector3(lean * i / 5 + Math.sin(i * 1.4) * 0.035, trunkTop * i / 5, Math.cos(i) * 0.025));
    for (let i = 0; i < 5; i++) branch(trunk[i], trunk[i + 1], trunkRadius * (1 - i / 6), trunkRadius * (1 - (i + 1) / 6), 0);
    if (style.evergreen) {
      const needle = new THREE.Color(id === 'pine' ? 0x3f6556 : 0x3f5551);
      const tiers = id === 'pine' ? 5 : 7;
      for (let tier = 0; tier < tiers; tier++) {
        const y = H * (0.28 + tier / tiers * 0.61), spread = style.width * (1 - tier / (tiers + 0.4));
        for (let arm = 0; arm < 5; arm++) {
          const angle = arm * Math.PI * 0.4 + tier * 1.9 + random() * 0.3;
          const start = new THREE.Vector3(lean * y / H, y, 0), end = new THREE.Vector3(Math.cos(angle) * spread, y + (id === 'pine' ? 0.02 : -0.12) + (random() - 0.5) * 0.12, Math.sin(angle) * spread);
          branch(start, end, 0.035, 0.008, 1);
          for (let k = 0; k < 3; k++) {
            const center = start.clone().lerp(end, 0.26 + k * 0.3);
            const radius = Math.max(0.075, spread * (0.39 - k * 0.045));
            const color = needle.clone().multiplyScalar(0.85 + random() * 0.3);
            const round = (tier + arm + k) % (id === 'pine' ? 5 : 3) !== 0;
            const rise = (id === 'pine' ? 0.18 : 0.17) * (1 - tier / tiers * 0.28) * (0.9 + random() * 0.2);
            center.y += rise * 0.35 + (random() - 0.5) * 0.06;
            if (round) {
              cushion(center, radius * 1.22, rise, radius * 0.9, angle, color);
              if ((arm + k + tier) % 4 !== 0) cushion(center, radius * 1.18, rise * 1.05, radius * 0.86, angle, white, true);
              // A short needle spray at some edges retains a little sharpness.
              if (k === 2 && arm % 2 === 0) {
                const tip = center.clone().add(new THREE.Vector3(Math.cos(angle) * radius * 1.2, 0.07, Math.sin(angle) * radius * 1.2));
                tube(center, tip, radius * 0.35, 0.018, 'needles', color, 6);
              }
            } else {
              const tip = center.clone(); tip.y += rise * 1.5;
              tube(center, tip, radius, radius * 0.12, 'needles', color, 7);
              const snowCenter = center.clone().lerp(tip, 0.45);
              cushion(snowCenter, radius * 0.75, rise * 0.75, radius * 0.7, angle, white, true);
            }
          }
        }
      }
      // The leader ends inside an overlapping crown, with no separate arrowhead.
      for (let i = 0; i < 3; i++) {
        const angle = i * 2.4, width = (id === 'pine' ? 0.25 : 0.19) * (1 - i * 0.1);
        const center = new THREE.Vector3(lean * 0.86 + Math.cos(angle) * 0.055, H * (0.83 + i * 0.02), Math.sin(angle) * 0.055);
        cushion(center, width * 1.1, 0.17 - i * 0.02, width, angle, needle);
        cushion(center, width * 1.07, 0.17 - i * 0.02, width * 0.97, angle, white, true);
      }
    } else {
      const arms = style.young ? 6 : style.pollard ? 6 : 9;
      for (let i = 0; i < arms; i++) {
        const angle = i * 2.39996 + random() * 0.4;
        const fraction = style.fork + (i / arms) * (0.75 - style.fork);
        const a = new THREE.Vector3(lean * fraction, H * fraction, 0);
        const spread = style.width * (0.72 + random() * 0.28) * (1 - i / arms * 0.35);
        const end = new THREE.Vector3(Math.cos(angle) * spread, Math.min(H, a.y + H * (style.pollard ? 0.28 : (style.rise || 0.32) * (0.85 + random() * 0.3))), Math.sin(angle) * spread);
        const elbow = a.clone().lerp(end, 0.5); elbow.y -= style.pollard ? 0 : 0.1;
        const radius = trunkRadius * (style.pollard ? 0.72 : 0.46) * (1 - i / arms * 0.45);
        branch(a, elbow, radius, radius * 0.65, 1); branch(elbow, end, radius * 0.65, 0.014, 1);
        for (let j = 0; j < (style.young ? 3 : 4); j++) {
          const base = elbow.clone().lerp(end, 0.1 + j * 0.24), az = angle + (j % 2 ? -0.7 : 0.7);
          const tip = base.clone().add(new THREE.Vector3(Math.cos(az) * spread * 0.34, (0.34 + random() * 0.25) * (style.pollard ? 1.3 : 1), Math.sin(az) * spread * 0.34));
          branch(base, tip, style.pollard ? 0.025 : 0.018, 0.006, 2);
          for (let k = 0; k < 3; k++) {
            const twigBase = base.clone().lerp(tip, 0.35 + k * 0.22), az2 = az + (k % 2 ? -1.0 : 1.0);
            const twigEnd = twigBase.clone().add(new THREE.Vector3(Math.cos(az2) * (0.18 + random() * 0.1), 0.1 + random() * 0.22, Math.sin(az2) * 0.22));
            branch(twigBase, twigEnd, 0.007, 0.0025, 3);
          }
        }
      }
      // Fine upright crown shoots prevent a flat, clipped top.
      for (let i = 0; i < 5; i++) {
        const a = trunk[4].clone(), angle = i * 2.4;
        const b = new THREE.Vector3(lean + Math.cos(angle) * style.width * 0.36, H * (0.94 + random() * 0.08), Math.sin(angle) * style.width * 0.36);
        branch(a, b, 0.025, 0.004, 2);
      }
    }
    // Birch bark scars are dark, short, irregular bands rather than green foliage.
    if (style.birch) for (let i = 0; i < 17; i++) {
      const y = 0.2 + i * trunkTop / 18, radius = trunkRadius * (1 - y / trunkTop * 0.82) + 0.002;
      const center = new THREE.Vector3(lean * y / trunkTop, y, Math.cos(y / trunkTop * 5) * 0.025);
      tube(center, center.clone().add(new THREE.Vector3(0.005, 0.018 + random() * 0.025, 0)), radius, radius * 0.98, 'bark', new THREE.Color(0x575653), 7);
    }
    return Object.entries(buckets).filter(([, b]) => b.position.length).map(([part, b]) => {
      const g = new THREE.BufferGeometry();
      for (const attr of ['position', 'normal', 'color']) g.setAttribute(attr, new THREE.Float32BufferAttribute(b[attr], 3));
      g.computeBoundingSphere(); return { part, geometry: g };
    });
  }
  window.ParkTrees = { styles, geometry };
})();
