/**
 * 생성한 캐릭터 시트가 캐릭터_그래픽_프롬프트_8방향.md 의 규격·치수·일관성 규칙을 지키는지 검사한다.
 *
 *   pnpm check:character <합성본.png>               몸+옷을 합친 미리보기 하나
 *   pnpm check:character <body-*.png>               몸 레이어만 (carry 와 normal 이 같아도 됨)
 *   pnpm check:character <body-*.png> <outfit-*.png> 두 레이어 (합쳐서 검사 + 옷이 얼굴을 덮는지)
 *
 * 결과: OK / WARN(눈으로 확인 필요) / FAIL(규격 위반). FAIL 이 하나라도 있으면 종료 코드 1.
 * 방향이 맞는지, 동작이 자연스러운지는 검사하지 못한다. 미리보기를 재생해서 눈으로 본다.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Canvas, decodePng } from "./lib/png";

const FRAME = 32;
const COLS = 4;
const ROWS = 28;
const WIDTH = COLS * FRAME;
const HEIGHT = ROWS * FRAME;

/** 치수 고정표 (셀 좌표) */
const SPEC = {
  standTop: 6,
  sitTop: 9,
  /** 신발 바닥 y 30, 그림자가 있으면 31 까지 */
  bottom: [30, 31],
  /** 상체(머리·몸통·팔) 아래 경계. 이 위쪽이 1·3열에서 1px 올라간다 */
  upperBodyEnd: 27,
  maxStandWidth: 18,
  lieLength: [23, 27],
  /** 같은 행에서 0열과 달라도 되는 픽셀 수 [OK 상한, WARN 상한] */
  walkDiff: [60, 100],
  restDiff: [20, 40],
  /** 정면·비스듬히 앞 얼굴 아랫부분 (서기 y 15–18, x 9–20). 앉으면 3px 아래. 몸 레이어에 있어야 함 */
  lowerFace: { top: 15, bottom: 18, left: 9, right: 20 },
  /** 옷이 덮으면 안 되는 얼굴 아래 경계 (서기 턱 y 18, 앉기 y 21) */
  standChin: 18,
  sitChin: 21,
} as const;

const ROW_NAMES = [
  ...["down", "left", "right", "up", "down-left", "down-right", "up-left", "up-right"].map((d) => `normal ${d}`),
  ...["down", "left", "right", "up", "down-left", "down-right", "up-left", "up-right"].map((d) => `carry ${d}`),
  ...["down", "left", "right", "up"].map((d) => `sit ${d}`),
  ...["down", "left", "right", "up"].map((d) => `sitCarry ${d}`),
  ...["머리 남", "머리 서", "머리 동", "머리 북"].map((d) => `lie ${d}`),
];

type Level = "OK" | "WARN" | "FAIL";
const results: { level: Level; msg: string }[] = [];
const report = (level: Level, msg: string) => results.push({ level, msg });

function load(path: string): Canvas {
  const png = decodePng(readFileSync(path));
  const { width, height } = png.canvas;
  const name = basename(path);
  if (width !== WIDTH || height !== HEIGHT) report("FAIL", `${name}: 크기 ${width}x${height} (128x896 이어야 함)`);
  else report("OK", `${name}: 128x896`);
  if (!png.hasAlpha) report("FAIL", `${name}: 투명 채널이 없음 (색 형식 ${png.colorType})`);
  // 바닥 그림자(셀 아래 y 29–31 의 반투명 검정)는 일부러 반투명이라 뺀다
  let semi = 0;
  const d = png.canvas.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    if (a === 0 || a === 255) continue;
    const y = Math.floor(i / 4 / width) % FRAME;
    const shadow = y >= 29 && d[i]! < 40 && d[i + 1]! < 40 && d[i + 2]! < 40;
    if (!shadow) semi++;
  }
  if (semi > 0) report("WARN", `${name}: 반투명 픽셀 ${semi}개 (가장자리 번짐·체크무늬 배경 확인)`);
  return png.canvas;
}

function composite(layers: Canvas[]): Canvas {
  const out = new Canvas(WIDTH, HEIGHT);
  for (const layer of layers)
    for (let y = 0; y < HEIGHT; y++)
      for (let x = 0; x < WIDTH; x++) {
        const p = layer.get(x, y);
        if (p[3] > 0) out.set(x, y, p);
      }
  return out;
}

