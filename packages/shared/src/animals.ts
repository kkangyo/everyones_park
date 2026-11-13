// 공원 동물 (Phase 5A). 서버(행동 결정)와 클라이언트(그림)가 같은 행동 이름·시트 배치를 쓴다.

import type { Facing, Vec2 } from "./movement";

/** 동물 종류. 지금은 고양이만 */
export const ANIMAL_KINDS = ["cat"] as const;
export type AnimalKind = (typeof ANIMAL_KINDS)[number];

/**
 * 고양이 행동 = 그림 애니메이션 이름.
 *   stand  : 서서 둘러보기 (꼬리 살랑)
 *   walk   : 걷기
 *   run    : 뛰기 (우다다, 놀라서 도망)
 *   sit    : 앉기 (눈 깜빡임)
 *   loaf   : 식빵 자세 (엎드려 고개 들고 있기)
 *   sleep  : 몸을 말고 자기 (숨쉬기)
 *   groom  : 앉아서 앞발 핥기 (그루밍)
 *   stretch: 기지개 (한 번 하고 끝, 자고 일어날 때)
 *   meow   : 앉아서 냐옹 (입을 벌림, 한 번)
 *   hop    : 깜짝 놀라 뒤로 폴짝 (사람 쪽을 본 채로, 한 번)
 */
export const CAT_ACTIONS = ["stand", "walk", "run", "sit", "loaf", "sleep", "groom", "stretch", "meow", "hop"] as const;
export type CatAction = (typeof CAT_ACTIONS)[number];

/** 그림 방향. side 는 오른쪽을 보는 옆모습 (왼쪽은 뒤집어서 그린다), down = 앞모습, up = 뒷모습 */
export type CatView = "side" | "down" | "up";

/**
 * 고양이 시트 배치: 32x32 칸, 4열 x CAT_SHEET_ROWS.length 행. 행 = [행동, 방향], 열 = 애니메이션 4프레임.
 * 캐릭터와 같은 기준점: 칸 아래 가운데(16, 32)가 고양이 발밑 위치. 발바닥은 y 29, 그림자는 y 30–31
 */
export const CAT_SHEET_ROWS: readonly (readonly [CatAction, CatView])[] = [
  ["stand", "side"], ["stand", "down"], ["stand", "up"],
  ["walk", "side"], ["walk", "down"], ["walk", "up"],
  ["run", "side"], ["run", "down"], ["run", "up"],
  ["sit", "side"], ["sit", "down"], ["sit", "up"],
  ["loaf", "side"], ["loaf", "down"],
  ["sleep", "side"],
  ["groom", "down"],
  ["stretch", "side"],
  ["meow", "down"],
  ["hop", "side"], ["hop", "down"], ["hop", "up"],
];
export const CAT_FRAME = 32;
export const CAT_FRAMES_PER_ROW = 4;

/** 보는 방향 → 그림 방향. 옆·대각선은 옆모습 (고양이는 옆모습이 가장 고양이다워 보인다) */
export function catViewOf(facing: Facing): CatView {
  return facing === "down" ? "down" : facing === "up" ? "up" : "side";
}

/** 그 행동·방향의 시트 행. 그 방향 그림이 없으면 있는 방향으로 (예: 잠은 옆모습뿐) */
export function catRowOf(action: CatAction, facing: Facing): { row: number; view: CatView } {
  const want = catViewOf(facing);
  const rows = CAT_SHEET_ROWS.map(([a, v], row) => ({ a, v, row })).filter((r) => r.a === action);
  const hit = rows.find((r) => r.v === want) ?? rows.find((r) => r.v === "side") ?? rows[0]!;
  return { row: hit.row, view: hit.v };
}

/**
 * 고양이 이동 속도 (px/초). 사람 걷기는 96.
 * hop: 깜짝 놀라 뒤로 폴짝 (그림 4프레임 x 10fps = 0.4초 동안 약 42px)
 */
