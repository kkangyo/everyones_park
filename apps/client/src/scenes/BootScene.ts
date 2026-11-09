import Phaser from "phaser";
import { CHARACTER, MAP, PROP_SPRITES, TILESET, walkAnimKey } from "../assets";

/** 에셋을 불러온 뒤 공원 씬과 UI 씬을 시작한다. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, "불러오는 중…", { fontSize: "16px", color: "#9fb3c8" }).setOrigin(0.5);
    this.load.on("progress", (p: number) => label.setText(`불러오는 중… ${Math.round(p * 100)}%`));

    this.load.tilemapTiledJSON(MAP.key, MAP.url);
    this.load.image(TILESET.key, TILESET.url);
    this.load.spritesheet(TILESET.sheetKey, TILESET.url, { frameWidth: TILESET.tileSize, frameHeight: TILESET.tileSize });
    for (const prop of Object.values(PROP_SPRITES)) this.load.image(prop.key, prop.url);
    this.load.spritesheet(CHARACTER.key, CHARACTER.url, { frameWidth: CHARACTER.frameWidth, frameHeight: CHARACTER.frameHeight });
  }

  create(): void {
    this.createAnimations();
    this.scene.start("Park");
    this.scene.launch("UI");
  }

  private createAnimations(): void {
    CHARACTER.directions.forEach((facing, row) => {
      const first = row * CHARACTER.walkFrames;
      this.anims.create({
        key: walkAnimKey(facing),
        frames: this.anims.generateFrameNumbers(CHARACTER.key, { start: first, end: first + CHARACTER.walkFrames - 1 }),
        frameRate: CHARACTER.walkFrameRate,
        repeat: -1,
      });
    });
  }
}
