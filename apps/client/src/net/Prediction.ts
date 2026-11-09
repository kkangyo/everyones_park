import { TICK_SEC, isMoving, step, type CollisionGrid, type InputMessage, type MoveInput, type Vec2 } from "@park/shared";

/**
 * 내 캐릭터 예측·보정 (2-5).
 * 보낸 입력을 서버가 처리할 때까지 보관하고, 서버 위치가 오면
 * "서버 위치 + 아직 처리 안 된 입력"을 다시 적용해 현재 위치를 다시 계산한다.
 * Phaser 를 쓰지 않는 순수 로직 (Node 에서 테스트 가능).
 */
export class Prediction {
  private seq = 0;
  private pending: InputMessage[] = [];
  private lastSentMoving = false;

  /** 서버 응답을 기다리는 입력 수 (디버그용) */
  get pendingCount(): number {
    return this.pending.length;
  }

  /**
   * 이번 틱 입력을 보낼 메시지로 만든다. 멈춰 있는 동안은 보내지 않는다 (멈춘 순간 한 번만 보냄).
   * null 이면 보낼 것 없음.
   */
  nextInput(input: MoveInput): InputMessage | null {
    const moving = isMoving(input);
    if (!moving && !this.lastSentMoving) return null;
    this.lastSentMoving = moving;
    const msg: InputMessage = { seq: ++this.seq, x: input.x, y: input.y };
    this.pending.push(msg);
    return msg;
  }

  /**
   * 서버 위치(ackSeq 까지 처리된 결과)에 남은 입력을 다시 적용한 위치.
   * others: 다른 캐릭터의 최신 서버 위치. 서버가 판정할 때의 위치와 조금 다를 수 있어서
   * 다른 사람과 부딪히는 순간에는 작은 보정이 생길 수 있다.
   */
  reconcile(serverPos: Vec2, ackSeq: number, grid: CollisionGrid, others: readonly Vec2[] = []): Vec2 {
    this.pending = this.pending.filter((i) => i.seq > ackSeq);
    let pos = serverPos;
    for (const input of this.pending) pos = step(pos, input, TICK_SEC, grid, others);
    return pos;
  }
}
