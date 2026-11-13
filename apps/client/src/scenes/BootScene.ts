import Phaser from "phaser";
import { CAT_FRAME, CAT_FRAMES_PER_ROW, CAT_SHEET_ROWS, MENU, TRUCKS } from "@park/shared";
import { BODY_IDS, CAT_ANIMS, CAT_SHEET, CHARACTER, EMOTE_BUTTON, catAnimKey, EMOTE_SHEET, FOOD, GENERATED, MAP, PROP_SPRITES, TILESET, allCharacterSheets, bodySheet, foodSheet, idleFrame, poseAnimKey, truckSheet } from "../assets";
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
    this.load.image(EMOTE_BUTTON.key, EMOTE_BUTTON.url);
    this.load.spritesheet(CAT_SHEET.key, CAT_SHEET.url, { frameWidth: CAT_FRAME, frameHeight: CAT_FRAME });
    this.load.spritesheet(EMOTE_SHEET.key, EMOTE_SHEET.url, { frameWidth: EMOTE_SHEET.frameWidth, frameHeight: EMOTE_SHEET.frameHeight });
  }

  create(): void {
    this.createAnimations();
    this.createCatAnimations();
    this.createGeneratedTextures();
    this.scene.start(new URLSearchParams(location.search).has("characterArtReview") ? "CharacterArtReview" : "Lobby");
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

  /** 고양이: 시트 행([행동, 방향])마다 애니메이션 하나 */
  private createCatAnimations(): void {
    CAT_SHEET_ROWS.forEach(([action, view], row) => {
      const { frames, frameRate, repeat } = CAT_ANIMS[action];
      this.anims.create({
        key: catAnimKey(action, view),
        frames: frames.map((f) => ({ key: CAT_SHEET.key, frame: row * CAT_FRAMES_PER_ROW + f })),
        frameRate,
        repeat: repeat ? -1 : 0,
      });
    });
  }

  /** 그림 파일 없이 코드로 만드는 텍스처 */
  private createGeneratedTextures(): void {
    // 트럭 연기 한 알갱이 (흰 동그라미)
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(3, 3, 3);
    g.generateTexture(GENERATED.smoke, 6, 6);
    g.destroy();

    // 벙어리장갑 (5x6): 진한 테두리 + 빨간 장갑 + 엄지 + 흰 손목 띠
    const m = this.make.graphics({}, false);
    m.fillStyle(0x3a2a20, 1).fillRect(1, 0, 3, 1).fillRect(0, 1, 5, 4).fillRect(1, 5, 3, 1);
    m.fillStyle(0xd64545, 1).fillRect(1, 1, 3, 3);
    m.fillStyle(0xd64545, 1).fillRect(4, 2, 1, 1);
    m.fillStyle(0xf4efe4, 1).fillRect(1, 4, 3, 1);
    m.generateTexture(GENERATED.mitten, 5, 6);
    m.destroy();
  }
}
