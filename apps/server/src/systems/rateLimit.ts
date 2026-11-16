import { MSG } from "@park/shared";

/** 메시지 종류마다 초당 몇 개까지 (perSec), 한꺼번에 몇 개까지 (burst) 받는지 */
export interface RateRule {
  perSec: number;
  burst: number;
}

/**
 * 요청 횟수 제한 (7-1). 정상 클라이언트가 넘지 않을 만큼 여유를 둔다.
 * - input: 움직이는 동안 틱(20Hz)마다 하나. 네트워크가 막혔다 풀리면 몰려서 오므로 burst 를 넉넉히
 * - emote: 서버 쿨다운(3초)이 따로 있다. 연타 스크립트가 쿨다운 검사까지 오지 않게
 * - order·cancelOrder: 사람이 누르는 속도
 */
export const RATE_RULES: Readonly<Record<string, RateRule>> = {
  [MSG.input]: { perSec: 25, burst: 30 },
  [MSG.emote]: { perSec: 1, burst: 3 },
  [MSG.order]: { perSec: 2, burst: 4 },
  [MSG.cancelOrder]: { perSec: 2, burst: 4 },
  [MSG.eat]: { perSec: 3, burst: 5 },
  [MSG.sit]: { perSec: 3, burst: 5 },
  [MSG.stand]: { perSec: 3, burst: 5 },
  [MSG.pet]: { perSec: 3, burst: 5 },
  [MSG.look]: { perSec: 2, burst: 4 },
};

/** 규칙이 없는 메시지 종류 */
const DEFAULT_RULE: RateRule = { perSec: 5, burst: 10 };

/** 버린 메시지 로그는 사람·종류마다 이 간격에 한 번 (버린 개수를 모아서) */
const REPORT_INTERVAL_MS = 10_000;

interface Bucket {
  tokens: number;
  updatedAt: number;
  /** 아직 로그로 알리지 않은 버린 개수 */
  dropped: number;
  reportedAt: number;
}

/**
 * 토큰 버킷: 초당 perSec 개씩 채워지고 burst 개까지 쌓인다. 메시지 하나에 하나씩 쓴다.
 * 비어 있으면 그 메시지는 버리고, 버린 개수를 모아 onDropped 로 알린다 (로그용)
 */
export class RateLimiter {
  /** sessionId → 메시지 종류 → 버킷 */
  private readonly buckets = new Map<string, Map<string, Bucket>>();

  constructor(
    private readonly onDropped: (sessionId: string, type: string, count: number) => void,
    private readonly rules: Readonly<Record<string, RateRule>> = RATE_RULES,
  ) {}

  allow(sessionId: string, type: string, now = performance.now()): boolean {
    const rule = this.rules[type] ?? DEFAULT_RULE;
    let byType = this.buckets.get(sessionId);
    if (!byType) this.buckets.set(sessionId, (byType = new Map()));
    let b = byType.get(type);
    if (!b) byType.set(type, (b = { tokens: rule.burst, updatedAt: now, dropped: 0, reportedAt: -Infinity }));

    b.tokens = Math.min(rule.burst, b.tokens + ((now - b.updatedAt) / 1000) * rule.perSec);
    b.updatedAt = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    b.dropped++;
    if (now - b.reportedAt >= REPORT_INTERVAL_MS) {
      this.onDropped(sessionId, type, b.dropped);
      b.dropped = 0;
      b.reportedAt = now;
    }
    return false;
  }

  /** 나간 사람 정리. 아직 알리지 않은 버린 개수가 있으면 마지막으로 알린다 */
  forget(sessionId: string): void {
    for (const [type, b] of this.buckets.get(sessionId) ?? []) if (b.dropped > 0) this.onDropped(sessionId, type, b.dropped);
    this.buckets.delete(sessionId);
  }
}
