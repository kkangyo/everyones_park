# 모두의 쉼터 (everyones_park)

겨울 공원을 위에서 내려다보는 도트 2D 멀티플레이 웹 공간.

- 기획서: [모두의쉼터_기획서_v1.md](모두의쉼터_기획서_v1.md)
- 개발 순서: [개발순서.md](개발순서.md)
- 개발 단계(진행 체크리스트): [개발단계.md](개발단계.md)

## 요구 사항

- Node.js 20 LTS (`.nvmrc` 참고)
- pnpm (`corepack enable`)

## 개발 실행

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm dev          # 서버(:2567) + 클라이언트(:5173) 동시 실행
```

브라우저에서 http://localhost:5173 (같은 네트워크의 다른 PC에서는 `http://<폰 IP>:5173`)
