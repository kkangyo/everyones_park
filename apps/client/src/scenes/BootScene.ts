import Phaser from "phaser";
import { GENDERS } from "@park/shared";
import { CHARACTER, MAP, PROP_SPRITES, TILESET, allCharacterSheets, bodySheet, walkAnimKey } from "../assets";
import { t } from "../i18n";

/** 에셋을 불러온 뒤 입장 화면을 시작한다. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, t("app.loading", { percent: 0 }), { fontSize: "16px", color: "#9fb3c8" }).setOrigin(0.5);
    this.load.on("progress", (p: number) => label.setText(t("app.loading", { percent: Math.round(p * 100) })));

    this.load.tilemapTiledJSON(MAP.key, MAP.url);
    this.load.image(TILESET.key, TILESET.url);
    this.load.spritesheet(TILESET.sheetKey, TILESET.url, { frameWidth: TILESET.tileSize, frameHeight: TILESET.tileSize });
    for (const prop of Object.values(PROP_SPRITES)) this.load.image(prop.key, prop.url);
    for (const sheet of allCharacterSheets()) {
      this.load.spritesheet(sheet.key, sheet.url, { frameWidth: CHARACTER.frameWidth, frameHeight: CHARACTER.frameHeight });
    }
  }

  create(): void {
    this.createAnimations();
    this.scene.start("Lobby");
  }

  /** 걷기 애니메이션은 몸 시트에만 (옷은 몸 프레임을 따라감) */
  private createAnimations(): void {
    for (const gender of GENDERS) {
      CHARACTER.directions.forEach((facing, row) => {
        const first = row * CHARACTER.walkFrames;
        this.anims.create({
          key: walkAnimKey(gender, facing),
          frames: this.anims.generateFrameNumbers(bodySheet(gender).key, { start: first, end: first + CHARACTER.walkFrames - 1 }),
          frameRate: CHARACTER.walkFrameRate,
          repeat: -1,
        });
      });
    }
  }
}
