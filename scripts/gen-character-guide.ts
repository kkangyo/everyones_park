/**
 * 캐릭터 치수 가이드 시트를 생성한다. 사진으로 캐릭터를 만들 때 생성 도구에 '비율·크기 참고 이미지'로 첨부한다.
 *
 *   pnpm gen:guide
 *
 * 출력
 *   docs/character-size-guide.png     128x896 (4열 x 28행, 셀 32x32). 게임 시트와 같은 배치, 투명 배경
 *   docs/character-size-guide-x4.png  4배 확대 + 셀 격자 + 기준선(빨강 y 6 머리 꼭대기, y 30 신발 바닥). 사람이 보는 용도
 *
 * 치수는 캐릭터_그래픽_프롬프트_8방향.md "치수 고정표"와 같다. 색은 부위 표시일 뿐이고 실제 그림 색이 아니다.
 *   보라 머리카락 / 살구 얼굴·목 / 검정 눈 / 파랑 몸통 / 하늘 팔 / 주황 손 / 초록 다리 / 진초록 신발 / 회색 그림자
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas, encodePng, hex, type RGBA } from "./lib/png";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FRAME = 32;
const COLS = 4;

const C = {
  hair: hex("#7b61c9"),
  face: hex("#f5c9a0"),
  eye: hex("#222222"),
  torso: hex("#4a8fd8"),
  arm: hex("#9cc8f0"),
  hand: hex("#f08a4b"),
  leg: hex("#4caf6a"),
  shoe: hex("#2f6b40"),
  shadow: hex("#9a9a9a"),
};

const DIRS_8 = ["down", "left", "right", "up", "down-left", "down-right", "up-left", "up-right"] as const;
const DIRS_4 = ["down", "left", "right", "up"] as const;
type Dir = (typeof DIRS_8)[number];
type PoseName = "normal" | "carry" | "sit" | "sitCarry" | "lie";
/** 행 묶음 (위에서부터). 게임 시트(apps/client/src/assets.ts CHARACTER.rows)와 같은 순서 */
const ROWS: { pose: PoseName; dirs: readonly Dir[] }[] = [
  { pose: "normal", dirs: DIRS_8 },
  { pose: "carry", dirs: DIRS_8 },
  { pose: "sit", dirs: DIRS_4 },
  { pose: "sitCarry", dirs: DIRS_4 },
  { pose: "lie", dirs: DIRS_4 },
];

/** 실제로 그리는 모습. 오른쪽을 보는 방향은 왼쪽 모습을 뒤집는다 */
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

type Transform = (x: number, y: number) => [number, number];
const IDENTITY: Transform = (x, y) => [x, y];
const FLIP_X: Transform = (x, y) => [FRAME - 1 - x, y];
/** 눕기: '머리 서쪽' 그림을 돌린다. 남 = 머리 아래, 북 = 머리 위 (가운데 줄 y 23 → x 16) */
const LIE_TRANSFORMS: Record<(typeof DIRS_4)[number], Transform> = {
  left: IDENTITY,
  right: FLIP_X,
  down: (x, y) => [y - 7, FRAME - x],
  up: (x, y) => [FRAME + 7 - y, x + 4],
};

class Frame {
  constructor(
    private readonly c: Canvas,
    private readonly ox: number,
    private readonly oy: number,
    private readonly t: Transform,
  ) {}
  rect(x: number, y: number, w: number, h: number, color: RGBA): void {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        const [tx, ty] = this.t(i, j);
        if (tx >= 0 && ty >= 0 && tx < FRAME && ty < FRAME) this.c.set(this.ox + tx, this.oy + ty, color);
      }
  }
}

/** 머리(13x16, 모서리 1px 깎음) + 얼굴. top = 머리 꼭대기 y */
function drawHead(f: Frame, view: View, top: number, blink: boolean): void {
  f.rect(9, top, 14, 13, C.hair);
  f.rect(8, top + 1, 16, 11, C.hair);
  const eyeY = top + 8 + (blink ? 1 : 0);
  const eyeH = blink ? 1 : 2;
  if (view === "front") {
    f.rect(11, top + 5, 10, 8, C.face); // y 11–18
    f.rect(13, eyeY, 1, eyeH, C.eye);
    f.rect(18, eyeY, 1, eyeH, C.eye);
  } else if (view === "frontSide") {
    f.rect(9, top + 5, 9, 8, C.face); // 보는 쪽(왼쪽)으로 2px 치우침
    f.rect(11, eyeY, 1, eyeH, C.eye);
    f.rect(15, eyeY, 1, eyeH, C.eye);
  } else if (view === "side") {
    f.rect(8, top + 5, 8, 8, C.face); // 얼굴은 보는 쪽 절반
    f.rect(10, eyeY, 1, eyeH, C.eye);
  } else if (view === "backSide") {
    f.rect(8, top + 7, 1, 4, C.face); // 볼 가장자리만
  }
}

