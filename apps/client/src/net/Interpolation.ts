import { TICK_MS, type Facing, type Vec2 } from "@park/shared";

export interface Snapshot {
  /** 서버 시간 (ms) = 서버 틱 번호 * TICK_MS */
  t: number;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
}

/** 이 거리(px) 이상 한 번에 바뀌면 보간하지 않고 순간이동으로 본다 (보정·텔레포트 등) */
const TELEPORT_PX = 96;
const MAX_SNAPSHOTS = 30;

/**
 * 다른 사람 위치 보간 (2-4).
 * 받은 위치를 **서버 시간**과 함께 쌓아 두고, 그려야 할 시점의 위치를 앞뒤 두 개 사이에서 계산한다.
 * 받은 시각이 아니라 서버 틱 시각을 쓰므로 네트워크가 흔들려도 일정한 속도로 보인다.
 * Phaser 를 쓰지 않는 순수 로직.
 */
export class SnapshotBuffer {
  private snaps: Snapshot[] = [];

  push(s: Snapshot): void {
    const last = this.snaps[this.snaps.length - 1];
    if (last && s.t <= last.t) return; // 같은/이전 틱 (지연 흉내 등으로 순서가 섞인 경우)
    if (last && Math.hypot(s.x - last.x, s.y - last.y) > TELEPORT_PX) {
      this.snaps = [];
    } else if (last && s.t - last.t > TICK_MS * 1.5) {
      // 한동안 멈춰 있다가 다시 움직이기 시작: 직전 틱에 멈춘 자리에 있었다고 기준점을 끼워 넣는다
      // (안 그러면 멈춰 있던 긴 시간 동안 천천히 미끄러져 온 것처럼 보간됨)
      this.snaps.push({ ...last, t: s.t - TICK_MS, moving: false });
    }
    this.snaps.push(s);
    while (this.snaps.length > MAX_SNAPSHOTS) this.snaps.shift();
  }

  /** t(서버 시간) 시점의 모습. 버퍼보다 늦으면 마지막 값 그대로 (앞질러 예측하지 않음) */
  sample(t: number): (Vec2 & { facing: Facing; moving: boolean }) | null {
    const snaps = this.snaps;
    if (snaps.length === 0) return null;
    const first = snaps[0]!;
    if (t <= first.t) return first;
    for (let i = snaps.length - 1; i > 0; i--) {
      const a = snaps[i - 1]!;
      const b = snaps[i]!;
      if (t >= a.t) {
        if (t >= b.t) return b;
        const k = (t - a.t) / (b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, facing: b.facing, moving: b.moving };
      }
    }
    return snaps[snaps.length - 1]!;
  }
}

/** 보간 지연 범위 (ms). 최소 = 상태 두 개 분량 */
const MIN_INTERP_DELAY_MS = TICK_MS * 2;
const MAX_INTERP_DELAY_MS = 500;
/** 흔들림 추정치가 줄어드는 속도 (관측 한 번당). 크게 흔들린 뒤 수십 초에 걸쳐 천천히 줄어든다 */
const JITTER_DECAY = 0.995;

/**
 * 서버 시간 ↔ 내 시계 변환 + 보간 지연 자동 조절.
 * offset = 받은 시각 - 서버 시간. 가장 빨리 도착한 패킷이 실제 지연에 가장 가까우므로
 * 작아질 때는 바로 따라가고, 커질 때는 천천히 따라간다 (서버 틱 간격이 조금씩 밀리는 것 보정).
 * offset 보다 늦게 도착한 정도(흔들림)를 기억해 두고, 그만큼 더 과거를 보여줘서 끊기지 않게 한다.
 */
export class ServerClock {
  private offset: number | null = null;
  private jitter = 0;

  observe(serverTimeMs: number, receivedAt: number): void {
    const o = receivedAt - serverTimeMs;
    if (this.offset === null || o < this.offset) this.offset = o;
    else this.offset += (o - this.offset) * 0.01;
    const late = o - this.offset;
    this.jitter = late > this.jitter ? late : this.jitter * JITTER_DECAY;
  }

  /** 내 시계 시각 → 서버 시간. 아직 모르면 null */
  toServer(localMs: number): number | null {
    return this.offset === null ? null : localMs - this.offset;
  }

  /** 다른 사람을 얼마나 과거로 보여줄지 (ms) */
  get interpolationDelay(): number {
    return Math.min(MAX_INTERP_DELAY_MS, MIN_INTERP_DELAY_MS + this.jitter);
  }
}
