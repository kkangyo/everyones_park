import Phaser from "phaser";
import { collisionGridFromTiled, type CollisionGrid, type Vec2 } from "@park/shared";
import { DEPTH, MAP, PROP_SPRITES, TILESET } from "../assets";

export interface ParkMapView {
  map: Phaser.Tilemaps.Tilemap;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  obstacleLayer: Phaser.Tilemaps.TilemapLayer;
  grid: CollisionGrid;
  entrance: Vec2;
}

/** 공원 맵을 씬에 그린다. 공원 씬과 입장 화면 배경이 같이 쓴다 */
export function buildParkMap(scene: Phaser.Scene): ParkMapView {
  const map = scene.make.tilemap({ key: MAP.key });
  const tileset = map.addTilesetImage(TILESET.name, TILESET.key);
  if (!tileset) throw new Error(`타일셋 "${TILESET.name}" 을(를) 맵에서 찾을 수 없습니다`);

  const groundLayer = map.createLayer(MAP.layers.ground, tileset)!.setDepth(DEPTH.ground);
  const obstacleLayer = map.createLayer(MAP.layers.obstacles, tileset)!.setDepth(DEPTH.ground);
  liftYSortTiles(scene, obstacleLayer);

  // 서버와 같은 함수로, 같은 원본 JSON 에서 충돌 격자를 만든다
  const raw = scene.cache.tilemap.get(MAP.key).data;
  const grid = collisionGridFromTiled(raw, MAP.layers.obstacles);

  const obj = map.findObject(MAP.layers.spawns, (o) => o.name === MAP.entranceSpawn);
  if (!obj || obj.x === undefined || obj.y === undefined) throw new Error(`시작 위치 "${MAP.entranceSpawn}" 을(를) 맵에서 찾을 수 없습니다`);

  return { map, groundLayer, obstacleLayer, grid, entrance: { x: obj.x, y: obj.y } };
}

/**
 * ysort 속성이 있는 타일(나무·바위·울타리)을 타일 레이어에서 빼서 개별 이미지로 다시 그린다.
 * 이미지 depth 를 타일 아랫변 y 로 두면 캐릭터와 앞뒤가 맞는다 (나무 뒤에 서면 가려짐).
 * 충돌은 원본 JSON 으로 만든 격자를 쓰므로 영향 없음.
 */
function liftYSortTiles(scene: Phaser.Scene, layer: Phaser.Tilemaps.TilemapLayer): void {
  const lifted: Phaser.Tilemaps.Tile[] = [];
  layer.forEachTile((tile) => {
    const props = tile.properties as { ysort?: boolean; sprite?: string } | undefined;
    if (tile.index < 0 || !props?.ysort) return;
    const baseX = tile.pixelX + tile.width / 2;
    const baseY = tile.pixelY + tile.height;
    const prop = props.sprite ? PROP_SPRITES[props.sprite] : undefined;
    if (props.sprite && !prop) console.warn(`assets.ts PROP_SPRITES 에 "${props.sprite}" 이(가) 없어 타일 그림으로 그립니다`);
    const image = prop
      ? scene.add.image(baseX, baseY, prop.key)
      : scene.add.image(baseX, baseY, TILESET.sheetKey, tile.index - tile.tileset!.firstgid);
    image.setOrigin(0.5, 1).setDepth(DEPTH.ysortBase + baseY);
    lifted.push(tile);
  });
  for (const tile of lifted) layer.removeTileAt(tile.x, tile.y);
}
