// 임시 소리 생성 스크립트용 WAV 인코더 (16비트 모노 PCM, 외부 라이브러리 없음)

export const SAMPLE_RATE = 22050;

/** -1..1 샘플 → WAV 파일 바이트 */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // 모노
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** 가장 큰 소리가 peak 가 되게 맞춘다 */
export function normalize(samples: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  if (max > 0) for (let i = 0; i < samples.length; i++) samples[i] = (samples[i]! / max) * peak;
  return samples;
}

/** MIDI 음 번호 → 주파수 (A4 = 69 = 440Hz) */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
