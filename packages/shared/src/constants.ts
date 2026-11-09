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
