import Phaser from "phaser";
import type { ChannelInfo } from "@park/shared";
import { t } from "../i18n";
import { fetchChannels } from "../net/api";

/** 열려 있는 동안 목록을 다시 받아 오는 간격 */
const REFRESH_MS = 3000;
const PAD = 8;
const ROW_GAP = 4;
const MIN_WIDTH = 180;

const COLOR = { bg: 0x1b2433, border: 0xe8823a, row: "#2b3a52", here: "#2e9e47", full: "#3a4250" } as const;

const ROW_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: "14px",
  color: "#ffffff",
  padding: { x: 10, y: 8 },
};

/**
 * 채널 목록 (6-4, UI 씬). 화면 왼쪽 위 채널 표시를 누르면 그 아래에 열린다.
 * 채널마다 접속자 수를 보여 주고, 다른 채널을 누르면 그 채널로 옮긴다 (꽉 찬 채널은 누를 수 없음)
 */
export class ChannelList {
  private readonly root: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly blocker: Phaser.GameObjects.Zone;
  private readonly title: Phaser.GameObjects.Text;
  private rows: Phaser.GameObjects.Text[] = [];
  private timer?: Phaser.Time.TimerEvent;
  /** 마지막으로 그린 목록 (같으면 다시 그리지 않음) */
  private signature = "";
  /** 옮기는 중 (응답 전까지 다른 채널을 또 누르지 않게) */
  private busy = false;

  constructor(
    private readonly scene: Phaser.Scene,
    /** 지금 들어와 있는 채널의 방 id */
    private readonly currentId: () => string,
    private readonly onChoose: (id: string) => Promise<void>,
  ) {
    this.root = scene.add.container(0, 0).setVisible(false);
    this.bg = scene.add.graphics();
    // 판의 빈 곳을 눌러도 아래 공원으로 넘어가지 않게
    this.blocker = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setInteractive();
    this.title = scene.add.text(PAD, PAD, t("channels.loading"), { fontSize: "12px", color: "#9fb3c8" });
    this.root.add([this.bg, this.blocker, this.title]);
  }

  get visible(): boolean {
    return this.root.visible;
  }

  setVisible(visible: boolean): void {
    if (visible === this.root.visible) return;
    this.root.setVisible(visible);
    this.timer?.remove();
    this.timer = undefined;
    if (!visible) return;
    void this.refresh();
    this.timer = this.scene.time.addEvent({ delay: REFRESH_MS, loop: true, callback: () => void this.refresh() });
  }

  /** 왼쪽 위 모서리를 (left, top) 에 맞춘다 */
  place(left: number, top: number): void {
    this.root.setPosition(Math.round(left), Math.round(top));
  }

  private async refresh(): Promise<void> {
    let channels: ChannelInfo[];
    try {
      channels = await fetchChannels();
    } catch {
      this.render(t("channels.error"), []);
      return;
    }
    if (!this.root.visible) return;
    const total = channels.reduce((sum, c) => sum + c.players, 0);
    this.render(t("channels.title", { total }), channels);
  }

  private render(title: string, channels: ChannelInfo[]): void {
    const here = this.currentId();
    const signature = JSON.stringify([title, here, this.busy, channels]);
    if (signature === this.signature) return;
    this.signature = signature;

    this.title.setText(title);
    for (const row of this.rows) row.destroy();
    this.rows = channels.map((c) => {
      const isHere = c.id === here;
      const full = c.players >= c.max;
      const label = t(isHere ? "channels.rowHere" : full ? "channels.rowFull" : "channels.row", { channel: c.channel, players: c.players, max: c.max });
      const row = this.scene.add.text(PAD, 0, label, {
        ...ROW_STYLE,
        backgroundColor: isHere ? COLOR.here : full ? COLOR.full : COLOR.row,
        color: full && !isHere ? "#8a94a3" : "#ffffff",
      });
      if (!isHere && !full && !this.busy) {
        row.setInteractive({ useHandCursor: true }).on("pointerdown", () => void this.choose(c.id));
      }
      return row;
    });
    this.root.add(this.rows);

    let y = PAD + this.title.height + ROW_GAP;
    let width = Math.max(MIN_WIDTH, this.title.width + PAD * 2);
    for (const row of this.rows) {
      row.setY(y);
      y += row.height + ROW_GAP;
      width = Math.max(width, row.width + PAD * 2);
    }
    for (const row of this.rows) row.setFixedSize(width - PAD * 2, 0);
    const height = y - ROW_GAP + PAD;
    this.bg.clear().fillStyle(COLOR.bg, 0.92).fillRoundedRect(0, 0, width, height, 8);
    this.bg.lineStyle(2, COLOR.border, 1).strokeRoundedRect(0, 0, width, height, 8);
    this.blocker.setSize(width, height);
  }

  private async choose(id: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.title.setText(t("channels.moving"));
    try {
      await this.onChoose(id);
    } finally {
      this.busy = false;
      this.signature = "";
      if (this.root.active && this.root.visible) void this.refresh();
    }
  }
}
