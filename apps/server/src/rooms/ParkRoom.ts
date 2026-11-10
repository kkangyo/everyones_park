import { Room, type AuthContext, type Client } from "@colyseus/core";
import {
  CLOSE_CODE,
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
  type Vec2,
} from "@park/shared";
import { verifyToken } from "../auth/token";
import { config } from "../config";
import { createLogger } from "../logger";
import type { ParkMap } from "../map";
import { ParkState, PlayerState } from "../schema/ParkState";

const log = createLogger("room");

/**
 * 사람별 입력 대기열 최대 길이. 틱마다 하나씩만 처리하므로 이보다 많이 쌓이면
 * (너무 빨리 보내거나 지연이 커짐) 오래된 것부터 버린다. 10개 = 500ms 분량
 */
const MAX_QUEUED_INPUTS = 10;
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

/** 공원 채널 하나. 정원이 차면 매치메이킹이 새 방(채널)을 만든다 */
export class ParkRoom extends Room<{ state: ParkState; client: ParkClient }> {
  state = new ParkState();
  private map!: ParkMap;
  /** sessionId → 아직 처리하지 않은 입력 */
  private readonly inputQueues = new Map<string, InputMessage[]>();
  private droppedInputs = 0;
  private tickAccMs = 0;
  private lastAdvanceAt = performance.now();

  onCreate(options: { map: ParkMap }): void {
    this.map = options.map;
    this.maxClients = config.maxClients;
    log.info(`channel ${this.roomId} created (max ${this.maxClients})`);

    // 서버 권위 이동: 클라이언트는 입력만 보내고, 위치는 서버가 같은 step() 으로 계산한다.
    // 입력은 받는 즉시 처리하지 않고 대기열에 넣었다가 고정 틱마다 하나씩 처리한다.
    // → 네트워크가 흔들려도 다른 사람 눈에 일정한 속도로 보이고, 빨리 보내도 빨라지지 않는다
    this.onMessage(MSG.input, (client, message: unknown) => this.queueInput(client, message));
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
    player.outfit = auth.outfit;
    player.x = spawn.x;
    player.y = spawn.y;
    player.facing = "down";
    player.moving = false;
    player.seq = 0;
    this.state.players.set(client.sessionId, player);
    this.inputQueues.set(client.sessionId, []);
    log.info(`join  ${this.roomId} ${client.sessionId} "${player.nickname}" (${this.clients.length}/${this.maxClients})`);
  }

  onLeave(client: ParkClient): void {
    const userId = client.auth?.userId;
    if (userId !== undefined && activeByUser.get(userId) === client) activeByUser.delete(userId);
    const player = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.inputQueues.delete(client.sessionId);
    log.info(`leave ${this.roomId} ${client.sessionId} "${player?.nickname ?? "?"}" (${this.clients.length}/${this.maxClients})`);
  }

  onDispose(): void {
    log.info(`channel ${this.roomId} disposed (dropped inputs: ${this.droppedInputs})`);
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

  /** 고정 틱 한 번: 사람마다 입력을 하나씩 처리 */
  private tick(): void {
    this.state.tick++;
    for (const [sessionId, queue] of this.inputQueues) {
      const input = queue.shift();
      const player = this.state.players.get(sessionId);
      if (input && player) this.applyInput(sessionId, player, input);
    }
  }

  private applyInput(sessionId: string, player: PlayerState, input: InputMessage): void {
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

const AXES: readonly number[] = [-1, 0, 1];

/** 클라이언트가 보낸 값은 믿지 않는다. 형식이 틀리면 무시 */
function parseInput(message: unknown): InputMessage | null {
  if (typeof message !== "object" || message === null) return null;
  const { seq, x, y } = message as Record<string, unknown>;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 1 || seq > 0xffffffff) return null;
  if (typeof x !== "number" || typeof y !== "number" || !AXES.includes(x) || !AXES.includes(y)) return null;
  return { seq, x: x as Axis, y: y as Axis };
}
