import { artHandOffset } from "../characterArt";
import Phaser from "phaser";
import { EMOTES, EMOTE_SHOW_MS, MENU, type EmoteAction, handDrawOrder, isHandSide, bodyIdOf, straightFacing, type Appearance, type Facing, type MenuKind, type Vec2 } from "@park/shared";
import { CHARACTER, FOOD, DEPTH, EMOTE_SHEET, GENERATED, bodyHead, bodySheet, foodSheet, idleFrame, outfitSheet, poseAnimKey, type Pose } from "../assets";
import { t, type MessageKey } from "../i18n";
import { smoothText } from "../ui/text";

const NAMEPLATE_OFFSET_Y = -34;
const BUBBLE_OFFSET_Y = -46;
/** 이모티콘 말풍선이 튀어나오는 시간, 사라지는 시간 (ms) */
const EMOTE_POP_MS = 140;
const EMOTE_FADE_MS = 300;

/**
 * 이모티콘 동작 (5-5). 그림 없이 코드로: 캐릭터 그림 전체를 잠깐 옮기거나(jump·shiver) 장갑을 흔든다(wave).
 * 발밑 위치(앞뒤 순서·이름표)는 그대로 두고 그림만 움직인다
 */
const ACTION_MS: Record<EmoteAction, number> = { wave: 1600, jump: 760, shiver: 1500 };
/** 폴짝 한 번 시간, 높이 (px) */
const HOP_MS = 380;
const HOP_PX = 5;
/** 떨기: 이 간격(ms)마다 1px 씩 좌우 */
const SHIVER_STEP_MS = 70;
/** 손 흔들기: 이 간격마다 장갑이 좌우로 2px */
const WAVE_STEP_MS = 160;
/** 흔드는 장갑 위치 (발밑 기준, 보는 방향의 오른쪽 어깨 위). 앉아 있으면 sitDrop 만큼 내린다 */
const WAVE_HAND = { x: 9, y: -21 } as const;

/** 손에 든 간식 하나 (서버 HeldFoodView 중 그림에 필요한 것) */
export interface HeldFood {
  item: string;
  /** Anatomical left/right, persisted by the server. */
  hand: string;
  stage: number;
  /** 먹는 중 (4-6). 이 간식으로 먹는 연출을 한다 */
  eating: boolean;
}

/** 몸이 간식을 가리는 방향 (위쪽을 볼 때) */
const FOOD_BEHIND: ReadonlySet<Facing> = new Set(["up", "up-left", "up-right"]);

/**
 * 먹는 연출 한 입 (ms): 고개 돌리기 → 먹기/마시기 → 돌아오기 → 쉬기.
 *   food : 빠르게 돌아보고 씹으며 고개를 끄덕인다 ('냠')
 *   drink: 컵 쪽을 천천히 돌아보고 홀짝인다, 고개는 끄덕이지 않음 ('호로록')
 * 손·음식은 hand-rig의 고정 부착점 유지. 고개 돌리기·끄덕임·말풍선으로 먹기를 표현한다
 */
