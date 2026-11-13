/**
 * 임시 캐릭터 스프라이트시트를 생성한다. 몸과 옷을 따로 그려서 겹친다 (기획서 4장 구현 메모).
 *
 *   pnpm gen:character
 *
 * 출력:
 *   assets/sprites/body-<성별>.png    몸 (그림자, 다리, 신발, 머리, 얼굴)
 *   assets/sprites/outfit-<옷 id>.png 옷 (상의, 팔, 목도리, 바지·치마). 성별·옷 id 는 packages/shared/src/character.ts
 *
 * 모든 시트는 같은 배치: 프레임 32x32, 4열 x 28행 (128x896). apps/client/src/assets.ts 의 CHARACTER.rows 와 같은 순서
 *   행 0–7:   보통       down, left, right, up, down-left, down-right, up-left, up-right
 *   행 8–15:  들고 걷기  (같은 8방향. 팔을 앞으로 모음. 간식 그림은 게임이 손 위치에 따로 그린다)
 *   행 16–19: 앉기       down, left, right, up (보는 방향)
 *   행 20–23: 들고 앉기  down, left, right, up
 *   행 24–27: 눕기       down, left, right, up (머리 방향 = 남, 서, 동, 북)
 *   열 (걷기): 0 서기, 1 왼발 앞, 2 서기, 3 오른발 앞. 0번 열은 서 있는 모습으로도 쓴다
 *   열 (앉기·눕기): 0 기본, 1 숨 들이쉼(상체 1px 위), 2 눈 감음, 3 숨 들이쉼. 천천히 반복
 *
 * 최종 그림으로 바꿀 때도 같은 배치·파일 이름을 지키면 코드 수정 없이 교체된다.
 * 옷 레이어는 몸 위에 그려지므로 머리 부분은 비워 둔다 (모자·후드는 나중에 위에 덮어도 됨).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GENDERS, OUTFITS, frameOf, type Gender } from "../packages/shared/src/character";
import { Canvas, encodePng, hex, type RGBA } from "./lib/png";
import { drawCarryArms } from "./lib/carry-arms";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FRAME = 32;
const DIRS_8 = ["down", "left", "right", "up", "down-left", "down-right", "up-left", "up-right"] as const;
const DIRS_4 = ["down", "left", "right", "up"] as const;
const WALK_FRAMES = 4;
type PoseName = "normal" | "carry" | "sit" | "sitCarry" | "lie";
type Dir = (typeof DIRS_8)[number];
/** 행 묶음 (위에서부터). assets.ts 의 CHARACTER.rows 와 같은 순서 */
const ROWS: { pose: PoseName; dirs: readonly Dir[] }[] = [
  { pose: "normal", dirs: DIRS_8 },
  { pose: "carry", dirs: DIRS_8 },
  { pose: "sit", dirs: DIRS_4 },
  { pose: "sitCarry", dirs: DIRS_4 },
  { pose: "lie", dirs: DIRS_4 },
];
/** 앉으면 상체가 이만큼(px) 내려간다. assets.ts 의 CHARACTER.sitDrop 과 같은 값 */
const SIT_DROP = 3;
/**
 * 실제로 그리는 모습. 오른쪽을 보는 방향은 왼쪽 모습을 뒤집어 쓴다.
 * front: 정면, back: 뒷모습, side: 옆모습, frontSide: 비스듬히 앞(3/4), backSide: 비스듬히 뒤
 */
type View = "front" | "back" | "side" | "frontSide" | "backSide";

const VIEWS: Record<Dir, View> = {
  down: "front",
  up: "back",
  left: "side",
  right: "side",
  "down-left": "frontSide",
  "down-right": "frontSide",
  "up-left": "backSide",
  "up-right": "backSide",
};

