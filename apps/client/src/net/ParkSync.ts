import Phaser from "phaser";
import {
  CLOSE_CODE,
  DEFAULT_APPEARANCE,
  FACINGS,
  MSG,
  TICK_MS,
  isValidAppearance,
  type Appearance,
  type Facing,
  type InputMessage,
  type PlayerView,
  type Vec2,
} from "@park/shared";
import { CharacterView } from "../entities/CharacterView";
import { stateCallbacks, type ParkRoom } from "./connection";
import { ServerClock, SnapshotBuffer } from "./Interpolation";
import { LagSim } from "./LagSim";

export type NetStatus = "online" | "offline";

/** 연결이 끊긴 이유 (화면 안내 문구 선택용) */
export type LeaveReason = "duplicateLogin" | "disconnected";

export interface NetInfo {
  status: NetStatus;
  roomId: string;
  sessionId: string;
  players: number;
  /** 끊긴 경우 이유 */
  leaveReason?: LeaveReason;
  /** 끊긴 경우 웹소켓 종료 코드 (디버그용) */
  leaveCode?: number;
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
 * 입장한 채널의 입력 전송, 다른 사람 표시를 맡는다.
 * 채널 접속(로그인 토큰)은 입장 화면이 먼저 끝내고 room 을 넘겨 준다.
 * 연결이 끊겨도 혼자 걷기는 계속 동작한다.
 */
export class ParkSync {
  private status: NetStatus = "online";
  private leaveReason?: LeaveReason;
  private leaveCode?: number;
  private readonly remotes = new Map<string, Remote>();
  private readonly lag: LagSim;
  private readonly clock = new ServerClock();
  /** 내 캐릭터 서버 상태가 올 때마다 호출 (지연 흉내 적용 후) */
  onOwnState?: (state: OwnServerState, first: boolean) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: ParkRoom,
    lagMs: number,
  ) {
    this.lag = new LagSim(lagMs);
  }

  /** 상태 콜백을 건다. 이미 받은 상태(나·먼저 와 있던 사람)도 바로 onAdd 로 들어온다 */
  start(): void {
    const room = this.room;
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
        view: new CharacterView(this.scene, { x: player.x, y: player.y }, player.nickname, toAppearance(player)),
        buffer: new SnapshotBuffer(),
        latest: { x: player.x, y: player.y },
      };
      this.remotes.set(sessionId, remote);
      const push = () => {
        const snap = { t: room.state.tick * TICK_MS, x: player.x, y: player.y, facing: toFacing(player.facing), moving: player.moving };
        const appearance = toAppearance(player);
        this.lag.run(() => {
          remote.latest = { x: snap.x, y: snap.y };
          remote.buffer.push(snap);
          remote.view.setAppearance(appearance);
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
      this.leaveCode = code;
      this.leaveReason = code === CLOSE_CODE.duplicateLogin ? "duplicateLogin" : "disconnected";
      for (const r of this.remotes.values()) r.view.destroy();
      this.remotes.clear();
    });
  }

  sendInput(msg: InputMessage): void {
    if (this.status !== "online") return;
    this.lag.run(() => this.room.send(MSG.input, msg));
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
      roomId: this.room.roomId,
      sessionId: this.room.sessionId,
      players: this.remotes.size + 1,
      leaveReason: this.leaveReason,
      leaveCode: this.leaveCode,
      interpDelayMs: Math.round(this.clock.interpolationDelay),
    };
  }

  disconnect(): void {
    void this.room.leave();
  }
}

function toFacing(value: string): Facing {
  return (FACINGS as readonly string[]).includes(value) ? (value as Facing) : "down";
}

/** 서버가 보낸 외형. 모르는 값이면(옛 클라이언트 그림에 없는 옷 등) 기본값 */
function toAppearance(player: PlayerView): Appearance {
  const a = { gender: player.gender, outfit: player.outfit };
  return isValidAppearance(a) ? { gender: a.gender, outfit: a.outfit } : DEFAULT_APPEARANCE;
}
