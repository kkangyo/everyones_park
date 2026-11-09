import express from "express";
import { config } from "./config";
import { createLogger } from "./logger";
import { healthRouter } from "./http/health";

const log = createLogger("server");

const app = express();

app.use((req, _res, next) => {
  log.debug(`${req.method} ${req.url}`);
  next();
});
app.use(healthRouter);

const server = app.listen(config.port, () => {
  log.info(`listening on :${config.port} (env=${config.nodeEnv}, log=${config.logLevel})`);
});

function shutdown(signal: string): void {
  log.info(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
