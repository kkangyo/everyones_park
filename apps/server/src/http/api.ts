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

/** 계정 API: 로그인, 가입, 닉네임 추천·확인 */
export function apiRouter(db: Database, limiter = new LoginLimiter()): Router {
  const router = Router();
  router.use(express.json({ limit: "2kb" }));
  setInterval(() => limiter.sweep(), SWEEP_INTERVAL_MS).unref();

  const isTaken = async (key: string) => (await db.users.findByNicknameKey(key)) !== undefined;

  /** 로그인: 이미 있는 계정만. 캐릭터를 같이 보내면 저장된 캐릭터를 바꾼다 */
  router.post(API.login, async (req, res) => {
    const input = parseAccountBody(req.body);
    if ("error" in input) return sendError(res, 400, input);
    const { nickname, key, pin, appearance } = input;

    const ip = clientIp(req);
    const limitKeys = [`ip:${ip}`, `nick:${key}`];
    const lockedMs = limiter.lockedFor(limitKeys);
    if (lockedMs > 0) {
      log.info(`login locked "${nickname}" from ${ip}`);
      return sendError(res, 429, { error: "LOCKED", retryAfterSec: Math.ceil(lockedMs / 1000) });
    }

    let user = await db.users.findByNicknameKey(key);
    // 닉네임이 있는지는 입장 화면에서도 확인할 수 있는 공개 정보라 시도 횟수에 넣지 않는다
    if (!user) return sendError(res, 404, { error: "NICKNAME_NOT_FOUND" });

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
    sendLogin(res, user, false);
  });

  /** 가입: 새 닉네임만. 만들고 바로 로그인한 것과 같은 응답 */
  router.post(API.signup, async (req, res) => {
    const input = parseAccountBody(req.body);
    if ("error" in input) return sendError(res, 400, input);
    const { nickname, key, pin } = input;

    const formatError = checkNicknameFormat(nickname);
    if (formatError) return sendError(res, 400, { error: formatError });
    if (isBannedNickname(nickname)) return sendError(res, 400, { error: "NICKNAME_BANNED" });
    if (await isTaken(key)) return sendError(res, 409, { error: "NICKNAME_TAKEN" });

    const a = input.appearance ?? DEFAULT_APPEARANCE;
    try {
      const user = await db.users.create({ nickname, nicknameKey: key, pinHash: await hashPin(pin), gender: a.gender, outfit: a.outfit });
      log.info(`user created #${user.id} "${nickname}" from ${clientIp(req)}`);
      sendLogin(res, user, true);
    } catch (err) {
      // 같은 닉네임 가입이 동시에 들어와서 다른 쪽이 먼저 만든 경우
      if (err instanceof NicknameTakenError) return sendError(res, 409, { error: "NICKNAME_TAKEN" });
      throw err;
    }
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

interface AccountInput {
  nickname: string;
  key: string;
  pin: string;
  /** 보내지 않았으면 undefined */
  appearance?: Appearance;
}

/** 로그인·가입 요청 공통 검사: 닉네임 정리, PIN 형식, 캐릭터(보냈다면 올바른 값인지) */
function parseAccountBody(raw: unknown): AccountInput | ApiError {
  const body = (raw ?? {}) as Record<string, unknown>;
  if (typeof body.nickname !== "string" || typeof body.pin !== "string") return { error: "BAD_REQUEST" };
  if (!PIN_PATTERN.test(body.pin)) return { error: "PIN_FORMAT" };
  const nickname = normalizeNickname(body.nickname);
  let appearance: Appearance | undefined;
  if (body.gender !== undefined || body.outfit !== undefined) {
    const a = { gender: body.gender, outfit: body.outfit };
    if (!isValidAppearance(a)) return { error: "APPEARANCE_INVALID" };
    appearance = { gender: a.gender, outfit: a.outfit };
  }
  return { nickname, key: nicknameKey(nickname), pin: body.pin, appearance };
}

function sendLogin(res: Response, user: User, created: boolean): void {
  const authUser = toAuthUser(user);
  const response: LoginResponse = { token: issueToken(authUser), user: authUser, created };
  res.json(response);
}

function toAuthUser(user: User): AuthUser {
  // 저장된 옷이 나중에 목록에서 빠졌으면 그 성별의 기본 옷으로
  const outfits = OUTFITS[user.gender];
  const outfit = outfits.includes(user.outfit) ? user.outfit : outfits[0]!;
  return { userId: user.id, nickname: user.nickname, gender: user.gender, outfit };
}
