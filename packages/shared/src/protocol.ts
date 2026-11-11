// 클라이언트 ↔ 서버 통신 규약. 방 이름·메시지 이름·데이터 형태를 한곳에서 정의한다.

import type { Appearance, Gender } from "./character";
import type { Axis, Facing } from "./movement";
import type { NicknameFormatError } from "./nickname";

/** Colyseus 방(= 채널) 이름 */
export const ROOM_NAME = "park";

export const FACINGS: readonly Facing[] = ["up", "down", "left", "right", "down-left", "down-right", "up-left", "up-right"];

export const MSG = {
  /** 클라 → 서버: 한 틱 동안의 이동 입력 */
  input: "input",
  /** 클라 → 서버: 간식 주문 (OrderMessage). 트럭 앞에서만 */
  order: "order",
  /** 클라 → 서버: 주문 취소 (내용 없음) */
  cancelOrder: "cancelOrder",
  /** 클라 → 서버: 들고 있는 간식 먹기 시작 (EatMessage, 없으면 아직 안 먹은 첫 번째) */
  eat: "eat",
  /** 클라 → 서버: 가까운 자리에 앉기 (내용 없음). 서버가 빈 칸을 고른다 */
  sit: "sit",
  /** 클라 → 서버: 일어나기 (내용 없음) */
  stand: "stand",
  /** 서버 → 클라: 나에게만 보내는 알림 (NoticeMessage) */
  notice: "notice",
} as const;

export interface OrderMessage {
  truck: string;
  item: string;
}

export interface EatMessage {
  /** 먹을 간식의 손 번호 (PlayerView.hands 의 순서, 0 부터) */
  hand: number;
}

/**
 * 서버 알림 코드. 화면 문구는 클라이언트 i18n (notice.*)
 * - HANDS_FULL: 손이 꽉 차서 주문 불가 (머리 위 말풍선)
 * - NOT_AT_TRUCK / ALREADY_ORDERED / INVALID_ORDER: 주문 거절
 * - ORDER_CANCELLED_FAR: 트럭에서 멀어져서 취소됨
 * - ORDER_READY: 간식을 받음
 * - SEAT_FULL: 가까운 자리가 다 차서 앉지 못함 (머리 위 말풍선)
 */
export type NoticeCode = "HANDS_FULL" | "NOT_AT_TRUCK" | "ALREADY_ORDERED" | "INVALID_ORDER" | "ORDER_CANCELLED_FAR" | "ORDER_READY" | "SEAT_FULL";

export interface NoticeMessage {
  code: NoticeCode;
  /** 관련된 메뉴 id */
  item?: string;
}

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
  /** 양손에 든 간식 (최대 HANDS_MAX) */
  hands: HeldFoodView[];
  /** 주문한 트럭 id. 주문 없으면 "" */
  orderTruck: string;
  /** 주문한 메뉴 id */
  orderItem: string;
  /** 대기 순서. 0 = 지금 만드는 중, 1 = 다음 차례 … */
  orderQueuePos: number;
  /** 앉은 자리 id (맵 seats 오브젝트 name). 서 있으면 "" */
  seatId: string;
  /** 앉은 칸 번호 (seatId 가 있을 때만) */
  seatSlot: number;
}

export interface HeldFoodView {
  /** 메뉴 id */
  item: string;
  /** 먹는 그림 단계 (0 ~ EAT_STAGES-1) */
  stage: number;
  eating: boolean;
}

export interface TruckView {
  /** 지금 만드는 메뉴 id. 쉬는 중이면 "" (연기 연출) */
  cookingItem: string;
  /** 다 만들어지는 서버 틱 (cookingItem 이 있을 때만) */
  readyTick: number;
  /** 기다리는 사람 수 (만드는 중인 사람 제외) */
  waiting: number;
}

/** 서버 상태 최상위 (클라이언트가 읽는 형태) */
export interface ParkStateView {
  /** 서버 틱 번호. tick * TICK_MS = 서버 시간(ms) */
  tick: number;
  players: Map<string, PlayerView>;
  /** 트럭 id → 트럭 상태 */
  trucks: Map<string, TruckView>;
}

// ---- HTTP API (계정) ----

export const API = {
  /** POST LoginRequest → LoginResponse. 이미 있는 계정만 */
  login: "/api/login",
  /** POST SignupRequest → LoginResponse. 새 계정만 (만들고 바로 로그인) */
  signup: "/api/signup",
  /** GET → RandomNicknameResponse */
  randomNickname: "/api/nickname/random",
  /** GET ?name=닉네임 → NicknameCheckResponse */
  checkNickname: "/api/nickname/check",
} as const;

export interface LoginRequest {
  nickname: string;
  pin: string;
  /** 캐릭터를 바꾸려면 둘 다 보낸다. 없으면 저장된 캐릭터 그대로 */
  gender?: Gender;
  outfit?: string;
}

export interface SignupRequest {
  nickname: string;
  pin: string;
  gender: Gender;
  outfit: string;
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
  /** 가입: 이미 있는 닉네임 */
  | "NICKNAME_TAKEN"
  /** 로그인: 없는 닉네임 */
  | "NICKNAME_NOT_FOUND"
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
