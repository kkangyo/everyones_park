import Phaser from "phaser";
import { DEBUG } from "../debug";
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

  /** 채널에 접속했으면 채널 정보, 아니면 서버 헬스 상태 */
  private updateStatus(park: ParkScene): void {
    const net = park.netInfo;
    if (net.status === "online") {
      this.statusText.setText(`● 채널 ${net.roomId} · ${net.players}명`).setColor(COLOR.ok);
    } else if (net.status === "connecting") {
      this.statusText.setText("● 채널 접속 중…").setColor(COLOR.pending);
    } else if (this.health === "connected") {
      this.statusText.setText("● 서버는 켜져 있지만 채널 접속 실패 (새로고침)").setColor(COLOR.bad);
    } else {
      this.statusText.setText(this.health === "checking" ? "● 서버 확인 중…" : "● 서버 연결 안 됨").setColor(COLOR.bad);
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
        `net    ${d.net.status} room=${d.net.roomId ?? "-"} me=${d.net.sessionId ?? "-"}${d.net.error ? ` (${d.net.error})` : ""}`,
      ].join("\n"),
    );
  }

  private async refreshHealth(): Promise<void> {
    this.health = await checkHealth();
  }
}
