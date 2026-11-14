// 3D 겨울 공원 미리보기를 빌드 결과물 dist/park3d/ 에 넣는다.
// 운영 소스는 apps/client/park3d/ (index.html · sprites-data.js · three.min.js r128, sd/index.html = SD 인형판). Vite 를 거치지 않는 독립 페이지라 그대로 복사한다.
// 시제품 작업 폴더 winter-village/ 는 로컬 전용(git 제외). 시제품을 고친 뒤 운영에 올릴 때는 park.html 을 여기 index.html 로 복사한다.
// 주소를 아는 사람만 들어오는 미리보기라 운영 화면 어디에도 링크하지 않는다: http://<주소>:3100/park3d/ · /park3d/sd/
import { cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const client = join(dirname(fileURLToPath(import.meta.url)), "..");
cpSync(join(client, "park3d"), join(client, "dist/park3d"), { recursive: true });
console.log("park3d → dist/park3d/");
