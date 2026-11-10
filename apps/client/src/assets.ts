// 에셋 키·경로·규격은 이 파일에서만 관리한다. (임시 그림 → 최종 그림 교체 시 여기만 수정)
// 경로는 리포 루트의 assets/ 기준 (Vite publicDir)

import { GENDERS, OUTFITS, type Facing, type Gender } from "@park/shared";

export const MAP = {
  key: "map-park",
  url: "maps/park.json",
  layers: {
    ground: "ground",
    obstacles: "obstacles",
    spawns: "spawns",
    trucks: "trucks",
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
  /** 트럭 연기 */
  smoke: 150_000,
  /** 머리 위 말풍선, 트럭 메뉴 */
  bubble: 200_000,
  debug: 1_000_000,
} as const;

/**
 * 캐릭터 스프라이트시트 규격 (3-7: 몸 + 옷 레이어).
 * 몸 시트와 옷 시트는 모두 같은 배치: 행 = 자세(poses) x 방향(directions), 열 = 걷기 프레임. 0번 열은 서 있는 모습으로도 쓴다.
 * 자세: normal(보통), carry(간식을 들고 걷기, 4-5)
 * 옷 레이어는 몸과 같은 프레임 번호로 위에 겹쳐 그린다. 그림 생성: pnpm gen:character
 */
export const CHARACTER = {
  frameWidth: 32,
  frameHeight: 32,
  directions: ["down", "left", "right", "up"] as const satisfies readonly Facing[],
  poses: ["normal", "carry"] as const,
  walkFrames: 4,
  walkFrameRate: 8,
} as const;

export type Pose = (typeof CHARACTER.poses)[number];

export function bodySheet(gender: Gender): { key: string; url: string } {
  return { key: `body-${gender}`, url: `sprites/body-${gender}.png` };
}

export function outfitSheet(outfit: string): { key: string; url: string } {
  return { key: `outfit-${outfit}`, url: `sprites/outfit-${outfit}.png` };
}

/** 불러올 캐릭터 시트 전부 (몸 2 + 옷) */
export function allCharacterSheets(): { key: string; url: string }[] {
  return GENDERS.flatMap((g) => [bodySheet(g), ...OUTFITS[g].map(outfitSheet)]);
}

/** 걷기 애니메이션은 몸 시트에만 만든다. 옷은 몸의 현재 프레임 번호를 따라간다 */
export function walkAnimKey(gender: Gender, facing: Facing, pose: Pose = "normal"): string {
  return `${bodySheet(gender).key}-${pose}-walk-${facing}`;
}

/** 자세·방향의 첫 프레임 번호 (= 서 있는 모습) */
export function idleFrame(facing: Facing, pose: Pose = "normal"): number {
  const row = CHARACTER.poses.indexOf(pose) * CHARACTER.directions.length + CHARACTER.directions.indexOf(facing);
  return row * CHARACTER.walkFrames;
}

/**
 * 간식 그림: 12x12 프레임 EAT_STAGES 개 (0 = 처음, 뒤로 갈수록 먹어서 줄어듦). pnpm gen:food
 * 메뉴 id 는 packages/shared/data/menu.json
 */
export const FOOD = { frameWidth: 12, frameHeight: 12 } as const;

export function foodSheet(item: string): { key: string; url: string } {
  return { key: `food-${item}`, url: `sprites/food/${item}.png` };
}

/**
 * 트럭 그림: 96x80. 아래 96x64 가 맵 trucks 레이어 사각형(3x2칸)과 겹치고, 위 16px 은 지붕.
 * 트럭 id 는 packages/shared/data/trucks.json
 */
export function truckSheet(truck: string): { key: string; url: string } {
  return { key: `truck-${truck}`, url: `sprites/trucks/${truck}.png` };
}

/** 코드로 만드는 작은 텍스처 (BootScene) */
export const GENERATED = {
  smoke: "fx-smoke",
} as const;
