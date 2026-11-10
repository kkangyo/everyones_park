# 모두의 쉼터 (everyones_park)

겨울 공원을 위에서 내려다보는 도트 2D 멀티플레이 웹 공간.

- 기획서: [모두의쉼터_기획서_v1.md](모두의쉼터_기획서_v1.md)
- 개발 순서: [개발순서.md](개발순서.md)
- 개발 단계(진행 체크리스트): [개발단계.md](개발단계.md)

## 요구 사항

- Node.js 20 LTS (`.nvmrc` 참고)
- pnpm (`corepack enable`)

## 처음 한 번

```bash
nvm install && nvm use          # .nvmrc → Node 20
corepack enable
pnpm install
cp apps/server/.env.example apps/server/.env
```

WSL에서는 리포를 **WSL 파일시스템(예: `~/one_park`)에 clone** 한다. `/mnt/c/...` 아래에 두면 파일 변경 감지(자동 새로고침·서버 재시작)가 느리거나 동작하지 않는다.

## 개발 환경별 실행

어느 환경이든 **PC 브라우저 주소는 `http://localhost:15173`** 으로 같다. 실행 명령만 다르다.

| 하고 싶은 것 | 폰 (SSH 접속) | WSL |
| --- | --- | --- |
| 개발 (파일 저장 시 자동 반영) | `pnpm dev` | `pnpm dev:wsl` |
| 운영과 같은 조건으로 시험 (빌드 결과물 + production 서버) | `pnpm preview` | `pnpm preview:wsl` |
| 서버를 Docker 컨테이너로 시험 | (불가: 폰 커널) | `pnpm docker:up` 후 `pnpm client:wsl` |

### 폰

PC에서 SSH 터널을 열고 접속한다. (PC의 5173은 Windows 예약 포트라 막힐 수 있어서 15173을 쓴다)

```bat
ssh -L 15173:localhost:5173 dane@<집 주소> -p <ssh 포트>
```

폰에서 `pnpm dev` → PC 브라우저 `http://localhost:15173`

### WSL

WSL2는 WSL 안의 포트를 Windows `localhost`로 자동 연결한다. Vite가 바로 15173으로 뜨므로 터널이 필요 없다.

`pnpm dev:wsl` → Windows 브라우저 `http://localhost:15173`

폰 SSH 터널(Windows 15173)을 열어 둔 채로 WSL에서 `dev:wsl`을 실행하면 포트가 겹친다. 둘 중 하나만 쓴다.

### 각 명령이 하는 일

| 명령 | 내용 |
| --- | --- |
| `dev` / `dev:wsl` | 게임 서버(tsx watch, :2567) + Vite 개발 서버(:5173 / :15173). 브라우저는 Vite에만 접속하고, `/health`·`/api`·`/colyseus`(게임 접속)·`/monitor`는 Vite가 서버로 넘긴다 |
| `preview` / `preview:wsl` | 전체 빌드 → `NODE_ENV=production`으로 번들 서버 실행 + `vite preview`(같은 프록시). 운영 배포 전에 번들에서만 생기는 문제를 확인 |
| `docker:up` / `docker:logs` / `docker:down` | [docker/compose.yml](docker/compose.yml)로 서버 이미지를 빌드하고 :2567에 띄움. 클라이언트는 `pnpm client:wsl`로 호스트에서 실행 |

Vite는 포트가 이미 쓰이고 있으면 다른 포트로 바꾸지 않고 에러를 낸다(`strictPort`). 터널이나 브라우저 주소가 어긋나지 않게 하기 위해서다.

### 개발 도구

| 주소 / 키 | 내용 |
| --- | --- |
| `?debug=1` | 디버그 오버레이 (FPS, 좌표, 타일, 채널) |
| `F1` | 충돌 칸·발밑 상자·클릭 경로 표시 |
| `/monitor` | Colyseus Monitor: 채널·접속자 확인 (개발 모드 전용) |

### 환경변수 (`apps/server/.env`)

