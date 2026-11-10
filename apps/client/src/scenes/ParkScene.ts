import Phaser from "phaser";
import {
  MENU,
  TICK_MS,
  TILE_SIZE,
  findPath,
  footBox,
  isBlockedTile,
  isMoving,
  tileCenter,
  tileOf,
  type AuthUser,
  type CollisionGrid,
  type NoticeMessage,
  type Vec2,
} from "@park/shared";
import { DEPTH, bodySheet, idleFrame } from "../assets";
import { DEBUG, DEV_KEYS, LAG_MS } from "../debug";
import { Player } from "../entities/Player";
import { localized, t } from "../i18n";
import { KeyboardMove } from "../input/keyboard";
import { PathFollower } from "../input/pathFollower";
import type { ParkRoom } from "../net/connection";
import { ParkSync, type NetInfo, type OwnServerState } from "../net/ParkSync";
import { Prediction } from "../net/Prediction";
import { buildParkMap } from "../world/parkMap";
import { TruckController } from "../world/TruckController";

/** UI 씬이 화면 위쪽에 보여 주는 내 주문 상태 */
export type OrderStatus =
  | { kind: "waiting"; item: string; pos: number }
  | { kind: "ordering"; item: string }
  | { kind: "cooking"; item: string; sec: number };

/** 공원 씬 → UI 씬 이벤트: 잠깐 보여 줄 안내 문구 */
export const TOAST_EVENT = "toast";

/** 입장 화면(Lobby)이 로그인·채널 접속을 마치고 넘겨 주는 값 */
export interface ParkSceneData {
  room: ParkRoom;
  user: AuthUser;
}

/** 탭이 멈췄다 돌아오는 등 프레임이 크게 밀려도 한 번에 이 이상의 틱은 몰아서 돌리지 않는다 */
const MAX_TICKS_PER_FRAME = 5;

/** 화면 높이에 최소 이만큼의 타일이 보이도록 정수배 확대 배율을 고른다 */
const MIN_VISIBLE_TILES_Y = 12;
const MAX_ZOOM = 4;

export interface ParkDebugInfo {
  zoom: number;
  player: Vec2;
  tile: Vec2;
  facing: string;
  moving: boolean;
  groundTile: number;
  obstacleTile: number;
  collisionView: boolean;
  pathRemaining: number;
  net: NetInfo;
  lagMs: number;
  pendingInputs: number;
  /** 마지막 서버 보정 때 예측 위치와 어긋난 거리 (px) */
  lastCorrectionPx: number;
  corrections: number;
}

export class ParkScene extends Phaser.Scene {
  private entry!: ParkSceneData;
  private map!: Phaser.Tilemaps.Tilemap;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private obstacleLayer!: Phaser.Tilemaps.TilemapLayer;
  private grid!: CollisionGrid;
  private player!: Player;
  private keyboard!: KeyboardMove;
  private follower = new PathFollower();
  private destMarker!: Phaser.GameObjects.Graphics;
  private collisionView?: { tiles: Phaser.GameObjects.Graphics; overlay: Phaser.GameObjects.Graphics };
  private sync!: ParkSync;
  private prediction = new Prediction();
  private tickAccMs = 0;
  /** ?debug=1: 서버가 확인해 준 내 위치 (반투명) */
  private ghost?: Phaser.GameObjects.Sprite;
  private lastCorrectionPx = 0;
  private corrections = 0;
  private trucks!: TruckController;

  constructor() {
    super("Park");
  }

  init(data: ParkSceneData): void {
    this.entry = data;
  }

