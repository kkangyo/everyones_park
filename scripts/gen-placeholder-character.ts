/**
 * 임시 캐릭터 스프라이트시트를 생성한다.
 *
 *   pnpm gen:character
 *
 * 출력: assets/sprites/character-placeholder.png
 *   프레임 32x32, 4열 x 4행
 *   행: down, left, right, up   (apps/client/src/assets.ts 의 CHARACTER.directions 와 같은 순서)
 *   열: 걷기 0–3. 0번 열은 서 있는 모습으로도 쓴다
 *
 * 최종 그림으로 바꿀 때도 같은 배치를 지키면 코드 수정 없이 교체된다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas, encodePng, hex, type RGBA } from "./lib/png";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FRAME = 32;
const DIRECTIONS = ["down", "left", "right", "up"] as const;
const WALK_FRAMES = 4;

type Dir = (typeof DIRECTIONS)[number];

const C = {
  shadow: hex("#000000", 50),
  skin: hex("#f6d7b8"),
  cheek: hex("#f2a5a0"),
  hair: hex("#3b2a20"),
  eye: hex("#1b2433"),
  scarf: hex("#d64545"),
  coat: hex("#e8823a"),
  coatDark: hex("#c4652a"),
  pants: hex("#4a5568"),
  shoe: hex("#2d2d2d"),
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

function drawCharacter(f: Frame, dir: Dir, step: number): void {
  // step: 0 서기, 1 왼발 앞, 2 서기, 3 오른발 앞
  const stride = step === 1 ? 1 : step === 3 ? -1 : 0;
  const bob = stride !== 0 ? -1 : 0;
  const side = dir === "left" || dir === "right";

  f.ellipse(16, 30, 6, 1.6, C.shadow);

  // 다리
  if (side) {
    // 옆모습: 앞다리/뒷다리가 앞뒤로 벌어짐 (왼쪽을 보는 기준으로 그리고 right 는 뒤집힘)
    const front = 14 - 2 * Math.abs(stride);
    const back = 15 + 2 * Math.abs(stride);
    f.rect(back, 24, 3, 5, C.pants);
    f.rect(back, 28, 3, 2, C.shoe);
    f.rect(front, 24, 3, 5, C.pants);
    f.rect(front - 1, 28, 4, 2, C.shoe);
  } else {
    const leftLift = stride === 1 ? 1 : 0;
    const rightLift = stride === -1 ? 1 : 0;
    f.rect(12, 24, 3, 5 - leftLift, C.pants);
    f.rect(12, 28 - leftLift, 3, 2, C.shoe);
    f.rect(17, 24, 3, 5 - rightLift, C.pants);
    f.rect(17, 28 - rightLift, 3, 2, C.shoe);
  }

  // 몸통 (코트)
  f.rect(10, 15 + bob, 12, 9, C.coat);
  f.rect(10, 23 + bob, 12, 1, C.coatDark);
  f.rect(11, 14 + bob, 10, 1, C.coat);

  // 팔
  if (side) {
    f.rect(15 - stride, 16 + bob, 2, 6, C.coatDark);
  } else {
    f.rect(8, 16 + bob + stride, 2, 6, C.coatDark);
    f.rect(22, 16 + bob - stride, 2, 6, C.coatDark);
  }

  // 목도리
  f.rect(11, 14 + bob, 10, 2, C.scarf);
  if (dir === "up") f.rect(17, 16 + bob, 2, 3, C.scarf);

  // 머리
  const hy = 8 + bob;
  f.ellipse(16, hy, 6.5, 6.5, C.skin);

  if (dir === "down") {
    f.ellipse(16, hy - 3, 6.5, 3.5, C.hair);
    f.rect(9, hy - 2, 2, 4, C.hair);
    f.rect(21, hy - 2, 2, 4, C.hair);
    f.rect(13, hy + 1, 1, 2, C.eye);
    f.rect(18, hy + 1, 1, 2, C.eye);
    f.px(12, hy + 3, C.cheek);
    f.px(19, hy + 3, C.cheek);
  } else if (dir === "up") {
    f.ellipse(16, hy, 6.5, 6.5, C.hair);
  } else {
    // 왼쪽을 보는 옆모습
    f.ellipse(16, hy - 3, 6.5, 3.5, C.hair);
    f.ellipse(19, hy, 3.5, 5.5, C.hair);
    f.rect(11, hy + 1, 1, 2, C.eye);
    f.px(11, hy + 3, C.cheek);
  }
}

const canvas = new Canvas(WALK_FRAMES * FRAME, DIRECTIONS.length * FRAME);
DIRECTIONS.forEach((dir, row) => {
  for (let col = 0; col < WALK_FRAMES; col++) {
    drawCharacter(new Frame(canvas, col * FRAME, row * FRAME, dir === "right"), dir, col);
  }
});

const out = resolve(ROOT, "assets/sprites/character-placeholder.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodePng(canvas));
console.log(`character → ${out} (${canvas.width}x${canvas.height})`);
