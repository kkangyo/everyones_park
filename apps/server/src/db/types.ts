// 저장소 인터페이스. 게임 코드는 이 타입만 보고, 실제 DB(SQLite → 나중에 PostgreSQL)는 모른다.
// 메서드는 모두 Promise 를 돌려준다: SQLite 는 동기지만 PostgreSQL 로 바꿀 때 호출하는 쪽을 고치지 않게.

import type { Appearance, DayStats, Gender } from "@park/shared";

export interface User {
  id: number;
  /** 화면에 보이는 닉네임 (처음 만들 때 입력한 그대로, 정리만 함) */
  nickname: string;
  /** 중복 판정용 키 (shared nicknameKey) */
  nicknameKey: string;
  pinHash: string;
  gender: Gender;
  /** 얼굴 (= 몸 그림 id) */
  face: string;
  outfit: string;
  /** 생성 시각 (unix ms) */
  createdAt: number;
}

export type NewUser = Omit<User, "id" | "createdAt">;

export interface UserRepo {
  findByNicknameKey(key: string): Promise<User | undefined>;
  /** 같은 nicknameKey 가 이미 있으면 NicknameTakenError */
  create(user: NewUser): Promise<User>;
  updateAppearance(id: number, appearance: Appearance): Promise<void>;
}

/** 통계 (7-3). day 는 'YYYY-MM-DD' (STATS_TZ 기준), 시각은 unix ms */
export interface StatsRepo {
  /** 방문 시작. 방문 id */
  startVisit(userId: number, day: string, at: number): Promise<number>;
  endVisit(visitId: number, at: number): Promise<void>;
  /** 잠깐 나갔다 바로 돌아옴 (새로고침·채널 이동): 끝난 방문을 다시 이어 간다 */
  resumeVisit(visitId: number): Promise<void>;
  /** 간식 하나 완성 (손님이 받음) */
  addSnack(day: string, item: string): Promise<void>;
  /** 그날 통계. 아직 끝나지 않은 방문은 now 까지로 계산 */
  daySummary(day: string, now: number): Promise<DayStats>;
}

export interface Database {
  users: UserRepo;
  stats: StatsRepo;
  close(): Promise<void>;
}

/** 동시에 같은 닉네임으로 처음 가입하는 경우 (중복 키) */
export class NicknameTakenError extends Error {
  constructor(key: string) {
    super(`nickname key "${key}" already exists`);
  }
}
