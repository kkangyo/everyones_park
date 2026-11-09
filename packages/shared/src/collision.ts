// 타일 충돌 격자. Tiled 맵 JSON 에서 만들며, 서버와 클라이언트가 같은 함수를 쓴다.

import { FOOT_HITBOX } from "./constants";
import type { Vec2 } from "./movement";

export interface CollisionGrid {
  /** 타일 단위 가로·세로 칸 수 */
  cols: number;
  rows: number;
  tileSize: number;
  /** 1 = 지나갈 수 없음. 인덱스 = row * cols + col */
  blocked: Uint8Array;
}

/** Tiled JSON 중 충돌 격자를 만드는 데 필요한 부분 */
interface TiledMapLike {
  width: number;
  height: number;
  tilewidth: number;
  layers: { name: string; type: string; data?: number[] }[];
}

/** obstacles 타일 레이어에서 타일이 있는 칸을 모두 막힌 칸으로 본다 */
export function collisionGridFromTiled(map: TiledMapLike, layerName: string): CollisionGrid {
  const layer = map.layers.find((l) => l.name === layerName && l.type === "tilelayer");
  if (!layer?.data) throw new Error(`맵에 타일 레이어 "${layerName}" 이(가) 없습니다`);
  if (layer.data.length !== map.width * map.height) throw new Error(`레이어 "${layerName}" 크기가 맵과 다릅니다`);
  return {
    cols: map.width,
    rows: map.height,
    tileSize: map.tilewidth,
    blocked: Uint8Array.from(layer.data, (gid) => (gid !== 0 ? 1 : 0)),
  };
}

/** 맵 밖은 막힌 칸으로 취급한다 */
export function isBlockedTile(grid: CollisionGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return true;
  return grid.blocked[row * grid.cols + col] === 1;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 발밑 위치 → 충돌 상자 */
export function footBox(pos: Vec2): Box {
  const half = FOOT_HITBOX.width / 2;
  return { left: pos.x - half, right: pos.x + half, top: pos.y - FOOT_HITBOX.height, bottom: pos.y };
}

// 상자 경계가 타일 경계에 딱 붙어 있을 때 옆 칸까지 겹친 것으로 보지 않도록 조금 줄여서 판정
const EDGE_EPSILON = 1e-6;

/** 상자가 막힌 칸과 하나라도 겹치는지 */
export function boxHitsWall(grid: CollisionGrid, box: Box): boolean {
  const t = grid.tileSize;
  const c0 = Math.floor(box.left / t);
  const c1 = Math.floor((box.right - EDGE_EPSILON) / t);
  const r0 = Math.floor(box.top / t);
  const r1 = Math.floor((box.bottom - EDGE_EPSILON) / t);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (isBlockedTile(grid, c, r)) return true;
  return false;
}
