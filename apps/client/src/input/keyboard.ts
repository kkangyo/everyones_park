import Phaser from "phaser";
import type { Axis, MoveInput } from "@park/shared";

/** WASD + 방향키를 MoveInput 으로 읽는다 */
export class KeyboardMove {
  private readonly keys: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) throw new Error("키보드 입력을 사용할 수 없습니다");
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys(
      { up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D },
      true, // 방향키로 페이지가 스크롤되지 않게
    ) as KeyboardMove["keys"];
  }

  read(): MoveInput {
    const k = this.keys;
    const left = k.left.isDown || k.a.isDown;
    const right = k.right.isDown || k.d.isDown;
    const up = k.up.isDown || k.w.isDown;
    const down = k.down.isDown || k.s.isDown;
    // 반대 방향을 동시에 누르면 0
    const x = ((right ? 1 : 0) - (left ? 1 : 0)) as Axis;
    const y = ((down ? 1 : 0) - (up ? 1 : 0)) as Axis;
    return { x, y };
  }
}
