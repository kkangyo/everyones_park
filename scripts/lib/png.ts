// 임시 그림 생성 스크립트용 간단한 캔버스 + PNG 인코더·디코더 (외부 라이브러리 없음)
import { deflateSync, inflateSync } from "node:zlib";

export type RGBA = [number, number, number, number];

export function hex(color: string, alpha = 255): RGBA {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

export const CLEAR: RGBA = [0, 0, 0, 0];

export class Canvas {
  readonly data: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }
  set(x: number, y: number, c: RGBA): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data.set(c, (y * this.width + x) * 4);
  }
  rect(x: number, y: number, w: number, h: number, c: RGBA): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  /** 캔버스 밖은 투명 */
  get(x: number, y: number): RGBA {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return [0, 0, 0, 0];
    const i = (y * this.width + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
  }
}

// PNG 인코딩 (RGBA 8bit)

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(canvas: Canvas): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.width, 0);
  ihdr.writeUInt32BE(canvas.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = canvas.width * 4;
  const raw = Buffer.alloc((stride + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(canvas.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** PNG 정보. 검사 스크립트가 원본 형식(투명도 지원 여부)을 알려 줄 때 쓴다 */
export interface DecodedPng {
  canvas: Canvas;
  /** 6 RGBA, 4 회색+알파, 3 팔레트, 2 RGB, 0 회색 */
  colorType: number;
  /** 알파 채널 또는 tRNS 가 있음 */
  hasAlpha: boolean;
}

/** 8bit, 인터레이스 없는 PNG 를 RGBA 캔버스로 읽는다 (생성 도구·그림 프로그램 출력 대부분) */
export function decodePng(file: Uint8Array): DecodedPng {
  const buf = Buffer.from(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("PNG 파일이 아닙니다");
  let width = 0;
  let height = 0;
  let colorType = 0;
  let palette: Buffer | undefined;
  let trns: Buffer | undefined;
  const idat: Buffer[] = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error(`비트 깊이 ${data[8]} 은(는) 지원하지 않습니다 (8bit 만)`);
      colorType = data[9]!;
      if (data[12] !== 0) throw new Error("인터레이스 PNG 는 지원하지 않습니다");
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const bpp = ({ 6: 4, 4: 2, 3: 1, 2: 3, 0: 1 } as Record<number, number>)[colorType];
  if (!bpp) throw new Error(`색 형식 ${colorType} 은(는) 지원하지 않습니다`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const canvas = new Canvas(width, height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp]! : 0;
      const b = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i]! + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      const i = x * bpp;
      let px: RGBA;
      if (colorType === 6) px = [line[i]!, line[i + 1]!, line[i + 2]!, line[i + 3]!];
      else if (colorType === 4) px = [line[i]!, line[i]!, line[i]!, line[i + 1]!];
      else if (colorType === 2) px = [line[i]!, line[i + 1]!, line[i + 2]!, 255];
      else if (colorType === 0) px = [line[i]!, line[i]!, line[i]!, 255];
      else {
        const k = line[i]!;
        px = [palette![k * 3]!, palette![k * 3 + 1]!, palette![k * 3 + 2]!, trns && k < trns.length ? trns[k]! : 255];
      }
      canvas.set(x, y, px);
    }
    prev = line;
  }
  return { canvas, colorType, hasAlpha: colorType === 6 || colorType === 4 || trns !== undefined };
}