/** 프레임 안 좌표 변환 (그리는 좌표 → 실제 셀 좌표) */
type Transform = (x: number, y: number) => [number, number];
const IDENTITY: Transform = (x, y) => [x, y];
const FLIP_X: Transform = (x, y) => [FRAME - 1 - x, y];
/**
 * 눕기는 '머리가 왼쪽(서)'인 모습 하나만 그리고 돌리거나 뒤집는다.
 * 남: 머리가 아래, 북: 머리가 위 (가운데 줄 y=24 가 셀 가운데 x=16 으로 감)
 */
const LIE_TRANSFORMS: Record<(typeof DIRS_4)[number], Transform> = {
  left: IDENTITY,
  right: FLIP_X,
  down: (x, y) => [y - 8, FRAME - 1 - x],
  up: (x, y) => [FRAME + 7 - y, x],
};

function transformOf(pose: PoseName, dir: Dir): Transform {
  if (pose === "lie") return LIE_TRANSFORMS[dir as (typeof DIRS_4)[number]];
  return dir.endsWith("right") ? FLIP_X : IDENTITY;
}

const BODY = {
  shadow: hex("#000000", 50),
  skin: hex("#f6d7b8"),
  cheek: hex("#f2a5a0"),
  eye: hex("#1b2433"),
  legs: hex("#3a3f4a"),
  shoe: hex("#2d2d2d"),
  hair: { male: hex("#3b2a20"), female: hex("#5a3524") } satisfies Record<Gender, RGBA>,
};

interface OutfitStyle {
  coat: string;
  coatDark: string;
  scarf?: string;
  pants: string;
  /** 치마 (다리 위쪽을 덮음). 없으면 바지 */
  skirt?: string;
  /** 무릎까지 오는 긴 상의 */
  long?: boolean;
  /** 뒤에서 보이는 후드 */
  hood?: boolean;
  /** 앞섶 단추·지퍼 색 */
  trim?: string;
}

const OUTFIT_STYLES: Record<string, OutfitStyle> = {
  // 남
  "padding-orange": { coat: "#e8823a", coatDark: "#c4652a", scarf: "#d64545", pants: "#4a5568" },
  "coat-navy": { coat: "#34466b", coatDark: "#26334f", scarf: "#b8bec9", pants: "#2f3440", long: true, trim: "#c9a24a" },
  "hoodie-green": { coat: "#4f8a5b", coatDark: "#3b6b45", pants: "#c8b48a", hood: true },
  "parka-gray": { coat: "#8a929e", coatDark: "#6b727d", scarf: "#e0b03a", pants: "#3d5a8a", trim: "#4a4f57" },
  // 여
  "coat-pink": { coat: "#f0a3b5", coatDark: "#d27f93", scarf: "#f5f1e8", pants: "#3a3f4a", skirt: "#5b4a6b" },
  "padding-cream": { coat: "#efe2c4", coatDark: "#d2c19c", scarf: "#8a5a3b", pants: "#4a4440", long: true },
  "coat-red": { coat: "#c94040", coatDark: "#a02f2f", scarf: "#2f3a5a", pants: "#2a2a2e", trim: "#e8c26a" },
  "parka-mint": { coat: "#8fd1c0", coatDark: "#6bb3a1", scarf: "#f08aa0", pants: "#3d5a8a", hood: true },
};

/** 프레임 하나에 그리는 도구. transform 으로 뒤집거나 돌려 그린다 (*-right = *-left 를 뒤집은 것) */
class Frame {
  constructor(
    private readonly c: Canvas,
    private readonly ox: number,
    private readonly oy: number,
    private readonly transform: Transform,
  ) {}
  px(x: number, y: number, color: RGBA): void {
    const [tx, ty] = this.transform(x, y);
    if (tx < 0 || ty < 0 || tx >= FRAME || ty >= FRAME) return; // 옆 셀 침범 방지
    this.c.set(this.ox + tx, this.oy + ty, color);
  }
  rect(x: number, y: number, w: number, h: number, color: RGBA): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, color);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, color: RGBA): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, color);
      }
  }
}

