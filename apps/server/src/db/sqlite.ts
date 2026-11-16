import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { DEFAULT_APPEARANCE, readAppearance, type Appearance } from "@park/shared";
import { createLogger } from "../logger";
import { NicknameTakenError, type Database, type NewUser, type StatsRepo, type User, type UserRepo } from "./types";

const log = createLogger("db");

/**
 * 마이그레이션. 순서대로 한 번씩만 실행되고, 실행한 개수는 PRAGMA user_version 에 남는다.
 * **이미 배포한 항목은 고치지 말고** 새 항목을 뒤에 추가한다.
 */
const MIGRATIONS: readonly string[] = [
  // 1: 계정 (3-1)
  `CREATE TABLE users (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     nickname      TEXT    NOT NULL,
     nickname_key  TEXT    NOT NULL UNIQUE,
     pin_hash      TEXT    NOT NULL,
     gender        TEXT    NOT NULL,
     outfit        TEXT    NOT NULL,
     created_at    INTEGER NOT NULL
   ) STRICT`,
  // 2: 얼굴 선택. 예전 계정은 '' (읽을 때 옷에 맞는 얼굴로 채움)
  `ALTER TABLE users ADD COLUMN face TEXT NOT NULL DEFAULT ''`,
  // 3: 통계 (7-3). 방문(들어옴~나감)과 날짜별 간식 완성 개수
  `CREATE TABLE visits (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id    INTEGER NOT NULL,
     day        TEXT    NOT NULL,
     joined_at  INTEGER NOT NULL,
     left_at    INTEGER
   ) STRICT;
   CREATE INDEX visits_day ON visits (day);
   CREATE TABLE snack_counts (
     day    TEXT    NOT NULL,
     item   TEXT    NOT NULL,
     count  INTEGER NOT NULL,
     PRIMARY KEY (day, item)
   ) STRICT`,
];

interface UserRow {
  id: number;
  nickname: string;
  nickname_key: string;
  pin_hash: string;
  gender: string;
  face: string;
  outfit: string;
  created_at: number;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    nickname: row.nickname,
    nicknameKey: row.nickname_key,
    pinHash: row.pin_hash,
    // 목록에서 빠진 얼굴·옷이면 기본값 (응답할 때 api toAuthUser 가 성별 기본값으로 다시 맞춘다)
    ...(readAppearance(row) ?? { ...DEFAULT_APPEARANCE, gender: row.gender === "female" ? "female" : "male" }),
    createdAt: row.created_at,
  };
}

export function openSqlite(path: string): Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new BetterSqlite3(path);
  // WAL: 읽기와 쓰기가 서로 막지 않음. 폰의 느린 저장장치에서도 쓰기가 빠르다
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  const findByKey = db.prepare<[string], UserRow>("SELECT * FROM users WHERE nickname_key = ?");
  const insert = db.prepare<[string, string, string, string, string, string, number]>(
    "INSERT INTO users (nickname, nickname_key, pin_hash, gender, face, outfit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const updateAppearance = db.prepare<[string, string, string, number]>("UPDATE users SET gender = ?, face = ?, outfit = ? WHERE id = ?");

  const users: UserRepo = {
    async findByNicknameKey(key) {
      const row = findByKey.get(key);
      return row ? toUser(row) : undefined;
    },
    async create(u: NewUser) {
      const createdAt = Date.now();
      try {
        const { lastInsertRowid } = insert.run(u.nickname, u.nicknameKey, u.pinHash, u.gender, u.face, u.outfit, createdAt);
        return { ...u, id: Number(lastInsertRowid), createdAt };
      } catch (err) {
        if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") throw new NicknameTakenError(u.nicknameKey);
        throw err;
      }
    },
    async updateAppearance(id: number, a: Appearance) {
      updateAppearance.run(a.gender, a.face, a.outfit, id);
    },
  };

  // 서버가 갑자기 꺼져서 끝나지 않은 방문은 체류 시간을 알 수 없으므로 0 으로 닫는다 (평균에서 빠짐)
  const orphaned = db.prepare("UPDATE visits SET left_at = joined_at WHERE left_at IS NULL").run().changes;
  if (orphaned > 0) log.info(`closed ${orphaned} unfinished visits from the previous run`);

  const insertVisit = db.prepare<[number, string, number]>("INSERT INTO visits (user_id, day, joined_at) VALUES (?, ?, ?)");
  const endVisit = db.prepare<[number, number]>("UPDATE visits SET left_at = ? WHERE id = ?");
  const resumeVisit = db.prepare<[number]>("UPDATE visits SET left_at = NULL WHERE id = ?");
  const addSnack = db.prepare<[string, string]>(
    "INSERT INTO snack_counts (day, item, count) VALUES (?, ?, 1) ON CONFLICT (day, item) DO UPDATE SET count = count + 1",
  );
  const visitSummary = db.prepare<[number, string], { visitors: number; visits: number; avg_ms: number | null }>(
    `SELECT COUNT(DISTINCT user_id) AS visitors, COUNT(*) AS visits,
            AVG(CASE WHEN left_at IS NULL THEN ? - joined_at WHEN left_at > joined_at THEN left_at - joined_at END) AS avg_ms
       FROM visits WHERE day = ?`,
  );
  const snackSummary = db.prepare<[string], { item: string; count: number }>("SELECT item, count FROM snack_counts WHERE day = ? ORDER BY count DESC, item");

  const stats: StatsRepo = {
    async startVisit(userId, day, at) {
      return Number(insertVisit.run(userId, day, at).lastInsertRowid);
    },
    async endVisit(visitId, at) {
      endVisit.run(at, visitId);
    },
    async resumeVisit(visitId) {
      resumeVisit.run(visitId);
    },
    async addSnack(day, item) {
      addSnack.run(day, item);
    },
    async daySummary(day, now) {
      const v = visitSummary.get(now, day)!;
      return { day, visitors: v.visitors, visits: v.visits, avgStaySec: Math.round((v.avg_ms ?? 0) / 1000), snacks: snackSummary.all(day) };
    },
  };

  return {
    users,
    stats,
    async close() {
      db.close();
    },
  };
}

function migrate(db: BetterSqlite3.Database): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  if (current > MIGRATIONS.length) {
    throw new Error(`DB 버전(${current})이 코드(${MIGRATIONS.length})보다 높습니다. 더 새 버전의 서버가 만든 DB 입니다`);
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    // 마이그레이션 하나 + 버전 기록을 한 트랜잭션으로: 중간에 죽어도 반쯤 적용된 상태가 남지 않는다
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
    log.info(`migrated to version ${v + 1}`);
  }
}
