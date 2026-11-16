import Phaser from "phaser";
import { MENU, type PublicStatsResponse } from "@park/shared";
import { foodSheet } from "../assets";
import { localized, t } from "../i18n";
import { fetchStatsToday } from "../net/api";

/** 다시 받아 오는 간격 (서버도 10초 캐시) */
const REFRESH_MS = 60_000;
const PAD = 6;
const ROW_H = 20;
const ICON_SCALE = 1.5;
/** 이보다 좁은 화면에서는 한 줄로 (오늘 N명 · 인기 1위만) */
const COMPACT_BELOW_PX = 560;

const COLOR = { bg: 0x1b2433, border: 0xe8823a } as const;
const TEXT: Phaser.Types.GameObjects.Text.TextStyle = { fontSize: "12px", color: "#ffffff" };

/**
 * '오늘의 공원' (7-3, UI 씬): 미니맵 왼쪽에 오늘 방문자 수와 인기 간식을 모든 사람에게 보여 준다.
 * 1분마다 서버에서 다시 받아 온다. 못 받아 오면 이전 값을 그대로 둔다
 */
export class StatsPanel {
  private readonly root: Phaser.GameObjects.Container;
  private stats?: PublicStatsResponse;
  private compact = false;
  private builtFor = "";
  width = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0);
    void this.refresh();
    scene.time.addEvent({ delay: REFRESH_MS, loop: true, callback: () => void this.refresh() });
  }

  /** 오른쪽 위 모서리를 (right, top) 에 맞춘다. 화면 폭에 따라 한 줄/여러 줄 */
  layout(right: number, top: number, screenW: number): void {
    const compact = screenW < COMPACT_BELOW_PX;
    const key = JSON.stringify([compact, this.stats]);
    if (key !== this.builtFor) {
      this.builtFor = key;
      this.compact = compact;
      this.build();
    }
    this.root.setPosition(Math.round(right - this.width), top);
  }

  private async refresh(): Promise<void> {
    try {
      this.stats = await fetchStatsToday();
    } catch {
      // 다음에 다시
    }
  }

  private build(): void {
    const scene = this.scene;
    this.root.removeAll(true);
    const s = this.stats;
    if (!s) {
      this.width = 0;
      return;
    }
    const items: Phaser.GameObjects.GameObject[] = [];
    let width: number;
    let height: number;
    if (this.compact) {
      const top = s.topSnacks[0];
      const label = top
        ? t("stats.compact", { visitors: s.visitors, item: snackName(top.item) })
        : t("stats.compactNoSnack", { visitors: s.visitors });
      const text = scene.add.text(PAD, PAD - 1, label, { ...TEXT, fontSize: "11px" });
      items.push(text);
      width = text.width + PAD * 2;
      height = text.height + PAD * 2 - 2;
    } else {
      const title = scene.add.text(PAD, PAD, t("stats.title"), { ...TEXT, fontSize: "11px", color: "#ffd9a8" });
      const visitors = scene.add.text(PAD, PAD + 16, t("stats.visitors", { visitors: s.visitors }), TEXT);
      const snackTitle = scene.add.text(PAD, PAD + 36, t("stats.topSnacks"), { ...TEXT, fontSize: "11px", color: "#9fb3c8" });
      items.push(title, visitors, snackTitle);
      let y = PAD + 52;
      width = Math.max(title.width, visitors.width, snackTitle.width);
      if (s.topSnacks.length === 0) {
        const none = scene.add.text(PAD, y, t("stats.noSnacks"), { ...TEXT, color: "#8a94a3" });
        items.push(none);
        width = Math.max(width, none.width);
        y += ROW_H;
      }
      s.topSnacks.forEach((snack, i) => {
        const icon = scene.add.image(PAD + 8, y + ROW_H / 2, foodSheet(snack.item).key, 0).setScale(ICON_SCALE);
        const label = scene.add.text(PAD + 20, y + ROW_H / 2, t("stats.snackRow", { rank: i + 1, item: snackName(snack.item), count: snack.count }), TEXT).setOrigin(0, 0.5);
        items.push(icon, label);
        width = Math.max(width, 20 + label.width);
        y += ROW_H;
      });
      width += PAD * 2;
      height = y + PAD - 2;
    }
    const bg = scene.add.graphics();
    bg.fillStyle(COLOR.bg, 0.85).fillRoundedRect(0, 0, width, height, 6);
    bg.lineStyle(2, COLOR.border, 1).strokeRoundedRect(0, 0, width, height, 6);
    // 눌러도 아래 공원으로 넘어가지 않게
    const blocker = scene.add.zone(0, 0, width, height).setOrigin(0, 0).setInteractive();
    this.root.add([bg, blocker, ...items]);
    this.width = width;
  }
}

function snackName(item: string): string {
  return localized(MENU.get(item)?.name ?? { ko: item });
}
