import { Server } from "@colyseus/core";
import { monitor } from "@colyseus/monitor";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@park/shared";
import { config } from "./config";
import { openDatabase } from "./db";
import { createLogger } from "./logger";
import { apiRouter } from "./http/api";
import { healthRouter } from "./http/health";
import { loadParkMap } from "./map";
import { ParkRoom } from "./rooms/ParkRoom";

const log = createLogger("server");

const map = loadParkMap();
log.info(`map loaded: ${map.grid.cols}x${map.grid.rows} tiles, entrance (${map.entrance.x}, ${map.entrance.y})`);

const db = openDatabase({ path: config.dbPath });
log.info(`database: ${config.dbPath}`);

const server = new Server({
  transport: new WebSocketTransport(),
  greet: false,
  express: (app) => {
    // Caddy·Vite 프록시가 같은 컴퓨터에서 넘겨 주므로, 그 경우에만 X-Forwarded-For 의 IP 를 믿는다 (로그인 시도 제한 기준)
    app.set("trust proxy", "loopback");
    app.use((req, _res, next) => {
      log.debug(`${req.method} ${req.url}`);
      next();
    });
    app.use(healthRouter);
    app.use(apiRouter(db));
    // 방 목록·접속자 확인용 관리 화면. 운영에서는 끈다 (나중에 관리자 키로 보호해서 켤 수 있음)
    if (!config.isProduction) app.use("/monitor", monitor());
  },
});

server.define(ROOM_NAME, ParkRoom, { map });

// Ctrl+C / SIGTERM 은 Colyseus 가 받아서 방을 정리한 뒤 종료한다
server.onShutdown(async () => {
  log.info("shutting down");
  await db.close();
});

await server.listen(config.port);
log.info(`listening on :${config.port} (env=${config.nodeEnv}, log=${config.logLevel}, maxClients=${config.maxClients})`);
