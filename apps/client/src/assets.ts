// 에셋 키·경로·규격은 이 파일에서만 관리한다. (임시 그림 → 최종 그림 교체 시 여기만 수정)
// 경로는 리포 루트의 assets/ 기준 (Vite publicDir)

import { GENDERS, OUTFITS, OUTFIT_BODIES, straightFacing, type Facing, type StraightFacing } from "@park/shared";

export const MAP = {
  key: "map-park",
  url: "maps/park.json",
  layers: {
    ground: "ground",
    obstacles: "obstacles",
    spawns: "spawns",
    trucks: "trucks",
    seats: "seats",
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

const FACING_8 = ["down", "left", "right", "up", "down-left", "down-right", "up-left", "up-right"] as const satisfies readonly Facing[];
const FACING_4 = ["down", "left", "right", "up"] as const satisfies readonly StraightFacing[];

/**
 * 캐릭터 스프라이트시트 규격 (3-7: 몸 + 옷 레이어).
 * 몸 시트와 옷 시트는 모두 같은 배치: 프레임 32x32, 4열 x 28행 (128x896).
 * 행은 rows 를 위에서부터 차례로 (자세마다 방향 수만큼):
 *   0–7 보통 / 8–15 들고 걷기 (8방향) / 16–19 앉기 / 20–23 들고 앉기 / 24–27 눕기 (4방향, 눕기는 머리 방향)
 * 열: 걷기 4프레임 (0번 = 서 있는 모습). 앉기·눕기는 숨쉬기 4프레임 (0번 = 기본, 2번 = 눈 감음)
 * 옷 레이어는 몸과 같은 프레임 번호로 위에 겹쳐 그린다. 그림 생성: pnpm gen:character
 */
export const CHARACTER = {
  frameWidth: 32,
  frameHeight: 32,
  rows: [
    { pose: "normal", directions: FACING_8, frameRate: 8 },
    /** 간식을 들고 걷기 (4-5) */
    { pose: "carry", directions: FACING_8, frameRate: 8 },
    /** 자리에 앉기 (5-2) */
    { pose: "sit", directions: FACING_4, frameRate: 1.5 },
    { pose: "sitCarry", directions: FACING_4, frameRate: 1.5 },
    /** 눕기 (그림만 준비, 기획서상 MVP 이후) */
    { pose: "lie", directions: FACING_4, frameRate: 1.5 },
  ],
  framesPerRow: 4,
  /** 앉으면 상체가 내려가는 px (간식 손 위치 보정). 그림 생성기 SIT_DROP 과 같은 값 */
  sitDrop: 3,
} as const;

export type Pose = (typeof CHARACTER.rows)[number]["pose"];

/** 시트 행 번호. 4방향 자세에 대각선이 오면 세로 방향 그림을 쓴다 */
function rowOf(facing: Facing, pose: Pose): number {
  let row = 0;
  for (const r of CHARACTER.rows) {
    const dirs: readonly Facing[] = r.directions;
    if (r.pose === pose) return row + dirs.indexOf(dirs.length === FACING_8.length ? facing : straightFacing(facing));
    row += dirs.length;
  }
  throw new Error(`알 수 없는 자세 "${pose}"`);
}

/** 몸 그림 id 전부: 성별 기본 몸(body-male.png) + 옷 전용 몸(OUTFIT_BODIES, body-male-handsome.png 등) */
export const BODY_IDS: readonly string[] = [...GENDERS, ...new Set(Object.values(OUTFIT_BODIES))];

/** 몸 그림 id 는 shared bodyIdOf(appearance) 로 구한다 */
export function bodySheet(bodyId: string): { key: string; url: string } {
  return { key: `body-${bodyId}`, url: `sprites/body-${bodyId}.png` };
}

/**
 * 몸 그림마다 간식 위치 세로 보정 (px, 아래로 +). HAND_OFFSETS 는 기본 몸 기준이고,
 * 머리가 큰 전용 몸은 받치는 손이 더 아래에 있다
 */
export const BODY_HAND_DY: Readonly<Record<string, number>> = {
  "male-handsome": 3,
};

/**
 * 몸 그림마다 머리·입 위치 (먹는 연출). 서 있는 0열 기준.
 *   headBottom: 머리(턱·목)가 끝나는 셀 y. 먹을 때 이 줄 위쪽만 다른 방향 그림으로 바꿔 '고개를 돌린' 모습을 만든다
 *   biteY: 한 입 먹을 때 간식 가운데 높이 (발밑 기준 px, 위가 -). 간식 윗부분이 입에 닿는 높이
 */
export const BODY_HEAD: Readonly<Record<string, { headBottom: number; biteY: number }>> = {
  male: { headBottom: 14, biteY: -17 },
  female: { headBottom: 14, biteY: -17 },
  "male-handsome": { headBottom: 18, biteY: -12 },
};
const DEFAULT_HEAD = BODY_HEAD.male!;

export function bodyHead(bodyId: string): { headBottom: number; biteY: number } {
  return BODY_HEAD[bodyId] ?? DEFAULT_HEAD;
}

export function outfitSheet(outfit: string): { key: string; url: string } {
  return { key: `outfit-${outfit}`, url: `sprites/outfit-${outfit}.png` };
}

/** 불러올 캐릭터 시트 전부 (몸 + 옷) */
export function allCharacterSheets(): { key: string; url: string }[] {
  return [...BODY_IDS.map(bodySheet), ...GENDERS.flatMap((g) => OUTFITS[g].map(outfitSheet))];
}

/** 애니메이션(걷기·숨쉬기)은 몸 시트에만 만든다. 옷은 몸의 현재 프레임 번호를 따라간다 */
export function poseAnimKey(bodyId: string, facing: Facing, pose: Pose = "normal"): string {
  return `${bodySheet(bodyId).key}-${pose}-${facing}`;
}

/** 자세·방향의 첫 프레임 번호 (= 서 있는 모습, 앉기·눕기 기본 모습) */
export function idleFrame(facing: Facing, pose: Pose = "normal"): number {
  return rowOf(facing, pose) * CHARACTER.framesPerRow;
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
