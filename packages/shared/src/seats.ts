// 앉을 자리 (Phase 5). 서버(검증)와 클라이언트(표시)가 같은 데이터·함수를 쓴다.
// 자리는 맵 seats 오브젝트 레이어의 사각형이고, 그 칸은 obstacles 레이어에서 막혀 있다 (걸어서 지나갈 수 없음).

import { FOOT_HITBOX } from "./constants";
import { boxHitsWall, footBox, type Box, type CollisionGrid } from "./collision";
import type { StraightFacing, Vec2 } from "./movement";

/** 자리 종류. 지금은 벤치만 (기획서 6장: 그네·통나무·돌·의자는 나중) */
export const SEAT_KINDS = ["bench"] as const;
export type SeatKind = (typeof SEAT_KINDS)[number];

const SEAT_FACINGS: readonly StraightFacing[] = ["down", "up", "left", "right"];

/** 자리 사각형에서 이 거리(px) 안에 서 있으면 E 로 앉을 수 있다 */
export const SIT_RANGE_PX = 24;

/** 일어설 때 자리 사각형에서 떨어지는 거리 (px) */
const STAND_GAP_PX = 4;

export interface Seat {
  /** 맵 오브젝트 name (채널 안에서 겹치지 않음) */
  id: string;
  kind: SeatKind;
  /** 자리가 차지하는 영역 (px) */
  box: Box;
  /** 앉은 사람이 보는 방향 */
  facing: StraightFacing;
  /** 칸마다 앉은 캐릭터의 발밑 위치. 길이 = 칸 수 */
  slots: Vec2[];
}

interface TiledProperty {
  name: string;
  value: unknown;
}

/** Tiled JSON 중 자리를 읽는 데 필요한 부분 */
interface TiledSeatMapLike {
  layers: {
    name: string;
    type: string;
    objects?: { name: string; x: number; y: number; width?: number; height?: number; properties?: TiledProperty[] }[];
  }[];
}

/**
 * seats 오브젝트 레이어(사각형)에서 자리를 읽는다. 오브젝트 속성:
 *   kind   : SEAT_KINDS 중 하나
 *   slots  : 칸 수 (긴 쪽을 따라 나란히)
 *   facing : 앉아서 보는 방향 down / up / left / right
 */
export function seatsFromTiled(map: TiledSeatMapLike, layerName: string): Seat[] {
  const layer = map.layers.find((l) => l.name === layerName && l.type === "objectgroup");
  if (!layer?.objects) throw new Error(`맵에 오브젝트 레이어 "${layerName}" 이(가) 없습니다`);
  const ids = new Set<string>();
  return layer.objects.map((o) => {
    const prop = (name: string) => o.properties?.find((p) => p.name === name)?.value;
    const kind = prop("kind");
    const slots = prop("slots");
    const facing = prop("facing");
    if (!o.name || ids.has(o.name)) throw new Error(`맵의 자리 이름 "${o.name}" 이(가) 비었거나 중복입니다`);
    if (!o.width || !o.height) throw new Error(`맵의 자리 "${o.name}" 은(는) 사각형 오브젝트여야 합니다`);
    if (!SEAT_KINDS.includes(kind as SeatKind)) throw new Error(`맵의 자리 "${o.name}" 의 kind "${String(kind)}" 을(를) 모릅니다`);
    if (typeof slots !== "number" || !Number.isInteger(slots) || slots < 1) throw new Error(`맵의 자리 "${o.name}" 의 slots 는 1 이상 정수여야 합니다`);
    if (!SEAT_FACINGS.includes(facing as StraightFacing)) throw new Error(`맵의 자리 "${o.name}" 의 facing "${String(facing)}" 을(를) 모릅니다`);
    ids.add(o.name);
    const box = { left: o.x, top: o.y, right: o.x + o.width, bottom: o.y + o.height };
    return { id: o.name, kind: kind as SeatKind, box, facing: facing as StraightFacing, slots: slotPositions(box, facing as StraightFacing, slots) };
  });
}

/**
 * 칸마다 앉은 발밑 위치. 위·아래를 보는 자리는 가로로, 옆을 보는 자리는 세로로 나란히 앉는다.
 * 앉은 그림은 몸이 아래로 내려가 있어서(sitDrop) 발밑이 자리 아랫변보다 조금 위에 오게 한다.
 */
function slotPositions(box: Box, facing: StraightFacing, count: number): Vec2[] {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  return Array.from({ length: count }, (_, i) => {
    if (facing === "down" || facing === "up") return { x: box.left + ((i + 0.5) * w) / count, y: box.bottom - (facing === "down" ? 7 : 9) };
    return { x: (box.left + box.right) / 2 + (facing === "left" ? -1 : 1), y: box.top + ((i + 1) * h) / count - 6 };
  });
}

/** 점에서 자리 사각형까지 거리 (안이면 0) */
export function distanceToSeat(pos: Vec2, seat: Seat): number {
  const dx = Math.max(seat.box.left - pos.x, 0, pos.x - seat.box.right);
  const dy = Math.max(seat.box.top - pos.y, 0, pos.y - seat.box.bottom);
  return Math.hypot(dx, dy);
}

/** 그 점(클릭한 곳)에 있는 자리. 없으면 undefined (5-3) */
export function seatAt(pos: Vec2, seats: readonly Seat[]): Seat | undefined {
  return seats.find((seat) => distanceToSeat(pos, seat) === 0);
}

/** 그 점에서 가장 가까운 칸 번호 (클릭한 쪽 칸에 앉으러 간다) */
export function nearestSlot(seat: Seat, pos: Vec2): number {
  let best = 0;
  seat.slots.forEach((s, i) => {
    const b = seat.slots[best]!;
    if (Math.hypot(s.x - pos.x, s.y - pos.y) < Math.hypot(b.x - pos.x, b.y - pos.y)) best = i;
  });
  return best;
}

/** E 로 앉을 수 있는 거리 안의 자리들 (가까운 순) */
export function seatsInRange(pos: Vec2, seats: readonly Seat[]): Seat[] {
  return seats
    .map((seat) => ({ seat, d: distanceToSeat(pos, seat) }))
    .filter((s) => s.d <= SIT_RANGE_PX)
    .sort((a, b) => a.d - b.d)
    .map((s) => s.seat);
}

const OPPOSITE: Record<StraightFacing, StraightFacing> = { down: "up", up: "down", left: "right", right: "left" };

/**
 * 일어설 때 서는 위치: 자리 앞(보는 방향) → 뒤 → 옆 순서로, 발이 막힌 칸에 걸리지 않는 곳.
 * 다 막혀 있으면 앞 (맵을 만들 때 앞은 비워 둔다)
 */
export function seatStandPoint(seat: Seat, slot: number, grid: CollisionGrid): Vec2 {
  const s = seat.slots[slot] ?? seat.slots[0]!;
  const b = seat.box;
  const half = FOOT_HITBOX.width / 2;
  const at: Record<StraightFacing, Vec2> = {
    down: { x: s.x, y: b.bottom + FOOT_HITBOX.height + STAND_GAP_PX },
    up: { x: s.x, y: b.top - STAND_GAP_PX },
    left: { x: b.left - half - STAND_GAP_PX, y: s.y },
    right: { x: b.right + half + STAND_GAP_PX, y: s.y },
  };
  const sides: StraightFacing[] = seat.facing === "down" || seat.facing === "up" ? ["left", "right"] : ["down", "up"];
  for (const dir of [seat.facing, OPPOSITE[seat.facing], ...sides]) {
    if (!boxHitsWall(grid, footBox(at[dir]))) return at[dir];
  }
  return at[seat.facing];
}
