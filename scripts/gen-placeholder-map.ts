/**
 * 임시 타일셋(PNG)과 공원 맵(Tiled JSON)을 생성한다.
 *
 *   pnpm gen:map
 *
 * 출력
 *   assets/tiles/placeholder.png  32x32 타일 8열 x 2행
 *   assets/sprites/tree-tall.png  32x64 키 큰 나무 (obstacles 의 나무 타일 대신 그려짐)
 *   assets/maps/park.json         Tiled 형식 (ground / obstacles 타일 레이어, spawns·trucks 오브젝트 레이어)
 *
 * trucks 레이어: 사각형 오브젝트, name = trucks.json 의 트럭 id. 트럭이 차지하는 칸은
 * obstacles 레이어에 투명 타일(truck)로 막아서, 서버·클라이언트 충돌 격자에 그대로 들어간다.
 *
 * obstacles 타일 속성 (클라이언트가 읽음)
 *   ysort  : true 면 타일 레이어에서 빼서 캐릭터와 앞뒤 순서를 맞춰 그린다 (나무·바위·울타리)
 *   sprite : 타일 대신 그릴 스프라이트 이름. 아랫변을 타일 아랫변에 맞춰 그린다 (위로 삐져나옴)
 *
 * 주의: Tiled 에디터에서 park.json 을 직접 고치기 시작하면 이 스크립트를 다시 돌리지 말 것 (덮어씀).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas, CLEAR, encodePng, hex } from "./lib/png";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TILE = 32;
const COLUMNS = 8;
const ROWS = 2;

const MAP_W = 120;
const MAP_H = 90;

// 타일 번호 (타일셋 안의 위치). Tiled gid = 번호 + 1
const T = {
  snow: 0,
  snow2: 1,
  path: 2,
  plaza: 3,
  ice: 4,
  hill: 5,
  tree: 6,
  fence: 7,
  rock: 8,
  /** 트럭 자리 (그림 없음, 충돌만). 트럭 그림은 클라이언트가 trucks 레이어를 보고 따로 그린다 */
  truck: 9,
} as const;

/** 트럭 크기 (타일). trucks/<id>.png 그림의 아래쪽 이 크기만큼이 트럭 몸체 */
const TRUCK_W = 3;
const TRUCK_H = 2;
/** 트럭 순서 (trucks.json id). 중앙 광장을 도는 산책로를 따라 시계 방향으로 놓인다 */
const TRUCK_ORDER = ["bunsik", "eomuk", "bungeoppang", "hotteok", "goguma", "gyeranppang", "drink", "kkochi"];

// ---------------------------------------------------------------------------
// 난수 (항상 같은 맵이 나오도록 시드 고정)

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// 타일셋 이미지

/** 타일 하나를 그리는 함수. (ox, oy) 는 타일의 왼쪽 위 */
type TilePainter = (c: Canvas, ox: number, oy: number, rand: () => number) => void;

function speckle(base: string, dot: string, density: number): TilePainter {
  return (c, ox, oy, rand) => {
    c.rect(ox, oy, TILE, TILE, hex(base));
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) if (rand() < density) c.set(ox + x, oy + y, hex(dot));
  };
}

