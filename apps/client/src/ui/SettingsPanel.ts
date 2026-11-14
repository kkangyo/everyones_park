import Phaser from "phaser";
import { t } from "../i18n";
import { getSettings, unhidePlayer, updateSettings } from "../settings";

const WIDTH = 248;
const PAD = 10;
const ROW_H = 34;
const VOLUME_STEP = 0.1;

const COLOR = { bg: 0x1b2433, border: 0xe8823a, on: "#2e9e47", off: "#5a6b7d", button: "#2b3a52" } as const;

const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontSize: "14px", color: "#ffffff" };
const BUTTON_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontSize: "14px", color: "#ffffff", backgroundColor: COLOR.button, padding: { x: 10, y: 6 } };

/**
 * 설정창 (6-5, UI 씬): 닉네임 표시 켜기·끄기, 소리 크기, 숨긴 사람 다시 보기 (6-6).
 * 바꾸면 바로 적용되고 브라우저에 저장된다 (새로고침해도 유지)
 */
export class SettingsPanel {
  private readonly root: Phaser.GameObjects.Container;
  private height = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setVisible(false);
  }

  get visible(): boolean {
    return this.root.visible;
  }

  setVisible(visible: boolean): void {
    if (visible && !this.root.visible) this.build();
    this.root.setVisible(visible);
  }

  /** 오른쪽 위 모서리를 (right, top) 에 맞춘다. 화면 아래로 넘치면 위로 올린다 */
  place(right: number, top: number, screenH: number): void {
    const y = Math.max(0, Math.min(top, screenH - this.height - PAD));
    this.root.setPosition(Math.round(right - WIDTH), Math.round(y));
  }

  /** 값이 바뀔 때마다 내용을 새로 만든다 (숨긴 사람 수에 따라 높이가 바뀜) */
  private build(): void {
    const scene = this.scene;
    this.root.removeAll(true);
    const settings = getSettings();
    const items: Phaser.GameObjects.GameObject[] = [];
    const button = (x: number, y: number, text: string, onPress: () => void, color: string = COLOR.button) =>
      scene.add
        .text(x, y, text, { ...BUTTON_STYLE, backgroundColor: color })
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          onPress();
          // 누른 버튼을 그 입력 처리 도중에 지우지 않게 다음 프레임에 다시 만든다
          this.scene.time.delayedCall(0, () => this.build());
        });

    let y = PAD;
    items.push(scene.add.text(PAD, y, t("settings.title"), { ...LABEL_STYLE, fontSize: "15px", color: "#ffd9a8" }));
    y += 28;

    // 닉네임 표시
    items.push(scene.add.text(PAD, y + ROW_H / 2, t("settings.nicknames"), LABEL_STYLE).setOrigin(0, 0.5));
    items.push(
      button(WIDTH - PAD, y + ROW_H / 2, t(settings.showNicknames ? "settings.on" : "settings.off"), () => updateSettings({ showNicknames: !settings.showNicknames }), settings.showNicknames ? COLOR.on : COLOR.off),
    );
    y += ROW_H;

    // 소리 크기: − 70% +
    items.push(scene.add.text(PAD, y + ROW_H / 2, t("settings.volume"), LABEL_STYLE).setOrigin(0, 0.5));
    const plus = button(WIDTH - PAD, y + ROW_H / 2, "+", () => this.setVolume(settings.volume + VOLUME_STEP));
    const value = scene.add.text(plus.x - plus.width - 6, y + ROW_H / 2, `${Math.round(settings.volume * 100)}%`, LABEL_STYLE).setOrigin(1, 0.5).setFixedSize(44, 0).setAlign("center");
    const minus = button(value.x - value.width - 6, y + ROW_H / 2, "−", () => this.setVolume(settings.volume - VOLUME_STEP));
    items.push(plus, value, minus);
    y += ROW_H + 6;

    // 숨긴 사람 (6-6)
    items.push(scene.add.text(PAD, y, t("settings.hidden", { count: settings.hidden.length }), { ...LABEL_STYLE, fontSize: "12px", color: "#9fb3c8" }));
    y += 20;
    if (settings.hidden.length === 0) {
      items.push(scene.add.text(PAD, y, t("settings.hiddenNone"), { ...LABEL_STYLE, fontSize: "12px", color: "#8a94a3" }));
      y += 20;
    }
    for (const nickname of settings.hidden) {
      items.push(scene.add.text(PAD, y + ROW_H / 2, nickname, LABEL_STYLE).setOrigin(0, 0.5));
      items.push(button(WIDTH - PAD, y + ROW_H / 2, t("settings.unhide"), () => unhidePlayer(nickname)));
      y += ROW_H;
    }

    this.height = y + PAD;
    const bg = scene.add.graphics();
    bg.fillStyle(COLOR.bg, 0.94).fillRoundedRect(0, 0, WIDTH, this.height, 8);
    bg.lineStyle(2, COLOR.border, 1).strokeRoundedRect(0, 0, WIDTH, this.height, 8);
    // 판의 빈 곳을 눌러도 아래 공원으로 넘어가지 않게
    const blocker = scene.add.zone(0, 0, WIDTH, this.height).setOrigin(0, 0).setInteractive();
    this.root.add([bg, blocker, ...items]);
  }

  private setVolume(volume: number): void {
    const v = Math.round(Phaser.Math.Clamp(volume, 0, 1) * 10) / 10;
    updateSettings({ volume: v });
    this.scene.sound.volume = v;
  }
}
