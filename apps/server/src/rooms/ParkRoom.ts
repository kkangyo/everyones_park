import { Room, type AuthContext, type Client } from "@colyseus/core";
import {
  CLOSE_CODE,
  HANDS_MAX,
  MSG,
  TICK_MS,
  TICK_SEC,
  facingFromInput,
  isBlockedTile,
  isMoving,
  step,
  tileCenter,
  tileOf,
  type AuthUser,
  type Axis,
  type Facing,
  type InputMessage,
  type NoticeMessage,
  type Vec2,
} from "@park/shared";
import { verifyToken } from "../auth/token";
import { config } from "../config";
import { createLogger } from "../logger";
import type { ParkMap } from "../map";
import { ParkState, PlayerState } from "../schema/ParkState";
import { CatSystem } from "../systems/cats";
import { EmoteSystem } from "../systems/emotes";
import { HandsSystem } from "../systems/hands";
import { SeatSystem } from "../systems/seats";
import { TruckSystem } from "../systems/truck";

const log = createLogger("room");

/**
 * 사람별 입력 대기열 최대 길이. 이보다 많이 쌓이면 (너무 빨리 보내거나 서버가 오래 멈춤) 오래된 것부터 버린다.
 * 10개 = 500ms 분량
 */
const MAX_QUEUED_INPUTS = 10;
/**
 * 입력 처리 몫(크레딧): 틱마다 사람별로 1씩 쌓이고, 입력 하나를 처리할 때 1씩 쓴다. 이만큼까지 모아 둘 수 있다.
 * 네트워크가 잠깐 막혔다가 입력이 한꺼번에 도착하면 모아 둔 몫으로 따라잡는다.
 * (틱당 1개만 처리하면 보내는 속도와 처리 속도가 같아서 한 번 쌓인 대기열이 영영 줄지 않는다)
 * 길게 보면 처리하는 입력 수가 틱 수를 넘지 않으므로 빨리 보내서 빨라지는 것은 막힌다
 */
const MAX_INPUT_CREDIT = MAX_QUEUED_INPUTS;
/** 밀린 입력을 따라잡을 때 한 틱에 한 사람의 입력을 최대 몇 개까지 처리하는지 */
const MAX_INPUTS_PER_TICK = 3;
/**
 * 타이머가 늦게 깨어났을 때 한 번에 몰아서 돌리는 최대 틱 수 (8틱 = 400ms).
 * 폰 서버는 부하에 따라 50ms 타이머가 수백 ms 씩 밀리는 일이 있다. 그보다 오래 멈추면 밀린 시간은 버린다
 */
const MAX_CATCHUP_TICKS = 8;
/** 입장 위치를 입구 주변으로 흩뿌리는 범위 (타일). 한 점에 겹쳐 서지 않게 */
const SPAWN_SPREAD_TILES = 3;

type ParkClient = Client<{ auth: AuthUser }>;

/**
 * userId → 지금 접속 중인 연결 (이 서버 프로세스 안의 모든 채널).
 * 같은 계정으로 다른 탭·기기에서 들어오면 이전 연결을 끊는다 (한 사람이 두 번 보이지 않게)
 */
const activeByUser = new Map<number, ParkClient>();

/** 지금 쓰고 있는 채널 번호 (이 서버 프로세스 안). 새 채널은 비어 있는 가장 작은 번호를 받는다 */
const usedChannelNumbers = new Set<number>();

function takeChannelNumber(): number {
  let n = 1;
  while (usedChannelNumbers.has(n)) n++;
  usedChannelNumbers.add(n);
  return n;
}

/** 채널 목록(GET /api/channels)이 읽는 매치메이킹 정보 */
export interface ParkRoomMetadata {
  channel: number;
}

