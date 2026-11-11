import Phaser from "phaser";

/** 월드(카메라로 확대되는 화면)에 그리는 글자의 해상도. 카메라 최대 확대 배율과 같게 */
export const WORLD_TEXT_RESOLUTION = 4;

/**
 * 월드 글자를 선명하게: 높은 해상도로 그리고 부드럽게(LINEAR) 줄인다.
 * 게임 설정 pixelArt 는 모든 그림을 '가까운 픽셀'로 확대·축소하는데, 고해상도 글자를 그렇게 줄이면 획이 끊겨 깨져 보인다
 */
export function smoothText<T extends Phaser.GameObjects.Text>(text: T): T {
  text.setResolution(WORLD_TEXT_RESOLUTION);
  text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return text;
}