export const CAT_SPEED = { walk: 34, run: 118, hop: 100 } as const;

/** 이 거리(px) 안에 있으면 쓰다듬을 수 있다 (클릭·F 키·'쓰다듬기' 버튼). 서버는 보간 지연만큼 조금 더 너그럽게 본다 */
export const PET_RANGE_PX = 44;

/**
 * 고양이 주변 효과 (5A-3~5A-5). 서버가 fx·fxTick 을 바꾸면 클라이언트가 한 번 보여 준다
 *   meow   : '냐옹' 말풍선
 *   startle: 깜짝 놀람 '!'
 *   purr   : 쓰다듬어 줘서 골골 (하트)
 *   curious: 관심 '?' (사람이 가만히 있으면 다가오기 시작할 때)
 */
export const CAT_FX = ["meow", "startle", "purr", "curious"] as const;
export type CatFx = (typeof CAT_FX)[number];

/** 맵에 놓인 동물 하나 (animals 오브젝트 레이어의 점) */
export interface AnimalPlacement {
  id: string;
  kind: AnimalKind;
  /** 이름 (지금은 ko 만) */
  name: string;
  /** 사는 곳. 이 근처를 돌아다닌다 */
  home: Vec2;
  /** home 에서 이만큼(px)까지 돌아다닌다 */
  roamPx: number;
  /** 대담함 0–1. 높을수록 사람에게 빨리 다가오고 덜 피한다 */
  boldness: number;
}

interface TiledAnimalMapLike {
  layers: { name: string; type: string; objects?: { name: string; x: number; y: number; properties?: { name: string; value: unknown }[] }[] }[];
}

/**
 * animals 오브젝트 레이어(점)에서 동물을 읽는다. 오브젝트 속성:
 *   kind      : ANIMAL_KINDS 중 하나
 *   label     : 이름 (예: 고등어)
 *   roam      : 돌아다니는 범위 (타일 수)
 *   boldness  : 대담함 0–1
 */
export function animalsFromTiled(map: TiledAnimalMapLike, layerName: string, tileSize: number): AnimalPlacement[] {
  const layer = map.layers.find((l) => l.name === layerName && l.type === "objectgroup");
  if (!layer?.objects) return [];
  const ids = new Set<string>();
  return layer.objects.map((o) => {
    const prop = (name: string) => o.properties?.find((p) => p.name === name)?.value;
    const kind = prop("kind");
    const roam = prop("roam");
    const boldness = prop("boldness");
    if (!o.name || ids.has(o.name)) throw new Error(`맵의 동물 이름 "${o.name}" 이(가) 비었거나 중복입니다`);
    if (!ANIMAL_KINDS.includes(kind as AnimalKind)) throw new Error(`맵의 동물 "${o.name}" 의 kind "${String(kind)}" 을(를) 모릅니다`);
    if (typeof roam !== "number" || roam < 1) throw new Error(`맵의 동물 "${o.name}" 의 roam 은 1 이상이어야 합니다`);
    if (typeof boldness !== "number" || boldness < 0 || boldness > 1) throw new Error(`맵의 동물 "${o.name}" 의 boldness 는 0–1 이어야 합니다`);
    ids.add(o.name);
    return { id: o.name, kind: kind as AnimalKind, name: String(prop("label") ?? o.name), home: { x: o.x, y: o.y }, roamPx: roam * tileSize, boldness };
  });
}

/** 방향(dx, dy) → 8방향. 거의 움직이지 않으면 prev */
export function facingToward(dx: number, dy: number, prev: Facing): Facing {
  if (Math.hypot(dx, dy) < 0.01) return prev;
  const angle = Math.atan2(dy, dx); // 오른쪽 0, 아래 +
  const dirs: Facing[] = ["right", "down-right", "down", "down-left", "left", "up-left", "up", "up-right"];
  return dirs[(Math.round(angle / (Math.PI / 4)) + 8) % 8]!;
}
