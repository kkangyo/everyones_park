import Phaser from "phaser";
import { TICK_SEC, facingFromInput, isMoving, step, type Appearance, type CollisionGrid, type Facing, type MoveInput, type Vec2 } from "@park/shared";
import { CharacterView } from "./CharacterView";

/**
 * 내 캐릭터. 서버와 같은 고정 틱(TICK_SEC)으로 움직이고,
 * 화면에는 직전 틱과 현재 틱 사이를 보간해서 60fps 로 부드럽게 그린다.
 */
export class Player {
  readonly view: CharacterView;
  facing: Facing = "down";
  moving = false;
  /** 직전 틱 / 현재 틱 위치 (시뮬레이션 기준) */
  private prev: Vec2;
  private cur: Vec2;

  constructor(scene: Phaser.Scene, pos: Vec2, nickname: string, appearance: Appearance) {
    this.view = new CharacterView(scene, pos, nickname, appearance);
    this.prev = { ...pos };
    this.cur = { ...pos };
  }

  /** 시뮬레이션 위치 (현재 틱). 화면에 보이는 위치는 이보다 최대 한 틱 늦다 */
  get position(): Vec2 {
    return this.cur;
  }

  /** 한 틱 진행. others: 다른 캐릭터 위치 (발밑 충돌) */
  tick(input: MoveInput, grid: CollisionGrid, others: readonly Vec2[]): void {
    const next = step(this.cur, input, TICK_SEC, grid, others);
    this.facing = facingFromInput(input, this.facing);
    // 벽에 막혀 제자리걸음이면 서 있는 모습으로
    this.moving = isMoving(input) && (next.x !== this.cur.x || next.y !== this.cur.y);
    this.prev = this.cur;
    this.cur = next;
  }

  /** 서버 보정 등으로 위치를 바꾼다. 화면이 튀지 않게 직전 위치도 같은 만큼 옮긴다 */
  correctTo(pos: Vec2): void {
    const dx = pos.x - this.cur.x;
    const dy = pos.y - this.cur.y;
    this.prev = { x: this.prev.x + dx, y: this.prev.y + dy };
    this.cur = { ...pos };
  }

  /** 입장 직후 서버가 정한 위치로 순간이동 */
  teleport(pos: Vec2): void {
    this.prev = { ...pos };
    this.cur = { ...pos };
  }

  /** alpha: 직전 틱 → 현재 틱 사이 진행률 (0~1) */
  render(alpha: number): void {
    const x = this.prev.x + (this.cur.x - this.prev.x) * alpha;
    const y = this.prev.y + (this.cur.y - this.prev.y) * alpha;
    this.view.setPose({ x, y }, this.facing, this.moving);
  }
}
