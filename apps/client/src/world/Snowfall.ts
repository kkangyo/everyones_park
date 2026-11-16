import Phaser from "phaser";
import { DEPTH, GENERATED } from "../assets";

/** 화면(카메라에 보이는 범위) 넓이 1px² 당 눈송이 수. 확대 배율이 달라도 화면에 보이는 양이 비슷하게 */
const FLAKES_PER_SCREEN_PX2 = 1 / 3000;
const MAX_FLAKES = 300;
const LIFESPAN_MS = 9000;
/** 카메라 밖에서도 조금 만들어 두어 걸어갈 때 가장자리가 비지 않게 (px) */
const MARGIN = 64;

/**
 * 눈 내리는 효과 (6-1). 눈송이는 월드 좌표에 떨어지므로 걸어가면 화면에서 같이 움직인다 (화면에 붙어 있지 않음).
 * 카메라가 보는 범위 위에서만 만들고, 처음에는 미리 채워서 입장하자마자 눈이 내리고 있게 한다
 */
export class Snowfall {
  private readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly zone = new Phaser.Geom.Rectangle();
  /** 지난 프레임 카메라 가운데. 순간이동(입장 위치 받음 등)하면 그 자리에서 눈을 다시 채운다 */
  private lastCenter?: Phaser.Math.Vector2;

  constructor(private readonly scene: Phaser.Scene) {
    this.emitter = scene.add
      .particles(0, 0, GENERATED.snow, {
        emitZone: { type: "random", source: this.zone, quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
        lifespan: LIFESPAN_MS,
        speedY: { min: 12, max: 26 },
        speedX: { min: -6, max: 6 },
        scale: { min: 0.5, max: 1 },
        // 나타날 때·사라질 때 흐리게 (공중에서 갑자기 생기지 않게). t: 수명 진행도 0–1
        alpha: { onEmit: () => 0, onUpdate: (_p: Phaser.GameObjects.Particles.Particle, _k: string, t: number) => Math.min(1, t * 8, (1 - t) * 8) * 0.95 },
        frequency: 50,
      })
      .setDepth(DEPTH.snow);
  }

  /** 매 프레임: 만드는 범위를 카메라에 맞추고, 화면 크기에 맞춰 양을 정한다 */
  update(): void {
    this.fitToCamera();
    const view = this.scene.cameras.main.worldView;
    const center = new Phaser.Math.Vector2(view.centerX, view.centerY);
    const jumped = !this.lastCenter || this.lastCenter.distance(center) > Math.max(view.width, view.height);
    this.lastCenter = center;
    if (jumped) {
      this.emitter.killAll();
      this.emitter.fastForward(LIFESPAN_MS, 100);
    }
  }

  private fitToCamera(): void {
    const view = this.scene.cameras.main.worldView;
    this.zone.setTo(view.x - MARGIN, view.y - MARGIN, view.width + MARGIN * 2, view.height + MARGIN * 2);
    const { width, height } = this.scene.scale;
    const flakes = Math.min(MAX_FLAKES, Math.round(width * height * FLAKES_PER_SCREEN_PX2));
    this.emitter.frequency = LIFESPAN_MS / Math.max(1, flakes);
  }
}
