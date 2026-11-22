/**
 * 공원 지도(Tiled park.json) 점검. pnpm check:map 과 지도 편집기 저장(apps/client/vite.config.ts)이 같이 쓴다.
 * 멈추지 않고 문제를 모두 모아서 돌려준다: 형식이 깨졌으면 errors, 길이 막히는 등 플레이 문제는 problems.
 * 원본은 assets/maps/park.json 이다 (편집기로 고친다). 생성기(pnpm gen:map)와 같은지는 더 보지 않는다.
 */
import { collisionGridFromTiled, boxHitsWall, footBox } from "../../packages/shared/src/collision";
import { findPath, tileOf, tileCenter } from "../../packages/shared/src/pathfinding";
import { truckPlacementsFromTiled, truckFrontPoint, TRUCKS } from "../../packages/shared/src/food";
import { seatsFromTiled, seatStandPoint, distanceToSeat, SIT_RANGE_PX } from "../../packages/shared/src/seats";
import { WINTER_TILE as T, MAIN_LOOP } from "./winter-park-layout";

type Layer = { name: string; type: string; data?: number[]; objects?: { name: string; x: number; y: number; width?: number; height?: number; properties?: { name: string; value: unknown }[] }[] };
export type ParkMap = { width: number; height: number; tilewidth: number; tileheight: number; editor3d?: { trees: Record<string, string>; treeScales?: Record<string, number>; groundStyles?: Record<string, string>; lamps: { x: number; y: number; style?: string }[]; heights: Record<string, number> }; layers: Layer[] };
export interface ParkMapCheck { errors: string[]; problems: string[]; report: Record<string, unknown> }

const MAX_GID = 16;

