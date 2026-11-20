/** Rebuild generated food art: pnpm exec tsx scripts/assemble-food-art.ts */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Canvas, decodePng, encodePng, type RGBA } from "./lib/png";
import { MENU } from "../packages/shared/src/food";

const root = "docs/food-remake";
const sources = JSON.parse(readFileSync(`${root}/prompts.json`, "utf8")) as { id: string }[];
mkdirSync("assets/sprites/food-hd", { recursive: true });
const preview = new Canvas(768, Math.ceil(sources.length / 3) * 144);

for (const [index, { id }] of sources.entries()) {
  const src = decodePng(readFileSync(`${root}/sources/${id}.png`)).canvas;
  const cell = src.width / 3;
  // One shared transform for all stages: never independently trim/recenter a bite.
  let x0 = cell, y0 = src.height, x1 = 0, y1 = 0;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    if (src.get(x, y)[3] < 160) continue;
    const local = x % cell;
    x0 = Math.min(x0, local); x1 = Math.max(x1, local);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 <= x0 || y1 <= y0) throw Error(`${id}: missing opaque food`);
  for (const size of [12, 128]) {
    const out = new Canvas(size * 3, size);
    const scale = Math.min((size * 10 / 12) / (x1 - x0 + 1), (size * 10 / 12) / (y1 - y0 + 1));
    const left = size / 2 - (x1 - x0 + 1) * scale / 2;
    const top = size * 11 / 12 - (y1 - y0 + 1) * scale;
    for (let stage = 0; stage < 3; stage++) {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        // Area sampling with premultiplied alpha preserves glossy food colors.
        const samples = size === 12 ? 12 : 3;
        let a = 0, r = 0, g = 0, b = 0;
        for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
          const px = Math.floor(x0 + (x + (sx + .5) / samples - left) / scale);
          const py = Math.floor(y0 + (y + (sy + .5) / samples - top) / scale);
          if (px < 0 || px >= cell || py < 0 || py >= src.height) continue;
          const c = src.get(Math.floor(stage * cell) + px, py);
          // Drop generator's almost-transparent fringe, retain real alpha edges.
          const alpha = c[3] < 96 ? 0 : c[3] / 255;
          a += alpha; r += c[0] * alpha; g += c[1] * alpha; b += c[2] * alpha;
        }
        const alpha = a / (samples * samples);
        if (alpha < (size === 12 ? .28 : .08)) continue;
        const color: RGBA = [Math.round(r / a), Math.round(g / a), Math.round(b / a), size === 12 ? 255 : Math.round(alpha * 255)];
        out.set(stage * size + x, y, color);
      }
      if (size === 12) {
        let contact = 0;
        for (let y = 8; y <= 10; y++) for (let x = 5; x <= 7; x++) contact += out.get(stage * size + x, y)[3];
        if (!contact) throw Error(`${id} stage ${stage}: missing hand contact`);
      }
    }
    writeFileSync(`assets/sprites/${size === 12 ? "food" : "food-hd"}/${id}.png`, encodePng(out));
    if (size === 128) for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++)
      preview.set((index % 3) * 256 + 64 + x, Math.floor(index / 3) * 144 + y, out.get(x, y));
  }
}
writeFileSync(`${root}/preview.png`, encodePng(preview));
const cards = sources.map(({ id }) => `<article><h2>${MENU.get(id)!.name.ko}</h2><small>기존 · 처음 / 먹는 중 / 거의 다 먹음</small><img class="before" src="before/${id}.png"><small>개선 · 처음 / 먹는 중 / 거의 다 먹음</small><img src="../../assets/sprites/food-hd/${id}.png"><small>게임용 12px · 6배 확대</small><img class="pixel" src="../../assets/sprites/food/${id}.png"></article>`).join("\n");
writeFileSync(`${root}/review.html`, `<!doctype html><html lang="ko"><meta charset="utf-8"><title>겨울 간식 17종 비교</title><style>body{font:15px system-ui;background:#f5eee4;color:#4b3228;margin:32px}button{padding:10px 18px;border-radius:12px;border:1px solid #ad947b;background:#fff5e3;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:20px;margin-top:24px}article{background:#fffaf1;border:1px solid #dccbb7;border-radius:20px;padding:18px}h2{font-size:18px}small{display:block;color:#806c5c}img{display:block;width:100%;height:auto;background:repeating-conic-gradient(#ded4c4 0% 25%,#eee6d9 0% 50%) 0 / 16px 16px}.pixel,.before{image-rendering:pixelated}.dark img{background:#28313d}.plain img{background:#fff}</style><h1>겨울 간식 17종</h1><p>음식별 실제 특징과 섭취 3단계. 12px 게임용 시트와 128px 메뉴용 시트를 함께 확인합니다.</p><button onclick="document.body.className=''">체크 배경</button> <button onclick="document.body.className='dark'">어두운 배경</button> <button onclick="document.body.className='plain'">흰 배경</button><div class="grid">${cards}</div></html>`);
console.log(`Assembled ${sources.length} menus × 3 stages, 12px + 128px; ${root}/review.html`);
