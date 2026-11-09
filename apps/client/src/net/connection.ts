import { Callbacks, Client, type Room } from "@colyseus/sdk";
import { COLYSEUS_PATH, NICKNAME_MAX_LENGTH, ROOM_NAME, type JoinOptions, type PlayerView } from "@park/shared";

/** 서버 상태 중 클라이언트가 읽는 부분 */
export interface ParkStateView {
  players: Map<string, PlayerView>;
}

export type ParkRoom = Room<any, ParkStateView>;

/** 같은 주소(개발: Vite, 운영: Caddy)의 /colyseus 로 접속한다 */
const client = new Client(COLYSEUS_PATH);

export async function joinPark(options: JoinOptions): Promise<ParkRoom> {
  return (await client.joinOrCreate(ROOM_NAME, options)) as ParkRoom;
}

/**
 * 상태 변경 콜백 중 실제로 쓰는 것만 타입을 붙인다.
 * (SDK 타입 추론은 서버 Schema 클래스가 있어야 동작하는데, 클라이언트는 서버 코드를 import 하지 않는다)
 */
export interface ParkStateCallbacks {
  onAdd(collection: "players", handler: (player: PlayerView, sessionId: string) => void): () => void;
  onRemove(collection: "players", handler: (player: PlayerView, sessionId: string) => void): () => void;
  onChange(instance: PlayerView, handler: () => void): () => void;
}

export function stateCallbacks(room: ParkRoom): ParkStateCallbacks {
  return Callbacks.get(room as any) as unknown as ParkStateCallbacks;
}

/** 3단계 계정 기능 전까지 쓰는 임시 닉네임. ?name=홍길동 으로 지정할 수 있다 */
export function tempNickname(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("name")?.trim();
  if (fromUrl) return fromUrl.slice(0, NICKNAME_MAX_LENGTH);
  return `손님${Math.floor(1000 + Math.random() * 9000)}`;
}
