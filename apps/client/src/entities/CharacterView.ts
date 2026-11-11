import Phaser from "phaser";
import { MENU, bodyIdOf, straightFacing, type Appearance, type Facing, type MenuKind, type Vec2 } from "@park/shared";
import { BODY_HAND_DY, CHARACTER, DEPTH, GENERATED, bodyHead, bodySheet, foodSheet, idleFrame, outfitSheet, poseAnimKey, type Pose } from "../assets";
import { t, type MessageKey } from "../i18n";
import { smoothText } from "../ui/text";

const NAMEPLATE_OFFSET_Y = -34;
const BUBBLE_OFFSET_Y = -46;

/** 손에 든 간식 하나 (서버 HeldFoodView 중 그림에 필요한 것) */
export interface HeldFood {
  item: string;
  stage: number;
  /** 먹는 중 (4-6). 이 간식으로 먹는 연출을 한다 */
  eating: boolean;
}

/**
 * 간식을 그리는 손 위치 (발밑 기준 px). [한 개일 때, 두 개일 때 각각].
 * 위쪽(up, up-left, up-right)을 보면 몸 뒤에 가려지도록 몸보다 먼저 그린다.
 */
const HAND_OFFSETS: Record<Facing, { one: Vec2[]; two: Vec2[] }> = {
  down: { one: [{ x: 0, y: -12 }], two: [{ x: -5, y: -12 }, { x: 5, y: -12 }] },
  up: { one: [{ x: 0, y: -14 }], two: [{ x: -5, y: -14 }, { x: 5, y: -14 }] },
  left: { one: [{ x: -6, y: -12 }], two: [{ x: -7, y: -13 }, { x: -3, y: -11 }] },
  right: { one: [{ x: 6, y: -12 }], two: [{ x: 7, y: -13 }, { x: 3, y: -11 }] },
  "down-left": { one: [{ x: -4, y: -12 }], two: [{ x: -6, y: -12 }, { x: 1, y: -12 }] },
  "down-right": { one: [{ x: 4, y: -12 }], two: [{ x: 6, y: -12 }, { x: -1, y: -12 }] },
  "up-left": { one: [{ x: -3, y: -14 }], two: [{ x: -6, y: -14 }, { x: 2, y: -15 }] },
  "up-right": { one: [{ x: 3, y: -14 }], two: [{ x: 6, y: -14 }, { x: -2, y: -15 }] },
};

/** 몸이 간식을 가리는 방향 (위쪽을 볼 때) */
const FOOD_BEHIND: ReadonlySet<Facing> = new Set(["up", "up-left", "up-right"]);

/**
 * 먹는 연출 한 입 (ms): 입으로 올리기 → 입에 대고 있기 → 내리기 → 쉬기. 메뉴 kind 마다 다르다.
 *   food : 빠르게 올려 씹으며 고개를 끄덕인다 ('냠')
 *   drink: 컵을 천천히 올려 홀짝이고 천천히 내린다, 고개는 끄덕이지 않음 ('호로록')
 * 그림 없이 코드로: 간식 위치를 옮기고, 머리만 간식 쪽 방향 그림으로 바꿔 끼운다
 */
const BITES: Record<MenuKind, { raise: number; hold: number; lower: number; rest: number; nod: boolean; text: MessageKey }> = {
  food: { raise: 350, hold: 960, lower: 350, rest: 900, nod: true, text: "eat.bite" },
  drink: { raise: 750, hold: 1100, lower: 750, rest: 1400, nod: false, text: "eat.sip" },
};
const cycleOf = (b: (typeof BITES)[MenuKind]) => b.raise + b.hold + b.lower + b.rest;
/** 씹을 때 고개를 한 번 내렸다 올리는 간격 */
const NOD_MS = 160;
/** 간식이 이만큼 올라오면 고개를 간식 쪽으로 돌린다 (0~1) */
const TURN_AT = 0.25;
/** 방향별 얼굴 가운데 x (발밑 기준). 간식을 입 앞으로 가져갈 때 쓴다 */
const FACE_X: Record<Facing, number> = { down: 0, up: 0, left: -5, right: 5, "down-left": -2, "down-right": 2, "up-left": -1, "up-right": 1 };
/** 입 앞에서 간식이 얼굴 가운데에서 비켜나는 거리 (간식이 있는 손 쪽으로) */
const BITE_SIDE_PX = 6;

/**
 * 간식이 있는 쪽(side: 화면 왼쪽 -1, 오른쪽 +1)으로 고개를 돌린 방향.
 * 정면·뒷모습은 대각선으로, 비스듬히 보는데 반대쪽 손이면 정면으로. 옆모습은 이미 간식을 보고 있어 그대로
 */
