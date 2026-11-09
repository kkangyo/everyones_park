import { defineConfig } from "vite";

// 개발 중 API/헬스체크 요청을 게임 서버로 넘긴다. (운영에서는 Caddy가 같은 역할)
const serverUrl = process.env.SERVER_URL ?? "http://localhost:2567";

export default defineConfig({
  // 리포 루트의 assets/ (맵·타일·스프라이트)를 그대로 제공. 서버도 같은 맵 파일을 읽는다.
  publicDir: "../../assets",
  server: {
    host: true, // 같은 네트워크의 PC에서 폰 서버의 Vite에 접속할 수 있게
    port: 5173,
    proxy: {
      "/health": serverUrl,
      "/api": serverUrl,
    },
  },
  build: {
    // Phaser 자체가 약 1.2MB 라서 기본 경고 기준(500kB)을 넘는다
    chunkSizeWarningLimit: 1500,
  },
});
