import Phaser from "phaser";
import {
  CLOSE_CODE,
  DEFAULT_APPEARANCE,
  EMOTE_SHOW_MS,
  FACINGS,
  MSG,
  TICK_MS,
  readAppearance,
  type Appearance,
  type EatMessage,
  type EmoteMessage,
  type Facing,
  type InputMessage,
  type NoticeMessage,
  type PlayerView,
  type SitMessage,
  type TruckView,
  type Vec2,
  CAT_ACTIONS,
  CAT_FX,
  type AnimalView,
  type CatAction,
  type CatFx,
  type PetMessage,
} from "@park/shared";
import { CatView } from "../entities/CatView";
import { getSettings, isHidden } from "../settings";
import { CharacterView } from "../entities/CharacterView";
import { stateCallbacks, type ParkRoom } from "./connection";
import { ServerClock, SnapshotBuffer, type TimedPos } from "./Interpolation";
import { LagSim } from "./LagSim";

export type NetStatus = "online" | "offline";

/** 연결이 끊긴 이유 (화면 안내 문구 선택용) */
export type LeaveReason = "duplicateLogin" | "disconnected";

export interface NetInfo {
  status: NetStatus;
  roomId: string;
  /** 채널 번호 (1부터). 첫 상태를 받기 전에는 0 */
  channel: number;
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
  nickname: string;
}

/** 동물 한 마리의 상태 (서버 시간 기준으로 보간) */
interface AnimalSnap extends TimedPos {
  facing: Facing;
  action: CatAction;
  fx: string;
  fxTick: number;
}

interface Animal {
  view: CatView;
  buffer: SnapshotBuffer<AnimalSnap>;
  /** 이미 보여 준 효과의 fxTick (같은 효과를 두 번 보여 주지 않게) */
  shownFx: number;
}

