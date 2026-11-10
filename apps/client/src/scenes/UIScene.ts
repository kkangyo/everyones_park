import Phaser from "phaser";
import { DEBUG } from "../debug";
import { t } from "../i18n";
import { checkHealth, type ServerStatus } from "../net/health";
import { TOAST_EVENT, type OrderStatus, type ParkScene } from "./ParkScene";

const HEALTH_INTERVAL_MS = 3000;
const TOAST_MS = 3000;

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
    this.helpText = this.add.text(12, 0, t("controls.help"), { ...PANEL_STYLE, fontSize: "12px", color: "#5a6b7d" }).setOrigin(0, 1);

    const park = this.scene.get("Park");
    park.events.on(TOAST_EVENT, this.showToast, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => park.events.off(TOAST_EVENT, this.showToast, this));
  }

  update(): void {
    const park = this.scene.get("Park") as ParkScene;
    if (!park.sys.isActive()) return;
    this.updateStatus(park);
    this.updateOrder(park.orderStatus);
    const { width, height } = this.scale;
    this.toastText.setPosition(width / 2, height - 48);
    this.helpText.setPosition(12, height - 12);
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
        `facing ${d.facing}${d.moving ? " (moving)" : ""}`,
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
