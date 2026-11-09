// 폰 서버 운영: pm2 가 게임 서버와 Caddy 를 띄우고, 죽으면 다시 띄운다.
//   pnpm deploy:phone        빌드 + 시작/재시작
//   pnpm exec pm2 ls / logs  상태·로그
// 폰은 Docker 를 쓸 수 없어서 (개발순서.md "폰 서버 운영 방식") 이 방식으로 운영한다.
const path = require("node:path");

const root = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "park-server",
      cwd: path.join(root, "apps/server"),
      script: "dist/index.js",
      // pm2 를 실행한 Node (nvm 의 Node 20) 로 서버를 띄운다
      interpreter: process.execPath,
      env: {
        NODE_ENV: "production",
        PORT: "2567",
        LOG_LEVEL: "info",
      },
      max_memory_restart: "300M",
      time: true,
    },
    {
      name: "park-caddy",
      script: process.env.CADDY_BIN || "caddy",
      args: ["run", "--config", path.join(root, "deploy/Caddyfile"), "--adapter", "caddyfile"],
      interpreter: "none",
      env: {
        // HTTP :3100 (3000 은 폰에서 다른 프로그램이 사용 중). 공유기에서 3100 포워딩 필요.
        // 도메인 + 80/443 포워딩이 준비되면 SITE_ADDRESS=park.example.com 으로 바꾸면 HTTPS 인증서를 자동으로 받는다
        SITE_ADDRESS: process.env.SITE_ADDRESS || ":3100",
        CLIENT_DIST: path.join(root, "apps/client/dist"),
        GAME_SERVER: "localhost:2567",
      },
    },
  ],
};
