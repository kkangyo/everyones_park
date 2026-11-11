import Phaser from "phaser";
import { HANDS_MAX, isAtTruckFront, truckFrontPoint, type TruckPlacement, type Vec2 } from "@park/shared";
import { TruckView } from "../entities/TruckView";
import { t } from "../i18n";
import type { ParkSync } from "../net/ParkSync";
import { TruckMenu } from "../ui/TruckMenu";

/** 공원 씬이 넘겨 주는 기능 */
export interface TruckControllerDeps {
  /** 내 캐릭터 발밑 위치 (예측 위치) */
  position(): Vec2;
  /** 그 지점으로 길찾기 이동 시작. 갈 수 없으면 false */
  walkTo(goal: Vec2): boolean;
  /** 클릭 이동 중인지 */
  isWalking(): boolean;
  /** 내 머리 위 말풍선 */
  say(text: string): void;
}

const NUMBER_KEYS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"] as const;

/**
 * 간식 트럭 다루기 (4-1 ~ 4-3, 클라이언트 쪽).
 * - 트럭 앞에 서면 'Space 주문' 안내, Space·트럭 클릭·화면의 '주문' 버튼 → 메뉴 말풍선
 * - 멀리서 트럭을 클릭하면 트럭 앞까지 걸어가서 메뉴를 연다
 * - 손이 꽉 찼으면 메뉴 대신 '손이 꽉 찼어요' 말풍선 (서버도 다시 확인한다)
 */
export class TruckController {
  private readonly views: TruckView[];
  private menu?: TruckMenu;
  /** 클릭해서 걸어가는 중인 트럭. 도착하면 메뉴를 연다 */
  private walkingTo?: TruckPlacement;

  constructor(
    private readonly scene: Phaser.Scene,
    trucks: readonly TruckPlacement[],
    private readonly sync: ParkSync,
    private readonly deps: TruckControllerDeps,
  ) {
    this.views = trucks.map((placement) => {
      const view = new TruckView(scene, placement);
      view.sprite.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
        if (pointer.button === 0) this.interact(placement, true);
      });
      return view;
    });

    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    kb.addKey(K.SPACE, true).on("down", () => this.openMenuInFront());
    kb.addKey(K.ESC).on("down", () => this.closeMenu());
    NUMBER_KEYS.forEach((name, i) => kb.addKey(K[name]).on("down", () => this.menu?.chooseIndex(i)));
  }

  /** 지금 서 있는 트럭 앞에서 주문할 수 있는지 (메뉴가 닫혀 있고 기다리는 주문이 없을 때). 터치 '주문' 버튼 표시용 */
  canOrderHere(): boolean {
    return !this.menu && !this.sync.me?.orderTruck && this.truckInFront() !== undefined;
  }

  /** Space·'주문' 버튼: 서 있는 트럭의 메뉴를 연다 */
  openMenuInFront(): void {
    const truck = this.truckInFront();
    if (truck) this.interact(truck, false);
  }

  /** 클릭 이동 등으로 다른 곳에 가기 시작하면 '트럭에 가서 메뉴 열기'를 취소 */
  cancelPending(): void {
    this.walkingTo = undefined;
  }

  update(): void {
    const pos = this.deps.position();
    const me = this.sync.me;
    for (const view of this.views) {
      view.update(this.sync.truck(view.placement.def.id));
      const showHint = !this.menu && !me?.orderTruck && isAtTruckFront(pos, view.placement);
      view.setHintVisible(showHint);
    }

    // 트럭 앞을 벗어나면 메뉴를 닫는다
    if (this.menu) {
      const open = this.views.find((v) => v.placement.def.id === this.menu!.truckId)!;
      if (!isAtTruckFront(pos, open.placement)) this.closeMenu();
      // 화면 크기·카메라 위치에 맞춰 트럭 위 또는 아래에
      else this.menu.place(open.placement, this.scene.cameras.main);
    }

    // 클릭한 트럭에 도착
    if (this.walkingTo && !this.deps.isWalking()) {
      const truck = this.walkingTo;
      this.walkingTo = undefined;
      if (isAtTruckFront(pos, truck)) this.interact(truck, false);
    }
  }

  private truckInFront(): TruckPlacement | undefined {
    const pos = this.deps.position();
    return this.views.find((v) => isAtTruckFront(pos, v.placement))?.placement;
  }

  private interact(truck: TruckPlacement, fromClick: boolean): void {
    if (!isAtTruckFront(this.deps.position(), truck)) {
      if (fromClick && this.deps.walkTo(truckFrontPoint(truck))) this.walkingTo = truck;
      return;
    }
    if ((this.sync.me?.hands.length ?? 0) >= HANDS_MAX) {
      this.deps.say(t("notice.HANDS_FULL"));
      return;
    }
    this.closeMenu();
    this.menu = new TruckMenu(this.scene, truck, (item) => {
      this.sync.sendOrder(truck.def.id, item);
      this.closeMenu();
    });
  }

  get menuOpen(): boolean {
    return this.menu !== undefined;
  }

  closeMenu(): void {
    this.menu?.destroy();
    this.menu = undefined;
  }
}
