/**
 * 임시 간식·트럭 그림을 생성한다.
 *
 *   pnpm gen:food
 *
 * 출력
 *   assets/sprites/food/<메뉴 id>.png    12x12 프레임 3개 (가로). 0 = 처음, 1·2 = 먹으면서 줄어든 모습
 *                                        (packages/shared/src/food.ts EAT_STAGES, 메뉴 목록은 shared/data/menu.json)
 *   assets/sprites/trucks/<트럭 id>.png  96x80. 아래쪽 96x64 가 맵에서 트럭이 차지하는 3x2 칸, 위 16px 은 지붕
 *
 * 최종 그림으로 바꿀 때도 같은 크기·프레임 배치·파일 이름을 지키면 코드 수정 없이 교체된다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HAND_RIG } from "../packages/shared/src/hand-rig";
import { EAT_STAGES, MENU, TRUCKS } from "../packages/shared/src/food";
import { Canvas, encodePng, hex, type RGBA } from "./lib/png";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FOOD = HAND_RIG.foodFrame.width;
// Every stage keeps its grip at HAND_RIG.foodGrip (6,9); never trim/recenter frames.
const TRUCK_W = 96;
const TRUCK_H = 80;

type Painter = (p: Pen, stage: number) => void;

/** 프레임 하나에 그리는 도구 */
class Pen {
  constructor(
    private readonly c: Canvas,
    private readonly ox: number,
    private readonly oy: number,
  ) {}
  px(x: number, y: number, color: RGBA): void {
    this.c.set(this.ox + x, this.oy + y, color);
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

const OUTLINE = hex("#3a2a20");
const PAPER = hex("#f4efe4");
const PAPER_DARK = hex("#d9cfbd");
const STICK = hex("#c9a46a");

/** 종이컵 음료: 단계마다 수위가 내려간다 */
function cup(liquid: string): Painter {
  return (p, stage) => {
    p.rect(3, 3, 6, 8, PAPER);
    p.rect(2, 2, 8, 1, PAPER_DARK);
    p.rect(3, 10, 6, 1, PAPER_DARK);
    const level = 3 + stage * 2; // 액체 윗면 y
    p.rect(3, level, 6, 1, hex(liquid));
    if (stage === 0) p.px(9, 1, hex("#ffffff", 160)); // 김
    p.rect(9, 5, 2, 3, PAPER_DARK); // 컵 홀더
  };
}

/** 꼬치: 조각이 하나씩 없어진다 */
function skewer(piece: string, dark: string): Painter {
  return (p, stage) => {
    p.rect(5, 1, 1, 11, STICK);
    const pieces = 3 - stage;
    for (let i = 0; i < pieces; i++) {
      const y = 7 - i * 3;
      p.rect(3, y, 5, 3, hex(piece));
      p.rect(3, y + 2, 5, 1, hex(dark));
    }
  };
}

/** 종이 그릇에 담긴 조각들: 조각이 줄어든다 */
function tray(colors: string[], dark: string, round = false): Painter {
  const spots: [number, number][] = [
    [2, 4], [5, 3], [8, 4], [3, 6], [6, 6], [8, 7],
  ];
  return (p, stage) => {
    p.rect(1, 8, 10, 3, PAPER);
    p.rect(1, 10, 10, 1, PAPER_DARK);
    const count = spots.length - stage * 2;
    for (let i = 0; i < count; i++) {
      const [x, y] = spots[i]!;
      const color = hex(colors[i % colors.length]!);
      if (round) p.ellipse(x + 1.5, y + 1.5, 1.6, 1.6, color);
      else p.rect(x, y, 3, 2, color);
      p.px(x + 1, y + (round ? 2 : 1), hex(dark));
    }
  };
}

/** 붕어빵: 머리부터 한 입씩 */
function fish(inside: string): Painter {
  return (p, stage) => {
    const body = hex("#d99a45");
    const dark = hex("#b0732c");
    p.ellipse(6, 6, 4.5, 3, body);
    p.rect(9, 4, 2, 5, body); // 꼬리
    p.px(10, 3, body);
    p.px(10, 9, body);
    p.px(3, 5, OUTLINE); // 눈
    p.rect(5, 8, 3, 1, dark);
    // 한 입 = 머리 쪽(왼쪽)을 지움
    const bite = stage * 3;
    for (let y = 0; y < FOOD; y++) for (let x = 0; x < bite; x++) p.px(x, y, [0, 0, 0, 0]);
    if (stage > 0) p.rect(bite, 4, 1, 4, hex(inside));
  };
}

/** 둥근 빵·고구마: 오른쪽부터 한 입씩 */
function round(crust: string, inside: string, wrap: boolean, rx = 4.5, ry = 3.5): Painter {
  return (p, stage) => {
    if (wrap) p.rect(1, 7, 10, 4, PAPER);
    p.ellipse(6, 6, rx, ry, hex(crust));
    p.ellipse(6, 5, rx - 2, ry - 2, hex(inside));
    const bite = stage * 3;
    for (let y = 0; y < 8; y++) for (let x = FOOD - bite; x < FOOD; x++) p.px(x, y, [0, 0, 0, 0]);
    if (wrap) p.rect(1, 10, 10, 1, PAPER_DARK);
  };
}

const FOOD_PAINTERS: Record<string, Painter> = {
  tteokbokki: tray(["#e04a32", "#d23b25"], "#9e2a1a"),
  sundae: tray(["#4a2f35", "#5a3a40"], "#2a1a1e"),
  twigim: tray(["#e0a948", "#d29a3a"], "#a8742a"),
  eomuk: skewer("#e8c890", "#c9a46a"),
  "eomuk-soup": cup("#d8b46a"),
  "bungeoppang-red": fish("#6b2a2a"),
  "bungeoppang-cream": fish("#f2dc8a"),
  ttangkongppang: tray(["#c98a45", "#b97a38"], "#8a5525", true),
  "hotteok-honey": round("#b8793a", "#d9a35a", true),
  "hotteok-seed": round("#b8793a", "#8a6a3a", true),
  goguma: round("#8a3a4a", "#f0b84a", true, 5, 3),
  gunbam: tray(["#7a4a25", "#6a3e1e"], "#f0d8a0", true),
  gyeranppang: round("#e0a948", "#fff1b8", false, 4.5, 4),
  "yuja-tea": cup("#f2c23a"),
  "hot-choco": cup("#6b3e26"),
  sikhye: cup("#efe4c4"),
  dakkochi: skewer("#b8622f", "#8a4520"),
};

const TRUCK_COLORS: Record<string, { body: string; awning: string }> = {
  bunsik: { body: "#d64545", awning: "#ffd9a8" },
  eomuk: { body: "#3f7fbf", awning: "#ffffff" },
  bungeoppang: { body: "#e8a33a", awning: "#7a4a25" },
  hotteok: { body: "#b86a3a", awning: "#f2dc8a" },
  goguma: { body: "#7a4a6b", awning: "#f0b84a" },
  gyeranppang: { body: "#f2d04a", awning: "#e8823a" },
  drink: { body: "#4f9a8a", awning: "#f5f1e8" },
  kkochi: { body: "#6b4a3a", awning: "#e04a32" },
};

/** 트럭 (탑다운 3/4 시점, 손님 쪽으로 판매창이 보임). 아래 64px 가 맵의 3x2 칸 */
function drawTruck(c: Canvas, colors: { body: string; awning: string }): void {
  const body = hex(colors.body);
  const shade: RGBA = [Math.max(0, body[0] - 40), Math.max(0, body[1] - 40), Math.max(0, body[2] - 40), 255];
  const roof: RGBA = [Math.min(255, body[0] + 40), Math.min(255, body[1] + 40), Math.min(255, body[2] + 40), 255];
  // 그림자
  for (let x = 6; x < 90; x++) c.set(x, 78, hex("#000000", 50));
  // 지붕 (위에서 보이는 면) + 눈
  c.rect(4, 6, 88, 20, roof);
  c.rect(4, 6, 88, 3, hex("#ffffff"));
  // 앞면 몸체
  c.rect(4, 26, 88, 44, body);
  c.rect(4, 66, 88, 4, shade);
  // 운전석 (오른쪽)
  c.rect(70, 30, 18, 14, hex("#bfe3f5"));
  c.rect(70, 30, 18, 2, hex("#ffffff"));
  // 판매창 + 차양(줄무늬)
  c.rect(10, 34, 54, 22, hex("#2a2f3a"));
  c.rect(12, 36, 50, 18, hex("#ffd27a")); // 안쪽 따뜻한 불빛
  for (let x = 8; x < 66; x++) for (let y = 28; y < 34; y++) c.set(x, y, Math.floor(x / 6) % 2 === 0 ? hex(colors.awning) : body);
  // 판매대
  c.rect(8, 56, 58, 4, hex("#8a6a4a"));
  c.rect(8, 56, 58, 1, hex("#b08a62"));
  // 바퀴
  for (const wx of [16, 72]) {
    c.rect(wx, 68, 12, 10, hex("#2d2d2d"));
    c.rect(wx + 4, 71, 4, 4, hex("#8a8a8a"));
  }
}

function write(path: string, canvas: Canvas): void {
  const out = resolve(ROOT, path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(canvas));
}

for (const id of MENU.keys()) {
  const paint = FOOD_PAINTERS[id];
  if (!paint) throw new Error(`메뉴 "${id}" 의 그림 설정(FOOD_PAINTERS)이 없습니다`);
  const canvas = new Canvas(FOOD * EAT_STAGES, FOOD);
  for (let stage = 0; stage < EAT_STAGES; stage++) paint(new Pen(canvas, stage * FOOD, 0), stage);
  write(`assets/sprites/food/${id}.png`, canvas);
}
console.log(`food   → assets/sprites/food/ (${MENU.size})`);

for (const id of TRUCKS.keys()) {
  const colors = TRUCK_COLORS[id];
  if (!colors) throw new Error(`트럭 "${id}" 의 색(TRUCK_COLORS)이 없습니다`);
  const canvas = new Canvas(TRUCK_W, TRUCK_H);
  drawTruck(canvas, colors);
  write(`assets/sprites/trucks/${id}.png`, canvas);
}
console.log(`trucks → assets/sprites/trucks/ (${TRUCKS.size})`);
