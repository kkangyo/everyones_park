import {
  MENU,
  ORDER_CANCEL_DISTANCE_PX,
  TICK_RATE,
  distanceToTruck,
  isAtTruckFront,
  type NoticeMessage,
  type OrderMessage,
  type TruckPlacement,
} from "@park/shared";
import { createLogger } from "../logger";
import { TruckState, type ParkState, type PlayerState } from "../schema/ParkState";
import type { HandsSystem } from "./hands";

const log = createLogger("truck");

interface Truck {
  placement: TruckPlacement;
  state: TruckState;
  /** sessionId 대기열. 맨 앞 사람의 간식을 만들고 있다 (cookingItem 이 있으면) */
  queue: string[];
}

/**
 * 간식 트럭 (4-3, 4-4). 번호표 방식(A안): 주문하면 대기열에 들어가고 캐릭터는 자유롭게 움직인다.
 * 트럭마다 한 번에 한 명씩 조리(cookSec)하고, 다 되면 그 사람 손에 쥐어 준다.
 * 기다리는 동안 트럭에서 ORDER_CANCEL_DISTANCE_PX 넘게 멀어지면 자동 취소.
 */
export class TruckSystem {
  private readonly trucks = new Map<string, Truck>();

  constructor(
    private readonly state: ParkState,
    placements: readonly TruckPlacement[],
    private readonly hands: HandsSystem,
    private readonly notify: (sessionId: string, msg: NoticeMessage) => void,
  ) {
    for (const placement of placements) {
      const truckState = new TruckState();
      truckState.cookingItem = "";
      truckState.readyTick = 0;
      truckState.waiting = 0;
      state.trucks.set(placement.def.id, truckState);
      this.trucks.set(placement.def.id, { placement, state: truckState, queue: [] });
    }
  }

  order(sessionId: string, message: unknown): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    const msg = parseOrder(message);
    const truck = msg ? this.trucks.get(msg.truck) : undefined;
    if (!msg || !truck || !truck.placement.def.menu.includes(msg.item)) return this.notify(sessionId, { code: "INVALID_ORDER" });
    if (player.orderTruck) return this.notify(sessionId, { code: "ALREADY_ORDERED", item: player.orderItem });
    if (this.hands.isFull(player)) return this.notify(sessionId, { code: "HANDS_FULL" });
    if (!isAtTruckFront(player, truck.placement)) return this.notify(sessionId, { code: "NOT_AT_TRUCK" });

    truck.queue.push(sessionId);
    player.orderTruck = msg.truck;
    player.orderItem = msg.item;
    this.updateQueue(truck);
    log.debug(`order ${sessionId} ${msg.truck}/${msg.item} (queue ${truck.queue.length})`);
  }

  /** 주문 취소 (본인 요청, 멀어짐, 퇴장) */
  cancel(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    const truck = player?.orderTruck ? this.trucks.get(player.orderTruck) : undefined;
    if (!truck) return;
    const index = truck.queue.indexOf(sessionId);
    if (index >= 0) truck.queue.splice(index, 1);
    // 이 사람 것을 만들던 중이면 버리고 다음 사람으로
    if (index === 0) truck.state.cookingItem = "";
    clearOrder(player!);
    this.updateQueue(truck);
  }

  tick(tick: number): void {
    for (const truck of this.trucks.values()) {
      // 멀어진 사람 자동 취소
      for (const sessionId of [...truck.queue]) {
        const player = this.state.players.get(sessionId);
        if (player && distanceToTruck(player, truck.placement) > ORDER_CANCEL_DISTANCE_PX) {
          const item = player.orderItem;
          this.cancel(sessionId);
          this.notify(sessionId, { code: "ORDER_CANCELLED_FAR", item });
        }
      }

      const s = truck.state;
      if (s.cookingItem && tick >= s.readyTick) this.finish(truck);
      if (!s.cookingItem && truck.queue.length > 0) {
        const player = this.state.players.get(truck.queue[0]!)!;
        s.cookingItem = player.orderItem;
        s.readyTick = tick + Math.round(MENU.get(player.orderItem)!.cookSec * TICK_RATE);
      }
    }
  }

  private finish(truck: Truck): void {
    const sessionId = truck.queue.shift()!;
    const player = this.state.players.get(sessionId)!;
    const item = player.orderItem;
    // 주문할 때 손에 자리가 있었고 기다리는 동안 손은 줄기만 하므로 항상 들어간다
    this.hands.give(player, item);
    clearOrder(player);
    truck.state.cookingItem = "";
    this.updateQueue(truck);
    this.notify(sessionId, { code: "ORDER_READY", item });
  }

  /** 대기 순서·대기 인원 다시 계산 */
  private updateQueue(truck: Truck): void {
    truck.queue.forEach((sessionId, i) => {
      const p = this.state.players.get(sessionId);
      if (p && p.orderQueuePos !== i) p.orderQueuePos = i;
    });
    truck.state.waiting = Math.max(0, truck.queue.length - 1);
  }
}

function clearOrder(player: PlayerState): void {
  player.orderTruck = "";
  player.orderItem = "";
  player.orderQueuePos = 0;
}

function parseOrder(message: unknown): OrderMessage | null {
  if (typeof message !== "object" || message === null) return null;
  const { truck, item } = message as Record<string, unknown>;
  if (typeof truck !== "string" || typeof item !== "string") return null;
  return { truck, item };
}
