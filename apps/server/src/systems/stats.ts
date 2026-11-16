import type { PublicStatsResponse } from "@park/shared";
import { config } from "../config";
import type { StatsRepo } from "../db";
import { createLogger } from "../logger";

const log = createLogger("stats");

/** 나간 뒤 이 시간 안에 다시 들어오면 (새로고침 등) 같은 방문으로 이어 센다 */
const RESUME_GRACE_MS = 60_000;
/** 화면용 '오늘의 공원' 은 이 간격으로만 다시 계산한다 (모든 사람이 주기적으로 묻는다) */
const PUBLIC_CACHE_MS = 10_000;
const PUBLIC_TOP_SNACKS = 3;

interface OpenVisit {
  visitId: Promise<number>;
  /** 같은 계정의 연결 수. 채널 이동·다른 탭은 새 연결이 먼저 들어오고 이전 연결이 나중에 나간다 */
  sessions: number;
}

/** 'YYYY-MM-DD' (STATS_TZ 기준) */
export function dayOf(ms: number, timeZone = config.statsTimeZone): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

/**
 * 통계 (7-3): 일일 방문자, 평균 체류 시간, 인기 간식.
 * 방문 = 계정이 공원에 들어와서 나갈 때까지. 채널 이동·새로고침(1분 안에 다시 옴)은 한 방문으로 센다.
 * 날짜는 들어온 날 기준. 모든 채널(방)이 이 객체 하나를 같이 쓴다
 */
export class StatsService {
  private readonly open = new Map<number, OpenVisit>();
  private readonly recentlyLeft = new Map<number, { visitId: number; leftAt: number }>();
  private publicCache?: { at: number; value: PublicStatsResponse };

  constructor(private readonly repo: StatsRepo) {}

  join(userId: number, now = Date.now()): void {
    const current = this.open.get(userId);
    if (current) {
      current.sessions++;
      return;
    }
    const recent = this.recentlyLeft.get(userId);
    this.recentlyLeft.delete(userId);
    if (recent && now - recent.leftAt < RESUME_GRACE_MS) {
      this.open.set(userId, { visitId: Promise.resolve(recent.visitId), sessions: 1 });
      this.write(this.repo.resumeVisit(recent.visitId));
      return;
    }
    const visitId = this.repo.startVisit(userId, dayOf(now), now);
    this.write(visitId);
    this.open.set(userId, { visitId, sessions: 1 });
  }

  leave(userId: number, now = Date.now()): void {
    const current = this.open.get(userId);
    if (!current || --current.sessions > 0) return;
    this.open.delete(userId);
    this.write(
      current.visitId.then(async (visitId) => {
        await this.repo.endVisit(visitId, now);
        this.recentlyLeft.set(userId, { visitId, leftAt: now });
      }),
    );
    // 오래된 '방금 나감' 정리
    for (const [id, r] of this.recentlyLeft) if (now - r.leftAt >= RESUME_GRACE_MS) this.recentlyLeft.delete(id);
  }

  /** 손님이 간식을 받음 */
  snack(item: string, now = Date.now()): void {
    this.write(this.repo.addSnack(dayOf(now), item));
  }

  /** 오늘 방문자 수 + 인기 간식 (모든 사람에게 보여 주는 것, 잠깐 캐시) */
  async today(now = Date.now()): Promise<PublicStatsResponse> {
    if (this.publicCache && now - this.publicCache.at < PUBLIC_CACHE_MS) return this.publicCache.value;
    const s = await this.repo.daySummary(dayOf(now), now);
    const value = { day: s.day, visitors: s.visitors, topSnacks: s.snacks.slice(0, PUBLIC_TOP_SNACKS) };
    this.publicCache = { at: now, value };
    return value;
  }

  /** 최근 며칠 (관리자) */
  async recentDays(days: number, now = Date.now()) {
    const result = [];
    for (let i = 0; i < days; i++) result.push(await this.repo.daySummary(dayOf(now - i * 86_400_000), now));
    return result;
  }

  /** 통계를 못 남겨도 게임은 계속된다 */
  private write(p: Promise<unknown>): void {
    p.catch((err) => log.error("write failed", err));
  }
}