function turnToward(facing: Facing, side: number): Facing {
  if (side === 0) return facing;
  if (facing === "down") return side < 0 ? "down-left" : "down-right";
  if (facing === "up") return side < 0 ? "up-left" : "up-right";
  if ((facing === "down-left" && side > 0) || (facing === "down-right" && side < 0)) return "down";
  if ((facing === "up-left" && side > 0) || (facing === "up-right" && side < 0)) return "up";
  return facing;
}

const smoothstep = (k: number) => k * k * (3 - 2 * k);

/**
 * 캐릭터 그림 (몸 + 옷 레이어 + 손에 든 간식 + 이름표 + 말풍선). 내 캐릭터와 다른 사람 캐릭터가 같이 쓴다.
 * 위치(x, y)는 **발밑 가운데** 기준.
 * 걷기 애니메이션은 몸에만 걸고, 옷은 매번 몸과 같은 프레임 번호로 맞춘다 (3-7).
 * 간식을 들고 있으면 '들고 걷기' 자세(carry)로 그린다 (4-5).
 * 자리에 앉아 있으면 앉기 자세(sit, 들고 있으면 sitCarry)로 숨쉬기 애니메이션을 돌린다 (5-2).
 */
export class CharacterView {
  /** 몸·옷·간식을 묶은 컨테이너. 위치·앞뒤 순서(depth)는 이것 하나로 정한다 */
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Sprite;
  /** 먹을 때만: 몸 그림의 머리 부분만 잘라 간식 쪽 방향으로 바꿔 끼운 것 (몸과 옷 사이에 그림) */
  private readonly head: Phaser.GameObjects.Sprite;
  private readonly outfit: Phaser.GameObjects.Sprite;
  private readonly foods: Phaser.GameObjects.Image[] = [];
  private readonly nameplate: Phaser.GameObjects.Text;
  private bubble?: { text: Phaser.GameObjects.Text; timer: Phaser.Time.TimerEvent };
  private appearance: Appearance;
  private hands: readonly HeldFood[] = [];
  private facing: Facing = "down";
  private moving = false;
  private seated = false;
  /** 사람마다 먹는 박자가 같지 않게 */
  private readonly biteOffset = Math.random() * 10_000;
  /** '냠'을 마지막으로 띄운 한 입 번호 */
  private lastBite = -1;
  private readonly bitePops = new Set<Phaser.GameObjects.Text>();
  /** 뜨거운 것을 먹는 동안 컵·그릇에서 피어오르는 김 (처음 필요할 때 만든다) */
  private steam?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(
    private readonly scene: Phaser.Scene,
    pos: Vec2,
    nickname: string,
    appearance: Appearance,
  ) {
    this.appearance = appearance;
    this.body = scene.add.sprite(0, 0, bodySheet(bodyIdOf(appearance)).key, idleFrame(this.facing)).setOrigin(0.5, 1);
    this.head = scene.add.sprite(0, 0, bodySheet(bodyIdOf(appearance)).key, idleFrame(this.facing)).setOrigin(0.5, 1).setVisible(false);
    this.outfit = scene.add.sprite(0, 0, outfitSheet(appearance.outfit).key, idleFrame(this.facing)).setOrigin(0.5, 1);
    this.root = scene.add.container(pos.x, pos.y, [this.body, this.head, this.outfit]);
    this.nameplate = smoothText(
      scene.add.text(pos.x, pos.y + NAMEPLATE_OFFSET_Y, nickname, {
        fontSize: "9px",
        color: "#ffffff",
        stroke: "#1b2433",
        strokeThickness: 3,
      }),
    ).setOrigin(0.5, 1);
    this.applyPose();
  }

  get position(): Vec2 {
    return { x: this.root.x, y: this.root.y };
  }

