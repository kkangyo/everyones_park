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
  /** 클라 → 서버: 자리에 앉기 (SitMessage, 없으면 가까운 자리). 서버가 빈 칸을 고른다 */
  sit: "sit",
  /** 클라 → 서버: 일어나기 (내용 없음) */
  stand: "stand",
  /** 클라 → 서버: 이모티콘 (EmoteMessage). 서버가 쿨다운(EMOTE_COOLDOWN_SEC)을 확인한다 */
  emote: "emote",
  /** 클라 → 서버: 동물 쓰다듬기 (PetMessage). 가까이 있어야 한다 */
  pet: "pet",
  /** 클라 → 서버: 3D SD 꾸미기 바꾸기 (LookMessage). 입장할 때는 join 옵션 { look } 으로 보낸다 */
  look: "look",
  /** 서버 → 클라: 나에게만 보내는 알림 (NoticeMessage) */
  notice: "notice",
  /** 서버 → 클라: 관리자 공지 (AnnounceMessage). 모든 채널에 (7-2) */
  announce: "announce",
} as const;

export interface AnnounceMessage {
  text: string;
}

/** 관리자 공지 글자 수 */
export const ANNOUNCE_MAX_LENGTH = 200;

export interface OrderMessage {
  truck: string;
  item: string;
}

export interface EatMessage {
  /** 먹을 간식의 손 번호 (PlayerView.hands 의 순서, 0 부터) */
  hand: number;
}

export interface EmoteMessage {
  /** EMOTES 의 id */
  emote: string;
}

export interface PetMessage {
  /** 동물 id */
  animal: string;
}

export interface LookMessage {
  /** SD 꾸미기 조합 (isLookKey). 계정에 저장하지 않고, 접속해 있는 동안만 다른 사람에게 보인다 */
  look: string;
}

/**
 * SD 꾸미기 조합 "머리.옷.머리색.옷색.모자.모자색.목도리[.목도리모양.목도리무늬]" 형식 (뒤 두 개는 나중에 추가, 없으면 기본값).
 * 값 자체는 화면이 확인하고 모르는 값은 기본값으로 그린다
 */
export function isLookKey(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && /^[a-z]+(\.[a-z]+){6,8}$/.test(value);
}

export interface SitMessage {
  /** 앉을 자리 id (자리를 클릭해서 걸어간 경우). 이 자리가 가까이 있어야 하고, 다른 자리로 대신 앉지 않는다 */
  seat: string;
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
  /** 관리자가 내보냄 (7-2) */
  kicked: 4002,
} as const;

/** 입장 거절 오류 메시지 (onAuth, HTTP 403). 관리자가 내보내면서 잠시 막은 계정 */
export const JOIN_ERROR_BANNED = "BANNED";

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
  /** 얼굴 (= 몸 그림 id). shared/character.ts FACES */
  face: string;
  outfit: string;
  /** SD 꾸미기 조합 (isLookKey). 2D 화면은 쓰지 않는다. 없으면 "" */
  look: string;
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
  /** 마지막 이모티콘 id. 보낸 적 없으면 "" */
  emote: string;
  /** 마지막 이모티콘을 보낸 서버 틱. 이 값이 바뀌면 새 이모티콘 (같은 것을 다시 보내도 구분됨) */
  emoteTick: number;
}

export interface HeldFoodView {
  /** Anatomical hand: "left" | "right". Stable even when the array is compacted. */
  hand: string;
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

/** 공원 동물 한 마리 (클라이언트가 읽는 형태) */
export interface AnimalView {
  kind: string;
  name: string;
  x: number;
  y: number;
  facing: Facing;
  /** shared CAT_ACTIONS */
  action: string;
  fx: string;
  fxTick: number;
}

/** 서버 상태 최상위 (클라이언트가 읽는 형태) */
export interface ParkStateView {
  /** 서버 틱 번호. tick * TICK_MS = 서버 시간(ms) */
  tick: number;
  players: Map<string, PlayerView>;
  /** 트럭 id → 트럭 상태 */
  trucks: Map<string, TruckView>;
  /** 동물 id → 동물 */
  animals: Map<string, AnimalView>;
  /** 채널 번호 (1부터, 화면 표시용) */
  channel: number;
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
  /** GET → ChannelListResponse (6-4) */
  channels: "/api/channels",
  /** GET → PublicStatsResponse. 화면의 '오늘의 공원' (7-3) */
  statsToday: "/api/stats/today",
  // 관리자 (7-2, 7-3). 헤더 x-admin-key: <ADMIN_KEY>
  /** POST AdminNoticeRequest → { channels } */
  adminNotice: "/api/admin/notice",
  /** POST AdminKickRequest → { kicked } */
  adminKick: "/api/admin/kick",
  /** GET ?days=7 → AdminStatsResponse */
  adminStats: "/api/admin/stats",
} as const;

/** 간식별 완성(받은) 개수 */
export interface SnackCount {
  item: string;
  count: number;
}

export interface PublicStatsResponse {
  /** 통계 날짜 (YYYY-MM-DD, 서버 STATS_TZ 기준) */
  day: string;
  /** 오늘 방문한 사람 수 (계정 기준, 중복 없음) */
  visitors: number;
  /** 오늘 인기 간식 (많은 순, 최대 3개) */
  topSnacks: SnackCount[];
}

export interface DayStats {
  day: string;
  visitors: number;
  /** 방문 횟수 (같은 사람이 여러 번 오면 여러 번) */
  visits: number;
  /** 평균 체류 시간 (초). 아직 있는 사람은 지금까지 */
  avgStaySec: number;
  /** 간식별 완성 개수 (많은 순) */
  snacks: SnackCount[];
}

export interface AdminStatsResponse {
  /** 지금 접속 중인 사람 (모든 채널) */
  online: number;
  /** 최근 날짜부터 */
  days: DayStats[];
}

export interface AdminNoticeRequest {
  text: string;
}

export interface AdminKickRequest {
  nickname: string;
  /** 다시 들어오지 못하게 막을 시간 (분, 0 = 내보내기만) */
  banMinutes?: number;
}

/** 채널 목록의 채널 하나 */
export interface ChannelInfo {
  /** 방 id (joinById 로 들어갈 때 씀) */
  id: string;
  /** 채널 번호 (1부터) */
  channel: number;
  players: number;
  max: number;
}

export interface ChannelListResponse {
  /** 채널 번호 순 */
  channels: ChannelInfo[];
}

export interface LoginRequest {
  nickname: string;
  pin: string;
  /** 캐릭터를 바꾸려면 셋 다 보낸다. 없으면 저장된 캐릭터 그대로 */
  gender?: Gender;
  face?: string;
  outfit?: string;
}

export interface SignupRequest {
  nickname: string;
  pin: string;
  gender: Gender;
  face: string;
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