/** 서기·걷기·앉기 공통 상체. top = 머리 꼭대기, 몸통은 머리 꼭대기 + 13 부터 */
function drawUpper(f: Frame, view: View, top: number, torsoH: number, carry: boolean, swing: number, blink: boolean): void {
  const ty = top + 13;
  const torso: Record<View, [number, number]> = { front: [10, 12], back: [10, 13], side: [12, 9], frontSide: [10, 11], backSide: [11, 11] };
  const [tx, tw] = torso[view];
  f.rect(tx, ty, tw, torsoH, C.torso);
  if (view === "front" || view === "frontSide") f.rect(view === "front" ? 15 : 13, ty, 2, 2, C.face); // 깃 사이 목

  if (carry) {
    // 두 팔을 앞으로 모음. 손 가운데 = 몸통 위 + 4 (서 있으면 y 23)
    if (view === "side") {
      f.rect(14, ty, 2, 3, C.arm);
      f.rect(9, ty + 3, 4, 3, C.hand);
    } else if (view === "front") {
      f.rect(9, ty, 1, 3, C.arm);
      f.rect(22, ty, 1, 3, C.arm);
      f.rect(13, ty + 3, 7, 3, C.hand);
    } else if (view === "frontSide") {
      f.rect(9, ty, 1, 3, C.arm);
      f.rect(10, ty + 3, 6, 3, C.hand);
    } else {
      // 뒷모습: 팔이 몸 앞에 있어 어깨만 보임
      const [l, r] = view === "back" ? [9, 22] : [10, 22];
      f.rect(l, ty, 1, 3, C.arm);
      f.rect(r, ty, 1, 3, C.arm);
    }
  } else if (view === "side") {
    f.rect(15 - swing, ty, 2, torsoH - 2, C.arm);
    f.rect(15 - swing, ty + torsoH - 2, 2, 2, C.hand);
  } else {
    const [l, r] = view === "backSide" ? [10, 22] : [9, 22];
    f.rect(l, ty + swing, 1, torsoH - 2, C.arm);
    f.rect(l, ty + swing + torsoH - 2, 1, 2, C.hand);
    f.rect(r, ty - swing, 1, torsoH - 2, C.arm);
    f.rect(r, ty - swing + torsoH - 2, 1, 2, C.hand);
  }
  drawHead(f, view, top, blink);
}

/** 서 있는 다리 (y 27–29) + 신발 (y 29–30). stride 1 = 왼발 앞, -1 = 오른발 앞 */
function drawStandingLegs(f: Frame, view: View, stride: number): void {
  if (view === "side") {
    const front = 13 - 2 * Math.abs(stride);
    const back = 16 + 2 * Math.abs(stride);
    for (const x of [back, front]) {
      f.rect(x, 27, 3, 2, C.leg);
      f.rect(x, 29, 3, 2, C.shoe);
    }
    return;
  }
  const xs = view === "front" || view === "back" ? [12, 17] : [11, 16];
  xs.forEach((x, i) => {
    // 내딛는 발 반대쪽 다리가 1px 들림
    const lift = (stride === 1 && i === 1) || (stride === -1 && i === 0) ? 1 : 0;
    f.rect(x, 27, 3, 2 - lift, C.leg);
    f.rect(x, 29 - lift, 3, 2, C.shoe);
  });
}

/** 앉은 다리: 정면은 무릎(y 27–28), 옆은 보는 쪽으로 허벅지, 뒷모습은 안 보임. 신발 바닥 y 30 */
function drawSittingLegs(f: Frame, view: View): void {
  if (view === "back" || view === "backSide") return;
  if (view === "side") {
    f.rect(7, 27, 8, 2, C.leg);
    f.rect(6, 29, 4, 2, C.shoe);
    return;
  }
  const xs = view === "front" ? [12, 17] : [11, 16];
  for (const x of xs) {
    f.rect(x, 27, 3, 2, C.leg);
    f.rect(x, 29, 3, 2, C.shoe);
  }
}

