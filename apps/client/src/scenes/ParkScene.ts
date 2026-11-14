import Phaser from "phaser";
import {
  EMOTES,
  EMOTE_COOLDOWN_SEC,
  MENU,
  NO_INPUT,
  PET_RANGE_PX,
  SIT_RANGE_PX,
  TICK_MS,
  TILE_SIZE,
  bodyIdOf,
  findPath,
  footBox,
  isBlockedTile,
  isMoving,
  nearestSlot,
  seatAt,
  seatStandPoint,
  seatsInRange,
  tileCenter,
  tileOf,
  type AuthUser,
  type CollisionGrid,
  type Facing,
  type NoticeMessage,
  type Seat,
  type TruckPlacement,
  type Vec2,
} from "@park/shared";
import { DEPTH, bodySheet, idleFrame } from "../assets";
import { DEBUG, DEV_KEYS, LAG_MS } from "../debug";
import { Player } from "../entities/Player";
import { localized, t } from "../i18n";
import { getSettings } from "../settings";
import { KeyboardMove } from "../input/keyboard";
import { PathFollower } from "../input/pathFollower";
import { joinChannel, type ParkRoom } from "../net/connection";
import { ParkSync, type NetInfo, type OwnServerState } from "../net/ParkSync";
import { Prediction } from "../net/Prediction";
import { buildParkMap } from "../world/parkMap";
import { HandMenu } from "../ui/HandMenu";
import { TruckController } from "../world/TruckController";

/** UI 씬이 화면 위쪽에 보여 주는 내 주문 상태 */
export type OrderStatus =
  | { kind: "waiting"; item: string; pos: number }
  | { kind: "ordering"; item: string }
  | { kind: "cooking"; item: string; sec: number };

/** 지금 할 수 있는 행동 (UI 씬의 터치 버튼). 키보드 Space·E·Q 와 같은 동작 */
export interface ActionState {
  order: boolean;
  /** 앉기 / 일어나기 / 할 수 없음 */
  seat: "sit" | "stand" | null;
  eat: boolean;
  /** 쓰다듬을 수 있는 고양이가 가까이 있음 */
  pet: boolean;
}

/** 숫자키 1–9. 트럭 메뉴·간식 고르기가 열려 있으면 그 메뉴를, 아니면 이모티콘(1–8)을 고른다 */
const NUMBER_KEYS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"] as const;

/** 공원 씬 → UI 씬 이벤트: 잠깐 보여 줄 안내 문구 */
export const TOAST_EVENT = "toast";
/** 공원 씬 → UI 씬 이벤트: 다른 사람 캐릭터를 누름 (닉네임, 누른 포인터) → 숨기기 메뉴 (6-6) */
export const PLAYER_MENU_EVENT = "playerMenu";

/** 입장 화면(Lobby)이 로그인·채널 접속을 마치고 넘겨 주는 값 */
export interface ParkSceneData {
  room: ParkRoom;
  user: AuthUser;
  /** 입장 토큰. 다른 채널로 옮길 때 다시 쓴다 (6-4) */
  token: string;
}

/** 탭이 멈췄다 돌아오는 등 프레임이 크게 밀려도 한 번에 이 이상의 틱은 몰아서 돌리지 않는다 */
const MAX_TICKS_PER_FRAME = 5;

/**
 * 화면의 짧은 쪽에 타일이 이만큼 이상 보이는 가장 큰 정수배로 확대한다 (작을수록 가깝게).
 * 휴대폰 세로(폭 약 390px)·노트북(높이 약 560px) 모두 2배, 큰 모니터는 3배
 */
const MIN_VISIBLE_TILES = 6;
const MAX_ZOOM = 3;

export interface ParkDebugInfo {
  zoom: number;
  player: Vec2;
  tile: Vec2;
  facing: string;
  moving: boolean;
  seated: boolean;
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
  /** 트럭 위치 (미니맵 표시용) */
  truckPlacements: readonly TruckPlacement[] = [];
  private seats: Seat[] = [];
  /** 앉아 있는 동안 일어나기를 이미 요청했음 (서버 응답 전까지 다시 보내지 않음) */
  private standRequested = false;
  /** 내 손에 든 간식 말풍선 (무엇을 먹을지 고르기) */
  private handMenu?: HandMenu;
  /** 앉아 있을 때 땅·다른 자리를 클릭하면, 일어난 뒤에 할 일 (그곳으로 걸어가기) */
  private afterStand?: () => void;
  /** 클릭해서 걸어가는 중인 자리. 도착하면 앉는다 (5-3) */
  private walkingToSeat?: Seat;
  /** 고양이를 눌러서 걸어가는 중. 도착했을 때 가까우면 쓰다듬는다 (5A-5) */
  private walkingToAnimal?: string;

