/** Validate the production food sheets independently of character documentation. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MENU, EAT_STAGES } from "../packages/shared/src/food";
import { HAND_RIG } from "../packages/shared/src/hand-rig";
import { decodePng } from "./lib/png";

for (const { id } of MENU.values()) for (const size of [HAND_RIG.foodFrame.width, 128]) {
  const file = `assets/sprites/${size === 128 ? "food-hd" : "food"}/${id}.png`;
  const { canvas: c, hasAlpha } = decodePng(readFileSync(file));
  assert.equal(c.width, size * EAT_STAGES, `${file}: width`);
  assert.equal(c.height, size, `${file}: height`);
  assert.ok(hasAlpha, `${file}: missing transparency`);
  const frames: number[][] = [];
  for (let stage = 0; stage < EAT_STAGES; stage++) {
    const pixels: number[] = [];
    let opaque = 0, clear = 0, contact = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const p = c.get(stage * size + x, y);
      pixels.push(...p); opaque += p[3] > 0 ? 1 : 0; clear += p[3] === 0 ? 1 : 0;
      if (size === 12 && Math.abs(x - HAND_RIG.foodGrip.x) <= 1 && Math.abs(y - HAND_RIG.foodGrip.y) <= 1) contact += p[3];
    }
    assert.ok(opaque > size && clear > size, `${file} stage ${stage}: empty sprite or opaque backdrop`);
    if (size === 12) assert.ok(contact > 0, `${file} stage ${stage}: missing grip`);
    frames.push(pixels);
  }
  assert.notDeepEqual(frames[0], frames[1], `${file}: consumption stage 1 duplicates full serving`);
  assert.notDeepEqual(frames[1], frames[2], `${file}: consumption stage 2 duplicates stage 1`);
}
console.log(`OK: ${MENU.size} foods × ${EAT_STAGES} distinct stages × 2 resolutions; alpha and hand contacts`);
