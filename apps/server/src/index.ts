import { Server } from "@colyseus/core";
import { monitor } from "@colyseus/monitor";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@park/shared";
import { config } from "./config";
import { createLogger } from "./logger";
import { healthRouter } from "./http/health";
import { loadParkMap } from "./map";
import { ParkRoom } from "./rooms/ParkRoom";

const log = createLogger("server");

const map = loadParkMap();
log.info(`map loaded: ${map.grid.cols}x${map.grid.rows} tiles, entrance (${map.entrance.x}, ${map.entrance.y})`);

const server = new Server({
  transport: new WebSocketTransport(),
  greet: false,
  express: (app) => {
    app.use((req, _res, next) => {
      log.debug(`${req.method} ${req.url}`);
      next();
    });
    app.use(healthRouter);
    // 방 목록·접속자 확인용 관리 화면. 운영에서는 끈다 (나중에 관리자 키로 보호해서 켤 수 있음)
    if (!config.isProduction) app.use("/monitor", monitor());
  },
});

server.define(ROOM_NAME, ParkRoom, { map });

// Ctrl+C / SIGTERM 은 Colyseus 가 받아서 방을 정리한 뒤 종료한다
server.onShutdown(() => log.info("shutting down"));

await server.listen(config.port);
log.info(`listening on :${config.port} (env=${config.nodeEnv}, log=${config.logLevel}, maxClients=${config.maxClients})`);
