import Phaser from "phaser";
import { FACINGS, MSG, TICK_MS, type Facing, type InputMessage, type PlayerView, type Vec2 } from "@park/shared";
import { CharacterView } from "../entities/CharacterView";
import { joinPark, stateCallbacks, type ParkRoom } from "./connection";
import { ServerClock, SnapshotBuffer } from "./Interpolation";
import { LagSim } from "./LagSim";

export type NetStatus = "connecting" | "online" | "offline";

export interface NetInfo {
  status: NetStatus;
  roomId?: string;
  sessionId?: string;
  players: number;
  error?: string;
  /** 다른 사람을 보여주는 지연 (ms). 네트워크 흔들림에 따라 자동 조절 */
  interpDelayMs: number;
}

/** 서버가 확인해 준 내 캐릭터 상태 */
export interface OwnServerState {
  pos: Vec2;
  seq: number;
}

interface Remote {
  view: CharacterView;
  buffer: SnapshotBuffer;
  /** 가장 최근에 받은 서버 위치 (보간 전). 2-6 발밑 충돌 예측에 쓴다 */
  latest: Vec2;
}

/**
 * 채널 접속, 입력 전송, 다른 사람 표시를 맡는다.
 * 서버에 연결하지 못해도 혼자 걷기는 계속 동작한다.
 */
export class ParkSync {
  private room?: ParkRoom;
  private status: NetStatus = "connecting";
  private error?: string;
  private readonly remotes = new Map<string, Remote>();
  private readonly lag: LagSim;
  private readonly clock = new ServerClock();
  /** 내 캐릭터 서버 상태가 올 때마다 호출 (지연 흉내 적용 후) */
  onOwnState?: (state: OwnServerState, first: boolean) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly nickname: string,
    lagMs: number,
  ) {
    this.lag = new LagSim(lagMs);
  }

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
      if (sessionId === room.sessionId) {
        let first = true;
        const emit = () => {
          // 콜백 시점의 값을 복사해 두고 지연 후 전달 (그 사이 값이 바뀌어도 그때 받은 값으로)
          const state: OwnServerState = { pos: { x: player.x, y: player.y }, seq: player.seq };
          const isFirst = first;
          first = false;
          this.lag.run(() => this.onOwnState?.(state, isFirst));
        };
        emit();
        cb.onChange(player, emit);
        return;
      }

      const remote: Remote = {
        view: new CharacterView(this.scene, { x: player.x, y: player.y }, player.nickname),
        buffer: new SnapshotBuffer(),
        latest: { x: player.x, y: player.y },
      };
      this.remotes.set(sessionId, remote);
      const push = () => {
        const snap = { t: room.state.tick * TICK_MS, x: player.x, y: player.y, facing: toFacing(player.facing), moving: player.moving };
        this.lag.run(() => {
          remote.latest = { x: snap.x, y: snap.y };
          remote.buffer.push(snap);
        });
      };
      push();
      cb.onChange(player, push);
    });
    // 매 틱 도착 시각으로 서버 시계를 맞춘다 (다른 사람 보간 기준)
    cb.listen("tick", (tick: number) => {
      const serverTime = tick * TICK_MS;
      this.lag.run(() => this.clock.observe(serverTime, performance.now()));
    });
    cb.onRemove("players", (_player: PlayerView, sessionId: string) => {
      this.lag.run(() => {
        this.remotes.get(sessionId)?.view.destroy();
        this.remotes.delete(sessionId);
      });
    });

    room.onLeave((code) => {
      this.status = "offline";
      this.error = `연결 끊김 (code ${code})`;
      for (const r of this.remotes.values()) r.view.destroy();
      this.remotes.clear();
    });
  }

  sendInput(msg: InputMessage): void {
    const room = this.room;
    if (!room || this.status !== "online") return;
    this.lag.run(() => room.send(MSG.input, msg));
  }

  /** 매 프레임: 다른 사람을 서버 시간 기준으로 조금 과거 시점(보간 지연)으로 그린다 */
  render(now: number): void {
    const serverNow = this.clock.toServer(now);
    if (serverNow === null) return;
    const t = serverNow - this.clock.interpolationDelay;
    for (const r of this.remotes.values()) {
      const s = r.buffer.sample(t);
      if (s) r.view.setPose(s, s.facing, s.moving);
    }
  }

  /** 다른 사람들의 최신 서버 위치 (발밑 충돌 예측용) */
  othersLatest(): Vec2[] {
    return [...this.remotes.values()].map((r) => r.latest);
  }

  get online(): boolean {
    return this.status === "online";
  }

  get info(): NetInfo {
    return {
      status: this.status,
      roomId: this.room?.roomId,
      sessionId: this.room?.sessionId,
      players: this.room ? this.remotes.size + 1 : 0,
      error: this.error,
      interpDelayMs: Math.round(this.clock.interpolationDelay),
    };
  }

  disconnect(): void {
    void this.room?.leave();
  }
}

function toFacing(value: string): Facing {
  return (FACINGS as readonly string[]).includes(value) ? (value as Facing) : "down";
}
