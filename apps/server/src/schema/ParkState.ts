import { schema, t, type SchemaType } from "@colyseus/schema";

// 필드는 shared/protocol.ts 의 PlayerView, ParkStateView 와 맞춘다.
// schema() 의 기본 필드는 기본값이 없으면 undefined 로 시작한다 (undefined++ → NaN). 반드시 .default() 를 준다.
export const PlayerState = schema(
  {
    nickname: t.string().default(""),
    // 위치는 float64 로 보낸다. number 는 소수를 float32 로 줄여 보내서
    // 클라이언트 예측 보정(서버 위치 + 남은 입력 재적용)이 미세하게 어긋난다
    x: t.float64().default(0),
    y: t.float64().default(0),
    facing: t.string().default("down"),
    moving: t.boolean().default(false),
    /** 마지막으로 처리한 입력 번호 */
    seq: t.uint32().default(0),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const ParkState = schema(
  {
    /** 서버 틱 번호. 클라이언트가 다른 사람 위치를 서버 시간 기준으로 보간하는 데 쓴다 */
    tick: t.uint32().default(0),
    /** sessionId → 플레이어 */
    players: t.map(PlayerState),
  },
  "ParkState",
);
export type ParkState = SchemaType<typeof ParkState>;
