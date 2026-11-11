import { seatStandPoint, seatsInRange, type CollisionGrid, type NoticeMessage, type Seat } from "@park/shared";
import { createLogger } from "../logger";
import type { ParkState, PlayerState } from "../schema/ParkState";

const log = createLogger("seat");

/**
 * 자리에 앉기·일어나기 (5-2).
 * 앉으면 서버가 캐릭터를 칸 위치로 옮기고 자리 방향을 보게 한다. 칸 하나에는 한 명만.
 * 일어나면 자리 앞(막혀 있으면 다른 쪽)에 세운다. 이동 입력이 오면 먼저 일어난다 (ParkRoom).
 */
export class SeatSystem {
  private readonly seats = new Map<string, Seat>();

  constructor(
    private readonly state: ParkState,
    seats: readonly Seat[],
    private readonly grid: CollisionGrid,
    private readonly notify: (sessionId: string, msg: NoticeMessage) => void,
  ) {
    for (const seat of seats) this.seats.set(seat.id, seat);
  }

  isSeated(player: PlayerState): boolean {
    return player.seatId !== "";
  }

  /** 가까운 자리 중 빈 칸에 앉는다. 가까운 자리가 모두 차 있으면 SEAT_FULL */
  sit(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player || this.isSeated(player)) return;
    const near = seatsInRange(player, [...this.seats.values()]);
    if (near.length === 0) return; // 클라이언트도 자리 근처에서만 보낸다

    for (const seat of near) {
      const free = seat.slots
        .map((pos, slot) => ({ pos, slot, d: Math.hypot(pos.x - player.x, pos.y - player.y) }))
        .filter(({ slot }) => !this.isTaken(seat.id, slot))
        .sort((a, b) => a.d - b.d)[0];
      if (!free) continue;
      player.seatId = seat.id;
      player.seatSlot = free.slot;
      player.x = free.pos.x;
      player.y = free.pos.y;
      player.facing = seat.facing;
      player.moving = false;
      log.debug(`sit ${sessionId} ${seat.id}#${free.slot}`);
      return;
    }
    this.notify(sessionId, { code: "SEAT_FULL" });
  }

  /** 일어나기. 앉아 있지 않으면 아무것도 안 함 */
  stand(player: PlayerState): void {
    const seat = this.seats.get(player.seatId);
    if (!seat) return;
    const pos = seatStandPoint(seat, player.seatSlot, this.grid);
    player.x = pos.x;
    player.y = pos.y;
    player.seatId = "";
    player.seatSlot = 0;
  }

  private isTaken(seatId: string, slot: number): boolean {
    for (const p of this.state.players.values()) if (p.seatId === seatId && p.seatSlot === slot) return true;
    return false;
  }
}