  constructor() {
    super("Park");
  }

  init(data: ParkSceneData): void {
    this.entry = data;
    // 채널을 옮기면 같은 씬 객체로 다시 시작하므로 이전 채널의 상태를 비운다
    this.follower = new PathFollower();
    this.prediction = new Prediction();
    this.tickAccMs = 0;
    this.collisionView = undefined;
    this.ghost = undefined;
    this.lastCorrectionPx = 0;
    this.corrections = 0;
    this.standRequested = false;
    this.handMenu = undefined;
    this.afterStand = undefined;
    this.walkingToSeat = undefined;
    this.walkingToAnimal = undefined;
  }

  create(): void {
    this.keepTouchAligned();
    const park = buildParkMap(this);
    this.map = park.map;
    this.groundLayer = park.groundLayer;
    this.obstacleLayer = park.obstacleLayer;
    this.grid = park.grid;
    this.seats = park.seats;
    this.truckPlacements = park.trucks;

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
        .sprite(0, 0, bodySheet(bodyIdOf(user)).key, idleFrame("down"))
        .setOrigin(0.5, 1)
        .setAlpha(0.35)
        .setTint(0x80c0ff)
        .setDepth(DEPTH.debug - 1)
        .setVisible(false);
    }

    this.sync = new ParkSync(this, room, LAG_MS);
    this.sync.onOwnState = (state, first) => this.onOwnServerState(state, first);
    this.sync.onNotice = (notice) => this.onNotice(notice);
    this.sync.onOwnEmote = (id, remainingMs) => this.player.view.showEmote(id, remainingMs);
    this.sync.onAnimalTap = (id) => this.petAnimal(id);
    this.sync.onPlayerTap = (nickname, pointer) => {
      if (pointer.button === 0) this.events.emit(PLAYER_MENU_EVENT, nickname, pointer);
    };
    this.sync.start();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.sync.disconnect());

    // 간식 트럭 (Phase 4)
    this.trucks = new TruckController(this, park.trucks, this.sync, {
      position: () => this.player.position,
      walkTo: (goal) => {
        this.walkingToSeat = undefined;
        this.walkingToAnimal = undefined;
        return this.walkTo(goal);
      },
      isWalking: () => this.follower.active,
      say: (text) => this.player.view.say(text),
    });
    // Q: 들고 있는 간식 먹기 (걷기·서기·앉기 모두 가능)
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q).on("down", () => this.eat());
    // 내 캐릭터를 누르면 손에 든 간식 말풍선. 숫자키 1·2 로 고르고 Esc 로 닫는다
    this.player.view.enableTap(() => this.openHandMenu());
    const kb = this.input.keyboard!;
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on("down", () => this.closeHandMenu());
    // 숫자키 하나에 처리를 하나만 건다. 메뉴에서 고르면 메뉴가 닫히므로, 처리마다 따로 걸면 같은 키로 이모티콘까지 나간다
    NUMBER_KEYS.forEach((name, i) => kb.addKey(Phaser.Input.Keyboard.KeyCodes[name]).on("down", () => this.onNumberKey(i)));
    // E: 가까운 자리에 앉기 / 일어나기 (5-2). 빈 칸 확인은 서버가 한다
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E).on("down", () => this.toggleSeat());
    // F: 가까운 고양이 쓰다듬기 (5A-5)
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F).on("down", () => this.petNearby());
  }

  get netInfo(): NetInfo {
    return this.sync.info;
  }

  /** 내 캐릭터 위치 (미니맵 표시용, 예측 위치) */
  get myPosition(): Vec2 {
    return this.player.position;
  }

  /**
   * 채널 목록에서 고른 채널로 옮긴다 (6-4). 새 채널에 먼저 들어간 뒤 공원·UI 씬을 다시 시작한다.
   * 들어가지 못하면(꽉 참·없어진 채널·토큰 만료) 지금 채널에 그대로 있고 안내만 보여 준다.
   * 이전 채널 연결은 서버가 같은 계정의 새 접속으로 보고 끊는다. 손에 든 간식·주문은 이전 채널에 남는다(없어짐)
   */
  async switchChannel(roomId: string): Promise<void> {
    if (roomId === this.sync.info.roomId) return;
    const { user, token } = this.entry;
    let room: ParkRoom;
    try {
      room = await joinChannel(token, roomId);
    } catch (err) {
      console.warn("[net] 채널 옮기기 실패", err);
      this.events.emit(TOAST_EVENT, t("channels.failed"));
      return;
    }
    this.scene.restart({ room, user, token } satisfies ParkSceneData);
    this.scene.get("UI").scene.restart();
  }

  update(time: number, deltaMs: number): void {
    // 고정 틱: 서버와 같은 간격(TICK_MS)으로 입력을 읽고, 예측 이동하고, 서버로 보낸다
    this.tickAccMs = Math.min(this.tickAccMs + deltaMs, TICK_MS * MAX_TICKS_PER_FRAME);
    while (this.tickAccMs >= TICK_MS) {
      this.tickAccMs -= TICK_MS;
      this.fixedTick();
    }
    // 앉기는 서버 상태를 따른다 (앉으면 서버가 위치를 칸으로 옮겨서 보정으로 들어옴)
    const me = this.sync.me;
    this.player.setSeated(me?.seatId ? (me.facing as Facing) : null);
    if (!this.player.seated) {
      this.standRequested = false;
      const next = this.afterStand;
      this.afterStand = undefined;
      next?.();
    }
    this.arriveAtSeat();
    this.arriveAtAnimal();

    // 화면: 내 캐릭터는 직전 틱~현재 틱 사이 보간, 다른 사람은 서버 상태를 약간 과거로 보간
    this.player.render(this.tickAccMs / TICK_MS);
    this.player.view.setHands(this.sync.me?.hands ?? []);
    this.player.view.setNameVisible(getSettings().showNicknames);
    this.sync.render(time);
    this.trucks.update();
    this.updateHandMenu();

    this.destMarker.setVisible(this.follower.active);
    if (this.collisionView) this.drawCollisionOverlay(this.collisionView.overlay);
  }

  private fixedTick(): void {
    const keys = this.keyboard.read();
    if (this.player.seated) {
      // 앉아 있는 동안은 움직이지 않고, 방향키를 누르면 일어나기를 요청한다 (서버가 자리 앞에 세움)
      if (isMoving(keys)) this.requestStand();
      this.player.tick(NO_INPUT, this.grid, this.sync.othersLatest());
      const msg = this.prediction.nextInput(NO_INPUT);
      if (msg && this.sync.online) this.sync.sendInput(msg);
      return;
    }
    // 키보드를 누르면 클릭 이동(트럭으로 걸어가기 포함)은 취소
    if (isMoving(keys) && this.follower.active) {
      this.follower.cancel();
      this.trucks.cancelPending();
      this.walkingToSeat = undefined;
      this.walkingToAnimal = undefined;
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
      seated: this.player.seated,
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

  /** UI 씬이 매 프레임 읽어서 터치 버튼을 보이거나 숨긴다 */
  get actions(): ActionState {
    const hands = this.sync.me?.hands ?? [];
    return {
      order: this.trucks.canOrderHere(),
      seat: this.player.seated ? "stand" : seatsInRange(this.player.position, this.seats).length > 0 ? "sit" : null,
      eat: hands.length > 0 && !hands.some((h) => h.eating),
      pet: this.sync.animalNear(this.player.position, PET_RANGE_PX) !== undefined,
    };
  }

  /** '주문' 버튼 = Space */
  orderHere(): void {
    this.trucks.openMenuInFront();
  }

  /** Q·'먹기' 버튼: 먹을 수 있는 간식이 하나면 바로 먹고, 둘이면 무엇을 먹을지 말풍선으로 고른다 */
  eat(): void {
    const hands = this.sync.me?.hands ?? [];
    if (hands.length === 0 || hands.some((h) => h.eating)) return;
    if (hands.length === 1) this.sync.sendEat(0);
    else this.openHandMenu();
  }

  /** 내 캐릭터를 눌렀을 때·양손일 때 '먹기': 손에 든 간식 말풍선. 다시 누르면 닫힘 */
  private openHandMenu(): void {
    if (this.handMenu) return this.closeHandMenu();
    const hands = this.sync.me?.hands ?? [];
    if (hands.length === 0) {
      this.player.view.say(t("hands.empty"));
      return;
    }
    this.trucks.closeMenu();
    this.handMenu = new HandMenu(this, hands, (hand) => {
      this.sync.sendEat(hand);
      this.closeHandMenu();
    });
    this.handMenu.place(this.player.view.position, this.cameras.main);
  }

  private closeHandMenu(): void {
    this.handMenu?.destroy();
    this.handMenu = undefined;
  }

  /** 손 상태가 바뀌었거나(받음·다 먹음·먹기 시작) 트럭 메뉴가 열리면 닫고, 아니면 캐릭터를 따라다닌다 */
  private updateHandMenu(): void {
    if (!this.handMenu) return;
    const hands = this.sync.me?.hands ?? [];
    if (this.trucks.menuOpen || HandMenu.signatureOf(hands) !== this.handMenu.signature) this.closeHandMenu();
    else this.handMenu.place(this.player.view.position, this.cameras.main);
  }

  private onNumberKey(index: number): void {
    if (this.trucks.menuOpen) this.trucks.chooseMenuIndex(index);
    else if (this.handMenu) this.handMenu.chooseIndex(index);
    else if (EMOTES[index]) this.emote(EMOTES[index].id);
  }

  /** 이모티콘 보내기 (숫자키·화면의 이모티콘 버튼). 쿨다운 중이면 무시 (서버도 다시 확인한다) */
  emote(id: string): void {
    if (this.emoteCooldownSec > 0) return;
    this.sync.sendEmote(id);
  }

  /**
   * 다음 이모티콘까지 남은 시간 (초, 0 = 보낼 수 있음). 서버가 받아 준 내 마지막 이모티콘 틱 기준.
   * 받은 서버 틱은 실제 서버보다 조금 늦으므로 서버 판정보다 짧게 나오는 일은 없다
   */
  get emoteCooldownSec(): number {
    const me = this.sync.me;
    if (!me?.emoteTick) return 0;
    const elapsedSec = ((this.sync.serverTick - me.emoteTick) * TICK_MS) / 1000;
    return Math.max(0, EMOTE_COOLDOWN_SEC - elapsedSec);
  }

  /** 서버 알림: 손이 꽉 찼으면 머리 위 말풍선, 나머지는 화면 안내 */
  private onNotice(notice: NoticeMessage): void {
    const item = notice.item ? localized(MENU.get(notice.item)?.name ?? { ko: notice.item }) : "";
    const text = t(`notice.${notice.code}`, { item });
    if (notice.code === "HANDS_FULL" || notice.code === "SEAT_FULL") this.player.view.say(text);
    else this.events.emit(TOAST_EVENT, text);
  }

  /**
   * 땅을 클릭하면 길을 찾아 그곳으로 걸어간다. 자리(벤치)를 클릭하면 걸어가서 앉는다.
   * 트럭·메뉴 등 다른 것을 누른 경우는 그쪽에서 처리
   */
  private onPointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (pointer.button !== 0 || over.length > 0) return; // 왼쪽 버튼(터치 포함)만
    this.trucks.cancelPending();
    this.closeHandMenu();
    this.walkingToSeat = undefined;
    this.walkingToAnimal = undefined;
    const point = { x: pointer.worldX, y: pointer.worldY };
    const seat = seatAt(point, this.seats);
    if (this.player.seated) {
      if (seat?.id === this.sync.me?.seatId) return; // 앉아 있는 자리를 누름
      this.afterStand = () => (seat ? this.goSit(seat, point) : this.walkTo(point));
      this.requestStand();
      return;
    }
    if (seat) this.goSit(seat, point);
    else this.walkTo(point);
  }

  /** 자리를 클릭함: 가까우면 바로 앉고, 멀면 누른 칸 앞까지 걸어가서 앉는다 (5-3) */
  private goSit(seat: Seat, clicked: Vec2): void {
    if (seatsInRange(this.player.position, this.seats).includes(seat)) {
      this.follower.cancel();
      this.sync.sendSit(seat.id);
      return;
    }
    const front = seatStandPoint(seat, nearestSlot(seat, clicked), this.grid);
    if (this.walkTo(front)) this.walkingToSeat = seat;
  }

  /** F·'쓰다듬기' 버튼: 가까운 고양이를 쓰다듬는다 */
  petNearby(): void {
    const near = this.sync.animalNear(this.player.position, PET_RANGE_PX);
    if (near) this.sync.sendPet(near.id);
  }

  /**
   * 고양이를 누름: 가까우면 쓰다듬고, 멀면 걸어간다 (앉아 있으면 걸어가지 않음).
   * 낯선 고양이는 걸어오는 사람을 피하므로, 도착했을 때 가까이 있을 때만 쓰다듬는다
   */
  private petAnimal(id: string): void {
    const pos = this.sync.animalPosition(id);
    if (!pos) return;
    this.closeHandMenu();
    this.trucks.cancelPending();
    this.walkingToSeat = undefined;
    const me = this.player.position;
    if (Math.hypot(pos.x - me.x, pos.y - me.y) <= PET_RANGE_PX) {
      this.follower.cancel();
      this.walkingToAnimal = undefined;
      this.sync.sendPet(id);
      return;
    }
    if (this.player.seated) return;
    this.walkingToAnimal = this.walkTo(pos) ? id : undefined;
  }

  private arriveAtAnimal(): void {
    const id = this.walkingToAnimal;
    if (!id || this.follower.active) return;
    this.walkingToAnimal = undefined;
    const pos = this.sync.animalPosition(id);
    const me = this.player.position;
    if (pos && Math.hypot(pos.x - me.x, pos.y - me.y) <= PET_RANGE_PX) this.sync.sendPet(id);
  }

  /** 클릭한 자리에 도착했으면 앉는다. 막혀서 멈췄는데 자리가 멀면 그만둔다 */
  private arriveAtSeat(): void {
    const seat = this.walkingToSeat;
    if (!seat || this.follower.active || this.player.seated) return;
    this.walkingToSeat = undefined;
    if (seatsInRange(this.player.position, this.seats).includes(seat)) this.sync.sendSit(seat.id);
  }

  /** E·'앉기/일어나기' 버튼: 앉아 있으면 일어나고, 아니면 가까운 자리에 앉기를 요청한다 */
  toggleSeat(): void {
    if (this.player.seated) {
      this.requestStand();
      return;
    }
    if (seatsInRange(this.player.position, this.seats).length === 0) return;
    this.follower.cancel();
    this.trucks.cancelPending();
    this.walkingToSeat = undefined;
    this.sync.sendSit();
  }

  private requestStand(): void {
    if (this.standRequested) return;
    this.standRequested = true;
    this.sync.sendStand();
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

  /**
   * 터치 좌표가 어긋나지 않게 캔버스 위치를 다시 읽는다.
   * 휴대폰은 입장 화면에서 키보드가 올라오며 페이지가 스크롤된 채 남거나, 주소창이 숨으며 화면이 바뀐다.
   * 게임이 기억한 캔버스 위치가 실제와 다르면 큰 트럭은 눌려도 작은 메뉴 줄은 빗나간다
   */
  private keepTouchAligned(): void {
    const realign = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
      this.scale.updateBounds();
    };
    realign();
    const targets: EventTarget[] = [window, ...(window.visualViewport ? [window.visualViewport] : [])];
    for (const target of targets) {
      target.addEventListener("resize", realign);
      target.addEventListener("scroll", realign);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const target of targets) {
        target.removeEventListener("resize", realign);
        target.removeEventListener("scroll", realign);
      }
    });
  }

  /** 픽셀이 흐려지지 않게 항상 정수배로 확대한다 */
  private applyZoom(): void {
    const shortSide = Math.min(this.scale.width, this.scale.height);
    const zoom = Phaser.Math.Clamp(Math.floor(shortSide / (TILE_SIZE * MIN_VISIBLE_TILES)), 1, MAX_ZOOM);
    this.cameras.main.setZoom(zoom);
  }

  /** F1: 막힌 칸(빨강), 자리(노랑: 사각형·칸 위치, 옅은 선 = E 로 앉을 수 있는 범위), 발밑 충돌 상자(초록), 클릭 이동 경로(파랑) 표시 */
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
    for (const seat of this.seats) {
      const b = seat.box;
      tiles.lineStyle(2, 0xffd400, 1).strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
      tiles.lineStyle(1, 0xffd400, 0.6).strokeRect(b.left - SIT_RANGE_PX, b.top - SIT_RANGE_PX, b.right - b.left + SIT_RANGE_PX * 2, b.bottom - b.top + SIT_RANGE_PX * 2);
      tiles.fillStyle(0xffd400, 1);
      for (const s of seat.slots) tiles.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
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
