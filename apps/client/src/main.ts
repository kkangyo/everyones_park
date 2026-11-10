import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { ParkScene } from "./scenes/ParkScene";
import { UIScene } from "./scenes/UIScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#1b2433",
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: "100%",
    height: "100%",
  },
  scene: [BootScene, LobbyScene, ParkScene, UIScene],
});

// 개발 서버에서만: 브라우저 콘솔·자동 테스트에서 게임 상태를 볼 수 있게 (예: game.scene.getScene("Park"))
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
