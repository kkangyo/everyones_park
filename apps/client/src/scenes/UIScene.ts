import Phaser from "phaser";
import { DEBUG } from "../debug";
import { t } from "../i18n";
import { checkHealth, type ServerStatus } from "../net/health";
import { EMOTE_BUTTON } from "../assets";
import { EmotePalette } from "../ui/EmotePalette";
import { TOAST_EVENT, type ActionState, type OrderStatus, type ParkScene } from "./ParkScene";

const HEALTH_INTERVAL_MS = 3000;
const TOAST_MS = 3000;
/** 화면 가장자리와 터치 버튼 사이 간격, 버튼끼리 간격 */
const EDGE = 12;
const BUTTON_GAP = 8;

type ActionId = "order" | "seat" | "eat" | "pet";
/** 스마일 버튼 확대 배율 (24px → 48px, 손가락으로 누르기 쉽게) */
const EMOTE_BUTTON_SCALE = 2;

const COLOR = { ok: "#2e9e47", bad: "#d64545", pending: "#5a6b7d" } as const;

const PANEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: "14px",
  color: COLOR.pending,
  backgroundColor: "#ffffffcc",
  padding: { x: 6, y: 4 },
};

/** 공원 씬 위에 겹쳐 그리는 화면 고정 UI. 카메라 확대/이동의 영향을 받지 않는다. */
export class UIScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private orderText!: Phaser.GameObjects.Text;
  private cancelButton!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private toastTimer?: Phaser.Time.TimerEvent;
  private helpText!: Phaser.GameObjects.Text;
  /** 터치 버튼 (오른쪽 아래). 할 수 있을 때만 보인다 */
  private actionButtons!: Record<ActionId, Phaser.GameObjects.Text>;
  /** '이모티콘' 버튼으로 여는 고르기 판 */
  private emotePalette!: EmotePalette;
  /** 오른쪽 맨 아래 스마일 버튼. 누르면 이모티콘 고르기 판 */
  private emoteButton!: Phaser.GameObjects.Image;
  private debugText?: Phaser.GameObjects.Text;
  private health: ServerStatus | "checking" = "checking";

  constructor() {
    super("UI");
  }

  create(): void {
    this.statusText = this.add.text(12, 12, "", PANEL_STYLE);

    void this.refreshHealth();
    this.time.addEvent({ delay: HEALTH_INTERVAL_MS, loop: true, callback: () => void this.refreshHealth() });

    if (DEBUG) {
      this.debugText = this.add.text(12, 44, "", { ...PANEL_STYLE, fontSize: "12px", fontFamily: "monospace", color: "#1b2433" });
    }

    // 내 주문 상태 (화면 위 가운데) + 취소 버튼
    this.orderText = this.add.text(0, 12, "", { ...PANEL_STYLE, color: "#1b2433" }).setOrigin(1, 0).setVisible(false);
    this.cancelButton = this.add
      .text(0, 12, t("order.cancel"), { ...PANEL_STYLE, color: "#ffffff", backgroundColor: "#d64545" })
      .setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => (this.scene.get("Park") as ParkScene).cancelOrder());
    // 잠깐 보여 주는 안내 (화면 아래 가운데)
    this.toastText = this.add.text(0, 0, "", { ...PANEL_STYLE, color: "#1b2433" }).setOrigin(0.5, 1).setVisible(false);
    this.helpText = this.add.text(EDGE, 0, t("controls.help"), { ...PANEL_STYLE, fontSize: "12px", color: "#5a6b7d" }).setOrigin(0, 1);
    // 키보드가 없는 기기에서는 단축키 안내 대신 버튼만
    this.helpText.setVisible(this.sys.game.device.os.desktop);

    // 터치 버튼: 손가락으로 누르기 쉬운 크기. 키보드 Space·E·Q 와 같은 동작
    const park = this.scene.get("Park") as ParkScene;
    const button = (onPress: () => void) =>
      this.add
        .text(0, 0, "", { fontSize: "16px", color: "#ffffff", backgroundColor: "#1b2433e6", padding: { x: 14, y: 10 } })
        .setOrigin(1, 1)
        .setVisible(false)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", onPress);
    this.actionButtons = {
      order: button(() => park.orderHere()).setText(t("action.order")),
      seat: button(() => park.toggleSeat()),
      eat: button(() => park.eat()).setText(t("action.eat")),
      pet: button(() => park.petNearby()).setText(t("action.pet")),
    };

    this.emoteButton = this.add
      .image(0, 0, EMOTE_BUTTON.key)
      .setOrigin(1, 1)
      .setScale(EMOTE_BUTTON_SCALE)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.emotePalette.setVisible(!this.emotePalette.visible));
    this.emotePalette = new EmotePalette(this, (id) => {
      park.emote(id);
      this.emotePalette.setVisible(false);
    });
    // 공원(땅·트럭 등)을 누르면 닫는다. 판이나 버튼을 누른 것은 공원까지 오지 않는다
    park.input.on(Phaser.Input.Events.POINTER_DOWN, () => this.emotePalette.setVisible(false));

    park.events.on(TOAST_EVENT, this.showToast, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => park.events.off(TOAST_EVENT, this.showToast, this));
  }

  update(): void {
    const park = this.scene.get("Park") as ParkScene;
    if (!park.sys.isActive()) return;
    this.updateStatus(park);
    this.updateOrder(park.orderStatus);
    const { width, height } = this.scale;
    this.updateActions(park.actions, width, height);
    this.updateEmote(park.emoteCooldownSec);
    // 안내 문구는 터치 버튼 위에
    this.toastText.setPosition(width / 2, height - 72);
    this.helpText.setPosition(EDGE, height - EDGE);
    if (this.debugText) this.updateDebug(park);
  }

  private updateOrder(order: OrderStatus | undefined): void {
    this.orderText.setVisible(!!order);
    this.cancelButton.setVisible(!!order);
    if (!order) return;
    const text =
      order.kind === "waiting"
        ? t("order.waiting", { item: order.item, pos: order.pos })
        : order.kind === "cooking"
          ? t("order.cooking", { item: order.item, sec: order.sec })
          : t("order.ordering", { item: order.item });
    if (this.orderText.text !== text) this.orderText.setText(text);
    // 주문 문구 + 취소 버튼을 한 묶음으로 화면 가운데에
    const total = this.orderText.width + 4 + this.cancelButton.width;
    const left = Math.round((this.scale.width - total) / 2);
    this.orderText.setX(left + this.orderText.width);
    this.cancelButton.setX(left + this.orderText.width + 4);
  }

  /** 할 수 있는 행동의 버튼만 오른쪽 아래부터 왼쪽으로 늘어놓는다 */
  private updateActions(actions: ActionState, width: number, height: number): void {
    const b = this.actionButtons;
    b.order.setVisible(actions.order);
    b.eat.setVisible(actions.eat);
    b.pet.setVisible(actions.pet);
    b.seat.setVisible(actions.seat !== null);
    if (actions.seat) {
      const label = t(actions.seat === "sit" ? "action.sit" : "action.stand");
      if (b.seat.text !== label) b.seat.setText(label);
    }
    // 스마일 버튼이 항상 오른쪽 맨 아래, 나머지는 그 왼쪽에 (버튼 아랫변을 맞춤)
    this.emoteButton.setPosition(width - EDGE, height - EDGE);
    let right = width - EDGE - this.emoteButton.displayWidth - BUTTON_GAP;
    for (const id of ["pet", "seat", "eat", "order"] as const) {
      if (!b[id].visible) continue;
      b[id].setPosition(right, height - EDGE);
      right -= b[id].width + BUTTON_GAP;
    }
  }

  /**
   * 스마일 버튼·고르기 판: 쿨다운(3초) 중이면 흐리게.
   * 판은 버튼 위, 오른쪽 끝을 맞춘다
   */
  private updateEmote(cooldownSec: number): void {
    const button = this.emoteButton;
    const ready = cooldownSec <= 0;
    button.setAlpha(ready ? 1 : 0.5);
    this.emotePalette.setReady(ready);
    this.emotePalette.place(button.x, button.y - button.displayHeight - BUTTON_GAP);
  }

  private showToast(text: string): void {
    this.toastText.setText(text).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.time.delayedCall(TOAST_MS, () => this.toastText.setVisible(false));
  }

  /** 접속 중이면 채널 정보, 끊겼으면 이유 (서버가 꺼진 경우 구분) */
  private updateStatus(park: ParkScene): void {
    const net = park.netInfo;
    if (net.status === "online") {
      this.statusText.setText(t("status.channel", { channel: net.roomId, players: net.players })).setColor(COLOR.ok);
    } else if (net.leaveReason === "duplicateLogin") {
      this.statusText.setText(t("status.duplicateLogin")).setColor(COLOR.bad);
    } else {
      this.statusText.setText(t(this.health === "disconnected" ? "status.serverDown" : "status.disconnected")).setColor(COLOR.bad);
    }
  }

  private updateDebug(park: ParkScene): void {
    const d = park.getDebugInfo();
    this.debugText!.setText(
      [
        `FPS    ${Math.round(this.game.loop.actualFps)}`,
        `view   ${this.scale.width}x${this.scale.height}  zoom x${d.zoom}`,
        `pos    ${d.player.x}, ${d.player.y}`,
        `tile   ${d.tile.x}, ${d.tile.y}  ground=${d.groundTile} obstacle=${d.obstacleTile}`,
        `facing ${d.facing}${d.moving ? " (moving)" : ""}${d.seated ? " (seated)" : ""}`,
        `path   남은 경유점 ${d.pathRemaining}`,
        `F1     충돌·경로 표시 ${d.collisionView ? "켜짐" : "꺼짐"}`,
        `net    ${d.net.status} room=${d.net.roomId} me=${d.net.sessionId}${d.net.leaveCode !== undefined ? ` (code ${d.net.leaveCode})` : ""}`,
        `sync   lag=${d.lagMs}ms 대기입력=${d.pendingInputs} 보정=${d.corrections}회 (마지막 ${d.lastCorrectionPx}px)`,
        `interp 다른 사람 지연 ${d.net.interpDelayMs}ms (자동)`,
      ].join("\n"),
    );
  }

  private async refreshHealth(): Promise<void> {
    this.health = await checkHealth();
  }
}
