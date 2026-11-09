import Phaser from "phaser";
import { DEBUG } from "../debug";
import { checkHealth, type ServerStatus } from "../net/health";
import type { ParkScene } from "./ParkScene";

const HEALTH_INTERVAL_MS = 3000;

const STATUS_LABEL: Record<ServerStatus, { text: string; color: string }> = {
  connected: { text: "● 서버 연결됨", color: "#2e9e47" },
  disconnected: { text: "● 서버 연결 안 됨", color: "#d64545" },
};

const PANEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: "14px",
  color: "#5a6b7d",
  backgroundColor: "#ffffffcc",
  padding: { x: 6, y: 4 },
};

/** 공원 씬 위에 겹쳐 그리는 화면 고정 UI. 카메라 확대/이동의 영향을 받지 않는다. */
export class UIScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private debugText?: Phaser.GameObjects.Text;

  constructor() {
    super("UI");
  }

  create(): void {
    this.statusText = this.add.text(12, 12, "● 서버 확인 중…", PANEL_STYLE);

    void this.refreshStatus();
    this.time.addEvent({ delay: HEALTH_INTERVAL_MS, loop: true, callback: () => void this.refreshStatus() });

    if (DEBUG) {
      this.debugText = this.add.text(12, 44, "", { ...PANEL_STYLE, fontSize: "12px", fontFamily: "monospace", color: "#1b2433" });
    }
  }

  update(): void {
    if (!this.debugText) return;
    const park = this.scene.get("Park") as ParkScene;
    if (!park.sys.isActive()) return;
    const d = park.getDebugInfo();
    this.debugText.setText(
      [
        `FPS    ${Math.round(this.game.loop.actualFps)}`,
        `view   ${this.scale.width}x${this.scale.height}  zoom x${d.zoom}`,
        `pos    ${d.player.x}, ${d.player.y}`,
        `tile   ${d.tile.x}, ${d.tile.y}  ground=${d.groundTile} obstacle=${d.obstacleTile}`,
        `facing ${d.facing}${d.moving ? " (moving)" : ""}`,
        `path   남은 경유점 ${d.pathRemaining}`,
        `F1     충돌·경로 표시 ${d.collisionView ? "켜짐" : "꺼짐"}`,
      ].join("\n"),
    );
  }

  private async refreshStatus(): Promise<void> {
    const label = STATUS_LABEL[await checkHealth()];
    this.statusText.setText(label.text).setColor(label.color);
  }
}
