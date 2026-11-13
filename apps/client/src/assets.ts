// 에셋 키·경로·규격은 이 파일에서만 관리한다. (임시 그림 → 최종 그림 교체 시 여기만 수정)
// 경로는 리포 루트의 assets/ 기준 (Vite publicDir)

import { FACES, GENDERS, OUTFITS, HAND_RIG, type CatAction, type CatView, straightFacing, type Facing, type StraightFacing } from "@park/shared";

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
  frameWidth: 64,
  frameHeight: 64,
  /** Art uses twice the logical hand-rig resolution. */
  pixelRatio: 2,
  worldScale: 1.5,
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
  sitDrop: HAND_RIG.sitDrop,
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

/** 몸 그림 id 전부 = 고를 수 있는 얼굴 전부 (body-male.png, body-female-longhair.png …) */
export const BODY_IDS: readonly string[] = GENDERS.flatMap((g) => FACES[g]);

/** 몸 그림 id 는 shared bodyIdOf(appearance) 로 구한다 */
export function bodySheet(bodyId: string): { key: string; url: string } {
  return { key: `body-${bodyId}`, url: `sprites/body-${bodyId}.png` };
}

/**
 * 몸 그림마다 머리·입 위치 (먹는 연출). 서 있는 0열 기준.
 *   headBottom: 머리(턱·목)가 끝나는 셀 y. 먹을 때 이 줄 위쪽만 다른 방향 그림으로 바꿔 '고개를 돌린' 모습을 만든다
 *   biteY: 먹기 효과 말풍선의 입 기준 높이. 음식 위치는 shared hand-rig가 정한다.
 */
export const BODY_HEAD: Readonly<Record<string, { headBottom: number; biteY: number }>> = {
  "male-handsome": { headBottom: 14, biteY: -18 },
  "female-longhair": { headBottom: 14, biteY: -18 },
};
const DEFAULT_HEAD = BODY_HEAD["male-handsome"]!;

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
export const FOOD = {
  frameWidth: HAND_RIG.foodFrame.width, frameHeight: HAND_RIG.foodFrame.height,
  grip: HAND_RIG.foodGrip,
} as const;

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

/**
 * 이모티콘 말풍선 그림: 20x20 프레임을 shared/data/emotes.json 순서대로 가로로 (프레임 번호 = EMOTES 의 순서).
 * 아래 가운데 꼬리 끝이 머리 위를 가리킨다. pnpm gen:emote
 */
export const EMOTE_SHEET = { key: "emotes", url: "sprites/emotes.png", frameWidth: 20, frameHeight: 20 } as const;
/** 화면 오른쪽 아래 이모티콘 버튼 (24x24, 스마일). pnpm gen:emote */
export const EMOTE_BUTTON = { key: "emote-button", url: "sprites/emote-button.png" } as const;

/**
 * 고양이 시트 (5A-1): 32x32 칸, 행 = shared CAT_SHEET_ROWS ([행동, 방향]), 4열. 기준점은 칸 아래 가운데. pnpm gen:cat
 * 다른 털색 고양이를 추가하면 같은 배치로 cat-<털색>.png 를 만들고 coat 를 늘린다
 */
export const CAT_SHEET = { key: "cat-tabby", url: "sprites/animals/cat-tabby.png" } as const;

/**
 * 고양이 애니메이션: 행동마다 프레임 순서·속도. 같은 4프레임도 순서를 달리해 자연스럽게
 * (예: 앉기는 가끔만 눈을 깜빡이고, 기지개·냐옹은 한 번만 하고 마지막 모습에서 멈춘다)
 */
export const CAT_ANIMS: Readonly<Record<CatAction, { frames: readonly number[]; frameRate: number; repeat: boolean }>> = {
  stand: { frames: [0, 1, 0, 1, 0, 1, 2, 3], frameRate: 3, repeat: true },
  walk: { frames: [0, 1, 2, 3], frameRate: 7, repeat: true },
  run: { frames: [0, 1, 2, 3], frameRate: 12, repeat: true },
  sit: { frames: [0, 1, 0, 3, 0, 1, 0, 2, 0, 3], frameRate: 2, repeat: true },
  loaf: { frames: [0, 1, 0, 1, 2, 1], frameRate: 1.5, repeat: true },
  sleep: { frames: [0, 1, 2, 3], frameRate: 1.2, repeat: true },
  groom: { frames: [0, 1, 2, 3], frameRate: 5, repeat: true },
  stretch: { frames: [0, 1, 2, 2, 2, 3, 0], frameRate: 4, repeat: false },
  meow: { frames: [0, 1, 2, 3, 3, 1, 0], frameRate: 9, repeat: false },
  hop: { frames: [0, 1, 2, 3], frameRate: 10, repeat: false },
};

export function catAnimKey(action: CatAction, view: CatView): string {
  return `${CAT_SHEET.key}-${action}-${view}`;
}

/** 코드로 만드는 작은 텍스처 (BootScene) */
export const GENERATED = {
  smoke: "fx-smoke",
  /** 손 흔들기(안녕 이모티콘)에 쓰는 벙어리장갑 5x6 */
  mitten: "fx-mitten",
} as const;
