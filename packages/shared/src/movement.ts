// 이동 계산. 서버(권위 판정)와 클라이언트(예측)가 같은 코드를 쓴다.
// 화면·입력 장치와 무관한 순수 함수만 둔다.

import { FOOT_HITBOX, WALK_SPEED } from "./constants";
import { boxHitsWall, boxesOverlap, coreBox, footBox, type CollisionGrid } from "./collision";

export interface Vec2 {
  x: number;
  y: number;
}

export type Axis = -1 | 0 | 1;

/** 한 순간의 이동 입력. 키보드·클릭 이동 모두 이 형태로 바뀐다 */
export interface MoveInput {
  x: Axis;
  y: Axis;
}

/** 그림 방향 (4방향 그림 + 8방향 이동) */
export type Facing = "up" | "down" | "left" | "right";

export const NO_INPUT: MoveInput = { x: 0, y: 0 };

/** 한 번에 계산하는 최대 시간. 프레임이 크게 밀려도 얇은 벽을 뚫고 지나가지 않게 나눠서 계산한다 */
const MAX_SUBSTEP_SEC = 1 / 30;

export function isMoving(input: MoveInput): boolean {
  return input.x !== 0 || input.y !== 0;
}

/** 입력을 길이 1인 방향 벡터로. 대각선도 직선과 같은 속도가 되도록 정규화한다 */
export function inputDirection(input: MoveInput): Vec2 {
  if (input.x !== 0 && input.y !== 0) return { x: input.x * Math.SQRT1_2, y: input.y * Math.SQRT1_2 };
  return { x: input.x, y: input.y };
}

/**
 * dtSec 동안 이동한 뒤의 위치. 장애물에 막히면 벽에 붙어서 멈추고,
 * 축(x, y)을 따로 처리하므로 대각선으로 벽에 부딪히면 벽을 따라 미끄러진다.
 * others: 다른 캐릭터 위치. 발밑 가운데(CORE_HITBOX)끼리는 겹칠 수 없다.
 */
export function step(
  pos: Vec2,
  input: MoveInput,
  dtSec: number,
  grid: CollisionGrid,
  others: readonly Vec2[] = [],
  speed = WALK_SPEED,
): Vec2 {
  if (!isMoving(input) || dtSec <= 0) return pos;
  const dir = inputDirection(input);
  let cur = pos;
  let remaining = dtSec;
  while (remaining > 0) {
    const dt = Math.min(remaining, MAX_SUBSTEP_SEC);
    remaining -= dt;
    cur = moveAxis(cur, "x", dir.x * speed * dt, grid, others);
    cur = moveAxis(cur, "y", dir.y * speed * dt, grid, others);
  }
  return cur;
}

/**
 * next 로 가면 새로 겹치게 되는 캐릭터가 있는지.
 * 이미 겹쳐 있던 상대는 무시한다 (같은 자리에 입장한 경우 등 서로 떨어져 나갈 수 있게).
 */
function hitsOther(pos: Vec2, next: Vec2, others: readonly Vec2[]): boolean {
  if (others.length === 0) return false;
  const cur = coreBox(pos);
  const nb = coreBox(next);
  for (const o of others) {
    const ob = coreBox(o);
    if (boxesOverlap(nb, ob) && !boxesOverlap(cur, ob)) return true;
  }
  return false;
}

function moveAxis(pos: Vec2, axis: "x" | "y", delta: number, grid: CollisionGrid, others: readonly Vec2[]): Vec2 {
  if (delta === 0) return pos;
  const next = axis === "x" ? { x: pos.x + delta, y: pos.y } : { x: pos.x, y: pos.y + delta };
  if (!boxHitsWall(grid, footBox(next))) return hitsOther(pos, next, others) ? pos : next;

  // 막혔으면 부딪힌 타일 경계에 딱 붙인다
  const t = grid.tileSize;
  const box = footBox(next);
  if (axis === "x") {
    const half = FOOT_HITBOX.width / 2;
    const x = delta > 0 ? Math.floor(box.right / t) * t - half : (Math.floor(box.left / t) + 1) * t + half;
    const snapped = { x, y: pos.y };
    return boxHitsWall(grid, footBox(snapped)) || hitsOther(pos, snapped, others) ? pos : snapped;
  }
  const y = delta > 0 ? Math.floor(box.bottom / t) * t : (Math.floor(box.top / t) + 1) * t + FOOT_HITBOX.height;
  const snapped = { x: pos.x, y };
  return boxHitsWall(grid, footBox(snapped)) || hitsOther(pos, snapped, others) ? pos : snapped;
}

/**
 * 입력으로 바라보는 방향을 정한다.
 * 대각선이면 직전 방향이 그 대각선에 포함될 때 유지해서, 대각선 이동 중 그림이 깜빡이지 않게 한다.
 */
export function facingFromInput(input: MoveInput, prev: Facing): Facing {
  if (!isMoving(input)) return prev;
  const horizontal: Facing | null = input.x < 0 ? "left" : input.x > 0 ? "right" : null;
  const vertical: Facing | null = input.y < 0 ? "up" : input.y > 0 ? "down" : null;
  if (horizontal && vertical) return prev === horizontal || prev === vertical ? prev : vertical;
  return (horizontal ?? vertical)!;
}
