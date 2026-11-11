import Phaser from "phaser";
import type { TruckPlacement, TruckView as TruckStateView } from "@park/shared";
import { DEPTH, GENERATED, truckSheet } from "../assets";
import { localized, t } from "../i18n";
import { smoothText } from "../ui/text";

/** 트럭 그림 위쪽 지붕 높이 (그림 96x80 중 맵 칸 위로 삐져나온 부분) */
const ROOF_PX = 16;

/**
 * 간식 트럭 그림 (4-1): 트럭 + 이름 + 상태(만드는 중·대기 인원) + 연기(4-4) + 'Space 주문' 안내(4-2).
 * 트럭 클릭은 ParkScene 이 sprite 의 pointerdown 으로 받는다.
 */
export class TruckView {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly status: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private lastStatus = "";

  constructor(
    scene: Phaser.Scene,
    readonly placement: TruckPlacement,
  ) {
    const { box, def } = placement;
    const cx = (box.left + box.right) / 2;
    const top = box.top - ROOF_PX;

    // 아랫변을 맵 사각형 아랫변에 맞추고, 캐릭터와 같은 방식으로 앞뒤 순서를 정한다
    this.sprite = scene.add
      .image(cx, box.bottom, truckSheet(def.id).key)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.ysortBase + box.bottom)
      .setInteractive({ useHandCursor: true });

    const label = { fontSize: "9px", color: "#ffffff", stroke: "#1b2433", strokeThickness: 3 };
    smoothText(scene.add.text(cx, top - 2, localized(def.name), label))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.nameplate + box.bottom);
    this.status = smoothText(scene.add.text(cx, top - 13, "", { ...label, color: "#ffd9a8" }))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.nameplate + box.bottom);
    this.hint = smoothText(
      scene.add.text(cx, box.bottom + 4, t("truck.hint"), { fontSize: "8px", color: "#1b2433", backgroundColor: "#ffd9a8", padding: { x: 3, y: 1 } }),
    )
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.bubble)
      .setVisible(false);

    // 판매창 위로 피어오르는 연기 (만드는 동안만)
    this.smoke = scene.add
      .particles(cx - 14, top + 4, GENERATED.smoke, {
        x: { min: -16, max: 16 },
        speedY: { min: -14, max: -8 },
        speedX: { min: -3, max: 3 },
        lifespan: 1800,
        scale: { start: 0.6, end: 2 },
        alpha: { start: 0.7, end: 0 },
        // 눈 바탕에서도 보이게 살짝 회색
        tint: 0xaab4c0,
        frequency: 180,
        emitting: false,
      })
      .setDepth(DEPTH.smoke);
  }

  /** 서버 트럭 상태 반영. 매 프레임 불러도 바뀐 것만 다시 그린다 */
  update(state: TruckStateView | undefined): void {
    const cooking = !!state?.cookingItem;
    if (cooking !== this.smoke.emitting) {
      if (cooking) this.smoke.start();
      else this.smoke.stop();
    }
    const parts: string[] = [];
    if (cooking) parts.push(t("truck.cooking"));
    if (state && state.waiting > 0) parts.push(t("truck.waiting", { count: state.waiting }));
    const text = parts.join(" · ");
    if (text !== this.lastStatus) {
      this.lastStatus = text;
      this.status.setText(text);
    }
  }

  setHintVisible(visible: boolean): void {
    if (this.hint.visible !== visible) this.hint.setVisible(visible);
  }
}