const painters: Record<number, TilePainter> = {
  [T.snow]: speckle("#e9eff6", "#d8e2ee", 0.04),
  [T.snow2]: speckle("#e2e9f2", "#d2dce9", 0.05),
  [T.path]: speckle("#c4b8a8", "#a99b89", 0.1),
  [T.plaza]: (c, ox, oy) => {
    c.rect(ox, oy, TILE, TILE, hex("#cfd4dc"));
    for (let i = 0; i < TILE; i++) {
      c.set(ox + i, oy + 15, hex("#b7bfcb"));
      c.set(ox + 15, oy + i, hex("#b7bfcb"));
    }
  },
  [T.ice]: (c, ox, oy) => {
    c.rect(ox, oy, TILE, TILE, hex("#a9d3ee"));
    for (let i = 0; i < 10; i++) {
      c.set(ox + 6 + i, oy + 20 - i, hex("#d6eefc"));
      c.set(ox + 18 + i, oy + 28 - i, hex("#d6eefc"));
    }
  },
  [T.hill]: speckle("#d3dfea", "#bccbdb", 0.06),
  [T.tree]: (c, ox, oy) => {
    c.rect(ox, oy, TILE, TILE, CLEAR);
    c.rect(ox + 14, oy + 24, 4, 7, hex("#6b4a2f"));
    // 3단 삼각형 + 눈 덮인 윗부분
    const layers = [
      { top: 2, bottom: 12, half: 6 },
      { top: 8, bottom: 19, half: 9 },
      { top: 14, bottom: 25, half: 12 },
    ];
    for (const { top, bottom, half } of layers) {
      for (let y = top; y < bottom; y++) {
        const w = Math.round(((y - top + 1) / (bottom - top)) * half);
        for (let x = 16 - w; x < 16 + w; x++) c.set(ox + x, oy + y, hex(y < top + 2 ? "#ffffff" : "#2f5d46"));
      }
    }
  },
  [T.fence]: (c, ox, oy) => {
    c.rect(ox, oy, TILE, TILE, CLEAR);
    const wood = hex("#7a5634");
    c.rect(ox + 3, oy + 8, 3, 20, wood);
    c.rect(ox + 26, oy + 8, 3, 20, wood);
    c.rect(ox, oy + 12, TILE, 3, wood);
    c.rect(ox, oy + 20, TILE, 3, wood);
    c.rect(ox, oy + 11, TILE, 1, hex("#ffffff"));
  },
  [T.rock]: (c, ox, oy) => {
    c.rect(ox, oy, TILE, TILE, CLEAR);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const dx = (x - 16) / 12;
        const dy = (y - 19) / 9;
        if (dx * dx + dy * dy <= 1) c.set(ox + x, oy + y, hex(y < 14 ? "#ffffff" : "#8a94a0"));
      }
  },
};

/** 키 큰 나무 (32x64). 충돌은 밑동 타일 한 칸, 윗부분은 위쪽 칸을 덮어서 그 뒤에 서면 가려진다 */
function buildTallTree(): Canvas {
  const c = new Canvas(TILE, TILE * 2);
  c.rect(0, 0, c.width, c.height, CLEAR);
  // 그림자
  for (let x = 6; x < 26; x++) c.set(x, 62, hex("#000000", 40));
  for (let x = 9; x < 23; x++) c.set(x, 63, hex("#000000", 30));
  // 밑동
  c.rect(13, 48, 6, 14, hex("#6b4a2f"));
  c.rect(13, 48, 2, 14, hex("#58391f"));
  // 4단 잎 + 눈 덮인 윗부분
  const layers = [
    { top: 2, bottom: 16, half: 6 },
    { top: 10, bottom: 27, half: 10 },
    { top: 19, bottom: 39, half: 13 },
    { top: 30, bottom: 51, half: 15 },
  ];
  for (const { top, bottom, half } of layers) {
    for (let y = top; y < bottom; y++) {
      const w = Math.max(1, Math.round(((y - top + 1) / (bottom - top)) * half));
      for (let x = 16 - w; x < 16 + w; x++) {
        const snow = y < top + 3 || (y === bottom - 1 && (x + y) % 3 === 0);
        c.set(x, y, hex(snow ? "#ffffff" : x < 16 ? "#2f5d46" : "#27503c"));
      }
    }
  }
  return c;
}

function buildTileset(): Canvas {
  const canvas = new Canvas(COLUMNS * TILE, ROWS * TILE);
  const rand = mulberry32(7);
  for (const [index, paint] of Object.entries(painters)) {
    const i = Number(index);
    paint(canvas, (i % COLUMNS) * TILE, Math.floor(i / COLUMNS) * TILE, rand);
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// 맵 배치

const EMPTY = -1;
const ground = new Array<number>(MAP_W * MAP_H).fill(T.snow);
const obstacles = new Array<number>(MAP_W * MAP_H).fill(EMPTY);
/** 나무를 심지 않을 칸 (길, 광장, 언덕 등) */
const reserved = new Array<boolean>(MAP_W * MAP_H).fill(false);

const idx = (x: number, y: number) => y * MAP_W + x;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

function setGround(x: number, y: number, tile: number, reserve = true): void {
  if (!inside(x, y)) return;
  ground[idx(x, y)] = tile;
  if (reserve) reserved[idx(x, y)] = true;
}

function setObstacle(x: number, y: number, tile: number): void {
  if (!inside(x, y)) return;
  obstacles[idx(x, y)] = tile;
  reserved[idx(x, y)] = true;
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, fn: (x: number, y: number) => void): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) fn(x, y);
    }
}

