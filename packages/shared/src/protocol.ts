// 클라이언트 ↔ 서버 통신 규약. 방 이름·메시지 이름·데이터 형태를 한곳에서 정의한다.

import type { Axis, Facing } from "./movement";

/** Colyseus 방(= 채널) 이름 */
export const ROOM_NAME = "park";

export const FACINGS: readonly Facing[] = ["up", "down", "left", "right"];

/** joinOrCreate 옵션 */
export interface JoinOptions {
  /** 임시 닉네임 (3단계 계정 기능 전까지) */
  nickname?: string;
}

export const MSG = {
  /** 클라 → 서버: 한 틱 동안의 이동 입력 */
  input: "input",
} as const;

/**
 * 이동 입력 한 틱분. 서버는 받은 순서대로 step(TICK_SEC) 를 한 번씩 적용한다.
 * 멈춰 있는 동안은 보내지 않는다 (멈춘 순간 x=0,y=0 한 번만 보냄).
 */
export interface InputMessage {
  /** 1부터 1씩 증가. 서버가 처리한 마지막 번호를 PlayerView.seq 로 돌려준다 */
  seq: number;
  x: Axis;
  y: Axis;
}

/** 서버 상태 중 플레이어 한 명 (클라이언트가 읽는 형태) */
export interface PlayerView {
  nickname: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  /** 서버가 마지막으로 처리한 입력 번호 (내 캐릭터 예측 보정용) */
  seq: number;
}

/** 서버 상태 최상위 (클라이언트가 읽는 형태) */
export interface ParkStateView {
  /** 서버 틱 번호. tick * TICK_MS = 서버 시간(ms) */
  tick: number;
  players: Map<string, PlayerView>;
}

export const NICKNAME_MAX_LENGTH = 10;
