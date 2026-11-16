import { timingSafeEqual } from "node:crypto";
import express, { Router, type NextFunction, type Request, type Response } from "express";
import { ANNOUNCE_MAX_LENGTH, API, type AdminStatsResponse } from "@park/shared";
import { LoginLimiter } from "../auth/loginLimiter";
import { config } from "../config";
import { createLogger } from "../logger";
import { announce, kick, onlineCount } from "../rooms/ParkRoom";
import type { StatsService } from "../systems/stats";

const log = createLogger("admin");

const MAX_STATS_DAYS = 31;
const SWEEP_INTERVAL_MS = 60_000;
const MAX_BAN_MINUTES = 7 * 24 * 60;

/**
 * 관리자 API (7-2, 7-3): 공지, 내보내기, 통계. 요청 헤더 x-admin-key 가 ADMIN_KEY 와 같아야 한다.
 * ADMIN_KEY 가 없으면 전부 404 (관리자 기능 꺼짐). 키를 여러 번 틀리면 그 IP 를 잠시 막는다
 */
export function adminRouter(stats: StatsService, limiter = new LoginLimiter()): Router {
  const router = Router();
  setInterval(() => limiter.sweep(), SWEEP_INTERVAL_MS).unref();
  router.use("/api/admin", express.json({ limit: "2kb" }), (req, res, next) => checkKey(req, res, next, limiter));

  router.post(API.adminNotice, (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > ANNOUNCE_MAX_LENGTH) return void res.status(400).json({ error: "BAD_REQUEST", max: ANNOUNCE_MAX_LENGTH });
    res.json({ channels: announce(text) });
  });

  router.post(API.adminKick, (req, res) => {
    const nickname = typeof req.body?.nickname === "string" ? req.body.nickname.trim() : "";
    const ban = req.body?.banMinutes ?? 0;
    if (!nickname || typeof ban !== "number" || !Number.isInteger(ban) || ban < 0 || ban > MAX_BAN_MINUTES) {
      return void res.status(400).json({ error: "BAD_REQUEST" });
    }
    res.json({ kicked: kick(nickname, ban) });
  });

  router.get(API.adminStats, async (req, res) => {
    const days = Math.min(MAX_STATS_DAYS, Math.max(1, Number.parseInt(String(req.query.days ?? "7"), 10) || 7));
    res.json({ online: onlineCount(), days: await stats.recentDays(days) } satisfies AdminStatsResponse);
  });

  return router;
}

function checkKey(req: Request, res: Response, next: NextFunction, limiter: LoginLimiter): void {
  if (!config.adminKey) return void res.status(404).json({ error: "NOT_FOUND" });
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const keys = [`admin:${ip}`];
  const lockedMs = limiter.lockedFor(keys);
  if (lockedMs > 0) return void res.status(429).json({ error: "LOCKED", retryAfterSec: Math.ceil(lockedMs / 1000) });

  const given = Buffer.from(String(req.headers["x-admin-key"] ?? ""));
  const expected = Buffer.from(config.adminKey);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    limiter.fail(keys);
    log.warn(`rejected ${req.method} ${req.path} from ${ip}`);
    return void res.status(401).json({ error: "UNAUTHORIZED" });
  }
  limiter.reset(`admin:${ip}`);
  log.info(`${req.method} ${req.path} from ${ip}`);
  next();
}
