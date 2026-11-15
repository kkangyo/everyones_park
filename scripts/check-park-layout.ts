/**
 * 저장된 공원 지도(assets/maps/park.json)를 점검한다: 형식 · 시작 위치에서 트럭 앞·벤치·랜드마크까지 길 · 산책로 고리 · 빈 땅.
 * 지도 원본은 park.json 이다 (3D 미리보기 편집 모드로 고친다). 점검 내용은 scripts/lib/park-map-check.ts.
 *
 *   pnpm check:map
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { checkParkMap } from "./lib/park-map-check";

const raw = JSON.parse(readFileSync("assets/maps/park.json", "utf8"));
const { errors, problems, report } = checkParkMap(raw);
mkdirSync("docs/park-layout", { recursive: true });
writeFileSync("docs/park-layout/check-report.json", JSON.stringify({ ...report, errors, problems }, null, 2) + "\n");
console.log(JSON.stringify(report));
if (errors.length || problems.length) {
  for (const m of [...errors, ...problems]) console.error("✗ " + m);
  process.exit(1);
}
console.log("✓ 지도 점검 통과");
