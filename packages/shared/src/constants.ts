/** 타일 한 칸 크기 (px) */
export const TILE_SIZE = 32;

/** 채널(Room) 하나당 최대 인원 */
export const CHANNEL_CAPACITY = 70;

/** 걷기 속도 (px/초). 달리기는 없음 */
export const WALK_SPEED = 96;

/**
 * 발밑 충돌 상자 (px). 캐릭터 위치(발밑 가운데)를 기준으로
 * 가로 [x - width/2, x + width/2], 세로 [y - height, y] 범위다.
 * 장애물과는 이 상자만 부딪힌다 (머리·몸통은 나무 그림과 겹쳐도 됨).
 */
export const FOOT_HITBOX = { width: 12, height: 6 } as const;

/**
 * 이동 시뮬레이션 틱 (Hz). 클라이언트 예측과 서버 판정이 같은 간격으로 step() 을 돌린다.
 * 입력 하나 = 한 틱(TICK_SEC) 동안의 이동.
 */
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const TICK_SEC = 1 / TICK_RATE;

/**
 * 캐릭터끼리 겹치지 않는 발밑 가운데 영역 (px). 위치(발밑 가운데) 기준
 * 가로 [x - width/2, x + width/2], 세로 [y - height, y].
 * 캐릭터는 대부분 겹쳐도 되고 이 작은 영역끼리만 부딪힌다 (기획서: 폭 5칸 중 가운데 1칸).
 */
export const CORE_HITBOX = { width: 6, height: 4 } as const;
