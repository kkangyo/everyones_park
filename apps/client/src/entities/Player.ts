import Phaser from "phaser";
import { facingFromInput, isMoving, step, type CollisionGrid, type Facing, type MoveInput, type Vec2 } from "@park/shared";
import { CHARACTER, DEPTH, idleFrame, walkAnimKey } from "../assets";

/**
 * 캐릭터 하나. 위치(x, y)는 **발밑 가운데** 기준이다.
 * (나중에 발밑 충돌·앉기 위치 계산이 모두 이 점을 기준으로 한다)
 */
export class Player {
  readonly sprite: Phaser.GameObjects.Sprite;
  facing: Facing = "down";
  moving = false;

  constructor(scene: Phaser.Scene, pos: Vec2) {
    this.sprite = scene.add.sprite(pos.x, pos.y, CHARACTER.key, idleFrame(this.facing)).setOrigin(0.5, 1);
    this.updateDepth();
  }

  get position(): Vec2 {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /** 입력에 따라 dtSec 만큼 움직인다 (장애물에 막히면 멈추거나 미끄러짐) */
  move(input: MoveInput, dtSec: number, grid: CollisionGrid): void {
    const prev = this.position;
    const next = step(prev, input, dtSec, grid);
    this.sprite.setPosition(next.x, next.y);
    this.updateDepth();
    this.facing = facingFromInput(input, this.facing);
    // 벽에 막혀 제자리걸음이면 서 있는 모습으로
    this.moving = isMoving(input) && (next.x !== prev.x || next.y !== prev.y);
    this.updateAnimation();
  }

  /** 발밑 y 가 클수록(화면 아래일수록) 앞에 그린다 */
  private updateDepth(): void {
    this.sprite.setDepth(DEPTH.ysortBase + this.sprite.y);
  }

  private updateAnimation(): void {
    if (this.moving) {
      this.sprite.anims.play(walkAnimKey(this.facing), true);
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(idleFrame(this.facing));
    }
  }
}
