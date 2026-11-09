// 서버로 넘기는 URL 경로. apps/client/vite.config.ts 가 직접 읽으므로 이 파일은 다른 파일을 import 하지 않는다.

/** 브라우저가 Colyseus 에 접속할 때 쓰는 경로. 개발은 Vite, 운영은 Caddy 가 이 경로를 서버로 넘긴다 */
export const COLYSEUS_PATH = "/colyseus";
