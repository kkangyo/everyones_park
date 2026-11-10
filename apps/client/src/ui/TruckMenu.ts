import Phaser from "phaser";
import { MENU, type TruckPlacement } from "@park/shared";
import { DEPTH, foodSheet } from "../assets";
import { localized, t } from "../i18n";

const TEXT_RESOLUTION = 4;
const ROW_H = 16;
const WIDTH = 104;
const PAD = 5;
const HEADER_H = 14;
const FOOTER_H = 11;
/** 트럭 그림 지붕 위로 띄우는 간격 (이름·상태 글자 위) */
const ABOVE_TRUCK_PX = 40;

const COLOR = { bg: 0x1b2433, border: 0xe8823a, hover: 0x2f4060 } as const;

/**
 * 트럭 메뉴 말풍선 (4-2). 트럭 위에 떠서 메뉴를 고른다: 클릭 또는 숫자키(1, 2, 3…).
 * 월드 좌표에 그리므로 카메라와 함께 움직인다.
 */
export class TruckMenu {
  private readonly root: Phaser.GameObjects.Container;
  private readonly items: readonly string[];
  readonly truckId: string;

  constructor(
    scene: Phaser.Scene,
    truck: TruckPlacement,
    private readonly onChoose: (item: string) => void,
  ) {
    this.truckId = truck.def.id;
    const items = (this.items = truck.def.menu);
    const height = HEADER_H + items.length * ROW_H + FOOTER_H + PAD;
    const cx = (truck.box.left + truck.box.right) / 2;
    this.root = scene.add.container(cx - WIDTH / 2, truck.box.top - ABOVE_TRUCK_PX - height).setDepth(DEPTH.bubble);

    const bg = scene.add.graphics();
    bg.fillStyle(COLOR.bg, 0.95).fillRoundedRect(0, 0, WIDTH, height, 4);
    bg.lineStyle(1, COLOR.border, 1).strokeRoundedRect(0, 0, WIDTH, height, 4);
    // 말풍선 꼬리 (트럭 쪽)
    bg.fillStyle(COLOR.bg, 0.95).fillTriangle(WIDTH / 2 - 5, height, WIDTH / 2 + 5, height, WIDTH / 2, height + 6);
    this.root.add(bg);

    const text = (x: number, y: number, s: string, color = "#ffffff", size = "9px") =>
      scene.add.text(x, y, s, { fontSize: size, color }).setResolution(TEXT_RESOLUTION);
    this.root.add(text(PAD, 3, localized(truck.def.name), "#ffd9a8"));

    items.forEach((id, i) => {
      const y = HEADER_H + i * ROW_H;
      const hover = scene.add.rectangle(2, y, WIDTH - 4, ROW_H, COLOR.hover).setOrigin(0, 0).setAlpha(0);
      hover.setInteractive({ useHandCursor: true });
      hover.on("pointerover", () => hover.setAlpha(1));
      hover.on("pointerout", () => hover.setAlpha(0));
      hover.on("pointerdown", () => this.onChoose(id));
      const icon = scene.add.image(PAD + 6, y + ROW_H / 2, foodSheet(id).key, 0);
      const label = text(PAD + 15, y + 3, `${i + 1}  ${localized(MENU.get(id)!.name)}`);
      this.root.add([hover, icon, label]);
    });
    this.root.add(text(PAD, height - FOOTER_H - 1, t("truck.menuClose"), "#9fb3c8", "7px"));
  }

  /** 숫자키: 1 → 첫 번째 메뉴. 범위 밖이면 무시 */
  chooseIndex(index: number): void {
    const id = this.items[index];
    if (id) this.onChoose(id);
  }

  destroy(): void {
    this.root.destroy();
  }
}
