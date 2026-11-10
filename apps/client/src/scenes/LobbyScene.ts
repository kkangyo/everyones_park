import Phaser from "phaser";
import { t, translate } from "../i18n";
import { ApiFailure, login } from "../net/api";
import { joinPark } from "../net/connection";
import { loadProfile, saveProfile } from "../profile";
import { LobbyForm, type LobbyValues } from "../ui/LobbyForm";
import { buildParkMap } from "../world/parkMap";
import type { ParkSceneData } from "./ParkScene";

/** 배경 카메라가 입구 주변을 천천히 오가는 거리(px)와 시간 */
const DRIFT_PX = 160;
const DRIFT_MS = 20_000;
const BACKGROUND_ZOOM = 2;

/**
 * 입장 화면 (3-6): 공원 배경 + 닉네임·PIN·캐릭터 입력.
 * '공원 들어가기' → 로그인(처음이면 계정 생성) → 받은 토큰으로 채널 접속 → 공원 씬으로.
 */
export class LobbyScene extends Phaser.Scene {
  private form?: LobbyForm;

  constructor() {
    super("Lobby");
  }

  create(): void {
    const park = buildParkMap(this);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, park.map.widthInPixels, park.map.heightInPixels);
    cam.setZoom(BACKGROUND_ZOOM).setRoundPixels(true);
    cam.centerOn(park.entrance.x - DRIFT_PX / 2, park.entrance.y - 64);
    this.tweens.add({ targets: cam, scrollX: cam.scrollX + DRIFT_PX, duration: DRIFT_MS, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    this.form = new LobbyForm(this.textures, loadProfile(), (values) => this.enter(values));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.form?.destroy();
      this.form = undefined;
    });
  }

  /** 실패하면 화면에 보여 줄 문구로 예외를 던진다 (폼이 표시) */
  private async enter(values: LobbyValues): Promise<void> {
    let data: ParkSceneData;
    try {
      const res = await login(values);
      saveProfile({ nickname: res.user.nickname, gender: res.user.gender, outfit: res.user.outfit });
      data = { room: await joinPark(res.token), user: res.user };
    } catch (err) {
      throw new Error(errorMessage(err));
    }
    this.scene.start("Park", data);
    this.scene.launch("UI");
  }
}

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiFailure)) {
    console.warn("[lobby] 채널 접속 실패", err);
    return t("error.JOIN_FAILED");
  }
  if (err.code === "LOCKED") return t("error.LOCKED", { minutes: Math.max(1, Math.ceil((err.detail.retryAfterSec ?? 600) / 60)) });
  return translate(`error.${err.code}`, { remaining: err.detail.remaining ?? 0 }) ?? t("error.SERVER_ERROR");
}
