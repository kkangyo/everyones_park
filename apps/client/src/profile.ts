// 입장 화면에서 고른 값을 브라우저에 기억한다 (닉네임·캐릭터). PIN 은 저장하지 않는다.
import { DEFAULT_APPEARANCE, readAppearance, type Appearance } from "@park/shared";

const STORAGE_KEY = "park.profile.v1";

export interface Profile extends Appearance {
  nickname: string;
}

/** 저장된 값. 없거나 깨졌거나 저장소를 쓸 수 없으면(사생활 보호 모드 등) 기본값 */
export function loadProfile(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Profile> | null;
    if (raw) {
      // 얼굴 선택 전에 저장한 값(face 없음)은 옷에 맞는 얼굴로
      const appearance = readAppearance(raw) ?? DEFAULT_APPEARANCE;
      return { nickname: typeof raw.nickname === "string" ? raw.nickname : "", ...appearance };
    }
  } catch {
    // 무시하고 기본값
  }
  return { nickname: "", ...DEFAULT_APPEARANCE };
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // 저장하지 못해도 입장에는 문제없음
  }
}