/** 새 이모티콘이면 (id, 남은 표시 시간 ms). 이미 본 것이거나 표시 시간이 지났으면 null */
type EmoteWatcher = (player: PlayerView) => { id: string; remainingMs: number } | null;

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
  /** 동물 id → 그림 (5A-2) */
  private readonly animals = new Map<string, Animal>();
  private readonly lag: LagSim;
  private readonly clock = new ServerClock();
  /** 내 캐릭터 서버 상태가 올 때마다 호출 (지연 흉내 적용 후) */
  onOwnState?: (state: OwnServerState, first: boolean) => void;
  /** 서버가 나에게만 보낸 알림 (주문 결과 등) */
  onNotice?: (notice: NoticeMessage) => void;
  /** 내 이모티콘을 서버가 받아 줌 (remainingMs: 남은 표시 시간) */
  onOwnEmote?: (id: string, remainingMs: number) => void;
  /** 동물을 눌렀음 (쓰다듬기) */
  onAnimalTap?: (id: string) => void;
  /** 다른 사람 캐릭터를 눌렀음 (숨기기 메뉴, 6-6). pointer: 누른 화면 위치 */
  onPlayerTap?: (nickname: string, pointer: Phaser.Input.Pointer) => void;

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
        const emote = this.emoteWatcher();
        const emit = () => {
          const e = emote(player);
          if (e) this.lag.run(() => this.onOwnEmote?.(e.id, e.remainingMs));
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
        nickname: player.nickname,
      };
      remote.view.enableTap((pointer) => this.onPlayerTap?.(remote.nickname, pointer));
      remote.view.setHidden(isHidden(player.nickname));
      this.remotes.set(sessionId, remote);
      const emote = this.emoteWatcher();
      const push = () => {
        const e = emote(player);
        if (e) this.lag.run(() => remote.view.showEmote(e.id, e.remainingMs));
        const snap = {
          t: room.state.tick * TICK_MS,
          x: player.x,
          y: player.y,
          facing: toFacing(player.facing),
          moving: player.moving,
          seated: player.seatId !== "",
        };
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
    // 공원 동물: 다른 사람처럼 서버 시간 기준으로 보간. 효과(냐옹·골골 등)도 같은 시점에 보여 준다
    cb.onAdd("animals", (animal: AnimalView, id: string) => {
      const entry: Animal = {
        view: new CatView(this.scene, { x: animal.x, y: animal.y }, animal.name, () => this.onAnimalTap?.(id)),
        // 동물은 멈춰 있던 자리를 끼워 넣을 때도 상태를 그대로 둔다
        buffer: new SnapshotBuffer<AnimalSnap>((s) => s),
        // 들어오기 전에 있었던 효과는 보여 주지 않는다
        shownFx: animal.fxTick,
      };
      this.animals.set(id, entry);
      const push = () => {
        const snap: AnimalSnap = {
          t: room.state.tick * TICK_MS,
          x: animal.x,
          y: animal.y,
          facing: toFacing(animal.facing),
          action: toCatAction(animal.action),
          fx: animal.fx,
          fxTick: animal.fxTick,
        };
        this.lag.run(() => entry.buffer.push(snap));
      };
      push();
      cb.onChange(animal, push);
    });
    cb.onRemove("animals", (_animal: AnimalView, id: string) => {
      this.lag.run(() => {
        this.animals.get(id)?.view.destroy();
        this.animals.delete(id);
      });
    });
    cb.onRemove("players", (_player: PlayerView, sessionId: string) => {
      this.lag.run(() => {
        this.remotes.get(sessionId)?.view.destroy();
        this.remotes.delete(sessionId);
      });
    });

    room.onMessage(MSG.notice, (notice: NoticeMessage) => this.lag.run(() => this.onNotice?.(notice)));

    room.onLeave((code) => {
      this.status = "offline";
      this.leaveCode = code;
      this.leaveReason = code === CLOSE_CODE.duplicateLogin ? "duplicateLogin" : "disconnected";
      for (const r of this.remotes.values()) r.view.destroy();
      this.remotes.clear();
      for (const a of this.animals.values()) a.view.destroy();
      this.animals.clear();
    });
  }

  sendInput(msg: InputMessage): void {
    if (this.status !== "online") return;
    this.lag.run(() => this.room.send(MSG.input, msg));
  }

  sendOrder(truck: string, item: string): void {
    this.send(MSG.order, { truck, item });
  }

  sendCancelOrder(): void {
    this.send(MSG.cancelOrder);
  }

  /** hand: 먹을 손 번호. 없으면 서버가 아직 안 먹은 첫 번째를 고른다 */
  sendEat(hand?: number): void {
    this.send(MSG.eat, hand === undefined ? undefined : ({ hand } satisfies EatMessage));
  }

  sendEmote(emote: string): void {
    this.send(MSG.emote, { emote } satisfies EmoteMessage);
  }

  sendPet(animal: string): void {
    this.send(MSG.pet, { animal } satisfies PetMessage);
  }

  /** 화면에 보이는 위치 기준으로 range(px) 안의 가장 가까운 동물 */
  animalNear(pos: Vec2, range: number): { id: string; view: CatView } | undefined {
    let best: { id: string; view: CatView; d: number } | undefined;
    for (const [id, a] of this.animals) {
      const p = a.view.position;
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d <= range && (!best || d < best.d)) best = { id, view: a.view, d };
    }
    return best;
  }

  /** 동물의 화면 위치 (없으면 undefined) */
  animalPosition(id: string): Vec2 | undefined {
    return this.animals.get(id)?.view.position;
  }

  /** seat: 앉을 자리 id (자리를 클릭한 경우). 없으면 서버가 가까운 자리를 고른다 */
  sendSit(seat?: string): void {
    this.send(MSG.sit, seat === undefined ? undefined : ({ seat } satisfies SitMessage));
  }

  sendStand(): void {
    this.send(MSG.stand);
  }

  /**
   * 플레이어 한 명의 이모티콘 변화 감지 (5-4). emoteTick 이 바뀌면 새 이모티콘이다.
   * 늦게 들어와서 처음 받은 상태에 이미 지난 이모티콘이 있으면, 남은 시간만큼만 보여 준다
   */
  private emoteWatcher(): EmoteWatcher {
    let seen = 0;
    return (player) => {
      if (player.emoteTick === seen) return null;
      seen = player.emoteTick;
      const remainingMs = EMOTE_SHOW_MS - (this.room.state.tick - player.emoteTick) * TICK_MS;
      return player.emote && remainingMs > 0 ? { id: player.emote, remainingMs } : null;
    };
  }

  private send(type: string, payload?: unknown): void {
    if (this.status !== "online") return;
    this.lag.run(() => this.room.send(type, payload));
  }

  /** 내 캐릭터의 최신 서버 상태 (손·주문). 아직 없으면 undefined */
  get me(): PlayerView | undefined {
    return this.room.state.players?.get(this.room.sessionId);
  }

  /** 트럭 상태 (만드는 중·대기 인원) */
  truck(id: string): TruckView | undefined {
    return this.room.state.trucks?.get(id);
  }

  /** 서버가 마지막으로 보낸 틱 */
  get serverTick(): number {
    return this.room.state.tick ?? 0;
  }

  /** 매 프레임: 다른 사람을 서버 시간 기준으로 조금 과거 시점(보간 지연)으로 그린다 */
  render(now: number): void {
    const serverNow = this.clock.toServer(now);
    if (serverNow === null) return;
    const t = serverNow - this.clock.interpolationDelay;
    const { showNicknames } = getSettings();
    for (const [sessionId, r] of this.remotes) {
      r.view.setHidden(isHidden(r.nickname));
      r.view.setNameVisible(showNicknames);
      const s = r.buffer.sample(t);
      if (s) r.view.setPose(s, s.facing, s.moving, s.seated);
      // 손에 든 간식은 위치처럼 보간할 필요가 없어서 최신 상태를 그대로 그린다
      const hands = this.room.state.players?.get(sessionId)?.hands;
      if (hands) r.view.setHands(hands);
    }
    for (const a of this.animals.values()) {
      const s = a.buffer.sample(t);
      if (!s) continue;
      a.view.setPose(s, s.facing, s.action);
      if (s.fxTick > a.shownFx) {
        a.shownFx = s.fxTick;
        if ((CAT_FX as readonly string[]).includes(s.fx)) a.view.showFx(s.fx as CatFx);
      }
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
      channel: this.room.state.channel ?? 0,
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

function toCatAction(value: string): CatAction {
  return (CAT_ACTIONS as readonly string[]).includes(value) ? (value as CatAction) : "stand";
}

function toFacing(value: string): Facing {
  return (FACINGS as readonly string[]).includes(value) ? (value as Facing) : "down";
}

/** 서버가 보낸 외형. 모르는 값이면(옛 클라이언트 그림에 없는 옷 등) 기본값 */
function toAppearance(player: PlayerView): Appearance {
  return readAppearance(player) ?? DEFAULT_APPEARANCE;
}
