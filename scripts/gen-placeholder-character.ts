/**
 * 임시 캐릭터 스프라이트시트를 생성한다. 몸과 옷을 따로 그려서 겹친다 (기획서 4장 구현 메모).
 *
 *   pnpm gen:character
 *
 * 출력:
 *   assets/sprites/body-<성별>.png    몸 (그림자, 다리, 신발, 머리, 얼굴)
 *   assets/sprites/outfit-<옷 id>.png 옷 (상의, 팔, 목도리, 바지·치마). 성별·옷 id 는 packages/shared/src/character.ts
 *
 * 모든 시트는 같은 배치: 프레임 32x32, 4열 x 8행
 *   행 0–3: 보통      down, left, right, up   (apps/client/src/assets.ts 의 CHARACTER.directions 와 같은 순서)
 *   행 4–7: 들고 걷기 down, left, right, up   (팔을 앞으로 모음. 간식 그림은 게임이 손 위치에 따로 그린다)
 *   열: 걷기 0–3. 0번 열은 서 있는 모습으로도 쓴다
 *
 * 최종 그림으로 바꿀 때도 같은 배치·파일 이름을 지키면 코드 수정 없이 교체된다.
 * 옷 레이어는 몸 위에 그려지므로 머리 부분은 비워 둔다 (모자·후드는 나중에 위에 덮어도 됨).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GENDERS, OUTFITS, type Gender } from "../packages/shared/src/character";
import { Canvas, encodePng, hex, type RGBA } from "./lib/png";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FRAME = 32;
const DIRECTIONS = ["down", "left", "right", "up"] as const;
const WALK_FRAMES = 4;
/** 자세 (행 묶음 순서). assets.ts 의 CHARACTER.poses 와 같은 순서 */
const POSES = ["normal", "carry"] as const;
type PoseName = (typeof POSES)[number];

type Dir = (typeof DIRECTIONS)[number];

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

