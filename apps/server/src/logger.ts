import { config, LOG_LEVEL_ORDER, type LogLevel } from "./config";

// 로그는 stdout 으로만 남긴다. (Docker/클라우드에서 수집하기 쉽게)
const minLevel = LOG_LEVEL_ORDER.indexOf(config.logLevel);

function log(level: LogLevel, scope: string, message: string, extra?: unknown): void {
  if (LOG_LEVEL_ORDER.indexOf(level) < minLevel) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  if (extra === undefined) console.log(line);
  else console.log(line, extra);
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, extra?: unknown) => log("debug", scope, message, extra),
    info: (message: string, extra?: unknown) => log("info", scope, message, extra),
    warn: (message: string, extra?: unknown) => log("warn", scope, message, extra),
    error: (message: string, extra?: unknown) => log("error", scope, message, extra),
  };
}