[apps/server/.env.example](apps/server/.env.example) 참고. `PORT`, `LOG_LEVEL`, `MAX_CLIENTS`(채널 정원, 자동 분할 시험 시 2로), `ASSETS_DIR`, `DB_PATH`(SQLite 파일, 기본 `apps/server/data.db`), `AUTH_SECRET`(입장 토큰 서명 키, **운영에서 필수**), `TOKEN_TTL_SEC`.

클라이언트 쪽은 실행 명령이 정한다: `CLIENT_PORT`(Vite 포트), `SERVER_URL`(프록시 대상, 기본 `http://localhost:2567`).

## 계정 API

입장 화면이 쓰는 API. 개발 중 curl 로 시험할 수 있다 (서버 직접: `localhost:2567`).

```bash
# 로그인 (처음 쓰는 닉네임이면 이 PIN 으로 생성). gender·outfit 은 생략 가능
curl -s localhost:2567/api/login -H 'content-type: application/json' \
  -d '{"nickname":"따끈한 호떡","pin":"1234","gender":"female","outfit":"coat-red"}'
curl -s localhost:2567/api/nickname/random                 # 랜덤 닉네임
curl -s "localhost:2567/api/nickname/check?name=철수"      # 이미 있는 닉네임인지
```

- 실패하면 `{"error":"코드"}` (코드 목록: `packages/shared/src/protocol.ts` `ApiErrorCode`, 화면 문구: `apps/client/src/i18n/ko.json` `error.*`)
- 10분 안에 5번 틀리면 IP·닉네임 기준 10분 잠금. 잠금은 메모리에만 있어서 **서버를 재시작하면 풀린다** (개발 중 잠겼을 때)
- DB 확인: `sqlite3 apps/server/data.db ".schema"` / `"select id, nickname, gender, outfit from users"`

## 폰 서버 배포

폰은 Docker를 쓸 수 없어서 pm2가 게임 서버(Node)와 Caddy(정적 파일 + 프록시)를 직접 띄운다. 설정: [deploy/ecosystem.config.cjs](deploy/ecosystem.config.cjs), [deploy/Caddyfile](deploy/Caddyfile)

```bash
pnpm deploy:phone            # 설치 → 빌드 → pm2 시작/무중단 재시작 → 헬스체크
pnpm exec pm2 ls             # 상태
pnpm exec pm2 logs           # 로그
pnpm deploy:stop             # 내리기
```

- 기본 주소는 HTTP `:3100` (3000은 폰에서 다른 프로그램이 사용 중. 공유기에서 3100 포워딩 필요). 도메인과 80/443 포워딩이 준비되면 `SITE_ADDRESS=park.example.com pnpm deploy:phone` 으로 HTTPS 인증서를 자동으로 받는다.
- Caddy 설치 (sudo 없이, arm64 정적 바이너리):
  ```bash
  mkdir -p ~/bin && curl -fL "https://caddyserver.com/api/download?os=linux&arch=arm64" -o ~/bin/caddy && chmod +x ~/bin/caddy
  ~/bin/caddy version
  ```
  `~/bin`이 PATH에 없으면 `CADDY_BIN=~/bin/caddy pnpm deploy:phone`.
- 개발 서버(`pnpm dev`)와 운영 서버는 둘 다 2567 포트를 쓴다. 동시에 띄우지 않는다.
- 운영 서버는 `AUTH_SECRET` 이 없으면 시작하지 않는다. `deploy:phone` 이 처음 한 번 만들어 `apps/server/.env` 에 저장한다 (바꾸면 발급된 토큰이 모두 무효 → 다시 로그인하면 됨).
- 계정 DB 는 `apps/server/data.db` (+ `-wal`, `-shm`). 백업할 때는 이 파일들을 같이 복사한다.
- better-sqlite3·argon2 는 네이티브 모듈이다. arm64 미리 빌드 바이너리를 못 받으면 직접 빌드하므로 `sudo apt install build-essential python3` 가 필요할 수 있다.

## 임시 그림 다시 만들기

```bash
pnpm gen:map         # 타일셋 + 나무 + 공원 맵 (Tiled에서 맵을 직접 고치기 시작하면 실행하지 말 것)
pnpm gen:character   # 캐릭터 몸(body-*.png) + 옷(outfit-*.png) 스프라이트시트
```
