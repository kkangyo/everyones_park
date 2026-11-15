/**
 * 지도 편집 저장 통로 (개발 서버 전용). 3D 미리보기 편집 모드(/park3d/?edit)가 쓴다.
 * 운영 빌드·Caddy 에는 없어서 운영 사이트에서는 지도를 바꿀 수 없다. 개발 PC 에서 고치고 커밋 → 폰 배포.
 *
 *   GET  /__mapedit        편집 저장을 쓸 수 있는지 (편집 모드가 켜지는 조건)
 *   GET  /__mapedit/map    디스크의 assets/maps/park.json (저장한 내용을 바로 다시 읽게)
 *   POST /__mapedit/check  점검만
 *   POST /__mapedit/save   점검 → 형식이 맞으면 저장. 이전 파일은 assets/maps/.backup/ 에 남긴다
 *
 * 저장하면 3D 미리보기 데이터(apps/client/park3d/sprites-data.js 의 window.PARK.map)도 같이 고친다.
 * 게임 서버는 시작할 때 지도를 읽으므로, 저장 후 서버를 다시 띄워야 충돌 격자가 바뀐다.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { checkParkMap, type ParkMap } from "../../scripts/lib/park-map-check.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MAP = join(ROOT, "assets/maps/park.json");
const BACKUP = join(ROOT, "assets/maps/.backup");
const PARK3D_DATA = join(ROOT, "apps/client/park3d/sprites-data.js");
const PARK_LINE = "window.PARK = ";

const send = (res: ServerResponse, code: number, body: unknown) => { res.statusCode = code; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
const readBody = (req: IncomingMessage) => new Promise<string>((ok, fail) => { let s = ""; req.setEncoding("utf8"); req.on("data", (c) => (s += c)); req.on("end", () => ok(s)); req.on("error", fail); });

/** 3D 미리보기 데이터 파일의 window.PARK 줄에서 지도만 바꾼다 (스프라이트 줄은 그대로) */
function writePark3dMap(map: ParkMap) {
  const lines = readFileSync(PARK3D_DATA, "utf8").split("\n"), i = lines.findIndex((l) => l.startsWith(PARK_LINE));
  if (i < 0) throw new Error("sprites-data.js 에 window.PARK 줄이 없음");
  const park = JSON.parse(lines[i]!.slice(PARK_LINE.length).replace(/;\s*$/, ""));
  park.map = map; lines[i] = PARK_LINE + JSON.stringify(park) + ";";
  writeFileSync(PARK3D_DATA, lines.join("\n"));
}

export function mapEditPlugin(): Plugin {
  return {
    name: "park-map-edit",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__mapedit", async (req, res) => {
        try {
          const path = (req.url ?? "/").split("?")[0];
          if (req.method === "GET" && path === "/") return send(res, 200, { ok: true });
          if (req.method === "GET" && path === "/map") return send(res, 200, JSON.parse(readFileSync(MAP, "utf8")));
          if (req.method !== "POST" || (path !== "/check" && path !== "/save")) return send(res, 404, { error: "없는 경로" });
          const map = JSON.parse(await readBody(req)) as ParkMap, result = checkParkMap(map);
          if (path === "/check" || result.errors.length) return send(res, result.errors.length ? 400 : 200, result);
          mkdirSync(BACKUP, { recursive: true });
          const stamp = new Date().toISOString().replace(/[:.]/g, "-"), backup = join(BACKUP, `park-${stamp}.json`);
          copyFileSync(MAP, backup);
          writeFileSync(MAP, JSON.stringify(map)); // 생성기와 같은 한 줄 형식
          writePark3dMap(map);
          server.config.logger.info(`지도 저장: assets/maps/park.json (이전 파일: ${backup.slice(ROOT.length + 1)})${result.problems.length ? ` · 점검 문제 ${result.problems.length}개` : ""}`);
          send(res, 200, { ...result, saved: true, backup: backup.slice(ROOT.length + 1) });
        } catch (e) {
          send(res, 500, { error: String((e as Error)?.message ?? e) });
        }
      });
    },
  };
}