  create(): void {
    const park = buildParkMap(this);
    this.map = park.map;
    this.groundLayer = park.groundLayer;
    this.obstacleLayer = park.obstacleLayer;
    this.grid = park.grid;

    const { room, user } = this.entry;
    // 실제 입장 위치는 서버가 정해서 첫 상태로 알려 준다 (onOwnServerState)
    this.player = new Player(this, park.entrance, user.nickname, user);
    this.keyboard = new KeyboardMove(this);

    this.destMarker = this.add.graphics().setDepth(DEPTH.groundMarker).setVisible(false);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    cam.setRoundPixels(true);
    cam.startFollow(this.player.view.root, true);

    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this));

    if (DEV_KEYS) {
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F1, true).on("down", () => this.toggleCollisionView());
    }

    if (DEBUG) {
      this.ghost = this.add
        .sprite(0, 0, bodySheet(user.gender).key, idleFrame("down"))
        .setOrigin(0.5, 1)
        .setAlpha(0.35)
        .setTint(0x80c0ff)
        .setDepth(DEPTH.debug - 1)
        .setVisible(false);
    }

    this.sync = new ParkSync(this, room, LAG_MS);
    this.sync.onOwnState = (state, first) => this.onOwnServerState(state, first);
    this.sync.onNotice = (notice) => this.onNotice(notice);
    this.sync.start();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.sync.disconnect());

    // 간식 트럭 (Phase 4)
    this.trucks = new TruckController(this, park.trucks, this.sync, {
      position: () => this.player.position,
      walkTo: (goal) => this.walkTo(goal),
      isWalking: () => this.follower.active,
      say: (text) => this.player.view.say(text),
    });
    // Q: 들고 있는 간식 먹기 (걷기·서기·앉기 모두 가능)
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q).on("down", () => {
      if ((this.sync.me?.hands.length ?? 0) > 0) this.sync.sendEat();
    });
  }

  get netInfo(): NetInfo {
    return this.sync.info;
  }

  update(time: number, deltaMs: number): void {
    // 고정 틱: 서버와 같은 간격(TICK_MS)으로 입력을 읽고, 예측 이동하고, 서버로 보낸다
    this.tickAccMs = Math.min(this.tickAccMs + deltaMs, TICK_MS * MAX_TICKS_PER_FRAME);
    while (this.tickAccMs >= TICK_MS) {
      this.tickAccMs -= TICK_MS;
      this.fixedTick();
    }
    // 화면: 내 캐릭터는 직전 틱~현재 틱 사이 보간, 다른 사람은 서버 상태를 약간 과거로 보간
    this.player.render(this.tickAccMs / TICK_MS);
    this.player.view.setHands(this.sync.me?.hands ?? []);
    this.sync.render(time);
    this.trucks.update();

    this.destMarker.setVisible(this.follower.active);
    if (this.collisionView) this.drawCollisionOverlay(this.collisionView.overlay);
  }

  private fixedTick(): void {
    const keys = this.keyboard.read();
    // 키보드를 누르면 클릭 이동(트럭으로 걸어가기 포함)은 취소
    if (isMoving(keys) && this.follower.active) {
      this.follower.cancel();
      this.trucks.cancelPending();
    }
    const input = isMoving(keys) ? keys : this.follower.next(this.player.position, TICK_MS / 1000);

    this.player.tick(input, this.grid, this.sync.othersLatest());
    if (this.sync.online) {
      const msg = this.prediction.nextInput(input);
      if (msg) this.sync.sendInput(msg);
    }
  }

  /** 서버가 확인해 준 내 위치가 오면: 남은 입력을 다시 적용해 예측 위치를 바로잡는다 */
  private onOwnServerState(state: OwnServerState, first: boolean): void {
    if (this.ghost) this.ghost.setPosition(state.pos.x, state.pos.y).setDepth(DEPTH.debug - 1).setVisible(true);
    if (first) {
      // 입장 위치는 서버가 정한다
      this.player.teleport(state.pos);
      this.follower.cancel();
      return;
    }
    const corrected = this.prediction.reconcile(state.pos, state.seq, this.grid, this.sync.othersLatest());
    const cur = this.player.position;
    const err = Math.hypot(corrected.x - cur.x, corrected.y - cur.y);
    if (err > 0) {
      this.lastCorrectionPx = err;
      this.corrections++;
      this.player.correctTo(corrected);
    }
  }

  getDebugInfo(): ParkDebugInfo {
    const p = this.player.position;
    const tile = tileOf(p, TILE_SIZE);
    return {
      zoom: this.cameras.main.zoom,
      player: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 },
      tile: { x: tile.col, y: tile.row },
      facing: this.player.facing,
      moving: this.player.moving,
      groundTile: this.groundLayer.getTileAt(tile.col, tile.row)?.index ?? -1,
      obstacleTile: this.obstacleLayer.getTileAt(tile.col, tile.row)?.index ?? -1,
      collisionView: this.collisionView !== undefined,
      pathRemaining: this.follower.remaining.length,
      net: this.sync.info,
      lagMs: LAG_MS,
      pendingInputs: this.prediction.pendingCount,
      lastCorrectionPx: Math.round(this.lastCorrectionPx * 100) / 100,
      corrections: this.corrections,
    };
  }

  /** 내 주문 상태 (UI 씬이 매 프레임 읽음). 주문이 없으면 undefined */
  get orderStatus(): OrderStatus | undefined {
    const me = this.sync.me;
    if (!me?.orderTruck) return undefined;
    const item = localized(MENU.get(me.orderItem)?.name ?? { ko: me.orderItem });
    if (me.orderQueuePos > 0) return { kind: "waiting", item, pos: me.orderQueuePos };
    const truck = this.sync.truck(me.orderTruck);
    if (!truck?.cookingItem) return { kind: "ordering", item };
    const sec = Math.max(0, Math.ceil(((truck.readyTick - this.sync.serverTick) * TICK_MS) / 1000));
    return { kind: "cooking", item, sec };
  }

  cancelOrder(): void {
    this.sync.sendCancelOrder();
  }

  /** 서버 알림: 손이 꽉 찼으면 머리 위 말풍선, 나머지는 화면 안내 */
  private onNotice(notice: NoticeMessage): void {
    const item = notice.item ? localized(MENU.get(notice.item)?.name ?? { ko: notice.item }) : "";
    const text = t(`notice.${notice.code}`, { item });
    if (notice.code === "HANDS_FULL") this.player.view.say(text);
    else this.events.emit(TOAST_EVENT, text);
  }

  /** 땅을 클릭하면 길을 찾아 그곳으로 걸어간다. 트럭·메뉴 등 다른 것을 누른 경우는 그쪽에서 처리 */
  private onPointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (pointer.button !== 0 || over.length > 0) return; // 왼쪽 버튼(터치 포함)만
    this.trucks.cancelPending();
    this.walkTo({ x: pointer.worldX, y: pointer.worldY });
  }

  /** 그 지점이 있는 칸으로 길을 찾아 걸어간다. 막힌 곳·갈 수 없는 곳이면 false */
  private walkTo(target: Vec2): boolean {
    const goal = tileOf(target, TILE_SIZE);
    if (isBlockedTile(this.grid, goal.col, goal.row)) return false;
    const path = findPath(this.grid, tileOf(this.player.position, TILE_SIZE), goal);
    if (!path) return false;

    // 같은 칸을 누르면 그 칸 가운데로만 이동
    const waypoints = path.length > 0 ? path.map((step) => tileCenter(step, TILE_SIZE)) : [tileCenter(goal, TILE_SIZE)];
    this.follower.start(waypoints);
    this.drawDestMarker(waypoints[waypoints.length - 1]!);
    return true;
  }

  private drawDestMarker(at: Vec2): void {
    this.destMarker
      .clear()
      .lineStyle(2, 0xe8823a, 0.9)
      .strokeEllipse(at.x, at.y - 1, 14, 6)
      .setVisible(true);
  }

  /** 픽셀이 흐려지지 않게 항상 정수배로 확대한다 */
  private applyZoom(): void {
    const zoom = Phaser.Math.Clamp(Math.floor(this.scale.height / (TILE_SIZE * MIN_VISIBLE_TILES_Y)), 1, MAX_ZOOM);
    this.cameras.main.setZoom(zoom);
  }

  /** F1: 막힌 칸(빨강), 발밑 충돌 상자(초록), 클릭 이동 경로(파랑) 표시 */
  private toggleCollisionView(): void {
    if (this.collisionView) {
      this.collisionView.tiles.destroy();
      this.collisionView.overlay.destroy();
      this.collisionView = undefined;
      return;
    }
    const tiles = this.add.graphics().setDepth(DEPTH.debug);
    tiles.fillStyle(0xff3030, 0.35);
    const { cols, rows, tileSize, blocked } = this.grid;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) if (blocked[r * cols + c]) tiles.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
    const overlay = this.add.graphics().setDepth(DEPTH.debug + 1);
    this.collisionView = { tiles, overlay };
    this.drawCollisionOverlay(overlay);
  }

  private drawCollisionOverlay(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    const path = this.follower.remaining;
    if (path.length > 0) {
      const pos = this.player.position;
      g.lineStyle(2, 0x3080ff, 0.9).beginPath().moveTo(pos.x, pos.y);
      for (const p of path) g.lineTo(p.x, p.y);
      g.strokePath();
      g.fillStyle(0x3080ff, 0.9);
      for (const p of path) g.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    const b = footBox(this.player.position);
    g.fillStyle(0x30ff60, 0.8).fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
  }
}
