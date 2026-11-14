import Phaser from "phaser";
import { t } from "../i18n";

const PAD = 8;
const MARGIN = 8;

const COLOR = { bg: 0x1b2433, border: 0xe8823a } as const;

/**
 * 다른 사람 캐릭터를 누르면 뜨는 작은 메뉴 (6-6, UI 씬): 닉네임 + '숨기기'.
 * 숨기면 내 화면에서만 사라진다 (설정창에서 다시 볼 수 있음)
 */
export class PlayerMenu {
  private readonly root: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly blocker: Phaser.GameObjects.Zone;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hideButton: Phaser.GameObjects.Text;
  private nickname = "";

  constructor(
    private readonly scene: Phaser.Scene,
    onHide: (nickname: string) => void,
  ) {
    this.root = scene.add.container(0, 0).setVisible(false);
    this.bg = scene.add.graphics();
    this.blocker = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setInteractive();
    this.title = scene.add.text(PAD, PAD, "", { fontSize: "14px", color: "#ffd9a8" });
    this.hideButton = scene.add
      .text(PAD, 0, t("player.hide"), { fontSize: "14px", color: "#ffffff", backgroundColor: "#d64545", padding: { x: 12, y: 8 } })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        onHide(this.nickname);
        this.setVisible(false);
      });
    this.root.add([this.bg, this.blocker, this.title, this.hideButton]);
  }

  get visible(): boolean {
    return this.root.visible;
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
  }

  /** 누른 화면 위치 (x, y) 옆에 연다. 화면 밖으로 나가지 않게 */
  show(nickname: string, x: number, y: number): void {
    this.nickname = nickname;
    this.title.setText(nickname);
    this.hideButton.setY(PAD + this.title.height + 6);
    const width = Math.max(this.title.width, this.hideButton.width) + PAD * 2;
    const height = this.hideButton.y + this.hideButton.height + PAD;
    this.bg.clear().fillStyle(COLOR.bg, 0.94).fillRoundedRect(0, 0, width, height, 8);
    this.bg.lineStyle(2, COLOR.border, 1).strokeRoundedRect(0, 0, width, height, 8);
    this.blocker.setSize(width, height);
    const { width: sw, height: sh } = this.scene.scale;
    const left = Phaser.Math.Clamp(x + MARGIN, MARGIN, Math.max(MARGIN, sw - width - MARGIN));
    const top = Phaser.Math.Clamp(y - height / 2, MARGIN, Math.max(MARGIN, sh - height - MARGIN));
    this.root.setPosition(Math.round(left), Math.round(top)).setVisible(true);
  }
}
