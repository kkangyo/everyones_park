import { NO_INPUT, type Axis, type MoveInput, type Vec2 } from "@park/shared";

/** 경유점에 이만큼(px) 가까워지면 도착으로 본다. 한 프레임 이동량(약 1.6–3.2px)보다 커야 왔다 갔다 하지 않는다 */
const ARRIVE_PX = 3;
/** 이 시간 동안 거의 움직이지 못하면 (다른 사람에게 막힘 등) 클릭 이동을 취소 */
const STUCK_SEC = 0.6;
const STUCK_MIN_MOVE_PX = 0.5;

/**
 * 경로(경유점 목록)를 따라가도록 매 프레임 MoveInput 을 만든다.
 * 서버에는 키보드와 똑같은 방향 입력만 보내므로, 서버는 이동 방식 하나만 검증하면 된다.
 */
export class PathFollower {
  private waypoints: Vec2[] = [];
  private lastPos: Vec2 | null = null;
  private stuckSec = 0;

  get active(): boolean {
    return this.waypoints.length > 0;
  }

  /** 남은 경유점 (디버그 표시용) */
  get remaining(): readonly Vec2[] {
    return this.waypoints;
  }

  get destination(): Vec2 | undefined {
    return this.waypoints[this.waypoints.length - 1];
  }

  start(waypoints: Vec2[]): void {
    this.waypoints = [...waypoints];
    this.lastPos = null;
    this.stuckSec = 0;
  }

  cancel(): void {
    this.waypoints = [];
  }

  next(pos: Vec2, dtSec: number): MoveInput {
    while (this.waypoints.length > 0 && arrived(pos, this.waypoints[0]!)) this.waypoints.shift();
    const target = this.waypoints[0];
    if (!target) return NO_INPUT;

    if (this.lastPos) {
      const moved = Math.hypot(pos.x - this.lastPos.x, pos.y - this.lastPos.y);
      this.stuckSec = moved < STUCK_MIN_MOVE_PX ? this.stuckSec + dtSec : 0;
      if (this.stuckSec >= STUCK_SEC) {
        this.cancel();
        return NO_INPUT;
      }
    }
    this.lastPos = pos;

    return { x: axisToward(target.x - pos.x), y: axisToward(target.y - pos.y) };
  }
}

function arrived(pos: Vec2, target: Vec2): boolean {
  return Math.abs(target.x - pos.x) <= ARRIVE_PX && Math.abs(target.y - pos.y) <= ARRIVE_PX;
}

function axisToward(d: number): Axis {
  if (d > ARRIVE_PX) return 1;
  if (d < -ARRIVE_PX) return -1;
  return 0;
}
