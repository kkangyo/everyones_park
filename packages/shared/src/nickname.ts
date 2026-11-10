// 닉네임 형식 규칙. 클라이언트(입력 즉시 안내)와 서버(최종 검증)가 같은 함수를 쓴다.
// 욕설·예약어 검사는 서버에만 있다 (apps/server/src/nickname).

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 10;

/** 완성형 한글, 영문, 숫자, 그리고 낱말 사이 띄어쓰기 한 칸 (예: '따끈한 호떡') */
const ALLOWED = /^[가-힣A-Za-z0-9 ]+$/;

export type NicknameFormatError = "NICKNAME_LENGTH" | "NICKNAME_CHARS";

/** 입력값 정리: 유니코드 정규화(NFC), 앞뒤 공백 제거, 연속 공백은 한 칸으로 */
export function normalizeNickname(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ");
}

/**
 * 중복 판정용 키. 대소문자와 띄어쓰기만 다른 닉네임은 같은 닉네임으로 본다
 * ('따끈한 호떡' = '따끈한호떡', 'Kim' = 'kim')
 */
export function nicknameKey(nickname: string): string {
  return normalizeNickname(nickname).replace(/ /g, "").toLowerCase();
}

/** 정리된(normalizeNickname) 닉네임의 형식 오류. 문제없으면 null */
export function checkNicknameFormat(nickname: string): NicknameFormatError | null {
  const length = [...nickname].length;
  if (length < NICKNAME_MIN_LENGTH || length > NICKNAME_MAX_LENGTH) return "NICKNAME_LENGTH";
  if (!ALLOWED.test(nickname)) return "NICKNAME_CHARS";
  return null;
}

/** PIN: 숫자 4자리 */
export const PIN_PATTERN = /^\d{4}$/;