export function checkParkMap(raw: ParkMap): ParkMapCheck {
  const errors: string[] = [], problems: string[] = [];
  const layer = (n: string) => raw.layers?.find((l) => l.name === n);
  // 1) 형식: 이게 깨지면 서버·화면이 지도를 못 읽으니 저장하면 안 된다
  if (raw.tilewidth !== 32 || raw.tileheight !== 32) errors.push("칸 크기가 32px 이 아님");
  if (!(raw.width > 0 && raw.height > 0)) errors.push("지도 크기가 잘못됨");
  for (const n of ["ground", "obstacles", "spawns", "trucks", "seats", "landmarks", "animals"]) if (!layer(n)) errors.push(`${n} 층이 없음`);
  for (const l of raw.layers?.filter((l) => l.type === "tilelayer") ?? []) {
    if (l.data?.length !== raw.width * raw.height) errors.push(`${l.name} 칸 수가 지도 크기와 다름`);
    else if (!l.data.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_GID)) errors.push(`${l.name} 에 모르는 칸 번호가 있음`);
  }
  if (raw.editor3d) {
    const e = raw.editor3d, validKey = (k: string) => /^\d+$/.test(k) && Number(k) < raw.width * raw.height;
    if (!e.trees || !e.heights || !Array.isArray(e.lamps)) errors.push("3D 편집 데이터 형식이 잘못됨");
    else {
      if (Object.entries(e.trees).some(([k, v]) => !validKey(k) || !["pine", "spruce", "bare0", "bare1", "bare2", "bare3", "bare4", "bare5", "bare6", "bare7"].includes(v))) errors.push("나무 종류 또는 위치가 잘못됨");
      if (e.treeScales !== undefined && (!e.treeScales || typeof e.treeScales !== "object" || Array.isArray(e.treeScales) || Object.entries(e.treeScales).some(([k, v]) => !validKey(k) || !Number.isFinite(v) || v < 0.5 || v > 2))) errors.push("나무 크기는 50~200% 범위여야 함");
      const groundIds = ["grass-bare", "grass-dusting", "grass-patchy", "grass-deep", "brick-brown", "brick-brown-snow", "block-gray", "block-gray-snow", "stone-light", "gravel", "asphalt", "edge-brick", "edge-gray", "shore-earth", "shore-pebbles", "shore-stone", "shore-reeds", "shore-snow"];
      if (e.groundStyles !== undefined && (!e.groundStyles || typeof e.groundStyles !== "object" || Array.isArray(e.groundStyles) || Object.entries(e.groundStyles).some(([k, v]) => !validKey(k) || !groundIds.includes(v)))) errors.push("바닥 타일 종류 또는 위치가 잘못됨");
      if (Object.entries(e.heights).some(([k, v]) => !validKey(k) || !Number.isFinite(v) || v < -2 || v > 3)) errors.push("지형 높이가 허용 범위(-2~3)를 벗어남");
      if (e.lamps.some((o) => o.style !== undefined && !["basic", "copper", "globe", "ornate", "hanging", "twin", "shade", "triple", "modern"].includes(o.style))) errors.push("가로등 종류가 잘못됨");
      if (e.lamps.some((o) => !Number.isFinite(o.x) || !Number.isFinite(o.y) || o.x < 32 || o.y < 32 || o.x >= (raw.width - 1) * 32 || o.y >= (raw.height - 1) * 32)) errors.push("가로등 위치가 지도 밖임");
    }
  }
  const tables = layer("tables")?.objects || [], tableNames = new Set<string>();
  for (const table of tables) {
    if (!table.name || tableNames.has(table.name)) errors.push("식탁 이름이 비었거나 중복됨");
    tableNames.add(table.name);
    if (![table.x, table.y, table.width, table.height].every((n) => Number.isFinite(n) && Number(n) % 32 === 0) || !table.width || !table.height || table.width < 32 || table.height < 32 || table.x < 32 || table.y < 32 || table.x + table.width > (raw.width - 1) * 32 || table.y + table.height > (raw.height - 1) * 32) errors.push(`식탁 ${table.name}: 크기 또는 위치가 잘못됨`);
  }
  const spawn = layer("spawns")?.objects?.find((o) => o.name === "entrance");
  if (!spawn) errors.push("시작 위치(entrance)가 없음");
  if (errors.length) return { errors, problems, report: {} };

  // 2) 플레이: 시작 위치에서 트럭 앞·벤치 자리·랜드마크까지 걸어갈 수 있는지
  const grid = collisionGridFromTiled(raw as never, "obstacles"), start = tileOf(spawn!, 32);
  if (boxHitsWall(grid, footBox(spawn!))) problems.push("시작 위치가 막혀 있음");
  let checkedRoutes = 0;
  const reachable = (point: { x: number; y: number }, label: string) => {
    if (boxHitsWall(grid, footBox(point))) { problems.push(`${label}: 서 있을 자리가 막혀 있음`); return -1; }
    const path = findPath(grid, start, tileOf(point, 32));
    if (!path) { problems.push(`${label}: 시작 위치에서 갈 수 없음`); return -1; }
    let prev = tileCenter(start, 32);
    for (const t of path) { const next = tileCenter(t, 32); for (let k = 1; k <= 4; k++) { const pos = { x: prev.x + (next.x - prev.x) * k / 4, y: prev.y + (next.y - prev.y) * k / 4 }; if (boxHitsWall(grid, footBox(pos))) { problems.push(`${label}: 가는 길이 장애물에 걸림`); return -1; } } prev = next; }
    checkedRoutes++; return path.length;
  };
  const trucks = truckPlacementsFromTiled(raw as never, "trucks");
  if (trucks.length !== TRUCKS.size || new Set(trucks.map((t) => t.def.id)).size !== trucks.length) problems.push(`트럭이 ${TRUCKS.size}대가 아니거나 겹침 (${trucks.length}대)`);
  const truckRoutes = trucks.map((t) => ({ id: t.def.id, tiles: reachable(truckFrontPoint(t), `트럭 ${t.def.id} 앞`) }));
  const seats = seatsFromTiled(raw as never, "seats"); let slots = 0;
  for (const s of seats) for (let i = 0; i < s.slots.length; i++) { const p = seatStandPoint(s, i, grid); if (distanceToSeat(p, s) > SIT_RANGE_PX) problems.push(`벤치 ${s.id}/${i}: 앉을 자리에서 너무 멂`); reachable(p, `벤치 ${s.id}/${i}`); slots++; }
  // Every orientation needs a clear front so players stand into the aisle, not behind the backrest.
  for (const s of seats) for (let i = 0; i < s.slots.length; i++) {
    const p = seatStandPoint(s, i, grid), b = s.box;
    const inFront = s.facing === "down" ? p.y >= b.bottom : s.facing === "up" ? p.y <= b.top : s.facing === "left" ? p.x <= b.left : p.x >= b.right;
    if (!inFront) problems.push(`벤치 ${s.id}/${i}: 앞이 막혀 벤치 뒤·옆에서 일어섬`);
  }
  const landmarks = layer("landmarks")!.objects!;
  const landmarkRoutes = landmarks.map((p) => { const get = (k: string) => p.properties?.find((x) => x.name === k)?.value as number; return { id: p.name, tiles: reachable({ x: get("accessX"), y: get("accessY") }, `랜드마크 ${p.name}`) }; });
  for (const table of tables) for (let y = table.y / 32; y < (table.y + table.height!) / 32; y++) for (let x = table.x / 32; x < (table.x + table.width!) / 32; x++) {
    if (!grid.blocked[y * raw.width + x]) problems.push(`식탁 ${table.name}: 충돌 칸이 비어 있음`);
  }
  const ground = layer("ground")!.data!;
  let ice = 0, bridge = 0;
  for (let i = 0; i < ground.length; i++) {
    if (ground[i] === T.ice + 1) { ice++; if (!grid.blocked[i]) { problems.push(`얼음 칸 (${i % raw.width}, ${Math.floor(i / raw.width)})이 막혀 있지 않음`); break; } }
    if (ground[i] === T.bridge + 1) { bridge++; if (grid.blocked[i]) { problems.push(`다리 칸 (${i % raw.width}, ${Math.floor(i / raw.width)})이 막혀 있음`); break; } }
  }
  // 큰 산책로 고리가 끊기지 않았는지 (포장된 칸만으로)
  const paved = { ...grid, blocked: Uint8Array.from(grid.blocked, (n, i) => (n || ![T.path + 1, T.plaza + 1, T.bridge + 1, T.stage + 1].includes(ground[i]!) ? 1 : 0)) };
  let loopLength = 0;
  for (let i = 0; i < MAIN_LOOP.length; i++) {
    const a = MAIN_LOOP[i]!, b = MAIN_LOOP[(i + 1) % MAIN_LOOP.length]!, path = findPath(paved, { col: a[0], row: a[1] }, { col: b[0], row: b[1] });
    if (!path) problems.push(`산책로 고리 ${i}번 구간이 끊김 (${a} → ${b})`);
    else { if (path.length >= Math.hypot(a[0] - b[0], a[1] - b[1]) * 1.8 + 12) problems.push(`산책로 고리 ${i}번 구간이 크게 돌아감`); loopLength += path.length; }
  }
  for (let x = 0; x < raw.width; x++) for (const y of [0, raw.height - 1]) if (!grid.blocked[y * raw.width + x]) { problems.push("지도 바깥 테두리가 뚫려 있음"); break; }
  for (let y = 0; y < raw.height; y++) for (const x of [0, raw.width - 1]) if (!grid.blocked[y * raw.width + x]) { problems.push("지도 바깥 테두리가 뚫려 있음"); break; }
  // 시작 위치에서 닿지 않는 빈 땅 (나무로 둘러싸인 구멍 등)
  const visited = new Uint8Array(grid.cols * grid.rows), queue = [start.row * grid.cols + start.col]; visited[queue[0]!] = 1;
  for (let n = 0; n < queue.length; n++) { const i = queue[n]!, x = i % grid.cols, y = Math.floor(i / grid.cols); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx!, yy = y + dy!; if (xx < 0 || yy < 0 || xx >= grid.cols || yy >= grid.rows) continue; const j = yy * grid.cols + xx; if (!grid.blocked[j] && !visited[j]) { visited[j] = 1; queue.push(j); } } }
  const walkable = Array.from(grid.blocked).filter((n) => !n).length;
  if (queue.length !== walkable) problems.push(`갈 수 없는 빈 땅이 ${walkable - queue.length}칸 있음 (나무 등으로 둘러싸임)`);
  return { errors, problems: [...new Set(problems)], report: { dimensions: [raw.width, raw.height], pixels: [raw.width * 32, raw.height * 32], walkableTiles: walkable, reachableWalkableTiles: queue.length, trucks: trucks.length, benches: seats.length, tables: tables.length, seats: slots, landmarks: landmarks.length, checkedRoutes, iceTiles: ice, bridgeTiles: bridge, mainLoopSegments: MAIN_LOOP.length, loopLengthTiles: loopLength, truckRoutes, landmarkRoutes } };
}
