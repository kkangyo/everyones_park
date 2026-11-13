import Phaser from "phaser";
import { catRowOf, type CatAction, type CatFx, type Facing, type Vec2 } from "@park/shared";
import { CAT_ANIMS, CAT_SHEET, DEPTH, catAnimKey } from "../assets";
import { t } from "../i18n";
import { smoothText } from "../ui/text";

/** 머리 위 효과를 띄우는 높이 (발밑 기준) */
const FX_OFFSET_Y = -26;
/** 잘 때 'z' 가 떠오르는 간격 (ms) */
const ZZZ_MS = 1700;
/** 누를 수 있는 영역 (칸 안 좌표). 고양이는 작아서 그림보다 조금 넉넉하게 */
const HIT = { x: 4, y: 8, w: 24, h: 24 } as const;

/**
 * 공원 고양이 그림 (5A-2~5A-5). 서버가 정한 행동(action)·방향을 시트의 알맞은 줄로 그린다.
 * 옆모습은 오른쪽을 보는 그림이라 왼쪽을 볼 때는 뒤집는다. 위치(x, y)는 발밑 가운데
 */
export class CatView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private action: CatAction = "stand";
  private animKey = "";
  private zzzTimer?: Phaser.Time.TimerEvent;
  private readonly pops = new Set<Phaser.GameObjects.Text>();

  constructor(
    private readonly scene: Phaser.Scene,
    pos: Vec2,
    readonly name: string,
    onTap: () => void,
  ) {
    this.sprite = scene.add.sprite(pos.x, pos.y, CAT_SHEET.key, 0).setOrigin(0.5, 1);
    this.sprite
      .setInteractive({ hitArea: new Phaser.Geom.Rectangle(HIT.x, HIT.y, HIT.w, HIT.h), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
        if (pointer.button === 0) onTap();
      });
  }

  get position(): Vec2 {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  setPose(pos: Vec2, facing: Facing, action: CatAction): void {
    this.sprite.setPosition(pos.x, pos.y).setDepth(DEPTH.ysortBase + pos.y);
    const { view } = catRowOf(action, facing);
    this.sprite.setFlipX(view === "side" && facing.includes("left"));
    const key = catAnimKey(action, view);
    const changed = action !== this.action;
    // 한 번만 하는 동작(기지개·냐옹)은 행동이 바뀔 때만 처음부터. 방향만 바뀌면 이어서
    if (key !== this.animKey || (changed && !CAT_ANIMS[action].repeat)) {
      const progress = this.sprite.anims.isPlaying && !changed ? this.sprite.anims.getProgress() : 0;
      this.sprite.anims.play(key);
      if (progress > 0 && CAT_ANIMS[action].repeat) this.sprite.anims.setProgress(progress);
      this.animKey = key;
    }
    if (changed) {
      this.action = action;
      this.updateZzz();
    }
  }

  /** 서버가 보낸 효과를 한 번 보여 준다 */
  showFx(fx: CatFx): void {
    switch (fx) {
      case "meow":
        return this.pop(t("cat.meow"), { color: "#1b2433", bg: "#ffffff", rise: 4, ms: 1400 });
      case "startle":
        return this.pop("!", { color: "#ffd84d", size: "12px", rise: 6, ms: 800 });
      case "curious":
        return this.pop("?", { color: "#ffffff", size: "11px", rise: 4, ms: 1100 });
      case "purr":
        this.pop(t("cat.purr"), { color: "#ffd9e2", rise: 8, ms: 1500, dx: -6 });
        for (let i = 0; i < 3; i++) {
          this.scene.time.delayedCall(i * 260, () => this.pop("♥", { color: "#ff7a9c", size: "9px", rise: 14, ms: 1100, dx: 4 + i * 4 - 4, dy: 2 }));
        }
        return;
    }
  }

  destroy(): void {
    this.zzzTimer?.remove();
    for (const p of this.pops) p.destroy();
    this.sprite.destroy();
  }

  /** 자는 동안 'z' 가 하나씩 떠오른다 */
  private updateZzz(): void {
    if (this.action === "sleep" && !this.zzzTimer) {
      this.zzzTimer = this.scene.time.addEvent({
        delay: ZZZ_MS,
        loop: true,
        callback: () => this.pop("z", { color: "#dfe8f5", size: "8px", rise: 12, ms: 1600, dx: 8, dy: 6, drift: 6 }),
      });
    } else if (this.action !== "sleep" && this.zzzTimer) {
      this.zzzTimer.remove();
      this.zzzTimer = undefined;
    }
  }

  private pop(text: string, o: { color: string; bg?: string; size?: string; rise: number; ms: number; dx?: number; dy?: number; drift?: number }): void {
    const { x, y } = this.sprite;
    const pop = smoothText(
      this.scene.add.text(x + (o.dx ?? 0), y + FX_OFFSET_Y + (o.dy ?? 0), text, {
        fontSize: o.size ?? "8px",
        fontStyle: "bold",
        color: o.color,
        ...(o.bg ? { backgroundColor: o.bg, padding: { x: 3, y: 1 } } : { stroke: "#1b2433", strokeThickness: 2 }),
      }),
    )
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.bubble);
    this.pops.add(pop);
    this.scene.tweens.add({
      targets: pop,
      y: pop.y - o.rise,
      x: pop.x + (o.drift ?? 0),
      alpha: { from: 1, to: 0 },
      ease: "Sine.easeIn",
      duration: o.ms,
      onComplete: () => {
        this.pops.delete(pop);
        pop.destroy();
      },
    });
  }
}
