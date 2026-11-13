/**
 * 겨울 비정형 공원 레이아웃과 타일셋(PNG)/Tiled JSON을 생성한다.
 * 배치 원본: scripts/lib/winter-park-layout.ts. 반복 생성해도 같은 맵을 만든다.
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
 * seats 레이어 (5-1): 사각형 오브젝트 = 앉을 자리. 속성 kind(bench), slots(칸 수), facing(앉아서 보는 방향).
 * 자리 칸도 obstacles 레이어에 벤치 타일로 막는다 (걸어서 지나갈 수 없음). 벤치 타일은 ysort 없이 땅 높이에 그려서
 * 앉은 캐릭터가 항상 벤치 위에 보인다.
 *
 * animals 레이어 (5A-2): 점 오브젝트 = 동물이 사는 곳. 속성 kind(cat), label(이름), roam(돌아다니는 범위, 타일), boldness(대담함 0–1).
 * 읽는 함수는 shared/animals.ts 의 animalsFromTiled.
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
import { MAP_W, MAP_H, WINTER_TILE as T, EMPTY, ENTRANCE, LANDMARKS, benchSize, buildWinterParkLayout } from "./lib/winter-park-layout";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TILE = 32;
const COLUMNS = 8;
const ROWS = 2;

/**
 * 공원 동물이 사는 곳 (5A-2). 고등어: 사진 속 고등어 태비. 입구 광장 서쪽 벤치 근처라 들어오면 바로 만난다.
 * 조금 낯을 가리는 편 (boldness 0.45)
 */
const ANIMALS = [{ name: "cat-godeungeo", kind: "cat", label: "고등어", col: 62, row: 157, roam: 9, boldness: 0.45 }] as const;

/** 트럭 크기 (타일). trucks/<id>.png 그림의 아래쪽 이 크기만큼이 트럭 몸체 */
const TRUCK_W = 3;
const TRUCK_H = 2;
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
  [T.garden]: (c, ox, oy) => {
    c.rect(ox,oy,TILE,TILE,CLEAR);
    c.rect(ox+3,oy+7,26,22,hex("#85775f"));
    c.rect(ox+5,oy+8,22,17,hex("#656957"));
    for(const x of [8,16,24]){c.rect(ox+x,oy+5,1,15,hex("#796247"));c.rect(ox+x-2,oy+9,5,2,hex("#83917c"));}
    c.rect(ox+3,oy+7,26,3,hex("#f8fbff"));
    c.rect(ox+4,oy+25,24,2,hex("#dce5ec"));
  },
  [T.bridge]: (c, ox, oy) => {
    c.rect(ox,oy,TILE,TILE,hex("#b69b72"));
    for(let x=0;x<TILE;x+=8){c.rect(ox+x,oy,1,TILE,hex("#806b4e"));c.rect(ox+x+2,oy+4,1,24,hex("#cdb68d"));}
    c.rect(ox,oy+1,TILE,2,hex("#f4f7fa"));c.rect(ox,oy+29,TILE,2,hex("#f4f7fa"));
  },
  [T.stage]: (c, ox, oy) => {
    c.rect(ox,oy,TILE,TILE,hex("#b7b4aa"));
    for(let y=0;y<TILE;y+=8){c.rect(ox,oy+y,TILE,2,hex("#eef2f4"));c.rect(ox,oy+y+6,TILE,2,hex("#8c928f"));}
  },
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
  [T.benchDown]: (c, ox, oy) => paintBench(c, ox, oy, "down"),
  [T.benchUp]: (c, ox, oy) => paintBench(c, ox, oy, "up"),
  [T.benchLeft]: (c, ox, oy) => paintBench(c, ox, oy, "left"),
};

