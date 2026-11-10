# 게임 서버 이미지 (WSL 시험 + 클라우드 이전용)
# 폰 서버(arm64 chroot)는 커널에 PID 네임스페이스가 없어 Docker를 쓸 수 없으므로 Node를 직접 실행한다.
# 실행: pnpm docker:up   (docker/compose.yml)

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN npm install -g corepack@latest && corepack enable
WORKDIR /app

# better-sqlite3·argon2 네이티브 모듈: 미리 빌드된 바이너리를 못 받으면 직접 빌드한다
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# --- 빌드: 전체 의존성 설치 후 서버 번들 생성 (shared는 번들에 포함됨)
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @park/server build

# --- 실행: 서버 운영 의존성만 설치하고 번들만 복사
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --prod --frozen-lockfile --filter "@park/server..."
COPY --from=build /app/apps/server/dist apps/server/dist
# 서버가 읽는 맵 (충돌 격자·시작 위치). 그림 파일은 필요 없음
COPY assets/maps assets/maps
ENV ASSETS_DIR=/app/assets
# 계정 DB (SQLite). compose 에서 볼륨으로 붙여서 컨테이너를 다시 만들어도 남게 한다
RUN mkdir -p /data && chown node:node /data
ENV DB_PATH=/data/park.db

WORKDIR /app/apps/server
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:'+(process.env.PORT||2567)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/index.js"]
