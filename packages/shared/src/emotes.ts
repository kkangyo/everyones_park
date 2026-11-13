// 이모티콘 (5-4). 서버(검증·쿨다운)와 클라이언트(표시)가 같은 데이터를 쓴다.
// 목록·순서는 data/emotes.json 에서 고친다. 순서 = 숫자키 1–8, 그림 시트의 프레임 순서

import emoteData from "../data/emotes.json";
import type { LocalizedName } from "./food";

/**
 * 이모티콘과 같이 하는 동작 (5-5). 그림 없이 코드로 움직인다 (CharacterView)
 *   wave  : 머리 옆에서 손(벙어리장갑)을 흔든다
 *   jump  : 제자리에서 두 번 폴짝 (앉아 있으면 생략)
 *   shiver: 덜덜 떤다
 */
export const EMOTE_ACTIONS = ["wave", "jump", "shiver"] as const;
export type EmoteAction = (typeof EMOTE_ACTIONS)[number];

export interface EmoteDef {
  id: string;
  name: LocalizedName;
  /** 같이 하는 동작. 없으면 말풍선만 */
  action?: EmoteAction;
}

/** 한 번 보내면 다음 이모티콘까지 기다리는 시간 (초) */
export const EMOTE_COOLDOWN_SEC = 3;
/** 머리 위 말풍선이 떠 있는 시간 (ms) */
export const EMOTE_SHOW_MS = 3000;

function loadEmotes(): EmoteDef[] {
  const list = emoteData.emotes as EmoteDef[];
  const ids = new Set<string>();
  for (const e of list) {
    if (ids.has(e.id)) throw new Error(`emotes.json: 이모티콘 id "${e.id}" 이(가) 중복입니다`);
    if (e.action !== undefined && !EMOTE_ACTIONS.includes(e.action)) {
      throw new Error(`emotes.json: "${e.id}" 의 action 은 ${EMOTE_ACTIONS.join(" / ")} 중 하나여야 합니다`);
    }
    ids.add(e.id);
  }
  if (list.length > 9) throw new Error("emotes.json: 숫자키(1–9)로 고를 수 있게 9개 이하로 둡니다");
  return list;
}

/** 순서대로 (숫자키 1 = 0번째) */
export const EMOTES: readonly EmoteDef[] = loadEmotes();
export const EMOTE_BY_ID: ReadonlyMap<string, EmoteDef> = new Map(EMOTES.map((e) => [e.id, e]));
