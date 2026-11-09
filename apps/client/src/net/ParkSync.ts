import Phaser from "phaser";
import { FACINGS, MSG, type Facing, type MoveMessage, type PlayerView, type Vec2 } from "@park/shared";
import { CharacterView } from "../entities/CharacterView";
import { joinPark, stateCallbacks, type ParkRoom } from "./connection";

/** 내 위치를 서버로 보내는 간격 (2-2 임시. 2-3에서 입력 전송으로 바뀜) */
const SEND_INTERVAL_MS = 100;

export type NetStatus = "connecting" | "online" | "offline";

export interface NetInfo {
  status: NetStatus;
  roomId?: string;
  sessionId?: string;
  players: number;
  error?: string;
}

/**
 * 채널 접속과 다른 사람 표시를 맡는다.
 * 서버에 연결하지 못해도 혼자 걷기는 계속 동작한다.
 */
export class ParkSync {
  private room?: ParkRoom;
  private status: NetStatus = "connecting";
  private error?: string;
  private readonly others = new Map<string, CharacterView>();
  private lastSentAt = 0;
  private lastSent?: MoveMessage;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly nickname: string,
  ) {}

  async connect(): Promise<void> {
    try {
      this.room = await joinPark({ nickname: this.nickname });
    } catch (err) {
      this.status = "offline";
      this.error = err instanceof Error ? err.message : String(err);
      console.warn("[net] 채널 접속 실패", err);
      return;
    }
    const room = this.room;
    this.status = "online";
    console.info(`[net] 채널 ${room.roomId} 접속 (${room.sessionId})`);

    const cb = stateCallbacks(room);
    cb.onAdd("players", (player: PlayerView, sessionId: string) => {
      if (sessionId === room.sessionId) return; // 내 캐릭터는 직접 그린다
      const view = new CharacterView(this.scene, { x: player.x, y: player.y }, player.nickname);
      view.setPose({ x: player.x, y: player.y }, toFacing(player.facing), player.moving);
      this.others.set(sessionId, view);
      // 2-2: 받은 위치를 그대로 반영 (끊겨 보일 수 있음). 2-4에서 보간으로 부드럽게
      cb.onChange(player, () => view.setPose({ x: player.x, y: player.y }, toFacing(player.facing), player.moving));
    });
    cb.onRemove("players", (_player: PlayerView, sessionId: string) => {
      this.others.get(sessionId)?.destroy();
      this.others.delete(sessionId);
    });

    room.onLeave((code) => {
      this.status = "offline";
      this.error = `연결 끊김 (code ${code})`;
      for (const view of this.others.values()) view.destroy();
      this.others.clear();
    });
  }

  /** 매 프레임 호출. 바뀐 내용이 있을 때만 일정 간격으로 보낸다 */
  sendLocalPose(pos: Vec2, facing: Facing, moving: boolean, now: number): void {
    if (!this.room || this.status !== "online") return;
    if (now - this.lastSentAt < SEND_INTERVAL_MS) return;
    const msg: MoveMessage = { x: Math.round(pos.x * 100) / 100, y: Math.round(pos.y * 100) / 100, facing, moving };
    const prev = this.lastSent;
    if (prev && prev.x === msg.x && prev.y === msg.y && prev.facing === msg.facing && prev.moving === msg.moving) return;
    this.room.send(MSG.move, msg);
    this.lastSent = msg;
    this.lastSentAt = now;
  }

  get info(): NetInfo {
    return {
      status: this.status,
      roomId: this.room?.roomId,
      sessionId: this.room?.sessionId,
      players: this.room ? this.others.size + 1 : 0,
      error: this.error,
    };
  }

  disconnect(): void {
    void this.room?.leave();
  }
}

function toFacing(value: string): Facing {
  return (FACINGS as readonly string[]).includes(value) ? (value as Facing) : "down";
}
