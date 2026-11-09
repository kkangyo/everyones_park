// 타일 격자 A* 길찾기 (8방향). 클릭 이동, 자리 클릭 후 걸어가기 등에 쓴다.

import { isBlockedTile, type CollisionGrid } from "./collision";
import type { Vec2 } from "./movement";

export interface TilePos {
  col: number;
  row: number;
}

const NEIGHBORS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** 8방향 거리 추정 (octile) */
function heuristic(c: number, r: number, goal: TilePos): number {
  const dx = Math.abs(c - goal.col);
  const dy = Math.abs(r - goal.row);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * start → goal 타일 경로 (start 제외, goal 포함). 갈 수 없으면 null.
 * 대각선은 양옆 두 칸이 모두 비어 있을 때만 허용해서 모서리를 파고들지 않게 한다.
 */
export function findPath(grid: CollisionGrid, start: TilePos, goal: TilePos): TilePos[] | null {
  if (isBlockedTile(grid, goal.col, goal.row)) return null;
  if (start.col === goal.col && start.row === goal.row) return [];

  const { cols, rows } = grid;
  const size = cols * rows;
  const g = new Float64Array(size).fill(Infinity);
  const from = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const heap = new MinHeap();

  const startIdx = start.row * cols + start.col;
  const goalIdx = goal.row * cols + goal.col;
  g[startIdx] = 0;
  heap.push(startIdx, heuristic(start.col, start.row, goal));

  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === goalIdx) return reconstruct(from, goalIdx, startIdx, cols);
    if (closed[cur]) continue;
    closed[cur] = 1;

    const c = cur % cols;
    const r = (cur - c) / cols;
    for (const [dc, dr, cost] of NEIGHBORS) {
      const nc = c + dc;
      const nr = r + dr;
      if (isBlockedTile(grid, nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (isBlockedTile(grid, c + dc, r) || isBlockedTile(grid, c, r + dr))) continue;
      const ni = nr * cols + nc;
      if (closed[ni]) continue;
      const ng = g[cur]! + cost;
      if (ng < g[ni]!) {
        g[ni] = ng;
        from[ni] = cur;
        heap.push(ni, ng + heuristic(nc, nr, goal));
      }
    }
  }
  return null;
}

function reconstruct(from: Int32Array, goalIdx: number, startIdx: number, cols: number): TilePos[] {
  const path: TilePos[] = [];
  for (let i = goalIdx; i !== startIdx; i = from[i]!) path.push({ col: i % cols, row: Math.floor(i / cols) });
  return path.reverse();
}

export function tileOf(pos: Vec2, tileSize: number): TilePos {
  return { col: Math.floor(pos.x / tileSize), row: Math.floor(pos.y / tileSize) };
}

/** 타일 가운데 (발밑 위치로 쓸 점) */
export function tileCenter(tile: TilePos, tileSize: number): Vec2 {
  return { x: tile.col * tileSize + tileSize / 2, y: tile.row * tileSize + tileSize / 2 };
}

/** 우선순위 큐 (작은 값 먼저) */
class MinHeap {
  private items: number[] = [];
  private prios: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, prio: number): void {
    const items = this.items;
    const prios = this.prios;
    let i = items.length;
    items.push(item);
    prios.push(prio);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (prios[p]! <= prio) break;
      items[i] = items[p]!;
      prios[i] = prios[p]!;
      i = p;
    }
    items[i] = item;
    prios[i] = prio;
  }

  pop(): number {
    const items = this.items;
    const prios = this.prios;
    const top = items[0]!;
    const lastItem = items.pop()!;
    const lastPrio = prios.pop()!;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && prios[r]! < prios[l]! ? r : l;
        if (prios[m]! >= lastPrio) break;
        items[i] = items[m]!;
        prios[i] = prios[m]!;
        i = m;
      }
      items[i] = lastItem;
      prios[i] = lastPrio;
    }
    return top;
  }
}
