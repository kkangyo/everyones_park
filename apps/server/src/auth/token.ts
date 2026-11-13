// 입장 토큰: base64url(JSON).base64url(HMAC-SHA256)
// 서버에 상태를 두지 않으므로 서버를 재시작해도, 나중에 서버를 여러 대로 늘려도(같은 키) 그대로 검증된다.

import { createHmac, timingSafeEqual } from "node:crypto";
import { readAppearance, type AuthUser } from "@park/shared";
import { config } from "../config";

interface Payload extends AuthUser {
  /** 만료 시각 (unix 초) */
  exp: number;
}

function sign(body: string): string {
  return createHmac("sha256", config.authSecret).update(body).digest("base64url");
}

export function issueToken(user: AuthUser, nowMs = Date.now()): string {
  const payload: Payload = { ...user, exp: Math.floor(nowMs / 1000) + config.tokenTtlSec };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** 서명·만료·내용이 모두 맞으면 사용자 정보, 아니면 null */
export function verifyToken(token: unknown, nowMs = Date.now()): AuthUser | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;

  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let p: Partial<Payload>;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Payload>;
  } catch {
    return null;
  }
  const { userId, nickname, exp } = p;
  if (typeof exp !== "number" || exp * 1000 <= nowMs) return null;
  if (typeof userId !== "number" || typeof nickname !== "string") return null;
  // 얼굴 선택 전에 발급한 토큰(face 없음)은 옷에 맞는 얼굴로
  const appearance = readAppearance(p);
  if (!appearance) return null;
  return { userId, nickname, ...appearance };
}
