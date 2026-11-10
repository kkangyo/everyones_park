// 저장소 인터페이스. 게임 코드는 이 타입만 보고, 실제 DB(SQLite → 나중에 PostgreSQL)는 모른다.
// 메서드는 모두 Promise 를 돌려준다: SQLite 는 동기지만 PostgreSQL 로 바꿀 때 호출하는 쪽을 고치지 않게.

import type { Gender } from "@park/shared";

export interface User {
  id: number;
  /** 화면에 보이는 닉네임 (처음 만들 때 입력한 그대로, 정리만 함) */
  nickname: string;
  /** 중복 판정용 키 (shared nicknameKey) */
  nicknameKey: string;
  pinHash: string;
  gender: Gender;
  outfit: string;
  /** 생성 시각 (unix ms) */
  createdAt: number;
}

export type NewUser = Omit<User, "id" | "createdAt">;

export interface UserRepo {
  findByNicknameKey(key: string): Promise<User | undefined>;
  /** 같은 nicknameKey 가 이미 있으면 NicknameTakenError */
  create(user: NewUser): Promise<User>;
  updateAppearance(id: number, gender: Gender, outfit: string): Promise<void>;
}

export interface Database {
  users: UserRepo;
  close(): Promise<void>;
}

/** 동시에 같은 닉네임으로 처음 가입하는 경우 (중복 키) */
export class NicknameTakenError extends Error {
  constructor(key: string) {
    super(`nickname key "${key}" already exists`);
  }
}
