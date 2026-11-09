import Phaser from "phaser";
import type { Facing, Vec2 } from "@park/shared";
import { CHARACTER, DEPTH, idleFrame, walkAnimKey } from "../assets";

/** 이름표 글자를 선명하게: 카메라 최대 확대 배율만큼 높은 해상도로 그린다 */
const NAMEPLATE_RESOLUTION = 4;
const NAMEPLATE_OFFSET_Y = -34;

/**
 * 캐릭터 그림 (스프라이트 + 이름표). 내 캐릭터와 다른 사람 캐릭터가 같이 쓴다.
 * 위치(x, y)는 **발밑 가운데** 기준. 3-7에서 몸 + 옷 레이어로 확장한다.
 */
export class CharacterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly nameplate: Phaser.GameObjects.Text;
  private facing: Facing = "down";
  private moving = false;

  constructor(scene: Phaser.Scene, pos: Vec2, nickname: string) {
    this.sprite = scene.add.sprite(pos.x, pos.y, CHARACTER.key, idleFrame(this.facing)).setOrigin(0.5, 1);
    this.nameplate = scene.add
      .text(pos.x, pos.y + NAMEPLATE_OFFSET_Y, nickname, {
        fontSize: "9px",
        color: "#ffffff",
        stroke: "#1b2433",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setResolution(NAMEPLATE_RESOLUTION);
    this.applyPose();
  }

  get position(): Vec2 {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  setPose(pos: Vec2, facing: Facing, moving: boolean): void {
    this.sprite.setPosition(pos.x, pos.y);
    this.facing = facing;
    this.moving = moving;
    this.applyPose();
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameplate.destroy();
  }

  private applyPose(): void {
    const { x, y } = this.sprite;
    // 발밑 y 가 클수록(화면 아래일수록) 앞에 그린다. 이름표는 다른 캐릭터·나무보다 위에
    this.sprite.setDepth(DEPTH.ysortBase + y);
    this.nameplate.setPosition(x, y + NAMEPLATE_OFFSET_Y).setDepth(DEPTH.nameplate + y);

    if (this.moving) {
      this.sprite.anims.play(walkAnimKey(this.facing), true);
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(idleFrame(this.facing));
    }
  }
}
