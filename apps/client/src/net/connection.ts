import { Callbacks, Client, type Room } from "@colyseus/sdk";
import { COLYSEUS_PATH, ROOM_NAME, type ParkStateView, type PlayerView } from "@park/shared";

export type ParkRoom = Room<any, ParkStateView>;

/** 같은 주소(개발: Vite, 운영: Caddy)의 /colyseus 로 접속한다 */
const client = new Client(COLYSEUS_PATH);

/** 로그인(POST /api/login)으로 받은 토큰으로 채널에 들어간다. 서버 onAuth 가 토큰을 검증한다 */
export async function joinPark(token: string): Promise<ParkRoom> {
  client.auth.token = token;
  return (await client.joinOrCreate(ROOM_NAME, {})) as ParkRoom;
}

/**
 * 상태 변경 콜백 중 실제로 쓰는 것만 타입을 붙인다.
 * (SDK 타입 추론은 서버 Schema 클래스가 있어야 동작하는데, 클라이언트는 서버 코드를 import 하지 않는다)
 */
export interface ParkStateCallbacks {
  listen(property: "tick", handler: (value: number, previous: number) => void): () => void;
  onAdd(collection: "players", handler: (player: PlayerView, sessionId: string) => void): () => void;
  onRemove(collection: "players", handler: (player: PlayerView, sessionId: string) => void): () => void;
  onChange(instance: PlayerView, handler: () => void): () => void;
}

export function stateCallbacks(room: ParkRoom): ParkStateCallbacks {
  return Callbacks.get(room as any) as unknown as ParkStateCallbacks;
}
