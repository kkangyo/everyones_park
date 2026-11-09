import { Room, type Client } from "@colyseus/core";
import { FACINGS, MSG, NICKNAME_MAX_LENGTH, type Facing, type JoinOptions, type MoveMessage } from "@park/shared";
import { config } from "../config";
import { createLogger } from "../logger";
import type { ParkMap } from "../map";
import { ParkState, PlayerState } from "../schema/ParkState";

const log = createLogger("room");

/** 공원 채널 하나. 정원이 차면 매치메이킹이 새 방(채널)을 만든다 */
export class ParkRoom extends Room<{ state: ParkState }> {
  state = new ParkState();
  private map!: ParkMap;

  onCreate(options: { map: ParkMap }): void {
    this.map = options.map;
    this.maxClients = config.maxClients;
    log.info(`channel ${this.roomId} created (max ${this.maxClients})`);

    // 2-2 임시: 클라이언트가 보낸 위치를 그대로 반영. 2-3에서 서버가 입력으로 직접 계산하도록 바뀜
    this.onMessage(MSG.move, (client, message: unknown) => {
      const player = this.state.players.get(client.sessionId);
      const move = parseMove(message, this.map);
      if (!player || !move) return;
      player.x = move.x;
      player.y = move.y;
      player.facing = move.facing;
      player.moving = move.moving;
    });
  }

  onJoin(client: Client, options?: JoinOptions): void {
    const player = new PlayerState();
    player.nickname = sanitizeNickname(options?.nickname);
    player.x = this.map.entrance.x;
    player.y = this.map.entrance.y;
    player.facing = "down";
    player.moving = false;
    this.state.players.set(client.sessionId, player);
    log.info(`join  ${this.roomId} ${client.sessionId} "${player.nickname}" (${this.clients.length}/${this.maxClients})`);
  }

  onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    log.info(`leave ${this.roomId} ${client.sessionId} "${player?.nickname ?? "?"}" (${this.clients.length}/${this.maxClients})`);
  }

  onDispose(): void {
    log.info(`channel ${this.roomId} disposed`);
  }
}

function sanitizeNickname(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().slice(0, NICKNAME_MAX_LENGTH) : "";
  return name || `손님${Math.floor(1000 + Math.random() * 9000)}`;
}

/** 클라이언트가 보낸 값은 믿지 않는다. 형식이 틀리거나 맵 밖이면 무시 */
function parseMove(message: unknown, map: ParkMap): MoveMessage | null {
  if (typeof message !== "object" || message === null) return null;
  const { x, y, facing, moving } = message as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x > map.widthPx || y > map.heightPx) return null;
  if (typeof facing !== "string" || !FACINGS.includes(facing as Facing)) return null;
  if (typeof moving !== "boolean") return null;
  return { x, y, facing: facing as Facing, moving };
}
