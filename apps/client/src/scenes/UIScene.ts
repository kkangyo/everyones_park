import Phaser from "phaser";
import { DEBUG } from "../debug";
import { t } from "../i18n";
import { checkHealth, type ServerStatus } from "../net/health";
import type { ParkScene } from "./ParkScene";

const HEALTH_INTERVAL_MS = 3000;

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
  }

  update(): void {
    const park = this.scene.get("Park") as ParkScene;
    if (!park.sys.isActive()) return;
    this.updateStatus(park);
    if (this.debugText) this.updateDebug(park);
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
