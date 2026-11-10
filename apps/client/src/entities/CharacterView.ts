import Phaser from "phaser";
import type { Appearance, Facing, Vec2 } from "@park/shared";
import { DEPTH, bodySheet, idleFrame, outfitSheet, walkAnimKey } from "../assets";

/** 이름표 글자를 선명하게: 카메라 최대 확대 배율만큼 높은 해상도로 그린다 */
const NAMEPLATE_RESOLUTION = 4;
const NAMEPLATE_OFFSET_Y = -34;

/**
 * 캐릭터 그림 (몸 + 옷 레이어 + 이름표). 내 캐릭터와 다른 사람 캐릭터가 같이 쓴다.
 * 위치(x, y)는 **발밑 가운데** 기준.
 * 걷기 애니메이션은 몸에만 걸고, 옷은 매번 몸과 같은 프레임 번호로 맞춘다 (3-7).
 */
export class CharacterView {
  /** 몸·옷을 묶은 컨테이너. 위치·앞뒤 순서(depth)는 이것 하나로 정한다 */
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly outfit: Phaser.GameObjects.Sprite;
  private readonly nameplate: Phaser.GameObjects.Text;
  private appearance: Appearance;
  private facing: Facing = "down";
  private moving = false;

  constructor(scene: Phaser.Scene, pos: Vec2, nickname: string, appearance: Appearance) {
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
      .setResolution(NAMEPLATE_RESOLUTION);
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

  destroy(): void {
    this.root.destroy();
    this.nameplate.destroy();
  }

  private applyPose(): void {
    const { x, y } = this.root;
    // 발밑 y 가 클수록(화면 아래일수록) 앞에 그린다. 이름표는 다른 캐릭터·나무보다 위에
    this.root.setDepth(DEPTH.ysortBase + y);
    this.nameplate.setPosition(x, y + NAMEPLATE_OFFSET_Y).setDepth(DEPTH.nameplate + y);

    if (this.moving) {
      this.body.anims.play(walkAnimKey(this.appearance.gender, this.facing), true);
    } else {
      this.body.anims.stop();
      this.body.setFrame(idleFrame(this.facing));
    }
    this.outfit.setFrame(this.body.frame.name);
  }
}