/** 두 점 사이에 폭 width 칸짜리 길을 깐다 */
function drawPath(x0: number, y0: number, x1: number, y1: number, width = 3): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const half = Math.floor(width / 2);
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps);
    const y = Math.round(y0 + ((y1 - y0) * s) / steps);
    for (let j = -half; j <= half; j++) for (let i = -half; i <= half; i++) setGround(x + i, y + j, T.path);
  }
}

function buildMap(): void {
  const rand = mulberry32(42);

  // 바탕 눈에 약간의 얼룩
  for (let i = 0; i < ground.length; i++) if (rand() < 0.18) ground[i] = T.snow2;

  const center = { x: 60, y: 45 };

  // 산책로: 중앙을 도는 고리 + 각 구역으로 가는 길
  for (let a = 0; a < 360; a += 1) {
    const r = (a * Math.PI) / 180;
    const x = Math.round(center.x + Math.cos(r) * 22);
    const y = Math.round(center.y + Math.sin(r) * 15);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) setGround(x + i, y + j, T.path);
  }
  drawPath(center.x, 84, center.x, center.y); // 입구 → 중앙
  drawPath(center.x, center.y, 45, 40); // 중앙 → 호수
  drawPath(center.x, center.y, 90, 24); // 중앙 → 전망 언덕
  drawPath(center.x, center.y, 90, 56); // 중앙 → 눈사람 광장
  drawPath(center.x, center.y, 60, 12); // 중앙 → 북쪽 숲길

  // 중앙 광장 (나중에 트럭이 주변에 배치됨)
  fillEllipse(center.x, center.y, 7, 6, (x, y) => setGround(x, y, T.plaza));

  // 입구 광장 (시작 위치)
  for (let y = 78; y <= 87; y++) for (let x = 50; x <= 70; x++) setGround(x, y, T.plaza);

  // 눈사람 광장
  fillEllipse(92, 56, 7, 6, (x, y) => setGround(x, y, T.plaza));

  // 전망 언덕 + 북쪽 난간
  fillEllipse(92, 18, 14, 9, (x, y) => setGround(x, y, T.hill));
  for (let x = 82; x <= 102; x++) setObstacle(x, 10, T.fence);

  // 얼어붙은 호수 (지나갈 수 없음)
  fillEllipse(28, 38, 15, 10, (x, y) => setObstacle(x, y, T.ice));
  // 호숫가 바위
  fillEllipse(28, 38, 17, 12, (x, y) => {
    if (obstacles[idx(x, y)] === EMPTY && !reserved[idx(x, y)] && rand() < 0.12) setObstacle(x, y, T.rock);
  });

  // 외곽 나무 울타리 (아래쪽 입구만 비움)
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const border = x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2;
      const entrance = y >= MAP_H - 2 && x >= 56 && x <= 64;
      if (border && !entrance) setObstacle(x, y, T.tree);
    }

  // 흩어진 나무: 길·광장 바로 옆은 비우고, 구석은 숲처럼 빽빽하게
  for (let y = 2; y < MAP_H - 2; y++)
    for (let x = 2; x < MAP_W - 2; x++) {
      let nearReserved = false;
      for (let j = -1; j <= 1 && !nearReserved; j++)
        for (let i = -1; i <= 1; i++) if (reserved[idx(x + i, y + j)]) nearReserved = true;
      if (nearReserved) continue;
      const corner = (x < 22 || x > MAP_W - 22) && (y < 18 || y > MAP_H - 18);
      if (rand() < (corner ? 0.4 : 0.04)) setObstacle(x, y, T.tree);
    }
}

interface TruckObject {
  name: string;
  col: number;
  row: number;
}

/**
 * 트럭 8대: 중앙을 도는 산책로 바로 위쪽에, 산책로를 바라보게(앞 = 아래) 놓는다.
 * 각도는 각 구역으로 가는 길과 겹치지 않게 고름. 나무를 다 심은 뒤에 놓아서 나머지 맵 배치는 바뀌지 않는다.
 */
