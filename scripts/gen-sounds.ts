/**
 * 임시 배경 음악·효과음을 코드로 합성한다.
 *
 *   pnpm gen:sound
 *
 * 출력 (assets/sounds/, 22050Hz 16비트 모노 WAV)
 *   bgm-winter.wav   배경 음악. 8마디(80bpm, 24초) 오르골 + 부드러운 화음. 끝과 처음이 이어지게 반복(loop)
 *   sizzle.wav       트럭 조리 소리 (지글지글). 2.5초 반복
 *   ready.wav        간식이 나왔을 때 '띵동'
 *   pop.wav          이모티콘 보낼 때 '뽁'
 *
 * 최종 소리로 바꿀 때도 같은 파일 이름을 지키면(형식은 mp3·ogg 도 가능, assets.ts 경로만 수정) 코드 수정 없이 교체된다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE_RATE, encodeWav, midiToHz, normalize } from "./lib/wav";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "assets/sounds");
const SR = SAMPLE_RATE;

/** 같은 결과가 나오게 고정 시드 난수 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** 오르골·종 소리 한 음을 buf 의 start 초 위치에 더한다 */
function bell(buf: Float32Array, start: number, hz: number, gain: number, decaySec: number): void {
  const i0 = Math.round(start * SR);
  const len = Math.min(buf.length - i0, Math.round(decaySec * 5 * SR));
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const attack = Math.min(1, t / 0.004);
    const env = attack * Math.exp(-t / decaySec);
    const w = 2 * Math.PI * hz * t;
    // 기본음 + 높은 배음(빨리 사라짐) → 맑은 금속 느낌
    const s = Math.sin(w) + 0.35 * Math.sin(2 * w) * Math.exp(-t / (decaySec * 0.4)) + 0.12 * Math.sin(5.4 * w) * Math.exp(-t / 0.08);
    buf[i0 + i]! += s * env * gain;
  }
}

/** 부드러운 화음 바탕 (천천히 커졌다 작아지는 사인파) */
function pad(buf: Float32Array, start: number, dur: number, hz: number, gain: number): void {
  const i0 = Math.round(start * SR);
  const len = Math.min(buf.length - i0, Math.round(dur * SR));
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.sin((Math.PI * t) / dur) ** 2;
    const vib = 1 + 0.002 * Math.sin(2 * Math.PI * 4.5 * t);
    buf[i0 + i]! += (Math.sin(2 * Math.PI * hz * vib * t) + 0.2 * Math.sin(4 * Math.PI * hz * t)) * env * gain;
  }
}

/** 배경 음악: C - Am - F - G (각 2마디), 위에 오르골 선율, 아래 분산화음 */
function bgm(): Float32Array {
  const bpm = 80;
  const beat = 60 / bpm;
  const beats = 32;
  const loopLen = Math.round(beats * beat * SR);
  // 끝에서 울리는 소리의 꼬리를 처음으로 감아 넣어 이음매 없이 반복되게
  const tail = Math.round(4 * SR);
  const buf = new Float32Array(loopLen + tail);

  const C5 = 72;
  const chords = [
    [C5 - 12, C5 - 8, C5 - 5, C5 - 1], // C maj7 (C4 E4 G4 B4)
    [C5 - 15, C5 - 12, C5 - 8, C5 - 5], // A min7 (A3 C4 E4 G4)
    [C5 - 19, C5 - 15, C5 - 12, C5 - 8], // F maj7 (F3 A3 C4 E4)
    [C5 - 17, C5 - 13, C5 - 10, C5 - 7], // G (G3 B3 D4 F4 → G7, 처음으로 돌아가는 느낌)
  ];
  chords.forEach((chord, ci) => {
    const t0 = ci * 8 * beat;
    // 바탕 화음 (2마디 길이)
    for (const n of chord) pad(buf, t0, 8 * beat, midiToHz(n), 0.05);
    pad(buf, t0, 8 * beat, midiToHz(chord[0]! - 12), 0.08);
    // 분산화음 8분음표 (한 옥타브 위, 작게)
    const pattern = [0, 1, 2, 3, 2, 1, 2, 1];
    for (let k = 0; k < 16; k++) bell(buf, t0 + k * beat * 0.5, midiToHz(chord[pattern[k % 8]!]! + 12), 0.09, 0.5);
  });

  // 선율 [시작 박, MIDI, 세기]
  const melody: [number, number, number][] = [
    [0, 76, 1], [2, 79, 0.8], [3, 81, 0.8], [4, 79, 1], [6, 76, 0.8], [7, 74, 0.7],
    [8, 72, 1], [10, 76, 0.8], [11, 81, 0.9], [12, 79, 1], [15, 76, 0.7],
    [16, 77, 1], [18, 81, 0.8], [19, 84, 0.9], [20, 83, 1], [22, 81, 0.8], [23, 79, 0.7],
    [24, 79, 1], [26, 74, 0.8], [27, 76, 0.8], [28, 74, 1],
  ];
  for (const [b, n, v] of melody) bell(buf, b * beat, midiToHz(n), 0.22 * v, 0.9);

  const out = buf.slice(0, loopLen);
  for (let i = 0; i < tail; i++) out[i]! += buf[loopLen + i]!;
  return normalize(out, 0.7);
}

