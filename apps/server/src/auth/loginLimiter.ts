/**
 * 로그인 시도 제한 (3-4). PIN 이 4자리뿐이라 이것이 실제 방어선이다.
 * IP 와 닉네임 각각에 대해 **기간(window) 안에 maxFailures 번 틀리면 lockMs 동안 잠근다.**
 *
 * - 닉네임 기준: 여러 IP 에서 한 계정을 노리는 경우
 * - IP 기준: 한 곳에서 여러 계정을 돌아가며 노리는 경우
 *
 * 메모리에만 둔다 (서버 재시작 시 초기화). 서버를 여러 대로 늘리면 Redis 등으로 옮긴다.
 */

export interface LimiterOptions {
  maxFailures: number;
  windowMs: number;
  lockMs: number;
}

export const DEFAULT_LIMITER_OPTIONS: LimiterOptions = {
  maxFailures: 5,
  windowMs: 10 * 60_000,
  lockMs: 10 * 60_000,
};

interface Entry {
  failures: number;
  /** 첫 실패 시각. windowMs 가 지나면 횟수를 새로 센다 */
  firstAt: number;
  lockedUntil: number;
}

export class LoginLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly opts: LimiterOptions = DEFAULT_LIMITER_OPTIONS) {}

  /** 잠겨 있으면 풀릴 때까지 남은 ms, 아니면 0. 키 중 하나라도 잠겨 있으면 잠김 */
  lockedFor(keys: readonly string[], now = Date.now()): number {
    let ms = 0;
    for (const key of keys) {
      const e = this.entries.get(key);
      if (e && e.lockedUntil > now) ms = Math.max(ms, e.lockedUntil - now);
    }
    return ms;
  }

  /** 실패를 기록한다. 돌려주는 값: 잠기기 전까지 남은 기회 (가장 적은 키 기준, 0 이면 방금 잠김) */
  fail(keys: readonly string[], now = Date.now()): number {
    let remaining = this.opts.maxFailures;
    for (const key of keys) {
      let e = this.entries.get(key);
      if (!e || now - e.firstAt > this.opts.windowMs) {
        e = { failures: 0, firstAt: now, lockedUntil: 0 };
        this.entries.set(key, e);
      }
      e.failures++;
      if (e.failures >= this.opts.maxFailures) {
        e.lockedUntil = now + this.opts.lockMs;
        // 잠금이 풀리면 처음부터 다시 센다
        e.failures = 0;
        e.firstAt = e.lockedUntil;
      }
      remaining = Math.min(remaining, e.lockedUntil > now ? 0 : this.opts.maxFailures - e.failures);
    }
    return remaining;
  }

  /**
   * 성공하면 닉네임 기록만 지운다. IP 기록은 지우지 않는다
   * (내 계정으로 한 번씩 로그인하면서 남의 계정을 계속 시도하는 것을 막기 위해)
   */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /** 오래된 기록 정리. 주기적으로 호출 */
  sweep(now = Date.now()): void {
    for (const [key, e] of this.entries) {
      if (e.lockedUntil <= now && now - e.firstAt > this.opts.windowMs) this.entries.delete(key);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
