// 모든 환경변수는 이 파일에서만 읽는다.

import { resolve } from "node:path";
import { CHANNEL_CAPACITY } from "@park/shared";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

// 개발 중에는 apps/server/.env 를 읽는다. 운영(Docker 등)에서는 환경변수를 직접 넣으므로 파일이 없어도 된다.
try {
  process.loadEnvFile(".env");
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`환경변수 ${name} 은(는) 정수여야 합니다: "${raw}"`);
  return value;
}

function readLogLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL ?? "info";
  if (!(LOG_LEVELS as readonly string[]).includes(raw)) {
    throw new Error(`환경변수 LOG_LEVEL 은(는) ${LOG_LEVELS.join("|")} 중 하나여야 합니다: "${raw}"`);
  }
  return raw as LogLevel;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";

/** 개발 중에만 쓰는 토큰 서명 키. 운영에서는 AUTH_SECRET 이 없으면 시작하지 않는다 */
const DEV_AUTH_SECRET = "dev-only-secret-do-not-use-in-production";

function readAuthSecret(): string {
  const raw = process.env.AUTH_SECRET ?? "";
  if (raw) {
    if (raw.length < 32) throw new Error("환경변수 AUTH_SECRET 은(는) 32자 이상이어야 합니다 (openssl rand -hex 32)");
    return raw;
  }
  if (isProduction) throw new Error("운영(NODE_ENV=production)에서는 환경변수 AUTH_SECRET 이 필요합니다 (openssl rand -hex 32)");
  return DEV_AUTH_SECRET;
}

export const config = {
  port: readInt("PORT", 2567),
  logLevel: readLogLevel(),
  nodeEnv,
  isProduction,
  /** 채널(Room) 정원. 채널 자동 분할을 시험할 때 작게 줄일 수 있다 */
  maxClients: readInt("MAX_CLIENTS", CHANNEL_CAPACITY),
  /** 맵 등 에셋 폴더. 기본값은 apps/server 에서 실행할 때의 리포 루트 assets/ */
  assetsDir: resolve(process.env.ASSETS_DIR ?? "../../assets"),
  /** SQLite 파일 경로. 기본값은 apps/server/data.db (실행 위치 기준) */
  dbPath: resolve(process.env.DB_PATH ?? "data.db"),
  /** 입장 토큰 서명 키 (HMAC). 바꾸면 이미 발급한 토큰은 모두 무효 */
  authSecret: readAuthSecret(),
  /** 입장 토큰 유효 시간 (초) */
  tokenTtlSec: readInt("TOKEN_TTL_SEC", 12 * 60 * 60),
} as const;

export const LOG_LEVEL_ORDER: readonly LogLevel[] = LOG_LEVELS;