const BITES: Record<MenuKind, { raise: number; hold: number; lower: number; rest: number; nod: boolean; text: MessageKey }> = {
  food: { raise: 350, hold: 960, lower: 350, rest: 900, nod: true, text: "eat.bite" },
  drink: { raise: 750, hold: 1100, lower: 750, rest: 1400, nod: false, text: "eat.sip" },
};
const cycleOf = (b: (typeof BITES)[MenuKind]) => b.raise + b.hold + b.lower + b.rest;
/** 씹을 때 고개를 한 번 내렸다 올리는 간격 */
const NOD_MS = 160;
/** 한 입 진행도에 따라 고개를 간식 쪽으로 돌린다 (0~1). 음식 위치와 무관 */
const TURN_AT = 0.25;
/** 방향별 얼굴 가운데 x (발밑 기준). 말풍선 위치에만 사용한다 */
const FACE_X: Record<Facing, number> = { down: 0, up: 0, left: -5, right: 5, "down-left": -2, "down-right": 2, "up-left": -1, "up-right": 1 };

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
  /** 머리 위 이모티콘 (5-4). 글자 말풍선과 같은 자리라서 하나만 띄운다 */
  private emote?: { image: Phaser.GameObjects.Image; timer: Phaser.Time.TimerEvent };
  /** 지금 하는 이모티콘 동작 (5-5) */
  private action?: { kind: EmoteAction; startedAt: number };
  /** 손 흔들기 장갑 (처음 필요할 때 만든다) */
  private mitten?: Phaser.GameObjects.Image;
  /** 발밑 위치. 동작 중에는 그림(root)만 여기서 조금 벗어난다 */
  private ground: Vec2;
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
  /** 내 화면에서 숨김 (6-6). 그림·이름표·말풍선 모두 안 보이고 누를 수도 없다 */
  private hidden = false;
  /** 닉네임 표시 설정 (6-5) */
  private nameShown = true;

  constructor(
    private readonly scene: Phaser.Scene,
    pos: Vec2,
    nickname: string,
    appearance: Appearance,
  ) {
    this.appearance = appearance;
    this.ground = { ...pos };
    this.body = scene.add.sprite(0, 0, bodySheet(bodyIdOf(appearance)).key, idleFrame(this.facing)).setOrigin(0.5, 1);
    this.head = scene.add.sprite(0, 0, bodySheet(bodyIdOf(appearance)).key, idleFrame(this.facing)).setOrigin(0.5, 1).setVisible(false);
    this.outfit = scene.add.sprite(0, 0, outfitSheet(appearance.outfit).key, idleFrame(this.facing)).setOrigin(0.5, 1);
    for (const layer of [this.body, this.head, this.outfit]) layer.setScale(1 / CHARACTER.pixelRatio);
    this.root = scene.add.container(pos.x, pos.y, [this.body, this.head, this.outfit]).setScale(CHARACTER.worldScale);
    this.nameplate = smoothText(
      scene.add.text(pos.x, pos.y + NAMEPLATE_OFFSET_Y * CHARACTER.worldScale, nickname, {
        fontSize: "9px",
        color: "#ffffff",
        stroke: "#1b2433",
        strokeThickness: 3,
      }),
    ).setOrigin(0.5, 1);
    this.applyPose();
  }

  get position(): Vec2 {
    return { ...this.ground };
  }

  /**
   * 캐릭터를 누르면 onTap (내 캐릭터: 손에 든 간식 말풍선, 다른 사람: 숨기기 메뉴).
   * pointer 는 누른 화면 위치. 그 위치의 땅 클릭 이동은 일어나지 않는다
   */
  enableTap(onTap: (pointer: Phaser.Input.Pointer) => void): void {
    this.body.setInteractive({ useHandCursor: true }).on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onTap);
  }

  /** 닉네임 표시 켜기·끄기 (6-5). 매 프레임 불러도 된다 */
  setNameVisible(show: boolean): void {
    if (show === this.nameShown) return;
    this.nameShown = show;
    this.nameplate.setVisible(show && !this.hidden);
  }

  /** 내 화면에서 숨기기·다시 보기 (6-6). 매 프레임 불러도 된다 */
  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    this.root.setVisible(!hidden);
    this.nameplate.setVisible(this.nameShown && !hidden);
    this.steam?.setVisible(!hidden);
    if (this.body.input) this.body.input.enabled = !hidden;
    if (!hidden) return;
    this.clearBubble();
    this.clearEmote();
    for (const pop of this.bitePops) pop.destroy();
    this.bitePops.clear();
  }

  setPose(pos: Vec2, facing: Facing, moving: boolean, seated = false): void {
    this.ground = { ...pos };
    this.facing = facing;
    this.moving = moving;
    this.seated = seated;
    this.applyPose();
  }

  /** 옷·성별이 바뀌면 그림을 바꾼다 (같으면 아무것도 안 함) */
  setAppearance(appearance: Appearance): void {
    if (appearance.gender === this.appearance.gender && appearance.face === this.appearance.face && appearance.outfit === this.appearance.outfit) return;
    this.appearance = appearance;
    this.body.anims.stop();
    this.body.setTexture(bodySheet(bodyIdOf(appearance)).key);
    this.head.setTexture(bodySheet(bodyIdOf(appearance)).key);
    this.outfit.setTexture(outfitSheet(appearance.outfit).key);
    this.applyPose();
  }

  /** 손에 든 간식. 바뀌었을 때만 그림을 다시 만든다 (매 프레임 불러도 됨) */
  setHands(hands: readonly HeldFood[]): void {
    const same = (h: HeldFood, i: number) => h.item === this.hands[i]!.item && h.stage === this.hands[i]!.stage && h.hand === this.hands[i]!.hand && h.eating === this.hands[i]!.eating;
    if (hands.length === this.hands.length && hands.every(same)) return;
    this.hands = hands.map((h) => ({ item: h.item, hand: h.hand, stage: h.stage, eating: h.eating }));
    for (const f of this.foods) f.destroy();
    this.foods.length = 0;
    for (const h of this.hands) {
      const food = this.scene.add.image(0, 0, foodSheet(h.item).key, h.stage)
        .setOrigin(FOOD.grip.x / FOOD.frameWidth, FOOD.grip.y / FOOD.frameHeight);
      this.root.add(food);
      this.foods.push(food);
    }
    this.applyPose();
  }

  /** 머리 위 말풍선 (몇 초 뒤 사라짐). 새로 띄우면 이전 것(이모티콘 포함)은 바로 지움 */
  say(text: string, durationMs = 2500): void {
    if (this.hidden) return;
    this.clearBubble();
    this.clearEmote();
    const bubble = smoothText(
      this.scene.add.text(this.ground.x, this.ground.y + BUBBLE_OFFSET_Y * CHARACTER.worldScale, text, {
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

  /**
   * 머리 위 이모티콘 말풍선 (5-4). durationMs: 남은 표시 시간 (늦게 받았으면 그만큼 짧게).
   * 처음부터 띄울 때만 톡 튀어나오고, 끝날 때 흐려지며 사라진다
   */
  showEmote(id: string, durationMs = EMOTE_SHOW_MS): void {
    const frame = EMOTES.findIndex((e) => e.id === id);
    if (frame < 0 || durationMs <= 0 || this.hidden) return;
    this.clearBubble();
    this.clearEmote();
    const image = this.scene.add
      .image(this.ground.x, this.ground.y + BUBBLE_OFFSET_Y * CHARACTER.worldScale, EMOTE_SHEET.key, frame)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.bubble);
    if (durationMs > EMOTE_SHOW_MS - EMOTE_POP_MS) {
      // 처음부터 보는 경우만 동작도 한다 (늦게 들어와서 지난 이모티콘을 받았으면 말풍선만)
      const action = EMOTES[frame]!.action;
      this.action = action ? { kind: action, startedAt: this.scene.time.now } : undefined;
      image.setScale(0.5);
      this.scene.tweens.add({ targets: image, scale: 1, duration: EMOTE_POP_MS, ease: "Back.easeOut" });
    }
    const timer = this.scene.time.delayedCall(Math.max(0, durationMs - EMOTE_FADE_MS), () => {
      this.scene.tweens.add({ targets: image, alpha: 0, duration: Math.min(EMOTE_FADE_MS, durationMs), onComplete: () => this.clearEmote() });
    });
    this.emote = { image, timer };
  }

  destroy(): void {
    this.clearBubble();
    this.clearEmote();
    for (const pop of this.bitePops) pop.destroy();
    this.steam?.destroy();
    this.mitten?.destroy();
    this.root.destroy();
    this.nameplate.destroy();
  }

  private clearBubble(): void {
    if (!this.bubble) return;
    this.bubble.timer.remove();
    this.bubble.text.destroy();
    this.bubble = undefined;
  }

  private clearEmote(): void {
    if (!this.emote) return;
    this.emote.timer.remove();
    this.scene.tweens.killTweensOf(this.emote.image);
    this.emote.image.destroy();
    this.emote = undefined;
  }

  private applyPose(): void {
    const { x, y } = this.ground;
    const offset = this.actionOffset();
    this.root.setPosition(x + offset.x, y + offset.y);
    // 발밑 y 가 클수록(화면 아래일수록) 앞에 그린다. 이름표는 다른 캐릭터·나무보다 위에
    this.root.setDepth(DEPTH.ysortBase + y);
    this.nameplate.setPosition(x, y + NAMEPLATE_OFFSET_Y * CHARACTER.worldScale).setDepth(DEPTH.nameplate + y);
    this.bubble?.text.setPosition(x, y + BUBBLE_OFFSET_Y * CHARACTER.worldScale);
    this.emote?.image.setPosition(x, y + BUBBLE_OFFSET_Y * CHARACTER.worldScale);

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
    this.placeMitten();
  }

  /** 지금 동작에 따른 그림 이동 (px). 동작이 끝났으면 지운다 */
  private actionOffset(): Vec2 {
    if (!this.action) return { x: 0, y: 0 };
    const elapsed = this.scene.time.now - this.action.startedAt;
    if (elapsed >= ACTION_MS[this.action.kind]) {
      this.action = undefined;
      return { x: 0, y: 0 };
    }
    switch (this.action.kind) {
      case "jump":
        // 앉아 있으면 폴짝 뛰지 않는다 (말풍선만)
        return this.seated ? { x: 0, y: 0 } : { x: 0, y: -Math.round(HOP_PX * Math.sin((Math.PI * (elapsed % HOP_MS)) / HOP_MS)) };
      case "shiver":
        return { x: Math.floor(elapsed / SHIVER_STEP_MS) % 2 === 0 ? -1 : 1, y: 0 };
      case "wave":
        return { x: 0, y: 0 };
    }
  }

  /**
   * 손 흔들기: 보는 방향의 오른쪽(화면 기준) 어깨 위에서 장갑을 좌우로 흔든다.
   * 왼쪽을 보면 왼쪽 위. 뒷모습이면 몸 뒤가 아니라 머리 옆에 보이게 맨 앞에 그린다
   */
  private placeMitten(): void {
    const waving = this.action?.kind === "wave";
    if (!waving) {
      this.mitten?.setVisible(false);
      return;
    }
    if (!this.mitten) {
      this.mitten = this.scene.add.image(0, 0, GENERATED.mitten).setOrigin(0.5, 1);
      this.root.add(this.mitten);
    }
    const side = this.facing.includes("left") ? -1 : 1;
    const elapsed = this.scene.time.now - this.action!.startedAt;
    const swing = Math.floor(elapsed / WAVE_STEP_MS) % 2 === 0 ? 0 : 2;
    const drop = this.seated ? CHARACTER.sitDrop : 0;
    this.mitten
      .setPosition(side * (WAVE_HAND.x + swing), WAVE_HAND.y + drop)
      .setFlipX(side < 0)
      .setVisible(true);
    this.root.bringToTop(this.mitten);
  }

  /** 음식의 (6,9) 잡는 지점을 해당 손에 고정한다. 먹기 단계·음식 개수로 이동하지 않는다. */
  private placeFoods(): void {
    // 앉으면 4방향 그림이라 손 위치도 상하좌우 것을 쓰고, 내려간 상체만큼 내린다
    const facing = this.seated ? straightFacing(this.facing) : this.facing;
    const bodyId = bodyIdOf(this.appearance);
    // 몸이 1px 올라가는 프레임(1, 3번: 걷기·숨 들이쉬기)에 맞춰 같이 올림
    const lift = Number(this.body.frame.name) % 2 === 1 ? -1 : 0;
    const drop = this.seated ? CHARACTER.sitDrop : 0;

    const eatingIndex = this.hands.findIndex((h) => h.eating);
    const eatingItem = eatingIndex >= 0 && this.foods[eatingIndex] ? MENU.get(this.hands[eatingIndex]!.item) : undefined;
    const style = BITES[eatingItem?.kind ?? "food"];
    const bite = eatingItem ? this.bitePhase(style) : null;
    // 서버에 고정된 손의 부착점으로 먹는 쪽을 정한다 (음식 개수와 무관).
    const heldHand = this.hands[eatingIndex]?.hand;
    const hand = heldHand && isHandSide(heldHand) ? artHandOffset(bodyId, facing, heldHand, this.seated, Number(this.body.frame.name) % 4) : undefined;
    const side = hand ? Math.sign(hand.x) || Math.sign(FACE_X[facing]) || 1 : 0;
    const turn = bite && bite.k >= TURN_AT ? turnToward(facing, side) : facing;
    this.turnHead(bite ? turn : null, bite?.nod ?? 0, lift, drop);

    const column = Number(this.body.frame.name) % CHARACTER.framesPerRow;
    // Establish an explicit far-to-near order, independent of purchase/array order.
    const order = handDrawOrder(facing);
    const indices = this.foods.map((_, i) => i).sort((a, b) =>
      order.indexOf(this.hands[a]!.hand as "left" | "right") - order.indexOf(this.hands[b]!.hand as "left" | "right"));
    for (const i of indices) {
      const food = this.foods[i]!;
      const hand = this.hands[i]!.hand;
      food.setVisible(isHandSide(hand));
      if (!isHandSide(hand)) continue;
      const grip = artHandOffset(bodyId, facing, hand, this.seated, column);
      food.setPosition(grip.x, grip.y);
      if (i === eatingIndex && bite && bite.biteNo !== this.lastBite && bite.atMouth) {
        this.lastBite = bite.biteNo;
        this.popBite(FACE_X[turn] + side * 7, bodyHead(bodyId).biteY + lift + drop - 6, style.text);
      }
      this.root.bringToTop(food);
    }
    // Move the whole ordered food group behind the body for back views.
    if (FOOD_BEHIND.has(facing)) {
      for (const i of [...indices].reverse()) this.root.sendToBack(this.foods[i]!);
    }
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
    // 음식의 origin은 잡는 지점 (6,9)이므로 프레임 위쪽 y=0에서 김이 난다
    this.steam.setPosition(this.root.x + food.x * CHARACTER.worldScale, this.root.y + (food.y - FOOD.grip.y) * CHARACTER.worldScale).setDepth(this.root.depth + 0.5);
    if (!this.steam.emitting) this.steam.start();
  }

  /**
   * 지금 한 입의 어디쯤인지. k: 고개를 돌려 먹는 연출의 진행도 (0~1),
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
    this.head.setCrop(0, 0, CHARACTER.frameWidth, (headBottom + 1 + lift) * CHARACTER.pixelRatio);
    this.head.setPosition(0, drop + nod).setVisible(true);
    this.body.setCrop(0, (headBottom + 1 + lift + drop) * CHARACTER.pixelRatio, CHARACTER.frameWidth, CHARACTER.frameHeight);
  }

  /** 한 입 먹을 때 입 옆에 '냠'·'호로록'이 떠올랐다 사라진다 */
  private popBite(dx: number, dy: number, key: MessageKey): void {
    if (this.hidden) return;
    const pop = smoothText(
      this.scene.add.text(this.root.x + dx * CHARACTER.worldScale, this.root.y + dy * CHARACTER.worldScale, t(key), {
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
