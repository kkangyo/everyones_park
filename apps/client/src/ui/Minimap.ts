import Phaser from "phaser";
import type { TruckPlacement, Vec2 } from "@park/shared";
import { MAP, TILESET } from "../assets";
import { t } from "../i18n";

const TEXTURE_KEY = "minimap";
/** 미니맵 높이 = 화면 짧은 쪽의 이 비율 (최소·최대 px) */
const HEIGHT_RATIO = 0.3;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 176;
const PAD = 4;
const LEGEND_H = 16;

const COLOR = { bg: 0x1b2433, border: 0xe8823a, me: 0xe84545, meRing: 0xffffff, truck: 0xffb020, truckEdge: 0x5a3200 } as const;

/** Tiled JSON 중 미니맵에 필요한 부분 */
interface TiledLayersLike {
  width: number;
  height: number;
  tilewidth: number;
  layers: { name: string; type: string; data?: number[] }[];
  tilesets: { firstgid: number }[];
}

type Rgba = [number, number, number, number];

/**
 * 화면 오른쪽 위 미니맵 (6-3, UI 씬). 공원 전체를 타일 하나 = 점 하나로 줄여 그리고,
 * 내 위치(빨간 점)와 간식 트럭(노란 네모)을 표시한다.
 * 땅 색은 타일셋 그림의 타일별 평균 색이라 맵·타일 그림을 바꾸면 그대로 따라간다
 */
export class Minimap {
  private readonly root: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly image: Phaser.GameObjects.Image;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly legend: Phaser.GameObjects.Text;
  private readonly blocker: Phaser.GameObjects.Zone;
  /** 맵 크기 (px) */
  private readonly worldW: number;
  private readonly worldH: number;
  /** 화면에 그리는 지도 크기 */
  private w = 0;
  private h = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly trucks: readonly TruckPlacement[],
  ) {
    const raw = scene.cache.tilemap.get(MAP.key).data as TiledLayersLike;
    this.worldW = raw.width * raw.tilewidth;
    this.worldH = raw.height * raw.tilewidth;
    if (!scene.textures.exists(TEXTURE_KEY)) drawTexture(scene, raw);

    this.root = scene.add.container(0, 0);
    this.bg = scene.add.graphics();
    this.image = scene.add.image(PAD, PAD, TEXTURE_KEY).setOrigin(0, 0);
    this.marks = scene.add.graphics();
    this.legend = scene.add.text(PAD, 0, t("minimap.legend"), { fontSize: "11px", color: "#ffffff" });
    // 미니맵을 눌러도 아래 공원으로 넘어가지(그곳으로 걸어가지) 않게
    this.blocker = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setInteractive();
    this.root.add([this.bg, this.image, this.marks, this.legend, this.blocker]);
  }

  /** 화면 크기에 맞춰 크기를 정하고 오른쪽 위 모서리를 (right, top) 에 맞춘다 */
  layout(right: number, top: number, screenW: number, screenH: number): void {
    const h = Math.round(Phaser.Math.Clamp(Math.min(screenW, screenH) * HEIGHT_RATIO, MIN_HEIGHT, MAX_HEIGHT));
    if (h !== this.h) {
      this.h = h;
      this.w = Math.round((h * this.worldW) / this.worldH);
      this.image.setDisplaySize(this.w, this.h);
      this.legend.setY(PAD + this.h + 1);
      const boxW = this.w + PAD * 2;
      const boxH = this.h + PAD * 2 + LEGEND_H;
      this.bg.clear().fillStyle(COLOR.bg, 0.85).fillRoundedRect(0, 0, boxW, boxH, 6);
      this.bg.lineStyle(2, COLOR.border, 1).strokeRoundedRect(0, 0, boxW, boxH, 6);
      this.blocker.setSize(boxW, boxH);
    }
    this.root.setPosition(Math.round(right - this.width), top);
  }

  get width(): number {
    return this.w + PAD * 2;
  }

  get height(): number {
    return this.h + PAD * 2 + LEGEND_H;
  }

  /** 매 프레임: 내 위치 (깜빡이는 테두리로 눈에 띄게) + 트럭 */
  update(me: Vec2, timeMs: number): void {
    const g = this.marks.clear();
    for (const truck of this.trucks) {
      const a = this.toMap({ x: truck.box.left, y: truck.box.top });
      const b = this.toMap({ x: truck.box.right, y: truck.box.bottom });
      const tw = Math.max(5, b.x - a.x);
      const th = Math.max(4, b.y - a.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      g.fillStyle(COLOR.truckEdge, 1).fillRect(Math.round(cx - tw / 2) - 1, Math.round(cy - th / 2) - 1, tw + 2, th + 2);
      g.fillStyle(COLOR.truck, 1).fillRect(Math.round(cx - tw / 2), Math.round(cy - th / 2), tw, th);
    }
    const p = this.toMap(me);
    const pulse = 0.5 + 0.5 * Math.sin(timeMs / 200);
    g.lineStyle(1.5, COLOR.meRing, 0.4 + 0.6 * pulse).strokeCircle(p.x, p.y, 4 + pulse);
    g.fillStyle(COLOR.me, 1).fillCircle(p.x, p.y, 2.5);
  }

  /** 월드 좌표 → 미니맵 컨테이너 안 좌표 */
  private toMap(pos: Vec2): Vec2 {
    const x = Phaser.Math.Clamp(pos.x / this.worldW, 0, 1) * this.w;
    const y = Phaser.Math.Clamp(pos.y / this.worldH, 0, 1) * this.h;
    return { x: PAD + x, y: PAD + y };
  }
}

/** 타일 하나 = 점 하나인 지도 텍스처. ground 위에 obstacles 를 타일 그림의 평균 색으로 겹친다 */
function drawTexture(scene: Phaser.Scene, raw: TiledLayersLike): void {
  const colors = tileColors(scene);
  const firstgid = raw.tilesets[0]?.firstgid ?? 1;
  const texture = scene.textures.createCanvas(TEXTURE_KEY, raw.width, raw.height)!;
  const ctx = texture.getContext();
  const img = ctx.createImageData(raw.width, raw.height);
  const layers = [MAP.layers.ground, MAP.layers.obstacles].map((name) => raw.layers.find((l) => l.name === name && l.type === "tilelayer")?.data ?? []);
  for (let i = 0; i < raw.width * raw.height; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const data of layers) {
      const gid = data[i] ?? 0;
      const c = gid > 0 ? colors[gid - firstgid] : undefined;
      if (!c) continue;
      const a = c[3];
      r = r * (1 - a) + c[0] * a;
      g = g * (1 - a) + c[1] * a;
      b = b * (1 - a) + c[2] * a;
    }
    img.data.set([r, g, b, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  texture.refresh();
}

/** 타일셋 그림의 타일마다 평균 색 (투명한 부분은 빼고, 덮는 비율을 a 로) */
function tileColors(scene: Phaser.Scene): Rgba[] {
  const source = scene.textures.get(TILESET.key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const size = TILESET.tileSize;
  const cols = Math.floor(source.width / size);
  const rows = Math.floor(source.height / size);
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const colors: Rgba[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = ctx.getImageData(col * size, row * size, size, size).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let i = 0; i < px.length; i += 4) {
        const w = px[i + 3]! / 255;
        r += px[i]! * w;
        g += px[i + 1]! * w;
        b += px[i + 2]! * w;
        a += w;
      }
      colors.push(a > 0 ? [r / a, g / a, b / a, a / (size * size)] : [0, 0, 0, 0]);
    }
  }
  return colors;
}
