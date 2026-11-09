import Phaser from "phaser";
import { facingFromInput, isMoving, step, type CollisionGrid, type Facing, type MoveInput, type Vec2 } from "@park/shared";
import { CharacterView } from "./CharacterView";

/** 내 캐릭터. 입력으로 직접 움직인다 */
export class Player {
  readonly view: CharacterView;
  facing: Facing = "down";
  moving = false;

  constructor(scene: Phaser.Scene, pos: Vec2, nickname: string) {
    this.view = new CharacterView(scene, pos, nickname);
  }

  get position(): Vec2 {
    return this.view.position;
  }

  /** 입력에 따라 dtSec 만큼 움직인다 (장애물에 막히면 멈추거나 미끄러짐) */
  move(input: MoveInput, dtSec: number, grid: CollisionGrid): void {
    const prev = this.position;
    const next = step(prev, input, dtSec, grid);
    this.facing = facingFromInput(input, this.facing);
    // 벽에 막혀 제자리걸음이면 서 있는 모습으로
    this.moving = isMoving(input) && (next.x !== prev.x || next.y !== prev.y);
    this.view.setPose(next, this.facing, this.moving);
  }
}
