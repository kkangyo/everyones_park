/** 왕복 지연 흉내. 한 방향에 절반씩. 0 이면 바로 실행 */
export class LagSim {
  private readonly oneWayMs: number;

  constructor(roundTripMs: number) {
    this.oneWayMs = roundTripMs / 2;
  }

  run(fn: () => void): void {
    if (this.oneWayMs <= 0) fn();
    else setTimeout(fn, this.oneWayMs);
  }
}
