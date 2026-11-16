import Phaser from "phaser";
import type { TruckPlacement, TruckView, Vec2 } from "@park/shared";
import { SOUNDS } from "../assets";

/** 배경 음악 크기 (설정의 전체 소리 크기에 곱해진다) */
const BGM_VOLUME = 0.45;
/** 조리 소리: 트럭에서 이 거리(px) 안이면 들리고, 가까울수록 크다 */
const SIZZLE_RANGE_PX = 320;
const SIZZLE_MAX_VOLUME = 0.6;
/** 조리 소리가 커지고 작아지는 빠르기 (초당 변화량) */
const SIZZLE_FADE_PER_SEC = 1.5;

/**
 * 공원 소리 (6-2): 배경 음악, 가까운 트럭의 조리 소리, 간식 완성·이모티콘 효과음.
 * 소리는 게임 전체(game.sound)에 있어서 채널을 옮겨 공원 씬이 다시 시작해도 배경 음악이 끊기지 않는다.
 * 브라우저는 사용자가 누르기 전에는 소리를 막으므로, 막혀 있으면 풀릴 때(입장 클릭 등) 시작한다
 */
export class ParkAudio {
  private readonly bgm: Phaser.Sound.BaseSound;
  private readonly sizzle: Phaser.Sound.BaseSound;
  private sizzleVolume = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly trucks: readonly TruckPlacement[],
  ) {
    const sound = scene.sound;
    this.bgm = sound.get(SOUNDS.bgm.key) ?? sound.add(SOUNDS.bgm.key, { loop: true, volume: BGM_VOLUME });
    this.sizzle = sound.get(SOUNDS.sizzle.key) ?? sound.add(SOUNDS.sizzle.key, { loop: true, volume: 0 });
    if (sound.locked) sound.once(Phaser.Sound.Events.UNLOCKED, () => this.startLoops());
    else this.startLoops();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.setSizzle(0));
  }

  /** 매 프레임: 가장 가까운 '만드는 중' 트럭까지 거리로 조리 소리 크기를 정한다 */
  update(me: Vec2, truckState: (id: string) => TruckView | undefined, deltaMs: number): void {
    let target = 0;
    for (const truck of this.trucks) {
      if (!truckState(truck.def.id)?.cookingItem) continue;
      const b = truck.box;
      const dx = Math.max(b.left - me.x, 0, me.x - b.right);
      const dy = Math.max(b.top - me.y, 0, me.y - b.bottom);
      const near = 1 - Math.hypot(dx, dy) / SIZZLE_RANGE_PX;
      target = Math.max(target, near * SIZZLE_MAX_VOLUME);
    }
    const step = (SIZZLE_FADE_PER_SEC * deltaMs) / 1000;
    this.setSizzle(this.sizzleVolume + Phaser.Math.Clamp(target - this.sizzleVolume, -step, step));
  }

  /** 주문한 간식이 나옴 '띵동' */
  playReady(): void {
    this.playOnce(SOUNDS.ready.key, 0.8);
  }

  /** 내 이모티콘 '뽁' */
  playPop(): void {
    this.playOnce(SOUNDS.pop.key, 0.6);
  }

  private startLoops(): void {
    if (!this.bgm.isPlaying) this.bgm.play();
    if (!this.sizzle.isPlaying) this.sizzle.play();
  }

  private setSizzle(volume: number): void {
    this.sizzleVolume = Math.max(0, volume);
    (this.sizzle as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound).setVolume?.(this.sizzleVolume);
  }

  private playOnce(key: string, volume: number): void {
    if (!this.scene.sound.locked) this.scene.sound.play(key, { volume });
  }
}
