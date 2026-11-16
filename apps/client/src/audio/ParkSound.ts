import { SOUNDS } from "../assets";

type SoundId = keyof typeof SOUNDS;

/** 배경 음악 크기 (전체 소리 크기에 곱해진다) */
const BGM_VOLUME = 0.45;
/** 조리 소리가 커지고 작아지는 빠르기 (초당 변화량) */
const SIZZLE_FADE_PER_SEC = 1.5;

/**
 * 3D 화면 소리 (6-2, Phaser 없이 Web Audio). 2D 화면은 world/ParkAudio.ts.
 * 브라우저는 사용자가 누르기 전에 소리를 막으므로, 첫 클릭·터치·키 입력 때 오디오를 만들고 소리 파일을 받는다
 * (그 전에는 AudioContext 를 만들지 않아 자동재생 경고도 없다). 배경 음악은 start() 를 부른 뒤(공원 입장)부터
 */
export class ParkSound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sizzleGain?: GainNode;
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private wanted = false;
  private looping = false;
  private sizzle = 0;
  private volume = 1;
  private muted = false;

  constructor() {
    const unlock = () => {
      for (const ev of EVENTS) removeEventListener(ev, unlock, true);
      void this.unlock();
    };
    for (const ev of EVENTS) addEventListener(ev, unlock, true);
  }

  /** 공원에 들어감: 배경 음악·조리 소리 반복 시작 (소리가 아직 막혀 있으면 풀릴 때) */
  start(): void {
    this.wanted = true;
    this.startLoops();
  }

  /** 전체 소리 크기 0–1 과 음소거 */
  setVolume(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : volume;
  }

  /** 매 프레임: 조리 소리 목표 크기 (0–1) 쪽으로 천천히 */
  updateSizzle(target: number, dtSec: number): void {
    const step = SIZZLE_FADE_PER_SEC * dtSec;
    this.sizzle += Math.max(-step, Math.min(step, target - this.sizzle));
    if (this.sizzleGain) this.sizzleGain.gain.value = this.sizzle;
  }

  play(id: SoundId, volume: number): void {
    const buffer = this.buffers.get(id);
    if (!this.ctx || !this.master || !buffer || this.ctx.state !== "running") return;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.buffer = buffer;
    src.connect(gain).connect(this.master);
    src.start();
  }

  private async unlock(): Promise<void> {
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      const ctx = this.ctx;
      await Promise.all(
        (Object.keys(SOUNDS) as SoundId[]).map(async (id) => {
          const data = await (await fetch(`/${SOUNDS[id].url}`)).arrayBuffer();
          this.buffers.set(id, await ctx.decodeAudioData(data));
        }),
      );
      this.startLoops();
    } catch (err) {
      console.warn("[sound] 소리를 켜지 못함", err);
    }
  }

  private startLoops(): void {
    const ctx = this.ctx;
    const bgm = this.buffers.get("bgm");
    const sizzle = this.buffers.get("sizzle");
    if (!this.wanted || this.looping || !ctx || !this.master || !bgm || !sizzle) return;
    this.looping = true;
    const loop = (buffer: AudioBuffer, volume: number) => {
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buffer;
      src.loop = true;
      gain.gain.value = volume;
      src.connect(gain).connect(this.master!);
      src.start();
      return gain;
    };
    loop(bgm, BGM_VOLUME);
    this.sizzleGain = loop(sizzle, this.sizzle);
  }
}

const EVENTS = ["pointerdown", "keydown", "touchend"] as const;
