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
| `?name=철수` | 임시 닉네임 지정 (계정 기능 전까지) |
| `F1` | 충돌 칸·발밑 상자·클릭 경로 표시 |
| `/monitor` | Colyseus Monitor: 채널·접속자 확인 (개발 모드 전용) |

### 환경변수 (`apps/server/.env`)

[apps/server/.env.example](apps/server/.env.example) 참고. `PORT`, `LOG_LEVEL`, `MAX_CLIENTS`(채널 정원, 자동 분할 시험 시 2로), `ASSETS_DIR`.

클라이언트 쪽은 실행 명령이 정한다: `CLIENT_PORT`(Vite 포트), `SERVER_URL`(프록시 대상, 기본 `http://localhost:2567`).

## 임시 그림 다시 만들기

```bash
pnpm gen:map         # 타일셋 + 나무 + 공원 맵 (Tiled에서 맵을 직접 고치기 시작하면 실행하지 말 것)
pnpm gen:character   # 캐릭터 스프라이트시트
```