/** 프레임별 자세. 몸과 옷이 같은 값을 써야 어긋나지 않는다 */
interface Pose {
  /** 1: 왼발 앞, -1: 오른발 앞, 0: 서기 */
  stride: number;
  /** 상체(머리·몸통·팔) 세로 이동. 걸을 때 1px 위, 앉으면 SIT_DROP 아래, 숨 들이쉬면 1px 위 */
  bob: number;
  view: View;
  seated: boolean;
  /** 눈 감음 (앉기·눕기 2번 열) */
  blink: boolean;
}

function poseOf(dir: Dir, step: number, pose: PoseName): Pose {
  const seated = pose === "sit" || pose === "sitCarry";
  const rest = seated || pose === "lie";
  // 걷기 step: 0 서기, 1 왼발 앞, 2 서기, 3 오른발 앞 / 쉬기 step: 0 기본, 1·3 숨 들이쉼, 2 눈 감음
  const stride = rest ? 0 : step === 1 ? 1 : step === 3 ? -1 : 0;
  const up = step % 2 === 1 ? -1 : 0;
  return { stride, bob: (seated ? SIT_DROP : 0) + up, view: VIEWS[dir], seated, blink: rest && step === 2 };
}

function isCarry(pose: PoseName): boolean {
  return pose === "carry" || pose === "sitCarry";
}

type Rect = { x: number; y: number; w: number; h: number };

/** 앉은 다리 (바지는 legs 에 덮고, 신발은 몸 레이어만) */
function sitLegs(view: View): { legs: Rect[]; shoes: Rect[] } {
  if (view === "back") return { legs: [], shoes: [] }; // 등에 가려 안 보임
  if (view === "side")
    // 허벅지가 앞(왼쪽)으로 나오고 정강이가 아래로 (몸통보다 왼쪽으로 삐져나온 부분만 보임)
    return {
      legs: [
        { x: 6, y: 25, w: 8, h: 2 },
        { x: 6, y: 27, w: 3, h: 2 },
      ],
      shoes: [{ x: 5, y: 29, w: 4, h: 2 }],
    };
  // 정면: 무릎이 앞으로 와서 다리가 짧아 보임
  return {
    legs: [
      { x: 12, y: 26, w: 3, h: 3 },
      { x: 17, y: 26, w: 3, h: 3 },
    ],
    shoes: [
      { x: 12, y: 29, w: 3, h: 2 },
      { x: 17, y: 29, w: 3, h: 2 },
    ],
  };
}

/** 걷는 다리 위치 (옷의 바지도 같은 자리에 덮어 그린다) */
function legRects(p: Pose): Rect[] {
  if (p.seated) return sitLegs(p.view).legs;
  if (p.view === "frontSide" || p.view === "backSide") {
    // 비스듬히: 두 다리가 조금 붙고, 걸을 때 내딛는 다리가 1px 들리며 바깥으로 벌어진다
    const leftLift = p.stride === 1 ? 1 : 0;
    const rightLift = p.stride === -1 ? 1 : 0;
    return [
      { x: 12 - leftLift, y: 24, w: 3, h: 4 - leftLift },
      { x: 16 + rightLift, y: 24, w: 3, h: 4 - rightLift },
    ];
  }
  if (p.view === "side") {
    // 옆모습: 앞다리/뒷다리가 앞뒤로 벌어짐 (왼쪽을 보는 기준으로 그리고 right 는 뒤집힘)
    const front = 14 - 2 * Math.abs(p.stride);
    const back = 15 + 2 * Math.abs(p.stride);
    return [
      { x: back, y: 24, w: 3, h: 4 },
      { x: front, y: 24, w: 3, h: 4 },
    ];
  }
  const leftLift = p.stride === 1 ? 1 : 0;
  const rightLift = p.stride === -1 ? 1 : 0;
  return [
    { x: 12, y: 24, w: 3, h: 4 - leftLift },
    { x: 17, y: 24, w: 3, h: 4 - rightLift },
  ];
}

