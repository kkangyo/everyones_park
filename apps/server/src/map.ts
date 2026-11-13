import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { animalsFromTiled, collisionGridFromTiled, seatsFromTiled, truckPlacementsFromTiled, type AnimalPlacement, type CollisionGrid, type Seat, type TruckPlacement, type Vec2 } from "@park/shared";
import { config } from "./config";

// 클라이언트(apps/client/src/assets.ts MAP)와 같은 파일·레이어 이름
const MAP_FILE = "maps/park.json";
const OBSTACLE_LAYER = "obstacles";
const SPAWN_LAYER = "spawns";
const ENTRANCE_SPAWN = "entrance";
const TRUCK_LAYER = "trucks";
const SEAT_LAYER = "seats";
const ANIMAL_LAYER = "animals";

export interface ParkMap {
  grid: CollisionGrid;
  widthPx: number;
  heightPx: number;
  entrance: Vec2;
  trucks: TruckPlacement[];
  seats: Seat[];
  animals: AnimalPlacement[];
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: {
    name: string;
    type: string;
    data?: number[];
    objects?: { name: string; x: number; y: number; width?: number; height?: number; properties?: { name: string; value: unknown }[] }[];
  }[];
}

/** 서버 시작 시 한 번 읽는다. 클라이언트와 같은 JSON, 같은 함수로 충돌 격자를 만든다 */
export function loadParkMap(): ParkMap {
  const path = resolve(config.assetsDir, MAP_FILE);
  const raw = JSON.parse(readFileSync(path, "utf8")) as TiledMap;
  const spawn = raw.layers.find((l) => l.name === SPAWN_LAYER)?.objects?.find((o) => o.name === ENTRANCE_SPAWN);
  if (!spawn) throw new Error(`${path} 에 시작 위치 "${ENTRANCE_SPAWN}" 이(가) 없습니다`);
  return {
    grid: collisionGridFromTiled(raw, OBSTACLE_LAYER),
    widthPx: raw.width * raw.tilewidth,
    heightPx: raw.height * raw.tileheight,
    entrance: { x: spawn.x, y: spawn.y },
    trucks: truckPlacementsFromTiled(raw, TRUCK_LAYER),
    seats: seatsFromTiled(raw, SEAT_LAYER),
    animals: animalsFromTiled(raw, ANIMAL_LAYER, raw.tilewidth),
  };
}
