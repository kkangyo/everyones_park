import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collisionGridFromTiled, seatsFromTiled, seatStandPoint, boxHitsWall, footBox } from "../packages/shared/src/index";
import { ParkState, PlayerState } from "../apps/server/src/schema/ParkState";
import { SeatSystem } from "../apps/server/src/systems/seats";

const map = JSON.parse(readFileSync("assets/maps/park.json", "utf8"));
const grid = collisionGridFromTiled(map, "obstacles"), seats = seatsFromTiled(map, "seats");
const state = new ParkState(), player = new PlayerState(); state.players.set("review", player);
const system = new SeatSystem(state, seats, grid, () => assert.fail("Unexpected seat rejection"));
let slots = 0;
for (const seat of seats) for (let slot = 0; slot < seat.slots.length; slot++) {
  const front = seatStandPoint(seat, slot, grid);
  assert.ok(!boxHitsWall(grid, footBox(front)), `${seat.id} needs a free approach`);
  Object.assign(player, front);
  system.sit("review", seat.id);
  assert.equal(player.seatId, seat.id); assert.equal(player.seatSlot, slot); assert.equal(player.facing, seat.facing);
  assert.deepEqual({ x: player.x, y: player.y }, seat.slots[slot]);
  system.stand(player);
  assert.equal(player.seatId, ""); assert.deepEqual({ x: player.x, y: player.y }, front);
  slots++;
}
assert.equal(new Set(seats.map((seat) => seat.facing)).size, 4, "The park should use all four bench directions");
console.log(JSON.stringify({ benches: seats.length, testedSitStandSlots: slots, facings: [...new Set(seats.map((seat) => seat.facing))] }));
