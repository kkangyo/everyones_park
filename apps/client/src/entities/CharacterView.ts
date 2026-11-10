import Phaser from "phaser";
import type { Appearance, Facing, Vec2 } from "@park/shared";
import { DEPTH, bodySheet, foodSheet, idleFrame, outfitSheet, walkAnimKey, type Pose } from "../assets";

/** 이름표 글자를 선명하게: 카메라 최대 확대 배율만큼 높은 해상도로 그린다 */
const TEXT_RESOLUTION = 4;
const NAMEPLATE_OFFSET_Y = -34;
const BUBBLE_OFFSET_Y = -46;

/** 손에 든 간식 하나 (서버 HeldFoodView 중 그림에 필요한 것) */
export interface HeldFood {
  item: string;
  stage: number;
}

/**
 * 간식을 그리는 손 위치 (발밑 기준 px). [한 개일 때, 두 개일 때 각각].
 * 위를 보면 몸 뒤에 가려지도록 몸보다 먼저 그린다.
 */
const HAND_OFFSETS: Record<Facing, { one: Vec2[]; two: Vec2[] }> = {
  down: { one: [{ x: 0, y: -12 }], two: [{ x: -5, y: -12 }, { x: 5, y: -12 }] },
  up: { one: [{ x: 0, y: -14 }], two: [{ x: -5, y: -14 }, { x: 5, y: -14 }] },
  left: { one: [{ x: -6, y: -12 }], two: [{ x: -7, y: -13 }, { x: -3, y: -11 }] },
  right: { one: [{ x: 6, y: -12 }], two: [{ x: 7, y: -13 }, { x: 3, y: -11 }] },
};

/**
 * 캐릭터 그림 (몸 + 옷 레이어 + 손에 든 간식 + 이름표 + 말풍선). 내 캐릭터와 다른 사람 캐릭터가 같이 쓴다.
 * 위치(x, y)는 **발밑 가운데** 기준.
 * 걷기 애니메이션은 몸에만 걸고, 옷은 매번 몸과 같은 프레임 번호로 맞춘다 (3-7).
 * 간식을 들고 있으면 '들고 걷기' 자세(carry)로 그린다 (4-5).
 */
export class CharacterView {
  /** 몸·옷·간식을 묶은 컨테이너. 위치·앞뒤 순서(depth)는 이것 하나로 정한다 */
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly outfit: Phaser.GameObjects.Sprite;
  private readonly foods: Phaser.GameObjects.Image[] = [];
  private readonly nameplate: Phaser.GameObjects.Text;
  private bubble?: { text: Phaser.GameObjects.Text; timer: Phaser.Time.TimerEvent };
  private appearance: Appearance;
  private hands: readonly HeldFood[] = [];
  private facing: Facing = "down";
  private moving = false;

  constructor(
    private readonly scene: Phaser.Scene,
    pos: Vec2,
    nickname: string,
    appearance: Appearance,
  ) {
    this.appearance = appearance;
    this.body = scene.add.sprite(0, 0, bodySheet(appearance.gender).key, idleFrame(this.facing)).setOrigin(0.5, 1);
    this.outfit = scene.add.sprite(0, 0, outfitSheet(appearance.outfit).key, idleFrame(this.facing)).setOrigin(0.5, 1);
    this.root = scene.add.container(pos.x, pos.y, [this.body, this.outfit]);
    this.nameplate = scene.add
      .text(pos.x, pos.y + NAMEPLATE_OFFSET_Y, nickname, {
        fontSize: "9px",
        color: "#ffffff",
        stroke: "#1b2433",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setResolution(TEXT_RESOLUTION);
    this.applyPose();
  }

  get position(): Vec2 {
    return { x: this.root.x, y: this.root.y };
  }

  setPose(pos: Vec2, facing: Facing, moving: boolean): void {
    this.root.setPosition(pos.x, pos.y);
    this.facing = facing;
    this.moving = moving;
    this.applyPose();
  }

  /** 옷·성별이 바뀌면 그림을 바꾼다 (같으면 아무것도 안 함) */
  setAppearance(appearance: Appearance): void {
    if (appearance.gender === this.appearance.gender && appearance.outfit === this.appearance.outfit) return;
    this.appearance = appearance;
    this.body.anims.stop();
    this.body.setTexture(bodySheet(appearance.gender).key);
    this.outfit.setTexture(outfitSheet(appearance.outfit).key);
    this.applyPose();
  }

  /** 손에 든 간식. 바뀌었을 때만 그림을 다시 만든다 (매 프레임 불러도 됨) */
  setHands(hands: readonly HeldFood[]): void {
    if (hands.length === this.hands.length && hands.every((h, i) => h.item === this.hands[i]!.item && h.stage === this.hands[i]!.stage)) return;
    this.hands = hands.map((h) => ({ ...h }));
    for (const f of this.foods) f.destroy();
    this.foods.length = 0;
    for (const h of this.hands) {
      const food = this.scene.add.image(0, 0, foodSheet(h.item).key, h.stage);
      this.root.add(food);
      this.foods.push(food);
    }
    this.applyPose();
  }

  /** 머리 위 말풍선 (몇 초 뒤 사라짐). 새로 띄우면 이전 것은 바로 지움 */
  say(text: string, durationMs = 2500): void {
    this.clearBubble();
    const bubble = this.scene.add
      .text(this.root.x, this.root.y + BUBBLE_OFFSET_Y, text, {
        fontSize: "9px",
        color: "#1b2433",
        backgroundColor: "#ffffff",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setResolution(TEXT_RESOLUTION)
      .setDepth(DEPTH.bubble);
    this.bubble = { text: bubble, timer: this.scene.time.delayedCall(durationMs, () => this.clearBubble()) };
  }

  destroy(): void {
    this.clearBubble();
    this.root.destroy();
    this.nameplate.destroy();
  }

  private clearBubble(): void {
    if (!this.bubble) return;
    this.bubble.timer.remove();
    this.bubble.text.destroy();
    this.bubble = undefined;
  }

  private applyPose(): void {
    const { x, y } = this.root;
    // 발밑 y 가 클수록(화면 아래일수록) 앞에 그린다. 이름표는 다른 캐릭터·나무보다 위에
    this.root.setDepth(DEPTH.ysortBase + y);
    this.nameplate.setPosition(x, y + NAMEPLATE_OFFSET_Y).setDepth(DEPTH.nameplate + y);
    this.bubble?.text.setPosition(x, y + BUBBLE_OFFSET_Y);

    const pose: Pose = this.foods.length > 0 ? "carry" : "normal";
    if (this.moving) {
      this.body.anims.play(walkAnimKey(this.appearance.gender, this.facing, pose), true);
    } else {
      this.body.anims.stop();
      this.body.setFrame(idleFrame(this.facing, pose));
    }
    this.outfit.setFrame(this.body.frame.name);
    this.placeFoods();
  }

  /** 간식을 손 위치에. 위를 볼 때는 몸 뒤, 나머지는 몸 앞 */
  private placeFoods(): void {
    if (this.foods.length === 0) return;
    const offsets = HAND_OFFSETS[this.facing][this.foods.length === 1 ? "one" : "two"];
    // 걸을 때 몸이 1px 올라가는 프레임(1, 3번)에 맞춰 같이 올림
    const bob = Number(this.body.frame.name) % 2 === 1 ? -1 : 0;
    this.foods.forEach((food, i) => {
      const o = offsets[i]!;
      food.setPosition(o.x, o.y + bob);
      if (this.facing === "up") this.root.sendToBack(food);
      else this.root.bringToTop(food);
    });
  }
}