/** 공원 채널 하나. 정원이 차면 매치메이킹이 새 방(채널)을 만든다 */
export class ParkRoom extends Room<{ state: ParkState; client: ParkClient; metadata: ParkRoomMetadata }> {
  state = new ParkState();
  private map!: ParkMap;
  private hands!: HandsSystem;
  private trucks!: TruckSystem;
  private seats!: SeatSystem;
  private emotes!: EmoteSystem;
  private cats!: CatSystem;
  /** sessionId → 아직 처리하지 않은 입력 */
  private readonly inputQueues = new Map<string, InputMessage[]>();
  /** sessionId → 입력 처리 몫 (MAX_INPUT_CREDIT 참고) */
  private readonly inputCredits = new Map<string, number>();
  private droppedInputs = 0;
  private tickAccMs = 0;
  private lastAdvanceAt = performance.now();

  onCreate(options: { map: ParkMap }): void {
    this.map = options.map;
    this.maxClients = config.maxClients;
    this.state.channel = takeChannelNumber();
    void this.setMetadata({ channel: this.state.channel });
    log.info(`channel ${this.state.channel} (${this.roomId}) created (max ${this.maxClients})`);

    // 서버 권위 이동: 클라이언트는 입력만 보내고, 위치는 서버가 같은 step() 으로 계산한다.
    // 입력은 받는 즉시 처리하지 않고 대기열에 넣었다가 고정 틱마다 하나씩 처리한다.
    // → 네트워크가 흔들려도 다른 사람 눈에 일정한 속도로 보이고, 빨리 보내도 빨라지지 않는다
    this.onMessage(MSG.input, (client, message: unknown) => this.queueInput(client, message));

    // 간식 트럭·양손 (Phase 4)
    this.hands = new HandsSystem(this.state);
    this.trucks = new TruckSystem(this.state, this.map.trucks, this.hands, (sessionId, msg) => this.notify(sessionId, msg));
    this.onMessage(MSG.order, (client, message: unknown) => this.trucks.order(client.sessionId, message));
    this.onMessage(MSG.cancelOrder, (client) => this.trucks.cancel(client.sessionId));
    this.onMessage(MSG.eat, (client, message: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (player) this.hands.startEating(player, this.state.tick, parseHand(message));
    });

    // 앉기·일어나기 (Phase 5)
    this.seats = new SeatSystem(this.state, this.map.seats, this.map.grid, (sessionId, msg) => this.notify(sessionId, msg));
    this.onMessage(MSG.sit, (client, message: unknown) => this.seats.sit(client.sessionId, parseSeat(message)));
    this.onMessage(MSG.stand, (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) this.seats.stand(player);
    });

    // 이모티콘 (5-4)
    this.emotes = new EmoteSystem(this.state);
    this.onMessage(MSG.emote, (client, message: unknown) => {
      const emote = this.emotes.emote(client.sessionId, message);
      if (emote) this.cats.onEmote(client.sessionId, emote);
    });

    // 공원 동물 (Phase 5A). 친밀도는 계정마다 기억한다 (서버를 다시 켜면 처음부터)
    this.cats = new CatSystem(this.state, this.map.animals, this.map.grid, (sessionId) => this.clients.get(sessionId)?.auth?.userId);
    this.onMessage(MSG.pet, (client, message: unknown) => {
      if (typeof message === "object" && message !== null) this.cats.pet(client.sessionId, (message as Record<string, unknown>).animal);
    });

