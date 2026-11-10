// 닉네임 욕설·예약어 필터 (3-3). 어린이도 쓰는 서비스라 넉넉하게 막는다.
// 단어를 추가할 때: 소문자, 띄어쓰기 없이. 들어 있기만 해도(부분 일치) 막힌다.

/** 욕설·성적 표현·혐오 표현 */
const BANNED: readonly string[] = [
  // 한국어
  "시발", "씨발", "씨빨", "시빨", "씨바", "씨팔", "시팔", "쉬발", "쓰발", "씨벌", "시벌",
  "병신", "븅신", "빙신", "벼엉신",
  "좆", "존나", "졸라", "개새", "개색", "개세끼", "새끼", "쌔끼", "섀끼",
  "지랄", "염병", "썅", "니미", "니애미", "느금", "엠창", "애미", "에미", "니애비",
  "미친", "미췬", "또라이", "닥쳐",
  "섹스", "쎅스", "보지", "자지", "꼬추", "젖꼭", "야동", "강간", "성폭", "변태", "창녀", "걸레", "자위",
  "한남충", "김치녀", "된장녀", "틀딱", "급식충", "애자",
  // 영어
  "fuck", "fuk", "shit", "bitch", "bastard", "asshole", "dick", "pussy", "cunt", "cock", "porn", "sex", "nigg", "fag", "slut", "whore",
];

/** 운영자를 사칭할 수 있는 이름 */
const RESERVED: readonly string[] = ["관리자", "운영자", "운영진", "운영팀", "어드민", "admin", "모더레이터", "moderator", "공지", "시스템", "system", "모두의쉼터"];

/**
 * 비교용 형태: 소문자 + 한글·영문만 남김 (띄어쓰기·숫자로 끊어 쓰는 우회 방지. 예: '시1발', '시 발')
 */
function squash(nickname: string): string {
  return nickname.toLowerCase().replace(/[^가-힣a-z]/g, "");
}

/** 쓸 수 없는 닉네임이면 true */
export function isBannedNickname(nickname: string): boolean {
  const s = squash(nickname);
  return BANNED.some((w) => s.includes(w)) || RESERVED.some((w) => s.includes(w));
}
