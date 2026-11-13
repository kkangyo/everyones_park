import type { Facing, Vec2 } from "./movement";
import { straightFacing } from "./movement";

/** Character's anatomical hands, never screen left/right or array indices. */
export const HAND_SIDES = ["right", "left"] as const;
export type HandSide = (typeof HAND_SIDES)[number];

export function isHandSide(value: string): value is HandSide {
  return value === "left" || value === "right";
}

export const HAND_RIG = {
  version: 1,
  anchor: { x: 16, y: 32 },
  sitDrop: 3,
  foodFrame: { width: 12, height: 12 },
  /** Grip point inside every food frame, including every consumption stage. */
  foodGrip: { x: 6, y: 9 },
  /** Cell coordinates, standing column 0. Both hands exist even with one food. */
  grips: {
    down:         { left: { x: 21, y: 23 }, right: { x: 11, y: 23 } },
    left:         { left: { x: 12, y: 24 }, right: { x: 10, y: 22 } },
    right:        { left: { x: 22, y: 22 }, right: { x: 20, y: 24 } },
    up:           { left: { x: 11, y: 21 }, right: { x: 21, y: 21 } },
    "down-left":  { left: { x: 18, y: 23 }, right: { x: 10, y: 23 } },
    "down-right": { left: { x: 22, y: 23 }, right: { x: 14, y: 23 } },
    "up-left":    { left: { x: 10, y: 21 }, right: { x: 18, y: 20 } },
    "up-right":   { left: { x: 14, y: 20 }, right: { x: 22, y: 21 } },
  },
} as const satisfies {
  version: number; anchor: Vec2; sitDrop: number;
  foodFrame: { width: number; height: number }; foodGrip: Vec2;
  grips: Record<Facing, Record<HandSide, Vec2>>;
};

/** First purchase goes in the right hand; removing another item never changes it. */
export function freeHand(held: readonly { hand: string }[]): HandSide | undefined {
  return HAND_SIDES.find((side) => !held.some((food) => food.hand === side));
}

/** Exact grip in the 32×32 character cell, synchronized with body/outfit phase. */
export function handGrip(facing: Facing, hand: HandSide, seated = false, column = 0): Vec2 {
  const dir = seated ? straightFacing(facing) : facing;
  const grip = HAND_RIG.grips[dir][hand];
  return { x: grip.x, y: grip.y + (seated ? HAND_RIG.sitDrop : 0) - (column % 2 === 1 ? 1 : 0) };
}

/** Position of the FOOD GRIP relative to the renderer's feet anchor. */
export function handOffset(facing: Facing, hand: HandSide, seated = false, column = 0): Vec2 {
  const grip = handGrip(facing, hand, seated, column);
  return { x: grip.x - HAND_RIG.anchor.x, y: grip.y - HAND_RIG.anchor.y };
}

/** Far hand first, then near hand; back views are occluded by the body. */
export function handDrawOrder(facing: Facing): readonly HandSide[] {
  return HAND_RIG.grips[facing].left.y > HAND_RIG.grips[facing].right.y
    ? ["right", "left"] : ["left", "right"];
}
