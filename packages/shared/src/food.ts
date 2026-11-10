// 간식 트럭·메뉴·양손 규칙 (Phase 4). 서버(검증)와 클라이언트(표시)가 같은 데이터·함수를 쓴다.
// 메뉴·트럭 내용은 코드가 아니라 data/*.json 에서 고친다.

import menuData from "../data/menu.json";
import truckData from "../data/trucks.json";
import type { Box } from "./collision";
import type { Vec2 } from "./movement";

/** 언어별 이름. 지금은 ko 만 있음 */
export type LocalizedName = Record<string, string>;

export interface MenuItem {
  id: string;
  name: LocalizedName;
  /** 조리 시간 (초) */
  cookSec: number;
  /** 다 먹는 데 걸리는 시간 (초). EAT_STAGES 단계로 나눠 그림이 줄어든다 */
  eatSec: number;
}

export interface TruckDef {
  id: string;
  name: LocalizedName;
  /** MenuItem.id 목록 */
  menu: readonly string[];
}

/** 양손에 들 수 있는 간식 수 */
export const HANDS_MAX = 2;
/** 먹는 그림 단계 수 (0 = 처음, EAT_STAGES - 1 = 거의 다 먹음). 그림 시트의 프레임 수와 같다 */
export const EAT_STAGES = 3;

/** 트럭 앞 주문 영역: 트럭 아랫변에서 이만큼(px) 아래까지, 좌우로 이만큼 더 */
const FRONT_DEPTH_PX = 40;
const FRONT_SIDE_PX = 8;
/** 대기 중 트럭 앞에서 이만큼(px) 넘게 멀어지면 주문 자동 취소 (약 6칸) */
export const ORDER_CANCEL_DISTANCE_PX = 192;

function loadMenu(): Map<string, MenuItem> {
  const map = new Map<string, MenuItem>();
  for (const item of menuData.items as MenuItem[]) {
    if (map.has(item.id)) throw new Error(`menu.json: 메뉴 id "${item.id}" 이(가) 중복입니다`);
    if (!(item.cookSec > 0) || !(item.eatSec > 0)) throw new Error(`menu.json: "${item.id}" 의 cookSec·eatSec 은 0보다 커야 합니다`);
    map.set(item.id, item);
  }
  return map;
}

function loadTrucks(menu: Map<string, MenuItem>): Map<string, TruckDef> {
  const map = new Map<string, TruckDef>();
  for (const truck of truckData.trucks as TruckDef[]) {
    if (map.has(truck.id)) throw new Error(`trucks.json: 트럭 id "${truck.id}" 이(가) 중복입니다`);
    for (const id of truck.menu) if (!menu.has(id)) throw new Error(`trucks.json: "${truck.id}" 의 메뉴 "${id}" 이(가) menu.json 에 없습니다`);
    map.set(truck.id, truck);
  }
  return map;
}

/** 메뉴 id → 메뉴. JSON 이 잘못되면 시작할 때 바로 오류 */
export const MENU: ReadonlyMap<string, MenuItem> = loadMenu();
export const TRUCKS: ReadonlyMap<string, TruckDef> = loadTrucks(MENU as Map<string, MenuItem>);

/** 맵에 놓인 트럭 하나 (데이터 + 위치) */
export interface TruckPlacement {
  def: TruckDef;
  /** 트럭이 차지하는 영역 (px). 이 칸들은 맵 obstacles 레이어에서 막혀 있다 */
  box: Box;
}

/** Tiled JSON 중 트럭 위치를 읽는 데 필요한 부분 */
interface TiledObjectsLike {
  layers: { name: string; type: string; objects?: { name: string; x: number; y: number; width?: number; height?: number }[] }[];
}

/** trucks 오브젝트 레이어(사각형, name = 트럭 id)에서 트럭 위치를 읽는다 */
export function truckPlacementsFromTiled(map: TiledObjectsLike, layerName: string): TruckPlacement[] {
  const layer = map.layers.find((l) => l.name === layerName && l.type === "objectgroup");
  if (!layer?.objects) throw new Error(`맵에 오브젝트 레이어 "${layerName}" 이(가) 없습니다`);
  return layer.objects.map((o) => {
    const def = TRUCKS.get(o.name);
    if (!def) throw new Error(`맵의 트럭 "${o.name}" 이(가) trucks.json 에 없습니다`);
    if (!o.width || !o.height) throw new Error(`맵의 트럭 "${o.name}" 은(는) 사각형 오브젝트여야 합니다`);
    return { def, box: { left: o.x, top: o.y, right: o.x + o.width, bottom: o.y + o.height } };
  });
}

/** 주문할 수 있는 트럭 앞 영역 */
export function truckFrontBox(truck: TruckPlacement): Box {
  const b = truck.box;
  return { left: b.left - FRONT_SIDE_PX, right: b.right + FRONT_SIDE_PX, top: b.bottom, bottom: b.bottom + FRONT_DEPTH_PX };
}

/** 트럭 앞 가운데 (손님이 서는 곳) */
export function truckFrontPoint(truck: TruckPlacement): Vec2 {
  return { x: (truck.box.left + truck.box.right) / 2, y: truck.box.bottom + FRONT_DEPTH_PX / 2 };
}

/** 발밑 위치가 트럭 앞 주문 영역 안인지 */
export function isAtTruckFront(pos: Vec2, truck: TruckPlacement): boolean {
  const f = truckFrontBox(truck);
  return pos.x >= f.left && pos.x <= f.right && pos.y >= f.top && pos.y <= f.bottom;
}

/** 트럭 앞 가운데까지 거리 (자동 취소 판정) */
export function distanceToTruck(pos: Vec2, truck: TruckPlacement): number {
  const p = truckFrontPoint(truck);
  return Math.hypot(pos.x - p.x, pos.y - p.y);
}

/** 먹기 시작한 뒤 elapsedSec 초가 지났을 때의 그림 단계. 다 먹었으면 null */
export function eatStage(item: MenuItem, elapsedSec: number): number | null {
  if (elapsedSec >= item.eatSec) return null;
  return Math.min(EAT_STAGES - 1, Math.floor((elapsedSec / item.eatSec) * EAT_STAGES));
}
