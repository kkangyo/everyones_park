// 설정창(6-5)·숨기기(6-6) 값을 브라우저에 기억한다. 새로고침해도 유지된다.
import { nicknameKey } from "@park/shared";

const STORAGE_KEY = "park.settings.v1";

export interface Settings {
  /** 캐릭터 머리 위 닉네임 표시 (나·다른 사람 모두) */
  showNicknames: boolean;
  /** 소리 크기 0–1 (게임 전체 볼륨) */
  volume: number;
  /** 내 화면에서 숨긴 사람의 닉네임 (보이는 그대로. 비교는 nicknameKey 로) */
  hidden: string[];
}

const DEFAULTS: Settings = { showNicknames: true, volume: 0.7, hidden: [] };

let current = load();
let hiddenKeys = new Set(current.hidden.map(nicknameKey));

/** 저장된 값. 없거나 깨졌거나 저장소를 쓸 수 없으면(사생활 보호 모드 등) 기본값 */
function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Settings> | null;
    if (raw && typeof raw === "object") {
      return {
        showNicknames: typeof raw.showNicknames === "boolean" ? raw.showNicknames : DEFAULTS.showNicknames,
        volume: typeof raw.volume === "number" && raw.volume >= 0 && raw.volume <= 1 ? raw.volume : DEFAULTS.volume,
        hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((n): n is string => typeof n === "string") : [],
      };
    }
  } catch {
    // 무시하고 기본값
  }
  return { ...DEFAULTS, hidden: [] };
}

export function getSettings(): Readonly<Settings> {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  hiddenKeys = new Set(current.hidden.map(nicknameKey));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // 저장하지 못해도 이번 접속에서는 적용된다
  }
}

/** 내 화면에서 숨긴 사람인지 (6-6) */
export function isHidden(nickname: string): boolean {
  return hiddenKeys.has(nicknameKey(nickname));
}

export function hidePlayer(nickname: string): void {
  if (!isHidden(nickname)) updateSettings({ hidden: [...current.hidden, nickname] });
}

export function unhidePlayer(nickname: string): void {
  const key = nicknameKey(nickname);
  updateSettings({ hidden: current.hidden.filter((n) => nicknameKey(n) !== key) });
}