function drawBody(f: Frame, dir: Dir, step: number, gender: Gender, pose: PoseName): void {
  if (pose === "lie") return drawLyingBody(f, step, gender);
  const p = poseOf(dir, step, pose);
  const hair = BODY.hair[gender];
  f.ellipse(16, 30, 6, 1.6, BODY.shadow);

  // 다리 + 신발
  if (p.seated) {
    const sit = sitLegs(p.view);
    for (const l of sit.legs) f.rect(l.x, l.y, l.w, l.h, BODY.legs);
    for (const s of sit.shoes) f.rect(s.x, s.y, s.w, s.h, BODY.shoe);
  } else {
    const legs = legRects(p);
    for (const l of legs) f.rect(l.x, l.y, l.w, l.h + 1, BODY.legs);
    if (p.view === "side") {
      f.rect(legs[0]!.x, 28, 3, 2, BODY.shoe);
      f.rect(legs[1]!.x - 1, 28, 4, 2, BODY.shoe);
    } else {
      for (const l of legs) f.rect(l.x, l.y + l.h, 3, 2, BODY.shoe);
    }
  }

  // 목 (옷이 덮지 않는 틈이 비지 않게)
  f.rect(14, 13 + p.bob, 4, 2, BODY.skin);

  // 머리
  const hy = 8 + p.bob;
  const long = gender === "female";
  const v = p.view;
  // 눈 감으면 1px 가는 선
  const eyeY = hy + (p.blink ? 2 : 1);
  const eyeH = p.blink ? 1 : 2;
  if (long && v !== "front") {
    // 긴 머리 뒷부분 (얼굴보다 먼저)
    if (v === "back") f.rect(10, hy, 12, 7, hair);
    else if (v === "backSide") f.rect(11, hy, 12, 7, hair);
    else if (v === "frontSide") f.ellipse(19, hy + 2, 4, 6.5, hair);
    else f.ellipse(19, hy + 2, 3.5, 6.5, hair);
  }
  f.ellipse(16, hy, 6.5, 6.5, BODY.skin);

  if (v === "front") {
    f.ellipse(16, hy - 3, 6.5, 3.5, hair);
    f.rect(9, hy - 2, 2, long ? 9 : 4, hair);
    f.rect(21, hy - 2, 2, long ? 9 : 4, hair);
    f.rect(13, eyeY, 1, eyeH, BODY.eye);
    f.rect(18, eyeY, 1, eyeH, BODY.eye);
    f.px(12, hy + 3, BODY.cheek);
    f.px(19, hy + 3, BODY.cheek);
  } else if (v === "back") {
    f.ellipse(16, hy, 6.5, 6.5, hair);
  } else if (v === "frontSide") {
    // 왼쪽 아래를 보는 3/4 모습: 얼굴이 왼쪽으로 치우치고 뒤통수 머리가 오른쪽에 보인다
    f.ellipse(16, hy - 3, 6.5, 3.5, hair);
    f.ellipse(20, hy, 2.5, 5, hair);
    f.rect(9, hy - 2, 2, long ? 6 : 3, hair);
    f.rect(12, eyeY, 1, eyeH, BODY.eye);
    f.rect(16, eyeY, 1, eyeH, BODY.eye);
    f.px(11, hy + 3, BODY.cheek);
    f.px(17, hy + 3, BODY.cheek);
  } else if (v === "backSide") {
    // 왼쪽 위를 보는 3/4 뒷모습: 거의 머리카락, 왼쪽 가장자리에 볼·귀만 보인다
    f.ellipse(17, hy, 6.5, 6.5, hair);
    f.ellipse(16, hy - 2, 6.5, 4.5, hair);
    f.px(10, hy + 2, BODY.cheek);
  } else {
    // 왼쪽을 보는 옆모습
    f.ellipse(16, hy - 3, 6.5, 3.5, hair);
    f.ellipse(19, hy, 3.5, 5.5, hair);
    f.rect(11, eyeY, 1, eyeH, BODY.eye);
    f.px(11, hy + 3, BODY.cheek);
  }
}

