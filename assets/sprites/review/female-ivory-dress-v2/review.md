# 아이보리 민소매 원피스 — 디테일 보강 v2

`assets/sprites/outfit-ivory-sleeveless.png`를 이 후보의 `outfit-reference.png`로 교체했다. 요청한 기존 파일명은 유지했다. 32×32 셀, 4열×28행, 128×896 RGBA 규격이다. 합성본과 확대/비교 자료는 이 검토 폴더에만 보관한다.

## 디자인 변경

이전 상의+차콜 바지에서 **아이보리 A라인 민소매 원피스**로 바꿨다.

- 좁은 어깨끈과 목선 테두리, 몸판 옆 다트 음영
- 잘록한 허리와 얇은 절개선
- 아래로 퍼지는 치마, 세로 주름/하이라이트가 구분되는 3개 패널
- 짙은 안쪽 그림자와 밝은 접힌 면을 함께 둔 이중 밑단
- 앉으면 무릎 위로 접히는 치마, 누우면 몸의 길이 방향으로 이어지는 원피스

검은 블레이저 시트는 명암 대비와 픽셀 클러스터 밀도의 참고로만 사용했다. 의상은 6개 직물 톤을 사용하며, 몸과 합친 팔레트는 기존과 같은 22색이다. 몸·얼굴·머리·신발은 바꾸지 않았다. 원래 팔 피부 픽셀 1,512개를 그대로 유지하고 손 접점 64곳을 고정했다. 기존 다리/바지로 보이던 1,280개 기본 다리 픽셀은 원피스로 가렸다. 몸 레이어 신발 위에는 의상을 칠하지 않았다.

## 미리보기

- [전후 비교](before-after.png): 위가 이전, 아래가 새 원피스. 정면/왼쪽/앞대각선/앉은 정면.
- [28행 검토 화면](contact-sheet.png), [합성 시트](preview.png)
- [애니메이션/양손 검토](review.html): 4열 재생과 정지, 몸/의상 레이어, 빈손/한손/양손, 섭취 3단계 확인 가능.
- [음식 단계 0](food-stage-0.png), [단계 1](food-stage-1.png), [단계 2](food-stage-2.png): 큰 4열은 빈손/오른손/왼손/양손, 큰 4행은 애니메이션 열 0/1/2/3. 각 묶음에 carry 8방향 + sitCarry 4방향이 있다.

## 제작과 보정

내장 `image_gen` 이미지 편집 도구를 사용했다. [정확한 프롬프트](sources/edit-prompt.txt), [생성 원본](sources/generated-dress.png), [이전 의상 백업](sources/before-outfit.png)을 보관했다. 입력은 기존 여성 합성 자세 묶음과 블레이저 의상 디테일 참고다.

생성 결과의 머리/몸 변경과 가장자리 색 노이즈는 최종 시트에 사용하지 않았다. [assemble.ts](assemble.ts)에서 옷감 색/명암을 native 픽셀로 보정하고 목선·허리·치마 윤곽·주름·밑단을 명시적으로 조립했다. body-reference.png는 기존 몸 파일과 바이트까지 같다. 팔과 손은 기존 의상의 피부 픽셀을 그대로 합성했다. 눕기는 기준 쉬는 팔을 재사용해 들숨 때 팔이 사라지지 않도록 했다.

## 검사 결과

| 검사 | 결과 |
| --- | --- |
| 후보 몸 단독 | 종료 0, OK 29 / WARN 1 / FAIL 0 — [로그](body-check.log) |
| 몸+의상 `--hands` | 종료 0, OK 32 / WARN 2 / FAIL 0 — [로그](pair-check.log) |
| 추가 픽셀 검사 | 종료 0, 112칸/레이어, 22색, 손 접점 64개, 팔 피부 보존·기본 다리 가림·신발 소유권 확인 — [결과](pixel-check.json) |
| 브라우저 | Chromium에서 28행 재생, 음식 조합 48개/576개 화면, JS 오류 0 — [결과](browser-check.json) |
| 스크립트 | 조립·검증·비교 스크립트의 strict TypeScript 검사 통과 |
| 최종 배치 | 검사한 후보와 루트 의상 파일의 SHA-256 일치 — [기록](deployment-check.json) |

남은 WARN 2는 기존 몸의 누운 방향 그림자 180px와 `--hands`의 시각 확인 안내다. 추가 픽셀 검사로 반투명 픽셀은 모두 검정 alpha 48의 그림자임을 확인했다. 실제 피부색 접점과 팔 위치를 별도 검사하고, 4열 화면/의상 레이어/음식 조합을 비교했다. 검사 기준과 손 좌표는 바꾸지 않았다.

0·2열 중립, 1·3열 같은 들숨은 의도된 반복이다. 원피스가 다리를 덮는 옆모습 걷기는 합성 시 두 개의 고유 실루엣으로 보일 수 있으며, 몸의 원래 좌우 발 프레임은 유지한다. 게임 내 고개 돌리기·이름표·먹기 효과는 이번 자산 검토 범위에 포함하지 않았다. 외형 ID 등록이나 렌더링 코드는 변경하지 않았다.

재현은 저장소 루트에서 다음 순서로 실행한다. 최종 자산 복사는 검사 통과 후 수행한다.

```bash
pnpm exec tsx assets/sprites/review/female-ivory-dress-v2/assemble.ts
pnpm exec tsx assets/sprites/review/female-ivory-dress-v2/verify.ts
pnpm check:character assets/sprites/review/female-ivory-dress-v2/body-reference.png assets/sprites/review/female-ivory-dress-v2/outfit-reference.png --hands
pnpm preview:character assets/sprites/review/female-ivory-dress-v2/body-reference.png assets/sprites/review/female-ivory-dress-v2/outfit-reference.png --out assets/sprites/review/female-ivory-dress-v2
pnpm exec tsx assets/sprites/review/female-ivory-dress-v2/compare.ts
```
