// 에셋 키·경로·규격은 이 파일에서만 관리한다. (임시 그림 → 최종 그림 교체 시 여기만 수정)
// 경로는 리포 루트의 assets/ 기준 (Vite publicDir)

import type { Facing } from "@park/shared";

export const MAP = {
  key: "map-park",
  url: "maps/park.json",
  layers: {
    ground: "ground",
    obstacles: "obstacles",
    spawns: "spawns",
  },
  /** 처음 입장하는 위치 (spawns 레이어의 오브젝트 이름) */
  entranceSpawn: "entrance",
} as const;

export const TILESET = {
  key: "tiles-placeholder",
  /** 같은 이미지를 프레임 단위로 잘라 쓰는 키 (ysort 타일을 개별 이미지로 그릴 때) */
  sheetKey: "tiles-placeholder-sheet",
  url: "tiles/placeholder.png",
  /** park.json 안의 tilesets[].name 과 같아야 한다 */
  name: "placeholder",
  tileSize: 32,
} as const;

/**
 * 맵 타일 속성 sprite 값 → 그릴 이미지.
 * 이미지 아랫변을 타일 아랫변에 맞춰 그리므로, 타일보다 키가 크면 위쪽 칸을 덮는다.
 */
export const PROP_SPRITES: Record<string, { key: string; url: string }> = {
  "tree-tall": { key: "prop-tree-tall", url: "sprites/tree-tall.png" },
};

/** 그리는 순서. 캐릭터·나무 등 앞뒤가 있는 것은 depth = 발밑(아랫변) y 좌표 */
export const DEPTH = {
  ground: 0,
  /** 땅 위에 깔리는 표시 (클릭 목적지 등). ysort 대상보다 항상 아래 */
  groundMarker: 1,
  /** 이 값부터는 y 좌표를 더해서 쓴다 */
  ysortBase: 10,
  /** 이름표. 모든 캐릭터·나무보다 위 (맵 높이보다 충분히 큰 값) */
  nameplate: 100_000,
  debug: 1_000_000,
} as const;

/**
 * 캐릭터 스프라이트시트 규격.
 * 행 = 방향(directions 순서), 열 = 걷기 프레임. 0번 열은 서 있는 모습으로도 쓴다.
 */
export const CHARACTER = {
  key: "character-placeholder",
  url: "sprites/character-placeholder.png",
  frameWidth: 32,
  frameHeight: 32,
  directions: ["down", "left", "right", "up"] as const satisfies readonly Facing[],
  walkFrames: 4,
  walkFrameRate: 8,
} as const;

export function walkAnimKey(facing: Facing): string {
  return `${CHARACTER.key}-walk-${facing}`;
}

/** 서 있는 모습 프레임 번호 */
export function idleFrame(facing: Facing): number {
  return CHARACTER.directions.indexOf(facing) * CHARACTER.walkFrames;
}