function drawOutfit(f: Frame, dir: Dir, step: number, style: OutfitStyle, pose: PoseName): void {
  if (pose === "lie") return drawLyingOutfit(f, style);
  const p = poseOf(dir, step, pose);
  const coat = hex(style.coat);
  const coatDark = hex(style.coatDark);
  const pants = hex(style.pants);

  // 바지 (다리 위에 덮음)
  for (const l of legRects(p)) f.rect(l.x, l.y, l.w, l.h, pants);
  if (style.skirt) f.rect(10, 23 + p.bob, 12, 3, hex(style.skirt));

  // 몸통
  const bottom = style.long ? 26 : 24;
  f.rect(10, 15 + p.bob, 12, bottom - 15, coat);
  f.rect(10, bottom - 1 + p.bob, 12, 1, coatDark);
  f.rect(11, 14 + p.bob, 10, 1, coat);
  const v = p.view;
  // 앞섶: 정면은 가운데, 비스듬히 앞은 보는 쪽(왼쪽)으로 치우침
  const frontX = v === "front" ? 16 : v === "frontSide" ? 13 : null;
  if (frontX !== null) {
    if (style.trim) f.rect(frontX - 1, 16 + p.bob, 2, bottom - 17, hex(style.trim));
    else f.rect(frontX, 16 + p.bob, 1, bottom - 17, coatDark); // 지퍼선
  }
  // 비스듬히 보면 몸통 오른쪽(먼 쪽)에 그늘
  if (v === "frontSide" || v === "backSide") f.rect(20, 15 + p.bob, 2, bottom - 16, coatDark);

  // 후드 (뒤에서 보면 목 뒤에 늘어짐)
  if (style.hood) {
    if (v === "back") f.rect(12, 13 + p.bob, 8, 4, coatDark);
    else if (v === "backSide") f.rect(13, 13 + p.bob, 8, 4, coatDark);
    else if (v === "side") f.rect(18, 13 + p.bob, 4, 3, coatDark);
    else if (v === "frontSide") f.rect(17, 13 + p.bob, 5, 2, coatDark);
    else f.rect(11, 13 + p.bob, 10, 2, coatDark);
  }

  // 팔
  if (isCarry(pose)) {
    // Shared absolute hand rig is drawn after the cell's directional transform.
  } else if (v === "side") {
    f.rect(15 - p.stride, 16 + p.bob, 2, 6, coatDark);
  } else if (v === "frontSide" || v === "backSide") {
    // 가까운 팔(왼쪽)은 다 보이고, 먼 팔(오른쪽)은 몸통 가장자리에 조금 보인다. 다리와 반대로 흔든다
    f.rect(8, 16 + p.bob + p.stride, 2, 6, coatDark);
    f.rect(22, 16 + p.bob - p.stride, 1, 5, coatDark);
  } else {
    f.rect(8, 16 + p.bob + p.stride, 2, 6, coatDark);
    f.rect(22, 16 + p.bob - p.stride, 2, 6, coatDark);
  }

  // 목도리
  if (style.scarf) {
    const scarf = hex(style.scarf);
    f.rect(11, 14 + p.bob, 10, 2, scarf);
    if (v === "back" || v === "front") f.rect(17, 16 + p.bob, 2, 3, scarf);
    if (v === "frontSide") f.rect(14, 16 + p.bob, 2, 3, scarf);
    if (v === "backSide") f.rect(18, 16 + p.bob, 2, 3, scarf);
  }
}

/**
 * 누운 모습 (머리가 왼쪽, 하늘을 보고 반듯이). 다른 방향은 LIE_TRANSFORMS 로 돌린다.
 * 몸 가운데 줄 y=24, 머리 x 1–12, 몸통 x 12–21, 다리 x 21–31
 */
const LIE_LEGS: Rect[] = [
  { x: 21, y: 20, w: 9, h: 3 },
  { x: 21, y: 25, w: 9, h: 3 },
];