const opaque = (c: Canvas, row: number, col: number, x: number, y: number) =>
  x >= 0 && y >= 0 && x < FRAME && y < FRAME && c.get(col * FRAME + x, row * FRAME + y)[3] > 0;

function bbox(c: Canvas, row: number, col: number): { left: number; top: number; right: number; bottom: number } | null {
  let left = FRAME, top = FRAME, right = -1, bottom = -1;
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++)
      if (opaque(c, row, col, x, y)) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  return right < 0 ? null : { left, top, right, bottom };
}

function samePixel(c: Canvas, ra: number, ca: number, xa: number, ya: number, rb: number, cb: number, xb: number, yb: number): boolean {
  const a = xa >= 0 && ya >= 0 && xa < FRAME && ya < FRAME ? c.get(ca * FRAME + xa, ra * FRAME + ya) : [0, 0, 0, 0];
  const b = c.get(cb * FRAME + xb, rb * FRAME + yb);
  if (a[3] === 0 && b[3] === 0) return true;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** row 의 col 칸이 0열과 몇 픽셀 다른지. lift 면 0열의 상체를 1px 올려서 비교 (걷기·숨쉬기 1·3열) */
function diffFromCol0(c: Canvas, row: number, col: number, lift: boolean): number {
  let n = 0;
  for (let y = 0; y < FRAME; y++)
    for (let x = 0; x < FRAME; x++) {
      const sy = lift && y < SPEC.upperBodyEnd - 1 ? y + 1 : y;
      if (!samePixel(c, row, 0, x, sy, row, col, x, y)) n++;
    }
  return n;
}

function rowsIdentical(c: Canvas, ra: number, rb: number): boolean {
  for (let col = 0; col < COLS; col++)
    for (let y = 0; y < FRAME; y++) for (let x = 0; x < FRAME; x++) if (!samePixel(c, ra, col, x, y, rb, col, x, y)) return false;
  return true;
}

function grade(n: number, [ok, warn]: readonly [number, number]): Level {
  return n <= ok ? "OK" : n <= warn ? "WARN" : "FAIL";
}

function checkSheet(c: Canvas, isBodyOnly: boolean): void {
  for (let row = 0; row < ROWS; row++) {
    const name = `${row}행 ${ROW_NAMES[row]}`;
    const lie = row >= 24;
    const sit = row >= 16 && !lie;
    const problems: { level: Level; msg: string }[] = [];

    for (let col = 0; col < COLS; col++) {
      const b = bbox(c, row, col);
      if (!b) {
        problems.push({ level: "FAIL", msg: `${col}열 비어 있음` });
        continue;
      }
      if (b.top === 0 || b.left === 0 || b.right === FRAME - 1) problems.push({ level: "WARN", msg: `${col}열 셀 가장자리에 닿음 (잘림 확인)` });
      if (lie) continue;
      const want = (sit ? SPEC.sitTop : SPEC.standTop) - (col % 2);
      if (b.top !== want) problems.push({ level: Math.abs(b.top - want) <= 1 ? "WARN" : "FAIL", msg: `${col}열 머리 꼭대기 y ${b.top} (기대 ${want})` });
      if (!(SPEC.bottom as readonly number[]).includes(b.bottom))
        problems.push({ level: Math.abs(b.bottom - 30) <= 1 ? "WARN" : "FAIL", msg: `${col}열 발 아래 y ${b.bottom} (기대 30–31)` });
      const width = b.right - b.left + 1;
      if (width > SPEC.maxStandWidth) problems.push({ level: "WARN", msg: `${col}열 폭 ${width}px (기대 ${SPEC.maxStandWidth} 이하)` });
    }

    if (lie) {
      const b = bbox(c, row, 0);
      if (b) {
        const w = b.right - b.left + 1;
        const h = b.bottom - b.top + 1;
        const horizontal = row === 25 || row === 26;
        const length = horizontal ? w : h;
        if ((horizontal ? w <= h : h <= w)) problems.push({ level: "FAIL", msg: `누운 방향이 ${horizontal ? "가로" : "세로"}가 아님 (${w}x${h})` });
        if (length < SPEC.lieLength[0] || length > SPEC.lieLength[1]) problems.push({ level: "WARN", msg: `누운 몸 길이 ${length}px (기대 25 안팎)` });
      }
    }

    // 일관성: 0열과 다른 픽셀 수
    const limit = row < 16 ? SPEC.walkDiff : SPEC.restDiff;
    const diffs = [1, 2, 3].map((col) => diffFromCol0(c, row, col, col % 2 === 1 && !lie));
    const worst = Math.max(...diffs);
    const level = grade(worst, limit);
    if (level !== "OK") problems.push({ level, msg: `0열과 다른 픽셀 1·2·3열 = ${diffs.join(", ")} (기대 ${limit[0]} 이하. 크면 재생할 때 일렁임)` });

    if (problems.length === 0) report("OK", `${name}`);
    else for (const p of problems) report(p.level, `${name}: ${p.msg}`);
  }

  // 자세 사이: carry·sitCarry 가 팔 자세를 따로 갖는지 (몸 레이어는 같아도 됨)
  if (!isBodyOnly) {
    for (let r = 0; r < 8; r++) if (rowsIdentical(c, r + 8, r)) report("FAIL", `${r + 8}행 ${ROW_NAMES[r + 8]} 이(가) ${r}행과 똑같음 (팔을 앞으로 모은 자세가 없음)`);
    for (let r = 16; r < 20; r++) if (rowsIdentical(c, r + 4, r)) report("FAIL", `${r + 4}행 ${ROW_NAMES[r + 4]} 이(가) ${r}행과 똑같음`);
  }
}

/** 옷 레이어가 얼굴(턱 위)을 덮는지, 얼굴 아랫부분이 옷 레이어로 넘어갔는지 */
function checkLayers(body: Canvas, outfit: Canvas): void {
  // 얼굴이 보이는 행(정면·비스듬히 앞)의 0열: 얼굴 아랫부분에 옷만 있고 몸이 없는 픽셀
  const faceRows = [0, 4, 5, 8, 12, 13, 16, 20];
  const moved: string[] = [];
  for (const row of faceRows) {
    const f = SPEC.lowerFace;
    const dy = row >= 16 ? 3 : 0;
    let n = 0;
    for (let y = f.top + dy; y <= f.bottom + dy; y++)
      for (let x = f.left; x <= f.right; x++) if (opaque(outfit, row, 0, x, y) && !opaque(body, row, 0, x, y)) n++;
    if (n > 6) moved.push(`${row}행 ${n}px`);
  }
  if (moved.length === 0) report("OK", "얼굴 아랫부분이 몸 레이어에 있음");
  else report("WARN", `얼굴 아랫부분(턱 근처)이 옷 레이어에 있음: ${moved.join(", ")}. 레이어를 높이가 아니라 부위로 나눴는지 확인`);

  let total = 0;
  const rows: number[] = [];
  for (let row = 0; row < 24; row++) {
    const chin = row >= 16 ? SPEC.sitChin : SPEC.standChin;
    let n = 0;
    for (let col = 0; col < COLS; col++)
      for (let y = 0; y <= chin - (col % 2); y++)
        for (let x = 0; x < FRAME; x++) if (opaque(body, row, col, x, y) && opaque(outfit, row, col, x, y)) n++;
    if (n > 0) rows.push(row);
    total += n;
  }
  if (total === 0) report("OK", "옷 레이어가 얼굴·머리를 덮지 않음");
  else report("WARN", `옷 레이어가 턱 위 머리·얼굴 픽셀 ${total}개를 덮음 (행 ${rows.join(", ")}). 후드·모자가 아니면 레이어 나누기 확인`);
}

const files = process.argv.slice(2);
if (files.length < 1 || files.length > 2) {
  console.error("사용법: pnpm check:character <합성본.png | body.png> [outfit.png]");
  process.exit(2);
}
const layers = files.map(load);
if (results.some((r) => r.level === "FAIL")) {
  for (const r of results) console.log(`${r.level.padEnd(4)} ${r.msg}`);
  process.exit(1);
}
const isBodyOnly = files.length === 1 && basename(files[0]!).startsWith("body-");
checkSheet(composite(layers), isBodyOnly);
if (layers.length === 2) checkLayers(layers[0]!, layers[1]!);

for (const r of results) console.log(`${r.level.padEnd(4)} ${r.msg}`);
const count = (l: Level) => results.filter((r) => r.level === l).length;
console.log(`\nOK ${count("OK")} · WARN ${count("WARN")} · FAIL ${count("FAIL")}`);
console.log("방향이 맞는지, 동작이 자연스러운지는 미리보기를 재생해서 눈으로 확인하세요.");
process.exit(count("FAIL") > 0 ? 1 : 0);
