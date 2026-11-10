// 저장소 진입점. 다른 모듈은 여기서만 import 한다 (PostgreSQL 로 바꿀 때 이 파일과 구현만 교체).
import { openSqlite } from "./sqlite";
import type { Database } from "./types";

export type { Database, NewUser, User, UserRepo } from "./types";
export { NicknameTakenError } from "./types";

export function openDatabase(options: { path: string }): Database {
  return openSqlite(options.path);
}
