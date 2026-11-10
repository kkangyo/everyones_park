import express, { Router, type NextFunction, type Request, type Response } from "express";
import {
  API,
  DEFAULT_APPEARANCE,
  OUTFITS,
  PIN_PATTERN,
  checkNicknameFormat,
  isValidAppearance,
  nicknameKey,
  normalizeNickname,
  type ApiError,
  type Appearance,
  type AuthUser,
  type LoginResponse,
  type NicknameCheckResponse,
  type RandomNicknameResponse,
} from "@park/shared";
import { LoginLimiter } from "../auth/loginLimiter";
import { hashPin, verifyPin } from "../auth/pin";
import { issueToken } from "../auth/token";
import { NicknameTakenError, type Database, type User } from "../db";
import { createLogger } from "../logger";
import { isBannedNickname } from "../nickname/filter";
import { randomNickname } from "../nickname/random";

const log = createLogger("api");

const SWEEP_INTERVAL_MS = 60_000;

function sendError(res: Response, status: number, body: ApiError): void {
  res.status(status).json(body);
}

/** 프록시(Caddy·Vite) 뒤에서도 실제 접속 IP. index.ts 의 trust proxy 설정을 따른다 */
function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/** 계정 API: 로그인(처음이면 생성), 닉네임 추천·확인 */
export function apiRouter(db: Database, limiter = new LoginLimiter()): Router {
  const router = Router();
  router.use(express.json({ limit: "2kb" }));
  setInterval(() => limiter.sweep(), SWEEP_INTERVAL_MS).unref();

  const isTaken = async (key: string) => (await db.users.findByNicknameKey(key)) !== undefined;

  router.post(API.login, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.nickname !== "string" || typeof body.pin !== "string") return sendError(res, 400, { error: "BAD_REQUEST" });

    const nickname = normalizeNickname(body.nickname);
    const pin = body.pin;
    const key = nicknameKey(nickname);
    if (!PIN_PATTERN.test(pin)) return sendError(res, 400, { error: "PIN_FORMAT" });

    // 캐릭터: 보냈으면 올바른 값이어야 한다. 안 보냈으면 기존 값(처음이면 기본값)
    let appearance: Appearance | undefined;
    if (body.gender !== undefined || body.outfit !== undefined) {
      const a = { gender: body.gender, outfit: body.outfit };
      if (!isValidAppearance(a)) return sendError(res, 400, { error: "APPEARANCE_INVALID" });
      appearance = { gender: a.gender, outfit: a.outfit };
    }

    const ip = clientIp(req);
    const limitKeys = [`ip:${ip}`, `nick:${key}`];
    const lockedMs = limiter.lockedFor(limitKeys);
    if (lockedMs > 0) {
      log.info(`login locked "${nickname}" from ${ip}`);
      return sendError(res, 429, { error: "LOCKED", retryAfterSec: Math.ceil(lockedMs / 1000) });
    }

    let user = await db.users.findByNicknameKey(key);
    let created = false;
    if (!user) {
      // 처음 쓰는 닉네임 → 이 PIN 으로 계정 생성
      const formatError = checkNicknameFormat(nickname);
      if (formatError) return sendError(res, 400, { error: formatError });
      if (isBannedNickname(nickname)) return sendError(res, 400, { error: "NICKNAME_BANNED" });
      const a = appearance ?? DEFAULT_APPEARANCE;
      try {
        user = await db.users.create({ nickname, nicknameKey: key, pinHash: await hashPin(pin), gender: a.gender, outfit: a.outfit });
        created = true;
        log.info(`user created #${user.id} "${nickname}" from ${ip}`);
      } catch (err) {
        if (!(err instanceof NicknameTakenError)) throw err;
        // 같은 닉네임 가입이 동시에 들어옴: 먼저 만든 계정으로 로그인 시도
        user = (await db.users.findByNicknameKey(key))!;
      }
    }

    if (!created) {
      if (!(await verifyPin(user.pinHash, pin))) {
        const remaining = limiter.fail(limitKeys);
        log.info(`login failed "${user.nickname}" from ${ip} (remaining ${remaining})`);
        if (remaining === 0) {
          return sendError(res, 429, { error: "LOCKED", retryAfterSec: Math.ceil(limiter.lockedFor(limitKeys) / 1000) });
        }
        return sendError(res, 401, { error: "WRONG_PIN", remaining });
      }
      limiter.reset(`nick:${key}`);
      if (appearance && (appearance.gender !== user.gender || appearance.outfit !== user.outfit)) {
        await db.users.updateAppearance(user.id, appearance.gender, appearance.outfit);
        user = { ...user, ...appearance };
      }
      log.info(`login #${user.id} "${user.nickname}" from ${ip}`);
    }

    const authUser = toAuthUser(user);
    const response: LoginResponse = { token: issueToken(authUser), user: authUser, created };
    res.json(response);
  });

  router.get(API.randomNickname, async (_req, res) => {
    const nickname = await randomNickname(async (key) => (await isTaken(key)) || isBannedNickname(key));
    const response: RandomNicknameResponse = { nickname };
    res.json(response);
  });

  /** 입력 중에 '새 닉네임 / 이미 있는 닉네임' 안내용. 쓸 수 없는 닉네임이면 그 오류 */
  router.get(API.checkNickname, async (req, res) => {
    if (typeof req.query.name !== "string") return sendError(res, 400, { error: "BAD_REQUEST" });
    const nickname = normalizeNickname(req.query.name);
    const exists = await isTaken(nicknameKey(nickname));
    if (!exists) {
      const formatError = checkNicknameFormat(nickname);
      if (formatError) return sendError(res, 400, { error: formatError });
      if (isBannedNickname(nickname)) return sendError(res, 400, { error: "NICKNAME_BANNED" });
    }
    const response: NicknameCheckResponse = { exists };
    res.json(response);
  });

  // JSON 형식 오류(400)와 예상하지 못한 오류(500)도 같은 형태로 돌려준다
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number }).status;
    if (status && status >= 400 && status < 500) return sendError(res, status, { error: "BAD_REQUEST" });
    log.error("api error", err);
    sendError(res, 500, { error: "SERVER_ERROR" });
  });

  return router;
}

function toAuthUser(user: User): AuthUser {
  // 저장된 옷이 나중에 목록에서 빠졌으면 그 성별의 기본 옷으로
  const outfits = OUTFITS[user.gender];
  const outfit = outfits.includes(user.outfit) ? user.outfit : outfits[0]!;
  return { userId: user.id, nickname: user.nickname, gender: user.gender, outfit };
}
