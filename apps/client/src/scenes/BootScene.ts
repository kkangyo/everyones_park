import Phaser from "phaser";
import { MENU, TRUCKS } from "@park/shared";
import { BODY_IDS, CHARACTER, FOOD, GENERATED, MAP, PROP_SPRITES, TILESET, allCharacterSheets, bodySheet, foodSheet, idleFrame, poseAnimKey, truckSheet } from "../assets";
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
    for (const item of MENU.keys()) {
      const sheet = foodSheet(item);
      this.load.spritesheet(sheet.key, sheet.url, { frameWidth: FOOD.frameWidth, frameHeight: FOOD.frameHeight });
    }
    for (const truck of TRUCKS.keys()) {
      const sheet = truckSheet(truck);
      this.load.image(sheet.key, sheet.url);
    }
  }

  create(): void {
    this.createAnimations();
    this.createGeneratedTextures();
    this.scene.start("Lobby");
  }

  /** 걷기·숨쉬기 애니메이션은 몸 시트에만 (옷은 몸 프레임을 따라감). 몸 그림 x 자세 x 방향 */
  private createAnimations(): void {
    for (const bodyId of BODY_IDS)
      for (const { pose, directions, frameRate } of CHARACTER.rows)
        for (const facing of directions) {
          const first = idleFrame(facing, pose);
          this.anims.create({
            key: poseAnimKey(bodyId, facing, pose),
            frames: this.anims.generateFrameNumbers(bodySheet(bodyId).key, { start: first, end: first + CHARACTER.framesPerRow - 1 }),
            frameRate,
            repeat: -1,
          });
        }
  }

  /** 그림 파일 없이 코드로 만드는 텍스처 */
  private createGeneratedTextures(): void {
    // 트럭 연기 한 알갱이 (흰 동그라미)
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(3, 3, 3);
    g.generateTexture(GENERATED.smoke, 6, 6);
    g.destroy();
  }
}