/** 프레임 하나에 그리는 도구. flip 이면 좌우를 뒤집어 그린다 (right = left 를 뒤집은 것) */
class Frame {
  constructor(
    private readonly c: Canvas,
    private readonly ox: number,
    private readonly oy: number,
    private readonly flip: boolean,
  ) {}
  px(x: number, y: number, color: RGBA): void {
    this.c.set(this.ox + (this.flip ? FRAME - 1 - x : x), this.oy + y, color);
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

/** 걷기 프레임별 자세. 몸과 옷이 같은 값을 써야 어긋나지 않는다 */
interface Pose {
  /** 1: 왼발 앞, -1: 오른발 앞, 0: 서기 */
  stride: number;
  /** 걸을 때 몸이 1px 올라감 */
  bob: number;
  side: boolean;
}

function poseOf(dir: Dir, step: number): Pose {
  // step: 0 서기, 1 왼발 앞, 2 서기, 3 오른발 앞
  const stride = step === 1 ? 1 : step === 3 ? -1 : 0;
  return { stride, bob: stride !== 0 ? -1 : 0, side: dir === "left" || dir === "right" };
}

/** 다리 위치 (옷의 바지도 같은 자리에 덮어 그린다) */
function legRects(p: Pose): { x: number; y: number; h: number; w: number }[] {
  if (p.side) {
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

function drawBody(f: Frame, dir: Dir, step: number, gender: Gender): void {
  const p = poseOf(dir, step);
  const hair = BODY.hair[gender];
  f.ellipse(16, 30, 6, 1.6, BODY.shadow);

  // 다리 + 신발
  const legs = legRects(p);
  for (const l of legs) f.rect(l.x, l.y, l.w, l.h + 1, BODY.legs);
  if (p.side) {
    f.rect(legs[0]!.x, 28, 3, 2, BODY.shoe);
    f.rect(legs[1]!.x - 1, 28, 4, 2, BODY.shoe);
  } else {
    for (const l of legs) f.rect(l.x, l.y + l.h, 3, 2, BODY.shoe);
  }

  // 목 (옷이 덮지 않는 틈이 비지 않게)
  f.rect(14, 13 + p.bob, 4, 2, BODY.skin);

  // 머리
  const hy = 8 + p.bob;
  const long = gender === "female";
  if (long && dir !== "down") {
    // 긴 머리 뒷부분 (얼굴보다 먼저)
    if (dir === "up") f.rect(10, hy, 12, 7, hair);
    else f.ellipse(19, hy + 2, 3.5, 6.5, hair);
  }
  f.ellipse(16, hy, 6.5, 6.5, BODY.skin);

  if (dir === "down") {
    f.ellipse(16, hy - 3, 6.5, 3.5, hair);
    f.rect(9, hy - 2, 2, long ? 9 : 4, hair);
    f.rect(21, hy - 2, 2, long ? 9 : 4, hair);
    f.rect(13, hy + 1, 1, 2, BODY.eye);
    f.rect(18, hy + 1, 1, 2, BODY.eye);
    f.px(12, hy + 3, BODY.cheek);
    f.px(19, hy + 3, BODY.cheek);
  } else if (dir === "up") {
    f.ellipse(16, hy, 6.5, 6.5, hair);
  } else {
    // 왼쪽을 보는 옆모습
    f.ellipse(16, hy - 3, 6.5, 3.5, hair);
    f.ellipse(19, hy, 3.5, 5.5, hair);
    f.rect(11, hy + 1, 1, 2, BODY.eye);
    f.px(11, hy + 3, BODY.cheek);
  }
}

function drawOutfit(f: Frame, dir: Dir, step: number, style: OutfitStyle, pose: PoseName): void {
  const p = poseOf(dir, step);
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
  if (style.trim && dir === "down") f.rect(15, 16 + p.bob, 2, bottom - 17, hex(style.trim));
  if (!style.trim && dir === "down") f.rect(16, 16 + p.bob, 1, bottom - 17, coatDark); // 지퍼선

  // 후드 (뒤에서 보면 목 뒤에 늘어짐)
  if (style.hood) {
    if (dir === "up") f.rect(12, 13 + p.bob, 8, 4, coatDark);
    else if (p.side) f.rect(18, 13 + p.bob, 4, 3, coatDark);
    else f.rect(11, 13 + p.bob, 10, 2, coatDark);
  }

  // 팔
  if (pose === "carry") {
    // 들고 걷기: 팔을 몸 앞으로 모으고 흔들지 않는다
    if (p.side) {
      f.rect(14, 16 + p.bob, 2, 3, coatDark);
      f.rect(10, 18 + p.bob, 5, 2, coatDark);
    } else if (dir === "down") {
      f.rect(8, 16 + p.bob, 2, 3, coatDark);
      f.rect(22, 16 + p.bob, 2, 3, coatDark);
      f.rect(9, 19 + p.bob, 3, 2, coatDark);
      f.rect(20, 19 + p.bob, 3, 2, coatDark);
    } else {
      f.rect(8, 16 + p.bob, 2, 4, coatDark);
      f.rect(22, 16 + p.bob, 2, 4, coatDark);
    }
  } else if (p.side) {
    f.rect(15 - p.stride, 16 + p.bob, 2, 6, coatDark);
  } else {
    f.rect(8, 16 + p.bob + p.stride, 2, 6, coatDark);
    f.rect(22, 16 + p.bob - p.stride, 2, 6, coatDark);
  }

  // 목도리
  if (style.scarf) {
    const scarf = hex(style.scarf);
    f.rect(11, 14 + p.bob, 10, 2, scarf);
    if (dir === "up") f.rect(17, 16 + p.bob, 2, 3, scarf);
    if (dir === "down") f.rect(17, 16 + p.bob, 2, 3, scarf);
  }
}

function writeSheet(name: string, draw: (f: Frame, dir: Dir, step: number, pose: PoseName) => void): void {
  const canvas = new Canvas(WALK_FRAMES * FRAME, POSES.length * DIRECTIONS.length * FRAME);
  POSES.forEach((pose, poseIndex) => {
    DIRECTIONS.forEach((dir, dirIndex) => {
      const row = poseIndex * DIRECTIONS.length + dirIndex;
      for (let col = 0; col < WALK_FRAMES; col++) draw(new Frame(canvas, col * FRAME, row * FRAME, dir === "right"), dir, col, pose);
    });
  });
  const out = resolve(ROOT, `assets/sprites/${name}.png`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(canvas));
  console.log(`${name} → ${out}`);
}

for (const gender of GENDERS) {
  writeSheet(`body-${gender}`, (f, dir, step) => drawBody(f, dir, step, gender));
  for (const id of OUTFITS[gender]) {
    const style = OUTFIT_STYLES[id];
    if (!style) throw new Error(`옷 "${id}" 의 그림 설정(OUTFIT_STYLES)이 없습니다`);
    writeSheet(`outfit-${id}`, (f, dir, step, pose) => drawOutfit(f, dir, step, style, pose));
  }
}
