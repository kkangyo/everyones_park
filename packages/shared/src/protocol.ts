// 클라이언트 ↔ 서버 통신 규약. 방 이름·메시지 이름·데이터 형태를 한곳에서 정의한다.

import type { Appearance, Gender } from "./character";
import type { Axis, Facing } from "./movement";
import type { NicknameFormatError } from "./nickname";

/** Colyseus 방(= 채널) 이름 */
export const ROOM_NAME = "park";

export const FACINGS: readonly Facing[] = ["up", "down", "left", "right"];

export const MSG = {
  /** 클라 → 서버: 한 틱 동안의 이동 입력 */
  input: "input",
} as const;

/** 서버가 연결을 끊을 때 쓰는 코드 (웹소켓 4000–4999 는 앱 전용) */
export const CLOSE_CODE = {
  /** 같은 계정으로 다른 곳(탭·기기)에서 들어와서 이전 연결을 끊음 */
  duplicateLogin: 4001,
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
  gender: Gender;
  outfit: string;
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

// ---- HTTP API (계정) ----

export const API = {
  /** POST LoginRequest → LoginResponse */
  login: "/api/login",
  /** GET → RandomNicknameResponse */
  randomNickname: "/api/nickname/random",
  /** GET ?name=닉네임 → NicknameCheckResponse */
  checkNickname: "/api/nickname/check",
} as const;

export interface LoginRequest {
  nickname: string;
  pin: string;
  /** 고른 캐릭터. 처음이면 이 값으로 만들고, 이미 있는 계정이면 이 값으로 바꾼다. 없으면 저장된 값 그대로 */
  gender?: Gender;
  outfit?: string;
}

/** 로그인한 사람 (토큰 안에도 같은 정보가 들어 있다) */
export interface AuthUser extends Appearance {
  userId: number;
  nickname: string;
}

export interface LoginResponse {
  /** Colyseus 방에 들어갈 때 쓰는 토큰 */
  token: string;
  user: AuthUser;
  /** 이번에 새로 만든 계정인지 */
  created: boolean;
}

export interface RandomNicknameResponse {
  nickname: string;
}

export interface NicknameCheckResponse {
  /** 이미 있는 닉네임 (= PIN 을 넣으면 로그인) */
  exists: boolean;
}

/** API 오류 코드. 화면에 보이는 문구는 클라이언트 i18n 에서 코드로 찾는다 */
export type ApiErrorCode =
  | NicknameFormatError
  | "NICKNAME_BANNED"
  | "PIN_FORMAT"
  | "APPEARANCE_INVALID"
  | "WRONG_PIN"
  | "LOCKED"
  | "BAD_REQUEST"
  | "SERVER_ERROR";

export interface ApiError {
  error: ApiErrorCode;
  /** WRONG_PIN: 잠기기 전까지 남은 기회 */
  remaining?: number;
  /** LOCKED: 다시 시도할 수 있을 때까지 남은 시간(초) */
  retryAfterSec?: number;
}