/** 누운 모습 (머리 서쪽, 하늘을 봄). 길이 x 2–26 = 25px, 가운데 줄 y 23 */
function drawLying(f: Frame, col: number): void {
  f.rect(15, 17, 8, 13, C.torso);
  if (col % 2 === 1) f.rect(16, 16, 6, 1, C.torso); // 숨 들이쉼: 가슴 1px
  f.rect(15, 16 - (col % 2), 7, 1, C.arm);
  f.rect(15, 30, 7, 1, C.arm);
  for (const y of [18, 24]) {
    f.rect(23, y, 3, 4, C.leg);
    f.rect(25, y, 2, 4, C.shoe);
  }
  f.rect(3, 16, 11, 15, C.hair);
  f.rect(2, 17, 13, 13, C.hair);
  f.rect(7, 18, 8, 11, C.face); // 얼굴이 위(화면)를 봄
  const blink = col === 2;
  f.rect(10, 20, blink ? 1 : 2, 1, C.eye);
  f.rect(10, 26, blink ? 1 : 2, 1, C.eye);
}

function drawCell(f: Frame, pose: PoseName, dir: Dir, col: number): void {
  if (pose === "lie") return drawLying(f, col);
  const view = VIEWS[dir];
  const up = col % 2 === 1 ? -1 : 0;
  f.rect(10, 30, 12, 2, C.shadow);
  if (pose === "sit" || pose === "sitCarry") {
    drawUpper(f, view, 9 + up, 7, pose === "sitCarry", 0, col === 2);
    drawSittingLegs(f, view);
    return;
  }
  const stride = col === 1 ? 1 : col === 3 ? -1 : 0;
  drawStandingLegs(f, view, stride);
  drawUpper(f, view, 6 + up, 8, pose === "carry", stride, false);
}

function transformOf(pose: PoseName, dir: Dir): Transform {
  if (pose === "lie") return LIE_TRANSFORMS[dir as (typeof DIRS_4)[number]];
  return dir.endsWith("right") ? FLIP_X : IDENTITY;
}

const rowCount = ROWS.reduce((n, r) => n + r.dirs.length, 0);
const sheet = new Canvas(COLS * FRAME, rowCount * FRAME);
let row = 0;
for (const { pose, dirs } of ROWS)
  for (const dir of dirs) {
    for (let col = 0; col < COLS; col++) drawCell(new Frame(sheet, col * FRAME, row * FRAME, transformOf(pose, dir)), pose, dir, col);
    row++;
  }

// 확대본: 흰 바탕 + 셀 격자 + 기준선
const S = 4;
const big = new Canvas(sheet.width * S, sheet.height * S);
const white = hex("#ffffff");
const grid = hex("#b8b8b8");
const guide = hex("#e05050");
for (let y = 0; y < sheet.height; y++)
  for (let x = 0; x < sheet.width; x++) {
    const p = sheet.get(x, y);
    const ly = y % FRAME;
    const bg = ly === 6 || ly === 30 ? hex("#f6d6d6") : white;
    big.rect(x * S, y * S, S, S, p[3] > 0 ? p : bg);
  }
for (let x = 0; x <= sheet.width; x += FRAME) big.rect(Math.min(x * S, big.width - 1), 0, 1, big.height, grid);
for (let y = 0; y <= sheet.height; y += FRAME) big.rect(0, Math.min(y * S, big.height - 1), big.width, 1, grid);
for (let r = 0; r < rowCount; r++) {
  // 머리 꼭대기(y 6)·신발 바닥(y 30) 표시: 각 셀 왼쪽 끝에 짧은 빨간 눈금
  for (const ly of [6, 30]) for (let c = 0; c < COLS; c++) big.rect(c * FRAME * S, (r * FRAME + ly) * S + 1, 6, 2, guide);
}

for (const [name, canvas] of [
  ["docs/character-size-guide.png", sheet],
  ["docs/character-size-guide-x4.png", big],
] as const) {
  const out = resolve(ROOT, name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(canvas));
  console.log(`${name} (${canvas.width}x${canvas.height})`);
}
