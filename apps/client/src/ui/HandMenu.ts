import Phaser from "phaser";
import { MENU, type HeldFoodView, type Vec2 } from "@park/shared";
import { DEPTH, foodSheet } from "../assets";
import { localized, t } from "../i18n";
import { smoothText } from "./text";

/** 한 줄 높이. 2배 확대에서 40px 로 손가락으로 누르기 쉽게 */
const ROW_H = 20;
const WIDTH = 112;
const PAD = 5;
const HEADER_H = 14;
const TAIL = 6;
/** 캐릭터 발밑에서 말풍선 아랫변까지 (이름표 위) */
const ABOVE_FEET_PX = 46;
/** 화면 가장자리에서 띄우는 간격 (화면 px, 카메라 배율로 나눠 월드 px 로) */
const SCREEN_MARGIN = { top: 40, side: 8 } as const;

const COLOR = { bg: 0x1b2433, border: 0xe8823a, hover: 0x2f4060 } as const;

/**
 * 내 손에 든 간식 말풍선: 무엇을 들고 있는지 보여 주고, 먹을 것을 고른다 (클릭·터치 또는 숫자키 1, 2).
 * 내 캐릭터를 누르거나, 양손에 들고 '먹기'(Q)를 누르면 뜬다. 캐릭터 머리 위에서 따라다닌다.
 * 이미 먹는 중이면 고를 수 없고 '먹는 중'만 표시한다 (한 번에 하나씩).
 */
export class HandMenu {
  private readonly root: Phaser.GameObjects.Container;
  private readonly height: number;
  private readonly choosable: boolean[];
  /** 만들 때의 손 상태. 바뀌면(받음·다 먹음·먹기 시작) 닫는다 */
  readonly signature: string;

  constructor(
    scene: Phaser.Scene,
    hands: readonly HeldFoodView[],
    private readonly onChoose: (hand: number) => void,
  ) {
    this.signature = HandMenu.signatureOf(hands);
    const busy = hands.some((h) => h.eating);
    this.choosable = hands.map(() => !busy);
    const height = (this.height = HEADER_H + hands.length * ROW_H + PAD);
    this.root = scene.add.container(0, 0).setDepth(DEPTH.bubble);

    const bg = scene.add.graphics();
    bg.fillStyle(COLOR.bg, 0.95).fillRoundedRect(0, 0, WIDTH, height, 4);
    bg.lineStyle(1, COLOR.border, 1).strokeRoundedRect(0, 0, WIDTH, height, 4);
    // 꼬리 (캐릭터 쪽)
    bg.fillStyle(COLOR.bg, 0.95).fillTriangle(WIDTH / 2 - 5, height, WIDTH / 2 + 5, height, WIDTH / 2, height + TAIL);
    this.root.add(bg);

    const text = (x: number, y: number, s: string, color = "#ffffff") => smoothText(scene.add.text(x, y, s, { fontSize: "9px", color }));
    this.root.add(text(PAD, 3, t(busy ? "hands.titleBusy" : "hands.title"), "#ffd9a8"));

    hands.forEach((food, i) => {
      const y = HEADER_H + i * ROW_H;
      const icon = scene.add.image(PAD + 6, y + ROW_H / 2, foodSheet(food.item).key, food.stage);
      const name = localized(MENU.get(food.item)?.name ?? { ko: food.item });
      const label = food.eating ? `${name} · ${t("hands.eating")}` : busy ? name : `${i + 1}  ${name}`;
      const row = text(PAD + 15, y + (ROW_H - 10) / 2, label, busy && !food.eating ? "#8a99ab" : "#ffffff");
      if (this.choosable[i]) {
        // 누르는 영역. setAlpha(0) 이면 Phaser 가 클릭·터치를 받지 않아서 채우기 색만 투명하게
        const hit = scene.add.rectangle(2, y, WIDTH - 4, ROW_H, COLOR.hover, 0).setOrigin(0, 0);
        hit.setInteractive({ useHandCursor: true });
        hit.on("pointerover", () => hit.setFillStyle(COLOR.hover, 1));
        hit.on("pointerout", () => hit.setFillStyle(COLOR.hover, 0));
        hit.on("pointerdown", () => this.onChoose(i));
        this.root.add(hit);
      }
      this.root.add([icon, row]);
    });
  }

  static signatureOf(hands: readonly HeldFoodView[]): string {
    return hands.map((h) => `${h.item}:${h.eating ? 1 : 0}`).join(",");
  }

  /** 캐릭터 머리 위에, 화면 밖으로 나가지 않게. 매 프레임 불러도 된다 */
  place(feet: Vec2, camera: Phaser.Cameras.Scene2D.Camera): void {
    const view = camera.worldView;
    const side = SCREEN_MARGIN.side / camera.zoom;
    const x = Phaser.Math.Clamp(feet.x - WIDTH / 2, view.left + side, Math.max(view.left + side, view.right - side - WIDTH));
    const y = Math.max(feet.y - ABOVE_FEET_PX - this.height - TAIL, view.top + SCREEN_MARGIN.top / camera.zoom);
    this.root.setPosition(Math.round(x), Math.round(y));
  }

  /** 숫자키: 1 → 첫 번째 손. 고를 수 없으면 무시 */
  chooseIndex(index: number): void {
    if (this.choosable[index]) this.onChoose(index);
  }

  destroy(): void {
    this.root.destroy();
  }
}
