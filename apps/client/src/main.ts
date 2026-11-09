import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { ParkScene } from "./scenes/ParkScene";
import { UIScene } from "./scenes/UIScene";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#1b2433",
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: "100%",
    height: "100%",
  },
  scene: [BootScene, ParkScene, UIScene],
});
