import { EMOTE_BY_ID, EMOTE_COOLDOWN_SEC, TICK_RATE } from "@park/shared";
import { createLogger } from "../logger";
import type { ParkState } from "../schema/ParkState";

const log = createLogger("emote");

const COOLDOWN_TICKS = EMOTE_COOLDOWN_SEC * TICK_RATE;

/**
 * 이모티콘 (5-4). 받으면 PlayerState.emote·emoteTick 에 적고, 클라이언트는 emoteTick 이 바뀌면 머리 위에 띄운다.
 * 쿨다운 안에 다시 오면 (연타·조작한 클라이언트) 조용히 버린다
 */
export class EmoteSystem {
  constructor(private readonly state: ParkState) {}

  /** 받아 준 이모티콘 id. 형식이 틀렸거나 쿨다운이면 null */
  emote(sessionId: string, message: unknown): string | null {
    const player = this.state.players.get(sessionId);
    const id = parseEmote(message);
    if (!player || !id) return null;
    const tick = this.state.tick;
    if (player.emoteTick > 0 && tick - player.emoteTick < COOLDOWN_TICKS) {
      log.debug(`cooldown ${sessionId} ${id} (${tick - player.emoteTick}/${COOLDOWN_TICKS} ticks)`);
      return null;
    }
    player.emote = id;
    player.emoteTick = tick;
    log.debug(`emote ${sessionId} ${id}`);
    return id;
  }
}

/** 이모티콘 메시지의 id. 모르는 id 면 null */
function parseEmote(message: unknown): string | null {
  if (typeof message !== "object" || message === null) return null;
  const { emote } = message as Record<string, unknown>;
  return typeof emote === "string" && EMOTE_BY_ID.has(emote) ? emote : null;
}
