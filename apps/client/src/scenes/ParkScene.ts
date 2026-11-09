import Phaser from "phaser";
import {
  TICK_MS,
  TILE_SIZE,
  collisionGridFromTiled,
  findPath,
  footBox,
  isBlockedTile,
  isMoving,
  tileCenter,
  tileOf,
  type CollisionGrid,
  type Vec2,
} from "@park/shared";
import { CHARACTER, DEPTH, MAP, PROP_SPRITES, TILESET, idleFrame } from "../assets";
import { DEBUG, DEV_KEYS, LAG_MS } from "../debug";
import { Player } from "../entities/Player";
import { KeyboardMove } from "../input/keyboard";
import { PathFollower } from "../input/pathFollower";
import { tempNickname } from "../net/connection";
import { ParkSync, type NetInfo, type OwnServerState } from "../net/ParkSync";
import { Prediction } from "../net/Prediction";

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

  constructor() {
    super("Park");
  }

  create(): void {
    this.map = this.make.tilemap({ key: MAP.key });
    const tileset = this.map.addTilesetImage(TILESET.name, TILESET.key);
    if (!tileset) throw new Error(`타일셋 "${TILESET.name}" 을(를) 맵에서 찾을 수 없습니다`);

    this.groundLayer = this.map.createLayer(MAP.layers.ground, tileset)!.setDepth(DEPTH.ground);
    this.obstacleLayer = this.map.createLayer(MAP.layers.obstacles, tileset)!.setDepth(DEPTH.ground);
    this.liftYSortTiles(this.obstacleLayer);

    // 서버와 같은 함수로, 같은 원본 JSON 에서 충돌 격자를 만든다
    const raw = this.cache.tilemap.get(MAP.key).data;
    this.grid = collisionGridFromTiled(raw, MAP.layers.obstacles);

    const nickname = tempNickname();
    this.player = new Player(this, this.findSpawn(MAP.entranceSpawn), nickname);
    this.keyboard = new KeyboardMove(this);

    this.destMarker = this.add.graphics().setDepth(DEPTH.groundMarker).setVisible(false);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    cam.setRoundPixels(true);
    cam.startFollow(this.player.view.sprite, true);

    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this));

    if (DEV_KEYS) {
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F1, true).on("down", () => this.toggleCollisionView());
    }

    if (DEBUG) {
      this.ghost = this.add
        .sprite(0, 0, CHARACTER.key, idleFrame("down"))
        .setOrigin(0.5, 1)
        .setAlpha(0.35)
        .setTint(0x80c0ff)
        .setDepth(DEPTH.debug - 1)
        .setVisible(false);
    }

    this.sync = new ParkSync(this, nickname, LAG_MS);
    this.sync.onOwnState = (state, first) => this.onOwnServerState(state, first);
    void this.sync.connect();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.sync.disconnect());
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
    this.sync.render(time);

    this.destMarker.setVisible(this.follower.active);
    if (this.collisionView) this.drawCollisionOverlay(this.collisionView.overlay);
  }

  private fixedTick(): void {
    const keys = this.keyboard.read();
    // 키보드를 누르면 클릭 이동은 취소
    if (isMoving(keys) && this.follower.active) this.follower.cancel();
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
    const t = tileOf(p, TILE_SIZE);
    return {
      zoom: this.cameras.main.zoom,
      player: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 },
      tile: { x: t.col, y: t.row },
      facing: this.player.facing,
      moving: this.player.moving,
      groundTile: this.groundLayer.getTileAt(t.col, t.row)?.index ?? -1,
      obstacleTile: this.obstacleLayer.getTileAt(t.col, t.row)?.index ?? -1,
      collisionView: this.collisionView !== undefined,
      pathRemaining: this.follower.remaining.length,
      net: this.sync.info,
      lagMs: LAG_MS,
      pendingInputs: this.prediction.pendingCount,
      lastCorrectionPx: Math.round(this.lastCorrectionPx * 100) / 100,
      corrections: this.corrections,
    };
  }

  /** 땅을 클릭하면 길을 찾아 그곳으로 걸어간다. 막힌 곳·갈 수 없는 곳은 무시 */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.button !== 0) return; // 왼쪽 버튼(터치 포함)만
    const goal = tileOf({ x: pointer.worldX, y: pointer.worldY }, TILE_SIZE);
    if (isBlockedTile(this.grid, goal.col, goal.row)) return;

    const path = findPath(this.grid, tileOf(this.player.position, TILE_SIZE), goal);
    if (!path) return;

    // 같은 칸을 누르면 그 칸 가운데로만 이동
    const waypoints = path.length > 0 ? path.map((t) => tileCenter(t, TILE_SIZE)) : [tileCenter(goal, TILE_SIZE)];
    this.follower.start(waypoints);
    this.drawDestMarker(waypoints[waypoints.length - 1]!);
  }

  private drawDestMarker(at: Vec2): void {
    this.destMarker
      .clear()
      .lineStyle(2, 0xe8823a, 0.9)
      .strokeEllipse(at.x, at.y - 1, 14, 6)
      .setVisible(true);
  }

  /**
   * ysort 속성이 있는 타일(나무·바위·울타리)을 타일 레이어에서 빼서 개별 이미지로 다시 그린다.
   * 이미지 depth 를 타일 아랫변 y 로 두면 캐릭터와 앞뒤가 맞는다 (나무 뒤에 서면 가려짐).
   * 충돌은 원본 JSON 으로 만든 격자를 쓰므로 영향 없음.
   */
  private liftYSortTiles(layer: Phaser.Tilemaps.TilemapLayer): void {
    const lifted: Phaser.Tilemaps.Tile[] = [];
    layer.forEachTile((tile) => {
      const props = tile.properties as { ysort?: boolean; sprite?: string } | undefined;
      if (tile.index < 0 || !props?.ysort) return;
      const baseX = tile.pixelX + tile.width / 2;
      const baseY = tile.pixelY + tile.height;
      const prop = props.sprite ? PROP_SPRITES[props.sprite] : undefined;
      if (props.sprite && !prop) console.warn(`assets.ts PROP_SPRITES 에 "${props.sprite}" 이(가) 없어 타일 그림으로 그립니다`);
      const image = prop
        ? this.add.image(baseX, baseY, prop.key)
        : this.add.image(baseX, baseY, TILESET.sheetKey, tile.index - tile.tileset!.firstgid);
      image.setOrigin(0.5, 1).setDepth(DEPTH.ysortBase + baseY);
      lifted.push(tile);
    });
    for (const tile of lifted) layer.removeTileAt(tile.x, tile.y);
  }

  private findSpawn(name: string): Vec2 {
    const obj = this.map.findObject(MAP.layers.spawns, (o) => o.name === name);
    if (!obj || obj.x === undefined || obj.y === undefined) throw new Error(`시작 위치 "${name}" 을(를) 맵에서 찾을 수 없습니다`);
    return { x: obj.x, y: obj.y };
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
