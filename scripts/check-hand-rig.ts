/** Regression checks: pnpm check:hands */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HAND_RIG, HAND_SIDES, handGrip, handOffset, freeHand } from "../packages/shared/src/hand-rig";
import { FACINGS } from "../packages/shared/src/protocol";
import { straightFacing } from "../packages/shared/src/movement";
import { MENU, EAT_STAGES } from "../packages/shared/src/food";
import { TICK_SEC } from "../packages/shared/src/constants";
import { HandsSystem } from "../apps/server/src/systems/hands";
import { ParkState, PlayerState } from "../apps/server/src/schema/ParkState";
import { decodePng } from "./lib/png";
import { GENDERS, OUTFITS, frameOf } from "../packages/shared/src/character";

for (const facing of FACINGS) for (const side of HAND_SIDES) for (const seated of [false, true]) for (let col = 0; col < 4; col++) {
  const grip = handGrip(facing, side, seated, col);
  const offset = handOffset(facing, side, seated, col);
  assert.equal(offset.x + HAND_RIG.anchor.x, grip.x);
  assert.equal(offset.y + HAND_RIG.anchor.y, grip.y);
  const base = handGrip(seated ? straightFacing(facing) : facing, side);
  assert.equal(grip.y - base.y, (seated ? 3 : 0) - col % 2);
  // Food top-left + its grip is exactly the character hand; no center/bbox math.
  const foodX = offset.x - HAND_RIG.foodGrip.x;
  const foodY = offset.y - HAND_RIG.foodGrip.y;
  assert.equal(foodX + 6, offset.x);
  assert.equal(foodY + 9, offset.y);
  assert.ok(grip.x >= 1 && grip.x <= 30 && grip.y >= 1 && grip.y <= 30);
}
assert.deepEqual(handGrip("down", "left"), { x: 21, y: 23 });
assert.deepEqual(handGrip("up", "left"), { x: 11, y: 21 });

// Keep the generation instructions in agreement with the executable contract.
for (const file of ["캐릭터_그래픽_프롬프트_8방향.md", "Asset Generation Standard v2.1 - One Park Character Override.md"]) {
  const text = readFileSync(file, "utf8");
  for (const [dir, points] of Object.entries(HAND_RIG.grips)) {
    const row = `| ${dir} | (${points.left.x},${points.left.y}) | (${points.right.x},${points.right.y}) |`;
    assert.ok(text.includes(row), `${file}: outdated hand coordinates for ${dir}`);
  }
}

const guide = decodePng(readFileSync("docs/character-hand-guide.png")).canvas;
const directions = ["down", "left", "right", "up", "down-left", "down-right", "up-left", "up-right"] as const;
for (const row of [...Array.from({ length: 8 }, (_, i) => i + 8), 20, 21, 22, 23]) {
  for (let col = 0; col < 4; col++) for (const hand of HAND_SIDES) {
    const grip = handGrip(directions[row >= 20 ? row - 20 : row - 8]!, hand, row >= 20, col);
    assert.deepEqual(guide.get(col * 32 + grip.x, row * 32 + grip.y), hand === "left" ? [255,64,204,255] : [32,216,255,255]);
  }
}

// New 64px authored palm maps are checked by check-character-detail.ts.
// Exercise actual server removal/splice and refill, not just the allocation helper.
for (const consumed of [0, 1]) {
  const state = new ParkState();
  const player = new PlayerState();
  state.players.set("test", player);
  const system = new HandsSystem(state);
  const item = [...MENU.values()][0]!;
  assert.ok(system.give(player, item.id));
  assert.ok(system.give(player, item.id));
  assert.equal(player.hands[0]!.hand, "right");
  assert.equal(player.hands[1]!.hand, "left");
  assert.equal(system.give(player, item.id), false);
  const survivor = player.hands[1 - consumed]!;
  const side = survivor.hand;
  system.startEating(player, 0, consumed);
  system.tick(Math.ceil(item.eatSec / TICK_SEC) + 1);
  assert.equal(player.hands.length, 1);
  assert.equal(player.hands[0], survivor);
  assert.equal(player.hands[0]!.hand, side);
  assert.ok(system.give(player, item.id));
  assert.notEqual(player.hands[1]!.hand, side);
  assert.equal(freeHand(Array.from(player.hands)), undefined);
}

// All existing menu stages must retain material near the same grip.
for (const item of MENU.values()) {
  const png = decodePng(readFileSync(`assets/sprites/food/${item.id}.png`));
  assert.equal(png.canvas.width, HAND_RIG.foodFrame.width * EAT_STAGES);
  assert.equal(png.canvas.height, HAND_RIG.foodFrame.height);
  assert.ok(png.hasAlpha);
  for (let stage = 0; stage < EAT_STAGES; stage++) {
    let contact = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      contact += png.canvas.get(stage * 12 + 6 + dx, 9 + dy)[3] > 0 ? 1 : 0;
    assert.ok(contact > 0, `${item.id} stage ${stage}: no material at grip (6,9)`);
  }
}
console.log("OK: 8 directions × 2 hands × stand/sit × 4 phases; server consume/refill; all food stage grips");