    // 고정 틱 누산기: 타이머는 틱 간격의 절반마다 깨어나서, 실제로 흐른 시간만큼 틱을 돌린다.
    // (setInterval 만 믿으면 타이머가 밀릴 때 틱 수가 줄어 모두가 느려진다)
    this.lastAdvanceAt = performance.now();
    this.setSimulationInterval(() => this.advance(), TICK_MS / 2);
    // 상태 전송도 틱 직후에 직접 한다. 별도 타이머로 보내면 틱과 어긋나 다른 사람 움직임이 튄다
    this.patchRate = null;
  }

  /**
   * 입장 전 인증 (3-5). POST /api/login 이 발급한 토큰만 받는다. 실패하면 클라이언트 joinOrCreate 가 오류로 끝난다.
   * 돌려준 값은 onJoin 에서 client.auth 로 읽는다
   */
  static async onAuth(token: string | undefined, _options: unknown, context: AuthContext): Promise<AuthUser | null> {
    const user = verifyToken(token);
    if (!user) log.info(`auth rejected from ${context.ip ?? "?"}`);
    return user;
  }

  onJoin(client: ParkClient): void {
    const auth = client.auth!; // onAuth 를 통과해야 여기 온다
    const previous = activeByUser.get(auth.userId);
    if (previous) {
      log.info(`duplicate login #${auth.userId} "${auth.nickname}": closing previous ${previous.sessionId}`);
      previous.leave(CLOSE_CODE.duplicateLogin);
    }
    activeByUser.set(auth.userId, client);

    const player = new PlayerState();
    const spawn = this.pickSpawn();
    player.nickname = auth.nickname;
    player.gender = auth.gender;
    player.face = auth.face;
    player.outfit = auth.outfit;
    player.x = spawn.x;
    player.y = spawn.y;
    player.facing = "down";
    player.moving = false;
    player.seq = 0;
    player.seatId = "";
    player.seatSlot = 0;
    player.emote = "";
    player.emoteTick = 0;
    this.state.players.set(client.sessionId, player);
    this.inputQueues.set(client.sessionId, []);
    this.inputCredits.set(client.sessionId, 0);
    log.info(`join  ${this.roomId} ${client.sessionId} "${player.nickname}" (${this.clients.length}/${this.maxClients})`);
  }

  onLeave(client: ParkClient): void {
    const userId = client.auth?.userId;
    if (userId !== undefined && activeByUser.get(userId) === client) activeByUser.delete(userId);
    this.trucks.cancel(client.sessionId);
    this.cats.onLeave(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.inputQueues.delete(client.sessionId);
    this.inputCredits.delete(client.sessionId);
    log.info(`leave ${this.roomId} ${client.sessionId} "${player?.nickname ?? "?"}" (${this.clients.length}/${this.maxClients})`);
  }

  onDispose(): void {
    usedChannelNumbers.delete(this.state.channel);
    log.info(`channel ${this.state.channel} (${this.roomId}) disposed (dropped inputs: ${this.droppedInputs})`);
  }

  private queueInput(client: ParkClient, message: unknown): void {
    const player = this.state.players.get(client.sessionId);
    const queue = this.inputQueues.get(client.sessionId);
    const input = parseInput(message);
    if (!player || !queue || !input) return;
    const lastSeq = queue[queue.length - 1]?.seq ?? player.seq;
    if (input.seq <= lastSeq) return; // 이미 받았거나 순서가 뒤바뀐 입력

    queue.push(input);
    if (queue.length > MAX_QUEUED_INPUTS) {
      queue.shift(); // 클라이언트는 다음 상태에서 서버 위치로 보정된다
      this.droppedInputs++;
      log.debug(`drop input ${client.sessionId} (queue full)`);
    }
  }

  private advance(): void {
    const now = performance.now();
    this.tickAccMs += now - this.lastAdvanceAt;
    this.lastAdvanceAt = now;
    let ticks = 0;
    while (this.tickAccMs >= TICK_MS && ticks < MAX_CATCHUP_TICKS) {
      this.tickAccMs -= TICK_MS;
      this.tick();
      ticks++;
    }
    if (this.tickAccMs >= TICK_MS) {
      log.warn(`channel ${this.roomId} stalled, skipping ${Math.round(this.tickAccMs)}ms`);
      this.tickAccMs = 0;
    }
    if (ticks > 0) this.broadcastPatch();
  }

  /** 고정 틱 한 번: 사람마다 입력을 처리 (보통 하나, 밀렸으면 모아 둔 몫만큼 최대 MAX_INPUTS_PER_TICK 개) */
  private tick(): void {
    this.state.tick++;
    for (const [sessionId, queue] of this.inputQueues) {
      const player = this.state.players.get(sessionId);
      if (!player) continue;
      let credit = Math.min((this.inputCredits.get(sessionId) ?? 0) + 1, MAX_INPUT_CREDIT);
      for (let n = 0; n < MAX_INPUTS_PER_TICK && credit >= 1 && queue.length > 0; n++) {
        this.applyInput(sessionId, player, queue.shift()!);
        credit--;
      }
      this.inputCredits.set(sessionId, credit);
    }
    this.trucks.tick(this.state.tick);
    this.hands.tick(this.state.tick);
    this.cats.tick(this.state.tick);
  }

  /** 한 사람에게만 보내는 알림 (주문 결과 등) */
  private notify(sessionId: string, msg: NoticeMessage): void {
    this.clients.get(sessionId)?.send(MSG.notice, msg);
  }

  private applyInput(sessionId: string, player: PlayerState, input: InputMessage): void {
    if (this.seats.isSeated(player)) {
      // 앉아 있을 때 이동 입력이 오면 일어나기만 하고 이번 입력의 이동은 버린다
      // (클라이언트는 앉아 있는 동안 이동 입력 대신 stand 를 보내므로 보통은 오지 않음)
      if (isMoving(input)) this.seats.stand(player);
      player.seq = input.seq;
      return;
    }
    const prev = { x: player.x, y: player.y };
    const next = step(prev, input, TICK_SEC, this.map.grid, this.othersOf(sessionId));
    player.x = next.x;
    player.y = next.y;
    player.facing = facingFromInput(input, player.facing as Facing);
    player.moving = isMoving(input) && (next.x !== prev.x || next.y !== prev.y);
    player.seq = input.seq;
  }

  /** 발밑 충돌(2-6) 대상: 나를 뺀 모든 캐릭터 위치 */
  private othersOf(sessionId: string): Vec2[] {
    const others: Vec2[] = [];
    this.state.players.forEach((p, id) => {
      if (id !== sessionId) others.push({ x: p.x, y: p.y });
    });
    return others;
  }

  /** 입구 주변에서 막히지 않고 다른 사람이 서 있지 않은 칸 가운데 하나 */
  private pickSpawn(): Vec2 {
    const { grid, entrance } = this.map;
    const base = tileOf(entrance, grid.tileSize);
    const occupied = this.othersOf("");
    for (let attempt = 0; attempt < 30; attempt++) {
      const col = base.col + Math.round((Math.random() * 2 - 1) * SPAWN_SPREAD_TILES);
      const row = base.row + Math.round((Math.random() * 2 - 1) * SPAWN_SPREAD_TILES);
      const spot = tileCenter({ col, row }, grid.tileSize);
      const taken = occupied.some((o) => Math.abs(o.x - spot.x) < grid.tileSize && Math.abs(o.y - spot.y) < grid.tileSize);
      if (!isBlockedTile(grid, col, row) && !taken) return spot;
    }
    return entrance; // 다 차 있으면 겹쳐서 입장 (서로 떨어져 나갈 수 있음)
  }
}

/** 먹기 메시지의 손 번호. 없거나 틀리면 undefined (= 아직 안 먹은 첫 번째) */
function parseHand(message: unknown): number | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const { hand } = message as Record<string, unknown>;
  return typeof hand === "number" && Number.isInteger(hand) && hand >= 0 && hand < HANDS_MAX ? hand : undefined;
}

/** 앉기 메시지의 자리 id. 없거나 틀리면 undefined (= 가까운 자리) */
function parseSeat(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const { seat } = message as Record<string, unknown>;
  return typeof seat === "string" && seat.length > 0 && seat.length <= 64 ? seat : undefined;
}

const AXES: readonly number[] = [-1, 0, 1];

/** 클라이언트가 보낸 값은 믿지 않는다. 형식이 틀리면 무시 */
function parseInput(message: unknown): InputMessage | null {
  if (typeof message !== "object" || message === null) return null;
  const { seq, x, y } = message as Record<string, unknown>;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 1 || seq > 0xffffffff) return null;
  if (typeof x !== "number" || typeof y !== "number" || !AXES.includes(x) || !AXES.includes(y)) return null;
  return { seq, x: x as Axis, y: y as Axis };
}
