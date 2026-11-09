import { schema, t, type SchemaType } from "@colyseus/schema";

// 필드는 shared/protocol.ts 의 PlayerView 와 맞춘다
export const PlayerState = schema(
  {
    nickname: t.string(),
    x: t.number(),
    y: t.number(),
    facing: t.string(),
    moving: t.boolean(),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const ParkState = schema(
  {
    /** sessionId → 플레이어 */
    players: t.map(PlayerState),
  },
  "ParkState",
);
export type ParkState = SchemaType<typeof ParkState>;
