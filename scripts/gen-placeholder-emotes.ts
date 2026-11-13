/**
 * 임시 이모티콘 그림을 생성한다.
 *
 *   pnpm gen:emote
 *
 * 출력
 *   assets/sprites/emotes.png   20x20 프레임을 가로로 EMOTES 순서대로 (packages/shared/data/emotes.json).
 *                               흰 말풍선(아래 꼬리) 안에 12x12 그림. 머리 위 말풍선과 화면의 이모티콘 고르기 판이 같이 쓴다
 *   assets/sprites/emote-button.png  24x24. 화면 오른쪽 아래 이모티콘 버튼 (둥근 바탕 + 스마일)
 *
 * 최종 그림으로 바꿀 때도 같은 크기·프레임 순서·파일 이름을 지키면 코드 수정 없이 교체된다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMOTES } from "../packages/shared/src/emotes";
import { Canvas, encodePng, hex, type RGBA } from "./lib/png";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FRAME = 20;
/** 그림이 들어가는 자리 (프레임 안) */
const ICON_X = 4;
const ICON_Y = 2;

const PALETTE: Record<string, RGBA> = {
  O: hex("#3a2a20"),
  Y: hex("#ffd34d"),
  K: hex("#2a2a2a"),
  R: hex("#e84a5f"),
  r: hex("#a8303f"),
  W: hex("#ffffff"),
  P: hex("#ff9fb2"),
  p: hex("#d9607a"),
  T: hex("#ff6f7f"),
  B: hex("#6ec6ff"),
  b: hex("#2f6fb3"),
  G: hex("#5cb85c"),
  M: hex("#ffe680"),
  m: hex("#c9a640"),
  S: hex("#f6c9a0"),
  s: hex("#b07a55"),
};

/** 문자 그림 (12줄 x 12칸). '.' 은 투명, 나머지는 PALETTE */
type Art = readonly string[];

const FACE: Art = [
  "....OOOO....",
  "..OOYYYYOO..",
  ".OYYYYYYYYO.",
  ".OYYYYYYYYO.",
  "OYYYYYYYYYYO",
  "OYYYYYYYYYYO",
  "OYYYYYYYYYYO",
  "OYYYYYYYYYYO",
  ".OYYYYYYYYO.",
  ".OYYYYYYYYO.",
  "..OOYYYYOO..",
  "....OOOO....",
];

/** 얼굴 위에 덧그리는 표정: [x, y, 색] */
type Marks = readonly [number, number, string][];

const ART: Record<string, Art | { face: Marks }> = {
  hello: [
    "..s.s.s...b.",
    ".sSsSsSs...b",
    ".sSsSsSss...",
    ".sSsSsSsSs.b",
    ".sSSSSSSSs..",
    "ssSSSSSSSs.b",
    "sSsSSSSSSs..",
    ".sSSSSSSSs..",
    "..sSSSSSs...",
    "...sSSSs....",
    "...sssss....",
    "............",
  ],
  heart: [
    "............",
    "..rrr..rrr..",
    ".rRRRrrRRRr.",
    "rRWRRRRRRRRr",
    "rRWRRRRRRRRr",
    "rRRRRRRRRRRr",
    ".rRRRRRRRRr.",
    "..rRRRRRRr..",
    "...rRRRRr...",
    "....rRRr....",
    ".....rr.....",
    "............",
  ],
  // 하하: ^ ^ 눈 + 크게 벌린 입
  haha: {
    face: [
      [3, 4, "K"], [2, 5, "K"], [4, 5, "K"],
      [8, 4, "K"], [7, 5, "K"], [9, 5, "K"],
      [3, 7, "K"], [4, 7, "K"], [5, 7, "K"], [6, 7, "K"], [7, 7, "K"], [8, 7, "K"],
      [4, 8, "K"], [5, 8, "T"], [6, 8, "T"], [7, 8, "K"],
      [5, 9, "K"], [6, 9, "K"],
    ],
  },
  // 맛있다: 점 눈 + 볼 + 혀
  yummy: {
    face: [
      [3, 4, "K"], [8, 4, "K"],
      [2, 6, "P"], [9, 6, "P"],
      [3, 6, "K"], [4, 7, "K"], [5, 7, "K"], [6, 7, "K"], [7, 7, "K"], [8, 6, "K"],
      [6, 8, "T"], [7, 8, "T"], [6, 9, "p"], [7, 9, "T"],
    ],
  },
  // 배불러: 감은 눈 + 볼 빵빵 + 작은 입
  full: {
    face: [
      [2, 5, "K"], [3, 5, "K"], [4, 5, "K"],
      [7, 5, "K"], [8, 5, "K"], [9, 5, "K"],
      [1, 7, "P"], [2, 7, "P"], [3, 7, "P"], [8, 7, "P"], [9, 7, "P"], [10, 7, "P"],
      [5, 8, "K"], [6, 8, "K"],
    ],
  },
  cold: [
    ".....B......",
    "...B.B.B....",
    "....BBB.....",
    ".B...B...B..",
    "..B..b..B...",
    "BBBBbWbBBBB.",
    "..B..b..B...",
    ".B...B...B..",
    "....BBB.....",
    "...B.B.B....",
    ".....B......",
    "............",
  ],
  thanks: [
    "....pPPp....",
    ".pPp.PP.pPp.",
    ".PPPpPPpPPP.",
    "..pPPYYPPp..",
    "pPPPYYYYPPPp",
    "PPPPYYYYPPPP",
    ".pPPPYYPPPp.",
    "..PPpPPpPP..",
    ".pPp.GG.pPp.",
    ".....G..G...",
    "..GG.G.GG...",
    "...GGGG.....",
  ],
  night: [
    ".....mmm.bbb",
    "...mMMm....b",
    "..mMMm....b.",
    ".mMMm....bbb",
    ".mMM........",
    "mMMm....bb..",
    "mMMm.....b..",
    "mMMm....bb..",
    ".mMMm.......",
    ".mMMMm...mm.",
    "..mMMMMmmMm.",
    "....mmmmmm..",
  ],
};

