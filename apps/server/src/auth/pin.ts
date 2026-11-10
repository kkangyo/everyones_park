import argon2 from "argon2";

/**
 * argon2id. 기본값(메모리 64MB, 4스레드)은 폰 서버에서 동시 로그인이 몰리면 무겁다.
 * OWASP 권장 최소값(19MiB, 2회, 1스레드)을 쓴다.
 * PIN 은 4자리라 해시만으로는 막을 수 없으므로 로그인 시도 제한(loginLimiter)과 함께 쓴다.
 */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 } as const;

export function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, OPTIONS);
}

export async function verifyPin(hash: string, pin: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pin);
  } catch {
    return false; // 형식이 깨진 해시
  }
}
