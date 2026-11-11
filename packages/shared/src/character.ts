// 캐릭터 외형 (성별 + 옷). 서버는 이 목록으로 입력을 검증하고, 클라이언트는 같은 id 로 그림을 고른다.
// 옷을 추가할 때: 여기에 id 추가 → pnpm gen:character (또는 같은 이름의 그림 파일) → i18n 라벨
// 사진으로 만든 캐릭터처럼 비율이 다른 그림은 전용 몸과 짝을 지어 OUTFIT_BODIES 에 등록한다

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

/** 성별마다 고를 수 있는 옷 (MVP 각 4벌). 첫 번째가 기본값 */
export const OUTFITS: Record<Gender, readonly string[]> = {
  male: ["padding-orange", "coat-navy", "hoodie-green", "parka-gray", "black-blazer-handsome"],
  female: ["coat-pink", "padding-cream", "coat-red", "parka-mint"],
};

/**
 * 성별 기본 몸(body-<성별>.png) 대신 전용 몸을 쓰는 옷. 값 = 몸 그림 id (body-<id>.png).
 * 머리 크기 등 비율이 기본 몸과 달라서 서로 섞으면 어긋나는 그림 (캐릭터_그래픽_프롬프트_8방향.md 규격)
 */
export const OUTFIT_BODIES: Readonly<Record<string, string>> = {
  "black-blazer-handsome": "male-handsome",
};

/** 그릴 몸 그림 id. 전용 몸이 없으면 성별 */
export function bodyIdOf(appearance: Appearance): string {
  return OUTFIT_BODIES[appearance.outfit] ?? appearance.gender;
}

export interface Appearance {
  gender: Gender;
  outfit: string;
}

export const DEFAULT_APPEARANCE: Appearance = { gender: "male", outfit: OUTFITS.male[0]! };

export function isGender(value: unknown): value is Gender {
  return typeof value === "string" && (GENDERS as readonly string[]).includes(value);
}

/** 성별에 맞는 옷인지까지 확인 */
export function isValidAppearance(value: { gender?: unknown; outfit?: unknown }): value is Appearance {
  return isGender(value.gender) && typeof value.outfit === "string" && OUTFITS[value.gender].includes(value.outfit);
}
