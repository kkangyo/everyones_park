import { NICKNAME_MAX_LENGTH, nicknameKey } from "@park/shared";

// 랜덤 닉네임 추천 (3-3). '형용사 + 겨울 간식·물건' (예: '따끈한 호떡')
const ADJECTIVES: readonly string[] = [
  "따끈한", "포근한", "말랑한", "바삭한", "달콤한", "졸린", "느긋한", "수줍은", "반짝이는", "소복한",
  "동그란", "몽글몽글", "하얀", "보송한", "꼬마", "든든한", "새콤한", "고소한", "향긋한", "느릿한",
];
const NOUNS: readonly string[] = [
  "호떡", "붕어빵", "군밤", "군고구마", "어묵", "떡볶이", "계란빵", "유자차", "핫초코", "식혜",
  "닭꼬치", "순대", "튀김", "땅콩빵", "눈사람", "장갑", "목도리", "털모자", "눈송이", "벙어리장갑",
];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function candidate(): string {
  for (;;) {
    const name = `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
    if ([...name].length <= NICKNAME_MAX_LENGTH) return name;
  }
}

/**
 * 아직 아무도 쓰지 않는 랜덤 닉네임. 몇 번 뽑아도 다 쓰고 있으면 숫자를 붙인다 ('따끈한 호떡7')
 * isTaken: 닉네임 키로 이미 있는지 확인
 */
export async function randomNickname(isTaken: (key: string) => Promise<boolean>): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const name = candidate();
    if (!(await isTaken(nicknameKey(name)))) return name;
  }
  for (;;) {
    const base = candidate().replace(/ /g, "");
    const name = `${base}${Math.floor(Math.random() * 100)}`;
    if ([...name].length <= NICKNAME_MAX_LENGTH && !(await isTaken(nicknameKey(name)))) return name;
  }
}
