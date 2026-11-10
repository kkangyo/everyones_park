#!/usr/bin/env bash
# 폰 서버 배포: 의존성 설치 → 빌드 → pm2 로 게임 서버 + Caddy 시작(또는 무중단 재시작)
set -euo pipefail
cd "$(dirname "$0")/.."

CADDY="${CADDY_BIN:-caddy}"
if ! command -v "$CADDY" >/dev/null 2>&1; then
  echo "caddy 를 찾을 수 없습니다. README '폰 서버 배포' 의 설치 방법을 보거나 CADDY_BIN=/경로/caddy 로 지정하세요." >&2
  exit 1
fi

# 입장 토큰 서명 키: 운영 서버는 AUTH_SECRET 이 없으면 시작하지 않는다.
# 처음 배포할 때 한 번 만들어서 apps/server/.env 에 저장한다 (git 에 올라가지 않음. 서버가 시작할 때 읽음)
ENV_FILE=apps/server/.env
if [[ -z "${AUTH_SECRET:-}" ]] && ! grep -q '^AUTH_SECRET=.' "$ENV_FILE" 2>/dev/null; then
  echo "AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> "$ENV_FILE"
  echo "AUTH_SECRET 을 새로 만들어 $ENV_FILE 에 저장했습니다"
fi

pnpm install --frozen-lockfile
pnpm build
"$CADDY" validate --config deploy/Caddyfile --adapter caddyfile >/dev/null

pnpm exec pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pnpm exec pm2 save

# 배포 확인: Caddy 를 거쳐 서버 /health 가 응답하는지
SITE="${SITE_ADDRESS:-:3100}"
if [[ "$SITE" == :* ]]; then URL="http://localhost${SITE}"; else URL="https://${SITE}"; fi
for _ in $(seq 1 20); do
  if curl -fsS "${URL}/health" >/dev/null 2>&1; then
    pnpm exec pm2 ls
    echo "배포 완료: ${URL}"
    exit 0
  fi
  sleep 0.5
done
echo "배포 후 헬스체크 실패 (${URL}/health). pnpm exec pm2 logs 로 확인하세요." >&2
exit 1
