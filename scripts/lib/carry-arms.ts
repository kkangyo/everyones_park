import { HAND_RIG, HAND_SIDES, handGrip } from "../../packages/shared/src/hand-rig";
import type { Facing } from "../../packages/shared/src/movement";
import type { Canvas, RGBA } from "./png";

/** Code-native placeholder arms. Coordinates are absolute cell coordinates. */
export function drawCarryArms(
  canvas: Canvas, ox: number, oy: number, facing: Facing, seated: boolean, col: number,
  sleeve: RGBA, skin: RGBA, shoulderY: number,
): void {
  const shift = (seated ? HAND_RIG.sitDrop : 0) - col % 2;
  const back = facing === "up" || facing === "up-left" || facing === "up-right";
  for (const side of HAND_SIDES) {
    const grip = handGrip(facing, side, seated, col);
    const sx = grip.x < 16 ? 9 : 22;
    const sy = shoulderY + shift;
    if (back) {
      // Hidden palms remain attached in world space; only shoulders are visible.
      canvas.rect(ox + sx, oy + sy, 1, 3, sleeve);
      continue;
    }
    const elbowY = grip.y - 2;
    canvas.rect(ox + sx, oy + sy, 1, Math.max(1, elbowY - sy + 1), sleeve);
    canvas.rect(ox + Math.min(sx, grip.x), oy + elbowY, Math.abs(sx - grip.x) + 1, 2, sleeve);
  }
  // Paint palms after both sleeves so a near sleeve cannot erase the far grip.
  if (!back) for (const side of HAND_SIDES) {
    const grip = handGrip(facing, side, seated, col);
    canvas.rect(ox + grip.x - 1, oy + grip.y - 1, 3, 3, skin);
  }
}