function drawArt(c: Canvas, ox: number, oy: number, art: Art): void {
  art.forEach((row, y) => {
    if (row.length !== 12) throw new Error(`그림 한 줄은 12칸이어야 합니다: "${row}"`);
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      const color = PALETTE[ch];
      if (!color) throw new Error(`팔레트에 없는 글자 "${ch}"`);
      c.set(ox + x, oy + y, color);
    });
  });
}

/** 흰 말풍선 (둥근 사각형 + 아래 가운데 꼬리), 테두리는 진한 색 */
function drawBubble(c: Canvas, ox: number): void {
  const O = PALETTE.O!;
  const W = PALETTE.W!;
  // 몸통: 20x16, 모서리 1px 깎기
  c.rect(ox + 1, 0, FRAME - 2, 16, O);
  c.rect(ox, 1, FRAME, 14, O);
  c.rect(ox + 1, 1, FRAME - 2, 14, W);
  // 꼬리
  c.rect(ox + 8, 15, 4, 1, W);
  c.rect(ox + 7, 16, 1, 1, O);
  c.rect(ox + 12, 16, 1, 1, O);
  c.rect(ox + 8, 16, 4, 1, W);
  c.rect(ox + 8, 17, 1, 1, O);
  c.rect(ox + 11, 17, 1, 1, O);
  c.rect(ox + 9, 17, 2, 1, W);
  c.rect(ox + 9, 18, 2, 1, O);
}

/** 화면 버튼: 진한 둥근 바탕 + 주황 테두리 + 가운데 스마일 */
function drawButton(): Canvas {
  const size = 24;
  const c = new Canvas(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      if (d <= r - 1) c.set(x, y, hex("#1b2433", 235));
      else if (d <= r) c.set(x, y, hex("#e8823a"));
    }
  const smile: Marks = [
    [3, 4, "K"], [3, 5, "K"], [8, 4, "K"], [8, 5, "K"],
    [2, 7, "K"], [3, 8, "K"], [4, 8, "K"], [5, 8, "K"], [6, 8, "K"], [7, 8, "K"], [8, 8, "K"], [9, 7, "K"],
    [2, 6, "P"], [9, 6, "P"],
  ];
  drawArt(c, 6, 6, FACE);
  for (const [x, y, ch] of smile) c.set(6 + x, 6 + y, PALETTE[ch]!);
  return c;
}

function main(): void {
  const canvas = new Canvas(FRAME * EMOTES.length, FRAME);
  EMOTES.forEach((emote, i) => {
    const art = ART[emote.id];
    if (!art) throw new Error(`이모티콘 "${emote.id}" 그림이 없습니다 (scripts/gen-placeholder-emotes.ts ART)`);
    const ox = i * FRAME;
    drawBubble(canvas, ox);
    if ("face" in art) {
      drawArt(canvas, ox + ICON_X, ICON_Y, FACE);
      for (const [x, y, ch] of art.face) canvas.set(ox + ICON_X + x, ICON_Y + y, PALETTE[ch]!);
    } else {
      drawArt(canvas, ox + ICON_X, ICON_Y, art);
    }
  });
  const out = resolve(ROOT, "assets/sprites/emotes.png");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(canvas));
  console.log(`${out} (${EMOTES.length}개)`);
  const button = resolve(ROOT, "assets/sprites/emote-button.png");
  writeFileSync(button, encodePng(drawButton()));
  console.log(button);
}

main();