/** 나무 벤치 한 칸. 위·아래를 보는 벤치는 가로로, 왼쪽을 보는 벤치는 세로로 이어진다 */
function paintBench(c: Canvas, ox: number, oy: number, facing: "down" | "up" | "left"): void {
  c.rect(ox, oy, TILE, TILE, CLEAR);
  const wood = hex("#9a6a3f");
  const woodDark = hex("#6e4a2a");
  const snow = hex("#ffffff");
  const leg = hex("#4a4f57");
  if (facing === "left") {
    // 세로 벤치: 앉는 판(왼쪽) + 등받이(오른쪽)
    c.rect(ox + 5, oy + 2, 4, 4, leg);
    c.rect(ox + 5, oy + 26, 4, 4, leg);
    c.rect(ox + 6, oy, 14, TILE, wood);
    for (let y = 0; y < TILE; y += 8) c.rect(ox + 6, oy + y, 14, 1, woodDark);
    c.rect(ox + 21, oy, 5, TILE, woodDark);
    c.rect(ox + 21, oy, 1, TILE, snow);
    return;
  }
  const seatTop = facing === "down" ? 12 : 8;
  // 다리
  c.rect(ox + 3, oy + seatTop + 8, 3, 7, leg);
  c.rect(ox + 26, oy + seatTop + 8, 3, 7, leg);
  // 앉는 판 (널빤지 줄)
  c.rect(ox, oy + seatTop, TILE, 9, wood);
  c.rect(ox, oy + seatTop + 3, TILE, 1, woodDark);
  c.rect(ox, oy + seatTop + 6, TILE, 1, woodDark);
  c.rect(ox, oy + seatTop + 8, TILE, 1, woodDark);
  // 등받이 (보는 방향 반대쪽) + 위에 쌓인 눈
  const backTop = facing === "down" ? 3 : seatTop + 11;
  c.rect(ox, oy + backTop, TILE, 6, woodDark);
  c.rect(ox, oy + backTop + 2, TILE, 1, wood);
  c.rect(ox, oy + backTop, TILE, 1, snow);
}

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

const layout = buildWinterParkLayout();
const { ground, obstacles, trucks } = layout;
const BENCHES = layout.benches;

function toTiledData(layer: number[]): number[] {
  return layer.map((t) => (t === EMPTY ? 0 : t + 1));
}

// ---------------------------------------------------------------------------

const tileset = buildTileset();
const tallTree = buildTallTree();

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
  nextlayerid: 8,
  nextobjectid: 2 + trucks.length + BENCHES.length + LANDMARKS.length + ANIMALS.length,
  properties: [{ name: "season", type: "string", value: "winter" }, { name: "layout", type: "string", value: "organic-loop-v1" }],
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
        { id: 1, name: "entrance", type: "spawn", point: true, x: ENTRANCE.col * TILE + TILE / 2, y: ENTRANCE.row * TILE + TILE / 2, width: 0, height: 0, rotation: 0, visible: true },
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
    {
      id: 5,
      name: "seats",
      type: "objectgroup",
      draworder: "topdown",
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      // 사각형 = 자리가 차지하는 칸 (px). 속성은 shared/seats.ts 의 seatsFromTiled 참고
      objects: BENCHES.map((b, i) => {
        const { w, h } = benchSize(b);
        return {
          id: 2 + trucks.length + i,
          name: b.name,
          type: "seat",
          x: b.col * TILE,
          y: b.row * TILE,
          width: w * TILE,
          height: h * TILE,
          rotation: 0,
          visible: true,
          properties: [
            { name: "kind", type: "string", value: "bench" },
            { name: "slots", type: "int", value: b.slots },
            { name: "facing", type: "string", value: b.facing },
          ],
        };
      }),
    },
    {
      id: 6, name: "landmarks", type: "objectgroup", draworder: "topdown", x: 0, y: 0, opacity: 1, visible: true,
      objects: LANDMARKS.map((p, i) => ({
        id: 2 + trucks.length + BENCHES.length + i, name: p.id, type: p.kind, point: true,
        x: (p.center[0] + .5) * TILE, y: (p.center[1] + .5) * TILE, width: 0, height: 0, rotation: 0, visible: true,
        properties: [
          { name: "label", type: "string", value: p.name },
          { name: "accessX", type: "float", value: (p.access[0] + .5) * TILE },
          { name: "accessY", type: "float", value: (p.access[1] + .5) * TILE },
        ],
      })),
    },
    {
      id: 7, name: "animals", type: "objectgroup", draworder: "topdown", x: 0, y: 0, opacity: 1, visible: true,
      objects: ANIMALS.map((a, i) => ({
        id: 2 + trucks.length + BENCHES.length + LANDMARKS.length + i, name: a.name, type: "animal", point: true,
        x: a.col * TILE + TILE / 2, y: a.row * TILE + TILE / 2, width: 0, height: 0, rotation: 0, visible: true,
        properties: [
          { name: "kind", type: "string", value: a.kind },
          { name: "label", type: "string", value: a.label },
          { name: "roam", type: "int", value: a.roam },
          { name: "boldness", type: "float", value: a.boldness },
        ],
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
console.log(`map     → ${mapPath} (${MAP_W}x${MAP_H}, obstacles ${blocked} tiles, sealed pockets ${layout.sealedPockets})`);