/** 지글지글: 고음 잡음 + 무작위로 튀는 '탁탁' + 낮은 웅웅. 끝을 처음과 겹쳐서 반복해도 이음매가 없다 */
function sizzle(): Float32Array {
  const rand = rng(7);
  const len = Math.round(2.5 * SR);
  const fade = Math.round(0.3 * SR);
  const buf = new Float32Array(len + fade);
  let prev = 0;
  let low = 0;
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    const white = rand() * 2 - 1;
    const high = white - prev; // 간단한 고역 통과
    prev = white;
    low += (white - low) * 0.02;
    const breath = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.8 * t) * Math.sin(2 * Math.PI * 1.9 * t);
    buf[i] = high * 0.25 * breath + low * 0.5;
  }
  // 기름 튀는 소리
  for (let k = 0; k < 90; k++) {
    const i0 = Math.floor(rand() * (buf.length - 400));
    const amp = 0.3 + rand() * 0.7;
    const n = 60 + Math.floor(rand() * 200);
    for (let i = 0; i < n; i++) buf[i0 + i]! += (rand() * 2 - 1) * amp * Math.exp(-i / (n / 4));
  }
  const out = buf.slice(0, len);
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    out[i] = out[i]! * a + buf[len + i]! * (1 - a);
  }
  return normalize(out, 0.6);
}

/** 띵동 (E6 → C6) */
function ready(): Float32Array {
  const buf = new Float32Array(Math.round(1.6 * SR));
  bell(buf, 0, midiToHz(88), 1, 0.35);
  bell(buf, 0.22, midiToHz(84), 1, 0.5);
  return normalize(buf, 0.75);
}

/** 뽁: 위로 올라가는 짧은 소리 */
function pop(): Float32Array {
  const len = Math.round(0.12 * SR);
  const buf = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const hz = 500 + 900 * (t / 0.12);
    phase += (2 * Math.PI * hz) / SR;
    buf[i] = Math.sin(phase) * Math.min(1, t / 0.005) * Math.exp(-t / 0.04);
  }
  return normalize(buf, 0.6);
}

mkdirSync(OUT, { recursive: true });
const files: Record<string, Float32Array> = {
  "bgm-winter.wav": bgm(),
  "sizzle.wav": sizzle(),
  "ready.wav": ready(),
  "pop.wav": pop(),
};
for (const [name, samples] of Object.entries(files)) {
  const bytes = encodeWav(samples);
  writeFileSync(resolve(OUT, name), bytes);
  console.log(`assets/sounds/${name}  ${(samples.length / SR).toFixed(2)}s  ${Math.round(bytes.length / 1024)}KB`);
}
