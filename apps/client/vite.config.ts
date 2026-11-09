import { defineConfig, type ProxyOptions } from "vite";
import { COLYSEUS_PATH } from "../../packages/shared/src/paths.ts";

// 게임 서버 주소. 개발(vite dev)·미리보기(vite preview) 모두 API·헬스체크·게임 접속을 여기로 넘긴다.
// (운영에서는 Caddy가 같은 역할)
const serverUrl = process.env.SERVER_URL ?? "http://localhost:2567";

// 브라우저가 접속하는 포트. 실행 환경마다 다르게 쓴다 (README "개발 환경별 실행" 참고)
//   폰  : 5173  (PC에서 ssh -L 15173:localhost:5173 터널로 접속)
//   WSL : 15173 (Windows가 5173을 예약 포트로 막는 경우가 있어서 피함)
// 어느 쪽이든 PC 브라우저 주소는 http://localhost:15173 으로 같다.
const port = Number(process.env.CLIENT_PORT ?? 5173);

const proxy: Record<string, string | ProxyOptions> = {
  "/health": serverUrl,
  "/api": serverUrl,
  // Colyseus 매치메이킹(HTTP) + 게임 연결(WebSocket). 앞의 /colyseus 는 떼고 넘긴다
  [COLYSEUS_PATH]: {
    target: serverUrl,
    ws: true,
    rewrite: (path) => path.slice(COLYSEUS_PATH.length) || "/",
  },
  // Colyseus Monitor (개발 전용. 서버가 production 이면 404)
  "/monitor": serverUrl,
};

export default defineConfig({
  // 리포 루트의 assets/ (맵·타일·스프라이트)를 그대로 제공. 서버도 같은 맵 파일을 읽는다.
  publicDir: "../../assets",
  server: {
    host: true, // 터널·WSL 포트 연결·같은 네트워크 PC 어디서든 접속할 수 있게
    port,
    // 포트가 이미 쓰이고 있으면 다른 포트로 몰래 바꾸지 말고 에러를 낸다 (터널 포트가 어긋나지 않게)
    strictPort: true,
    proxy,
  },
  // pnpm preview: 빌드 결과물로 운영과 같은 조건에서 시험
  preview: {
    host: true,
    port,
    strictPort: true,
    proxy,
  },
  build: {
    // Phaser 자체가 약 1.2MB 라서 기본 경고 기준(500kB)을 넘는다
    chunkSizeWarningLimit: 1500,
  },
});
