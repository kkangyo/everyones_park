import { HANDS_MAX, MENU, TICK_SEC, eatStage } from "@park/shared";
import { HeldFoodState, type ParkState, type PlayerState } from "../schema/ParkState";

/**
 * 양손과 먹기 (4-4, 4-6). 손에 든 간식은 PlayerState.hands 로 모두에게 보인다.
 * 먹기는 한 번에 하나씩: 고른 손(없으면 아직 안 먹은 첫 번째)의 간식을 먹기 시작하고,
 * eatSec 동안 그림이 EAT_STAGES 단계로 줄어든 뒤 손에서 사라진다. 걷기·서기·앉기 모두 가능.
 */
export class HandsSystem {
  /** 먹기 시작한 서버 틱. 화면에 필요 없는 값이라 스키마가 아니라 여기에 둔다 */
  private readonly eatStartTick = new WeakMap<HeldFoodState, number>();

  constructor(private readonly state: ParkState) {}

  isFull(player: PlayerState): boolean {
    return player.hands.length >= HANDS_MAX;
  }

  /** 손에 간식을 쥐어 준다. 손이 꽉 찼으면 false */
  give(player: PlayerState, item: string): boolean {
    if (this.isFull(player) || !MENU.has(item)) return false;
    const food = new HeldFoodState();
    food.item = item;
    food.stage = 0;
    food.eating = false;
    player.hands.push(food);
    return true;
  }

  /** 먹기 시작. 이미 먹는 중이거나 그 손이 비었으면 아무것도 안 함. hand 가 없으면 아직 안 먹은 첫 번째 */
  startEating(player: PlayerState, tick: number, hand?: number): void {
    if (player.hands.some((f) => f.eating)) return;
    const food = hand === undefined ? player.hands.find((f) => !f.eating) : player.hands[hand];
    if (!food) return;
    food.eating = true;
    this.eatStartTick.set(food, tick);
  }

  /** 틱마다: 먹는 중인 간식의 단계를 올리고, 다 먹었으면 손에서 뺀다 */
  tick(tick: number): void {
    this.state.players.forEach((player) => {
      for (let i = player.hands.length - 1; i >= 0; i--) {
        const food = player.hands[i]!;
        const start = food.eating ? this.eatStartTick.get(food) : undefined;
        if (start === undefined) continue;
        const stage = eatStage(MENU.get(food.item)!, (tick - start) * TICK_SEC);
        if (stage === null) {
          player.hands.splice(i, 1);
        } else if (stage !== food.stage) {
          food.stage = stage;
        }
      }
    });
  }
}
