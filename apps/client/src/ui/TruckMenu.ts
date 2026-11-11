import Phaser from "phaser";
import { MENU, truckFrontBox, type TruckPlacement } from "@park/shared";
import { DEPTH, foodSheet } from "../assets";
import { localized, t } from "../i18n";
import { smoothText } from "./text";

/** 메뉴 한 줄 높이. 2배 확대에서 40px 로 손가락으로 누르기 쉽게 */
const ROW_H = 20;
const WIDTH = 104;
const PAD = 5;
const HEADER_H = 14;
const FOOTER_H = 11;
/** 트럭 그림 지붕 위로 띄우는 간격 (이름·상태 글자 위) */
const ABOVE_TRUCK_PX = 40;
/** 아래에 띄울 때: 트럭 앞 주문 영역(손님이 서는 곳) 아래로 띄우는 간격 */
const BELOW_FRONT_PX = 6;
const TAIL = 6;
/**
 * 화면 가장자리에서 띄우는 간격 (화면 px). 위는 채널 표시, 아래는 터치 버튼 자리.
 * 월드 px 로 바꿀 때 카메라 배율로 나눈다
 */
const SCREEN_MARGIN = { top: 40, bottom: 64, side: 8 } as const;

const COLOR = { bg: 0x1b2433, border: 0xe8823a, hover: 0x2f4060 } as const;

/**
 * 트럭 메뉴 말풍선 (4-2). 트럭 위에 떠서 메뉴를 고른다: 클릭·터치 또는 숫자키(1, 2, 3…).
 * 월드 좌표에 그리므로 카메라와 함께 움직인다.
 * 트럭 위가 화면 밖으로 잘리면 손님 아래에 띄우고(꼬리가 위를 향함), 좌우도 화면 안으로 밀어 넣는다 (place).
 */
export class TruckMenu {
  private readonly root: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly items: readonly string[];
  private readonly height: number;
  /** 마지막으로 그린 배경 (아래 표시 여부, 꼬리 x). 바뀔 때만 다시 그린다 */
  private drawn = { below: false, tailX: -1 };
  readonly truckId: string;

  constructor(
    scene: Phaser.Scene,
    truck: TruckPlacement,
    private readonly onChoose: (item: string) => void,
  ) {
    this.truckId = truck.def.id;
    const items = (this.items = truck.def.menu);
    const height = (this.height = HEADER_H + items.length * ROW_H + FOOTER_H + PAD);
    this.root = scene.add.container(0, 0).setDepth(DEPTH.bubble);
    this.bg = scene.add.graphics();
    this.root.add(this.bg);

    const text = (x: number, y: number, s: string, color = "#ffffff", size = "9px") =>
      smoothText(scene.add.text(x, y, s, { fontSize: size, color }));
    this.root.add(text(PAD, 3, localized(truck.def.name), "#ffd9a8"));

    items.forEach((id, i) => {
      const y = HEADER_H + i * ROW_H;
      // 누르는 영역. 숨길 때 setAlpha(0) 을 쓰면 Phaser 가 '그리지 않는 물체'로 보고 클릭·터치를 받지 않는다.
      // 그래서 물체는 보이게 두고 채우기 색만 투명하게 한다
      const hover = scene.add.rectangle(2, y, WIDTH - 4, ROW_H, COLOR.hover, 0).setOrigin(0, 0);
      hover.setInteractive({ useHandCursor: true });
      hover.on("pointerover", () => hover.setFillStyle(COLOR.hover, 1));
      hover.on("pointerout", () => hover.setFillStyle(COLOR.hover, 0));
      hover.on("pointerdown", () => this.onChoose(id));
      const icon = scene.add.image(PAD + 6, y + ROW_H / 2, foodSheet(id).key, 0);
      const label = text(PAD + 15, y + (ROW_H - 10) / 2, `${i + 1}  ${localized(MENU.get(id)!.name)}`);
      this.root.add([hover, icon, label]);
    });
    this.root.add(text(PAD, height - FOOTER_H - 1, t("truck.menuClose"), "#9fb3c8", "7px"));
    this.place(truck, scene.cameras.main);
  }

  /**
   * 화면(카메라가 보는 영역)에 맞춰 위치를 정한다. 매 프레임 불러도 된다.
   * 트럭 위에 다 들어가면 위, 아니면 손님 아래 (아래도 모자라면 더 넓은 쪽)
   */
  place(truck: TruckPlacement, camera: Phaser.Cameras.Scene2D.Camera): void {
    const view = camera.worldView;
    const z = camera.zoom;
    const top = view.top + SCREEN_MARGIN.top / z;
    const bottom = view.bottom - SCREEN_MARGIN.bottom / z;
    const side = SCREEN_MARGIN.side / z;

    const aboveY = truck.box.top - ABOVE_TRUCK_PX - this.height;
    const belowY = truckFrontBox(truck).bottom + BELOW_FRONT_PX;
    const fitsAbove = aboveY - TAIL >= top;
    const fitsBelow = belowY + this.height <= bottom;
    const below = !fitsAbove && (fitsBelow || bottom - belowY > aboveY + this.height - top);

    const cx = (truck.box.left + truck.box.right) / 2;
    const x = Phaser.Math.Clamp(cx - WIDTH / 2, view.left + side, Math.max(view.left + side, view.right - side - WIDTH));
    this.root.setPosition(Math.round(x), below ? belowY : aboveY);
    // 꼬리는 상자 안에서 트럭 가운데를 가리킨다
    this.drawBackground(below, Math.round(Phaser.Math.Clamp(cx - x, 10, WIDTH - 10)));
  }

  private drawBackground(below: boolean, tailX: number): void {
    if (this.drawn.below === below && this.drawn.tailX === tailX) return;
    this.drawn = { below, tailX };
    const h = this.height;
    const bg = this.bg.clear();
    bg.fillStyle(COLOR.bg, 0.95).fillRoundedRect(0, 0, WIDTH, h, 4);
    bg.lineStyle(1, COLOR.border, 1).strokeRoundedRect(0, 0, WIDTH, h, 4);
    // 말풍선 꼬리: 위에 뜨면 아래(트럭 쪽)로, 아래에 뜨면 위(손님·트럭 쪽)로
    bg.fillStyle(COLOR.bg, 0.95);
    if (below) bg.fillTriangle(tailX - 5, 0, tailX + 5, 0, tailX, -TAIL);
    else bg.fillTriangle(tailX - 5, h, tailX + 5, h, tailX, h + TAIL);
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
