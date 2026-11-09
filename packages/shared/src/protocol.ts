// 클라이언트 ↔ 서버 통신 규약. 방 이름·메시지 이름·데이터 형태를 한곳에서 정의한다.

import type { Facing } from "./movement";

/** Colyseus 방(= 채널) 이름 */
export const ROOM_NAME = "park";

export const FACINGS: readonly Facing[] = ["up", "down", "left", "right"];

/** joinOrCreate 옵션 */
export interface JoinOptions {
  /** 임시 닉네임 (3단계 계정 기능 전까지) */
  nickname?: string;
}

export const MSG = {
  /** 클라 → 서버: 내 위치 (2-2 임시. 2-3에서 입력 전송으로 바뀜) */
  move: "move",
} as const;

export interface MoveMessage {
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
}

/** 서버 상태 중 플레이어 한 명 (클라이언트가 읽는 형태) */
export interface PlayerView {
  nickname: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
}

export const NICKNAME_MAX_LENGTH = 10;