function drawLyingBody(f: Frame, step: number, gender: Gender): void {
  const hair = BODY.hair[gender];
  const blink = step === 2;
  f.ellipse(17, 25, 14, 6.5, BODY.shadow);
  for (const l of LIE_LEGS) f.rect(l.x, l.y, l.w, l.h, BODY.legs);
  for (const l of LIE_LEGS) f.rect(30, l.y, 2, l.h, BODY.shoe);
  f.rect(11, 22, 2, 4, BODY.skin); // 목
  if (gender === "female") f.ellipse(4, 24, 4.5, 8, hair); // 바닥에 펼쳐진 긴 머리
  f.ellipse(6.5, 24, 5.5, 5.5, BODY.skin);
  f.ellipse(3.5, 24, 3.5, 5.5, hair);
  // 얼굴이 위(화면 쪽)를 봄: 눈이 세로로 놓인다
  const eyeW = blink ? 1 : 2;
  f.rect(8, 21, eyeW, 1, BODY.eye);
  f.rect(8, 26, eyeW, 1, BODY.eye);
  f.px(10, 20, BODY.cheek);
  f.px(10, 27, BODY.cheek);
}

function drawLyingOutfit(f: Frame, style: OutfitStyle): void {
  const coat = hex(style.coat);
  const coatDark = hex(style.coatDark);
  for (const l of LIE_LEGS) f.rect(l.x, l.y, l.w, l.h, hex(style.pants));
  if (style.skirt) f.rect(20, 18, 3, 12, hex(style.skirt));
  const length = style.long ? 12 : 9;
  f.rect(12, 18, length, 12, coat);
  f.rect(12 + length - 1, 18, 1, 12, coatDark);
  if (style.trim) f.rect(13, 23, length - 2, 2, hex(style.trim));
  else f.rect(13, 24, length - 2, 1, coatDark); // 지퍼선
  // 몸 옆에 내려놓은 두 팔
  f.rect(13, 16, 7, 2, coatDark);
  f.rect(13, 30, 7, 2, coatDark);
  if (style.scarf) f.rect(11, 19, 2, 10, hex(style.scarf));
}

function writeSheet(name: string, draw: (f: Frame, dir: Dir, step: number, pose: PoseName) => void, style?: OutfitStyle): void {
  const rowCount = ROWS.reduce((n, r) => n + r.dirs.length, 0);
  const canvas = new Canvas(WALK_FRAMES * FRAME, rowCount * FRAME);
  let row = 0;
  for (const { pose, dirs } of ROWS)
    for (const dir of dirs) {
      for (let col = 0; col < WALK_FRAMES; col++) {
        draw(new Frame(canvas, col * FRAME, row * FRAME, transformOf(pose, dir)), dir, col, pose);
        if (style && isCarry(pose)) drawCarryArms(canvas, col * FRAME, row * FRAME, dir, pose === "sitCarry", col, hex(style.coatDark), BODY.skin, 16);
      }
      row++;
    }
  const out = resolve(ROOT, `assets/sprites/${name}.png`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(canvas));
  console.log(`${name} → ${out}`);
}

for (const gender of GENDERS) {
  if (frameOf(gender === "male" ? "male-handsome" : "female-longhair") !== "basic") continue;
  writeSheet(`body-${gender}`, (f, dir, step, pose) => drawBody(f, dir, step, gender, pose));
  for (const id of OUTFITS[gender]) {
    if (frameOf(id) !== "basic") continue; // 사진 비율 옷은 직접 만든 그림 (임시 그림으로 덮어쓰지 않음)
    const style = OUTFIT_STYLES[id];
    if (!style) throw new Error(`옷 "${id}" 의 그림 설정(OUTFIT_STYLES)이 없습니다`);
    writeSheet(`outfit-${id}`, (f, dir, step, pose) => drawOutfit(f, dir, step, style, pose), style);
  }
}
