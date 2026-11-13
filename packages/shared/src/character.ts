// 캐릭터 외형 (성별 + 얼굴 + 옷). 서버는 이 목록으로 입력을 검증하고, 클라이언트는 같은 id 로 그림을 고른다.
// 얼굴 = 몸 그림 (body-<얼굴 id>.png). 머리·얼굴·머리카락이 몸 레이어에 있어서 몸 그림을 바꾸면 얼굴이 바뀐다.
// 얼굴·옷을 추가할 때: 여기에 id 추가 (+ 비율 묶음) → 같은 이름의 그림 파일 → i18n 라벨 (character.face.*, character.outfit.*)

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

/**
 * 몸 비율 묶음. 머리 크기·위치가 달라서 **같은 묶음끼리만** 몸과 옷을 겹칠 수 있다.
 *   basic: 임시 그림 (pnpm gen:character). 작은 머리
 *   photo: 사진으로 만든 그림 (캐릭터_그래픽_프롬프트_8방향.md 규격). 큰 머리
 */
export const BODY_FRAMES = ["basic", "photo"] as const;
export type BodyFrame = (typeof BODY_FRAMES)[number];

/** 성별마다 고를 수 있는 얼굴 (= 몸 그림 id). 첫 번째가 기본값 */
export const FACES: Record<Gender, readonly string[]> = {
  male: ["male-handsome"],
  female: ["female-longhair"],
};

/** 성별마다 고를 수 있는 옷. 첫 번째가 기본값. 얼굴과 비율 묶음이 같은 옷만 보여 준다 (outfitsFor) */
export const OUTFITS: Record<Gender, readonly string[]> = {
  male: ["black-blazer-handsome"],
  female: ["ivory-sleeveless"],
};

/** basic 이 아닌 얼굴·옷의 비율 묶음. 여기 없으면 basic */
const FRAME_OF: Readonly<Record<string, BodyFrame>> = {
  "male-handsome": "photo",
  "female-longhair": "photo",
  "black-blazer-handsome": "photo",
  "ivory-sleeveless": "photo",
};

/** 얼굴 또는 옷의 비율 묶음 */
export function frameOf(faceOrOutfit: string): BodyFrame {
  return FRAME_OF[faceOrOutfit] ?? "basic";
}

/** 그 얼굴에 입힐 수 있는 옷 */
export function outfitsFor(gender: Gender, face: string): readonly string[] {
  return OUTFITS[gender].filter((o) => frameOf(o) === frameOf(face));
}

/** 그 옷을 입을 수 있는 첫 번째 얼굴 (얼굴 선택이 없던 예전 계정·토큰·브라우저 저장값을 읽을 때) */
export function defaultFaceFor(gender: Gender, outfit: string): string {
  return FACES[gender].find((f) => frameOf(f) === frameOf(outfit)) ?? FACES[gender][0]!;
}

/** 그릴 몸 그림 id */
export function bodyIdOf(appearance: Appearance): string {
  return appearance.face;
}

export interface Appearance {
  gender: Gender;
  /** FACES 의 id (= 몸 그림 id) */
  face: string;
  outfit: string;
}

export const DEFAULT_APPEARANCE: Appearance = { gender: "male", face: FACES.male[0]!, outfit: OUTFITS.male[0]! };

export function isGender(value: unknown): value is Gender {
  return typeof value === "string" && (GENDERS as readonly string[]).includes(value);
}

/** 성별에 맞는 얼굴·옷이고, 얼굴과 옷의 비율 묶음이 같은지까지 확인 */
export function isValidAppearance(value: { gender?: unknown; face?: unknown; outfit?: unknown }): value is Appearance {
  if (!isGender(value.gender) || typeof value.face !== "string" || typeof value.outfit !== "string") return false;
  return FACES[value.gender].includes(value.face) && OUTFITS[value.gender].includes(value.outfit) && frameOf(value.face) === frameOf(value.outfit);
}

/**
 * 밖에서 받은 외형 값을 읽는다. 얼굴이 없으면(얼굴 선택이 생기기 전의 값) 옷에 맞는 얼굴로 채운다.
 * 틀린 값이면 null
 */
export function readAppearance(value: { gender?: unknown; face?: unknown; outfit?: unknown }): Appearance | null {
  if (!isGender(value.gender) || typeof value.outfit !== "string") return null;
  const retiredFaces = { male: ["male"], female: ["female"] };
  const retiredOutfits = { male: ["padding-orange", "coat-navy", "hoodie-green", "parka-gray"], female: ["coat-pink", "padding-cream", "coat-red", "parka-mint"] };
  if (retiredOutfits[value.gender].includes(value.outfit) &&
      (value.face === undefined || value.face === "" || retiredFaces[value.gender].includes(String(value.face)))) {
    return { gender: value.gender, face: FACES[value.gender][0]!, outfit: OUTFITS[value.gender][0]! };
  }
  const face = value.face === undefined || value.face === "" ? defaultFaceFor(value.gender, value.outfit) : value.face;
  const a = { gender: value.gender, face, outfit: value.outfit };
  return isValidAppearance(a) ? { gender: a.gender, face: a.face, outfit: a.outfit } : null;
}