  /** 캐릭터를 누르면 onTap (내 캐릭터: 손에 든 간식 말풍선). 그 위치의 땅 클릭 이동은 일어나지 않는다 */
  enableTap(onTap: () => void): void {
    this.body.setInteractive({ useHandCursor: true }).on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onTap);
  }

  setPose(pos: Vec2, facing: Facing, moving: boolean, seated = false): void {
    this.root.setPosition(pos.x, pos.y);
    this.facing = facing;
    this.moving = moving;
    this.seated = seated;
    this.applyPose();
  }

  /** 옷·성별이 바뀌면 그림을 바꾼다 (같으면 아무것도 안 함) */
  setAppearance(appearance: Appearance): void {
    if (appearance.gender === this.appearance.gender && appearance.outfit === this.appearance.outfit) return;
    this.appearance = appearance;
    this.body.anims.stop();
    this.body.setTexture(bodySheet(bodyIdOf(appearance)).key);
    this.head.setTexture(bodySheet(bodyIdOf(appearance)).key);
    this.outfit.setTexture(outfitSheet(appearance.outfit).key);
    this.applyPose();
  }

  /** 손에 든 간식. 바뀌었을 때만 그림을 다시 만든다 (매 프레임 불러도 됨) */
  setHands(hands: readonly HeldFood[]): void {
    const same = (h: HeldFood, i: number) => h.item === this.hands[i]!.item && h.stage === this.hands[i]!.stage && h.eating === this.hands[i]!.eating;
    if (hands.length === this.hands.length && hands.every(same)) return;
    this.hands = hands.map((h) => ({ item: h.item, stage: h.stage, eating: h.eating }));
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
    const bubble = smoothText(
      this.scene.add.text(this.root.x, this.root.y + BUBBLE_OFFSET_Y, text, {
        fontSize: "9px",
        color: "#1b2433",
        backgroundColor: "#ffffff",
        padding: { x: 4, y: 2 },
      }),
    )
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.bubble);
    this.bubble = { text: bubble, timer: this.scene.time.delayedCall(durationMs, () => this.clearBubble()) };
  }

  destroy(): void {
    this.clearBubble();
    for (const pop of this.bitePops) pop.destroy();
    this.steam?.destroy();
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

    const holding = this.foods.length > 0;
    const pose: Pose = this.seated ? (holding ? "sitCarry" : "sit") : holding ? "carry" : "normal";
    if (this.moving || this.seated) {
      this.body.anims.play(poseAnimKey(bodyIdOf(this.appearance), this.facing, pose), true);
    } else {
      this.body.anims.stop();
      this.body.setFrame(idleFrame(this.facing, pose));
    }
    this.outfit.setFrame(this.body.frame.name);
    this.placeFoods();
  }

  /** 간식을 손 위치에 (먹는 중인 간식은 한 입 동작에 따라 입 앞까지). 위쪽을 볼 때는 몸 뒤, 나머지는 몸 앞 */
  private placeFoods(): void {
    // 앉으면 4방향 그림이라 손 위치도 상하좌우 것을 쓰고, 내려간 상체만큼 내린다
    const facing = this.seated ? straightFacing(this.facing) : this.facing;
    const offsets = HAND_OFFSETS[facing][this.foods.length === 1 ? "one" : "two"];
    const bodyId = bodyIdOf(this.appearance);
    // 몸이 1px 올라가는 프레임(1, 3번: 걷기·숨 들이쉬기)에 맞춰 같이 올림
    const lift = Number(this.body.frame.name) % 2 === 1 ? -1 : 0;
    const drop = this.seated ? CHARACTER.sitDrop : 0;
    const handDy = lift + drop + (BODY_HAND_DY[bodyId] ?? 0);

    const eatingIndex = this.hands.findIndex((h) => h.eating);
    const eatingItem = eatingIndex >= 0 && this.foods[eatingIndex] ? MENU.get(this.hands[eatingIndex]!.item) : undefined;
    const style = BITES[eatingItem?.kind ?? "food"];
    const bite = eatingItem ? this.bitePhase(style) : null;
    // 간식이 있는 쪽 (화면 기준). 한 손이면 보는 방향 쪽, 정면이면 오른쪽
    const hand = eatingIndex >= 0 ? offsets[eatingIndex] : undefined;
    const side = hand ? Math.sign(hand.x) || Math.sign(FACE_X[facing]) || 1 : 0;
    const turn = bite && bite.k >= TURN_AT ? turnToward(facing, side) : facing;
    this.turnHead(bite ? turn : null, bite?.nod ?? 0, lift, drop);

    this.foods.forEach((food, i) => {
      const o = offsets[i]!;
      let x = o.x;
      let y = o.y + handDy;
      if (i === eatingIndex && bite) {
        // 손 → 입 앞 (고개를 돌린 얼굴 쪽)
        const mouthX = FACE_X[turn] + side * BITE_SIDE_PX;
        const mouthY = bodyHead(bodyId).biteY + lift + drop + bite.nod;
        x = Math.round(x + (mouthX - x) * bite.k);
        y = Math.round(y + (mouthY - y) * bite.k);
        if (bite.biteNo !== this.lastBite && bite.atMouth) {
          this.lastBite = bite.biteNo;
          this.popBite(mouthX + side * 7, mouthY - 6, style.text);
        }
      }
      food.setPosition(x, y);
      if (FOOD_BEHIND.has(this.facing)) this.root.sendToBack(food);
      else this.root.bringToTop(food);
    });
    this.updateSteam(eatingItem?.hot ? this.foods[eatingIndex] : undefined);
  }

  /** 뜨거운 것을 먹는 동안 그 간식 위로 김이 난다. food 가 없으면 멈춤 (이미 나온 김은 마저 피어오름) */
  private updateSteam(food: Phaser.GameObjects.Image | undefined): void {
    if (!food) {
      if (this.steam?.emitting) this.steam.stop();
      return;
    }
    if (!this.steam) {
      this.steam = this.scene.add.particles(0, 0, GENERATED.smoke, {
        x: { min: -2, max: 2 },
        speedY: { min: -11, max: -6 },
        speedX: { min: -2, max: 2 },
        lifespan: 1200,
        scale: { start: 0.25, end: 0.75 },
        alpha: { start: 0.6, end: 0 },
        frequency: 240,
        emitting: false,
      });
    }
    // 간식 그림 윗부분에서. 캐릭터 바로 앞에 그린다
    this.steam.setPosition(this.root.x + food.x, this.root.y + food.y - 5).setDepth(this.root.depth + 0.5);
    if (!this.steam.emitting) this.steam.start();
  }

  /**
   * 지금 한 입의 어디쯤인지. k: 간식이 입으로 올라온 정도 (0 손 ~ 1 입),
   * atMouth: 입에 대고 있는 동안, nod: 씹으며 고개를 내린 px (음료는 0)
   */
  private bitePhase(b: (typeof BITES)[MenuKind]): { k: number; nod: number; atMouth: boolean; biteNo: number } {
    const cycle = cycleOf(b);
    const time = this.scene.time.now + this.biteOffset;
    const biteNo = Math.floor(time / cycle);
    const tt = time % cycle;
    const holdStart = b.raise;
    const lowerStart = holdStart + b.hold;
    const restStart = lowerStart + b.lower;
    const atMouth = tt >= holdStart && tt < lowerStart;
    const k = tt < holdStart ? tt / b.raise : atMouth ? 1 : tt < restStart ? 1 - (tt - lowerStart) / b.lower : 0;
    const nod = atMouth && b.nod ? Math.floor((tt - holdStart) / NOD_MS) % 2 : 0;
    return { k: smoothstep(k), nod, atMouth, biteNo };
  }

  /**
   * 머리만 다른 방향으로: 몸 그림에서 턱 아래만 남기고, 같은 시트의 turn 방향 '보통' 프레임에서 머리 부분만 잘라 겹친다.
   * 앉아 있으면 앉기 그림의 머리가 sitDrop 만큼 아래에 있으므로 같이 내린다. turn 이 null 이면 원래대로
   */
  private turnHead(turn: Facing | null, nod: number, lift: number, drop: number): void {
    if (turn === null || (turn === this.facing && nod === 0)) {
      if (this.head.visible) {
        this.head.setVisible(false);
        this.body.setCrop();
      }
      return;
    }
    const { headBottom } = bodyHead(bodyIdOf(this.appearance));
    const col = Number(this.body.frame.name) % CHARACTER.framesPerRow;
    // 서 있는 그림의 1·3열은 이미 1px 올라가 있다 (lift 는 그 열의 값). 앉기는 숨쉬기 1·3열이 같은 1px
    this.head.setFrame(idleFrame(turn, "normal") + col);
    this.head.setCrop(0, 0, CHARACTER.frameWidth, headBottom + 1 + lift);
    this.head.setPosition(0, drop + nod).setVisible(true);
    this.body.setCrop(0, headBottom + 1 + lift + drop, CHARACTER.frameWidth, CHARACTER.frameHeight);
  }

  /** 한 입 먹을 때 입 옆에 '냠'·'호로록'이 떠올랐다 사라진다 */
  private popBite(dx: number, dy: number, key: MessageKey): void {
    const pop = smoothText(
      this.scene.add.text(this.root.x + dx, this.root.y + dy, t(key), {
        fontSize: "7px",
        color: "#ffffff",
        stroke: "#1b2433",
        strokeThickness: 2,
      }),
    )
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.bubble);
    this.bitePops.add(pop);
    this.scene.tweens.add({
      targets: pop,
      y: pop.y - 8,
      alpha: 0,
      duration: 700,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.bitePops.delete(pop);
        pop.destroy();
      },
    });
  }
}
