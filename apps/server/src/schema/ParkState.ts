import { schema, t, type SchemaType } from "@colyseus/schema";

// 필드는 shared/protocol.ts 의 PlayerView, HeldFoodView, TruckView, ParkStateView 와 맞춘다.
// schema() 의 기본 필드는 기본값이 없으면 undefined 로 시작한다 (undefined++ → NaN). 반드시 .default() 를 준다.

/** 손에 든 간식 하나 (4-4) */
export const HeldFoodState = schema(
  {
    item: t.string().default(""),
    /** Character's anatomical hand. Assigned by HandsSystem.give, never by array index. */
    hand: t.string().default("right"),
    /** 먹는 그림 단계 (0 ~ EAT_STAGES-1) */
    stage: t.uint8().default(0),
    eating: t.boolean().default(false),
  },
  "HeldFoodState",
);
export type HeldFoodState = SchemaType<typeof HeldFoodState>;

export const PlayerState = schema(
  {
    nickname: t.string().default(""),
    /** 캐릭터 외형 (3-7). shared/character.ts 의 GENDERS, OUTFITS 값 */
    gender: t.string().default("male"),
    /** 얼굴 = 몸 그림 id (shared FACES) */
    face: t.string().default("male-handsome"),
    outfit: t.string().default(""),
    // 위치는 float64 로 보낸다. number 는 소수를 float32 로 줄여 보내서
    // 클라이언트 예측 보정(서버 위치 + 남은 입력 재적용)이 미세하게 어긋난다
    x: t.float64().default(0),
    y: t.float64().default(0),
    facing: t.string().default("down"),
    moving: t.boolean().default(false),
    /** 마지막으로 처리한 입력 번호 */
    seq: t.uint32().default(0),
    /** 양손 (최대 HANDS_MAX) */
    hands: t.array(HeldFoodState),
    /** 주문 (4-3). 없으면 orderTruck = "" */
    orderTruck: t.string().default(""),
    orderItem: t.string().default(""),
    /** 0 = 만드는 중, 1 = 다음 차례 … */
    orderQueuePos: t.uint8().default(0),
    /** 앉은 자리 (5-2). 서 있으면 seatId = "" */
    seatId: t.string().default(""),
    seatSlot: t.uint8().default(0),
    /** 마지막 이모티콘 (5-4). 보낸 적 없으면 emote = "", emoteTick = 0 */
    emote: t.string().default(""),
    emoteTick: t.uint32().default(0),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

/** 트럭 하나의 공개 상태 (연기 연출, 대기 인원 표시) */
export const TruckState = schema(
  {
    cookingItem: t.string().default(""),
    readyTick: t.uint32().default(0),
    waiting: t.uint8().default(0),
  },
  "TruckState",
);
export type TruckState = SchemaType<typeof TruckState>;

/**
 * 공원 동물 하나 (5A-2). 움직임·행동은 서버가 정하고, 클라이언트는 보간해서 그린다.
 * 위치는 사람처럼 예측·보정하지 않으므로 number(float32) 로 충분하다
 */
export const AnimalState = schema(
  {
    kind: t.string().default("cat"),
    name: t.string().default(""),
    x: t.number().default(0),
    y: t.number().default(0),
    facing: t.string().default("down"),
    /** shared CAT_ACTIONS */
    action: t.string().default("stand"),
    /** 한 번 보여 주는 효과 (shared CAT_FX). fxTick 이 바뀌면 새 효과 */
    fx: t.string().default(""),
    fxTick: t.uint32().default(0),
  },
  "AnimalState",
);
export type AnimalState = SchemaType<typeof AnimalState>;

export const ParkState = schema(
  {
    /** 서버 틱 번호. 클라이언트가 다른 사람 위치를 서버 시간 기준으로 보간하는 데 쓴다 */
    tick: t.uint32().default(0),
    /** sessionId → 플레이어 */
    players: t.map(PlayerState),
    /** 트럭 id → 트럭 */
    trucks: t.map(TruckState),
    /** 동물 id → 동물 (맵 animals 레이어) */
    animals: t.map(AnimalState),
  },
  "ParkState",
);
export type ParkState = SchemaType<typeof ParkState>;