function placeTrucks(center: { x: number; y: number }): TruckObject[] {
  // 위쪽 4대는 산책로 바깥, 아래쪽 4대는 산책로 안쪽 (모두 산책로를 바라봄). 왼쪽은 호수라 비움
  const angles = [-140, -115, -65, -15, 50, 70, 110, 140];
  return TRUCK_ORDER.map((name, i) => {
    const r = (angles[i]! * Math.PI) / 180;
    const pathX = Math.round(center.x + Math.cos(r) * 22);
    const pathY = Math.round(center.y + Math.sin(r) * 15);
    const col = pathX - 1;
    const row = pathY - 1 - TRUCK_H; // 트럭 아랫변 = 산책로(3칸 폭) 윗줄 바로 위
    // 트럭 + 주변 1칸 + 앞 2칸의 나무·바위를 치운다
    for (let y = row - 1; y <= row + TRUCK_H + 1; y++)
      for (let x = col - 1; x <= col + TRUCK_W; x++) if (inside(x, y) && obstacles[idx(x, y)] !== T.ice) obstacles[idx(x, y)] = EMPTY;
    for (let y = row; y < row + TRUCK_H; y++)
      for (let x = col; x < col + TRUCK_W; x++) {
        if (obstacles[idx(x, y)] === T.ice) throw new Error(`트럭 "${name}" 이(가) 호수와 겹칩니다 (${x}, ${y})`);
        setObstacle(x, y, T.truck);
      }
    return { name, col, row };
  });
}

function toTiledData(layer: number[]): number[] {
  return layer.map((t) => (t === EMPTY ? 0 : t + 1));
}

// ---------------------------------------------------------------------------

const tileset = buildTileset();
const tallTree = buildTallTree();
buildMap();
const trucks = placeTrucks({ x: 60, y: 45 });

const tilesetPath = resolve(ROOT, "assets/tiles/placeholder.png");
const treePath = resolve(ROOT, "assets/sprites/tree-tall.png");
const mapPath = resolve(ROOT, "assets/maps/park.json");
for (const p of [tilesetPath, treePath, mapPath]) mkdirSync(dirname(p), { recursive: true });

writeFileSync(tilesetPath, encodePng(tileset));
writeFileSync(treePath, encodePng(tallTree));

const ysort = { name: "ysort", type: "bool", value: true };

const map = {
  type: "map",
  version: "1.10",
  tiledversion: "1.11.0",
  orientation: "orthogonal",
  renderorder: "right-down",
  infinite: false,
  width: MAP_W,
  height: MAP_H,
  tilewidth: TILE,
  tileheight: TILE,
  nextlayerid: 5,
  nextobjectid: 2 + trucks.length,
  layers: [
    { id: 1, name: "ground", type: "tilelayer", x: 0, y: 0, width: MAP_W, height: MAP_H, opacity: 1, visible: true, data: toTiledData(ground) },
    { id: 2, name: "obstacles", type: "tilelayer", x: 0, y: 0, width: MAP_W, height: MAP_H, opacity: 1, visible: true, data: toTiledData(obstacles) },
    {
      id: 3,
      name: "spawns",
      type: "objectgroup",
      draworder: "topdown",
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      objects: [
        // 입구 광장 가운데. 좌표는 캐릭터 발밑 위치(px)
        { id: 1, name: "entrance", type: "spawn", point: true, x: 60 * TILE + TILE / 2, y: 83 * TILE + TILE / 2, width: 0, height: 0, rotation: 0, visible: true },
      ],
    },
    {
      id: 4,
      name: "trucks",
      type: "objectgroup",
      draworder: "topdown",
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      // 사각형 = 트럭 몸체가 차지하는 칸 (px). name = trucks.json 의 id
      objects: trucks.map((t, i) => ({
        id: 2 + i,
        name: t.name,
        type: "truck",
        x: t.col * TILE,
        y: t.row * TILE,
        width: TRUCK_W * TILE,
        height: TRUCK_H * TILE,
        rotation: 0,
        visible: true,
      })),
    },
  ],
  tilesets: [
    {
      firstgid: 1,
      name: "placeholder",
      image: "../tiles/placeholder.png",
      imagewidth: tileset.width,
      imageheight: tileset.height,
      tilewidth: TILE,
      tileheight: TILE,
      tilecount: COLUMNS * ROWS,
      columns: COLUMNS,
      margin: 0,
      spacing: 0,
      tiles: [
        { id: T.tree, properties: [ysort, { name: "sprite", type: "string", value: "tree-tall" }] },
        { id: T.fence, properties: [ysort] },
        { id: T.rock, properties: [ysort] },
      ],
    },
  ],
};
writeFileSync(mapPath, JSON.stringify(map));

const blocked = obstacles.filter((t) => t !== EMPTY).length;
console.log(`tileset → ${tilesetPath} (${tileset.width}x${tileset.height})`);
console.log(`tree    → ${treePath} (${tallTree.width}x${tallTree.height})`);
console.log(`map     → ${mapPath} (${MAP_W}x${MAP_H}, obstacles ${blocked} tiles)`);
