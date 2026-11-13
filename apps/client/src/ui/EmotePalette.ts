import Phaser from "phaser";
import { EMOTES } from "@park/shared";
import { EMOTE_SHEET } from "../assets";
import { localized } from "../i18n";

/** 이모티콘 그림 확대 배율. 20px → 40px 로 손가락으로 누르기 쉽게 */
const ICON_SCALE = 2;
const COLS = 4;
const GAP = 6;
const PAD = 8;
const CELL = EMOTE_SHEET.frameWidth * ICON_SCALE;
const LABEL_H = 14;

const COLOR = { bg: 0x1b2433, border: 0xe8823a } as const;

/**
 * 화면의 이모티콘 고르기 판 (5-4, UI 씬). '이모티콘' 버튼을 누르면 위에 열린다.
 * 그림을 누르면 보내고 닫힌다. 그림 옆 숫자는 같은 이모티콘의 키보드 단축키
 */
export class EmotePalette {
  private readonly root: Phaser.GameObjects.Container;
  private readonly icons: Phaser.GameObjects.Image[] = [];
  readonly width: number;
  readonly height: number;

  constructor(scene: Phaser.Scene, onChoose: (id: string) => void) {
    const rows = Math.ceil(EMOTES.length / COLS);
    this.width = PAD * 2 + COLS * CELL + (COLS - 1) * GAP;
    this.height = PAD * 2 + rows * (CELL + LABEL_H) + (rows - 1) * GAP;
    this.root = scene.add.container(0, 0).setVisible(false);

    const bg = scene.add.graphics();
    bg.fillStyle(COLOR.bg, 0.92).fillRoundedRect(0, 0, this.width, this.height, 8);
    bg.lineStyle(2, COLOR.border, 1).strokeRoundedRect(0, 0, this.width, this.height, 8);
    // 판의 빈 곳을 눌러도 아래 공원으로 넘어가지 않게
    const blocker = scene.add.zone(0, 0, this.width, this.height).setOrigin(0, 0).setInteractive();
    this.root.add([bg, blocker]);

    EMOTES.forEach((emote, i) => {
      const x = PAD + (i % COLS) * (CELL + GAP);
      const y = PAD + Math.floor(i / COLS) * (CELL + LABEL_H + GAP);
      const icon = scene.add
        .image(x, y, EMOTE_SHEET.key, i)
        .setOrigin(0, 0)
        .setScale(ICON_SCALE)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => onChoose(emote.id));
      const key = scene.add.text(x, y, String(i + 1), { fontSize: "10px", color: "#9fb3c8" });
      const name = scene.add.text(x + CELL / 2, y + CELL, localized(emote.name), { fontSize: "11px", color: "#ffffff" }).setOrigin(0.5, 0);
      this.icons.push(icon);
      this.root.add([icon, key, name]);
    });
  }

  get visible(): boolean {
    return this.root.visible;
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
  }

  /** 오른쪽 아래 모서리를 (right, bottom) 에 맞춘다 */
  place(right: number, bottom: number): void {
    this.root.setPosition(Math.round(right - this.width), Math.round(bottom - this.height));
  }

  /** 쿨다운 중에는 흐리게 */
  setReady(ready: boolean): void {
    for (const icon of this.icons) icon.setAlpha(ready ? 1 : 0.35);
  }
}
