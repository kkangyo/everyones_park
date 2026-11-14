import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { ParkScene } from "./scenes/ParkScene";
import { CharacterArtReviewScene } from "./scenes/CharacterArtReviewScene";
import { UIScene } from "./scenes/UIScene";
import { getSettings } from "./settings";

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
  scene: [BootScene, LobbyScene, ParkScene, UIScene, CharacterArtReviewScene],
});

// 소리 크기는 설정창(6-5)에서 바꾸고 브라우저에 기억한다
game.events.once(Phaser.Core.Events.READY, () => (game.sound.volume = getSettings().volume));

// 개발 서버에서만: 브라우저 콘솔·자동 테스트에서 게임 상태를 볼 수 있게 (예: game.scene.getScene("Park"))
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
