// 모든 환경변수는 이 파일에서만 읽는다.

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

export const config = {
  port: readInt("PORT", 2567),
  logLevel: readLogLevel(),
  nodeEnv: process.env.NODE_ENV ?? "development",
} as const;

export const LOG_LEVEL_ORDER: readonly LogLevel[] = LOG_LEVELS;
