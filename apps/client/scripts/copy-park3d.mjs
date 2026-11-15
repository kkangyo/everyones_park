// 3D 겨울 공원 미리보기를 빌드 결과물 dist/park3d/ 에 넣는다.
// 운영 소스는 apps/client/park3d/ (index.html = 도트 미리보기 · sprites-data.js · three.min.js r128 — 메인 화면(/)도 three.min.js · sprites-data.js 를 여기서 읽는다, sd/index.html = 메인으로 넘기는 옛 주소). Vite 를 거치지 않는 독립 페이지라 그대로 복사한다.
// 시제품 작업 폴더 winter-village/ 는 로컬 전용(git 제외). 시제품을 고친 뒤 운영에 올릴 때는 park.html 을 여기 index.html 로 복사한다.
// 도트 미리보기는 주소를 아는 사람만 들어온다: http://<주소>:3100/park3d/
import { cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const client = join(dirname(fileURLToPath(import.meta.url)), "..");
cpSync(join(client, "park3d"), join(client, "dist/park3d"), { recursive: true });
console.log("park3d → dist/park3d/");
