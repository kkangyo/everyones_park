// URL 파라미터로 켜는 개발용 옵션. 예) http://localhost:15173/?debug=1&lag=150
const params = new URLSearchParams(window.location.search);

/** 디버그 오버레이 (FPS, 좌표, 타일) + 서버 위치 고스트 */
export const DEBUG = params.get("debug") === "1";

/** F1 충돌 표시 등 개발용 단축키. 개발 서버(vite dev)이거나 ?debug=1 일 때만 */
export const DEV_KEYS = import.meta.env.DEV || DEBUG;

/** 인위적 왕복 지연 (ms). 보내는 쪽·받는 쪽에 절반씩 건다. 예측·보간 시험용 */
export const LAG_MS = Math.max(0, Number(params.get("lag")) || 0);
