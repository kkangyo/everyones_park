# 여성 사진 캐릭터 — 제작·검사 기록

이 문서는 초기 민소매 상의+바지 버전의 기록이다. 현재 `assets/sprites/outfit-ivory-sleeveless.png`는 [원피스 디테일 보강 v2](../female-ivory-dress-v2/review.md)로 갱신했다. 아래 후보 파일과 검사 결과는 이전 버전의 제작 이력으로 보관한다.

판정: **후보 제작·정적 검사·브라우저 검토 완료**. 런타임 미등록이며 기존 여자 몸/의상 파일은 교체하지 않았다.

## 최종 배치

완성된 몸·의상 통합 PNG만 `assets/sprites/`에 원본과 동일한 바이트로 복사했다. 각 파일은 4열×28행 전체 동작을 포함한다.

- `../../body-female-longhair.png`: 장발 여성 몸 레이어.
- `../../outfit-ivory-sleeveless.png`: 아이보리 민소매 의상 레이어.

몸+의상 합성본은 이 후보 폴더의 `preview.png`에만 보관한다. 이전에 함께 복사했던 `assets/sprites/character-female-ivory-sleeveless.png`는 제거했다.

파일 배치만 수행했으며 게임 외형 목록 등록은 별도다.

## 결과물

- [body-reference.png](body-reference.png): 머리·긴 머리카락·얼굴·귀·목·기본 다리·검은 플랫슈즈·그림자. 128×896, RGBA8, 112칸.
- [outfit-reference.png](outfit-reference.png): 아이보리 민소매 상의·금색 목걸이·노출 팔/손·차콜 바지. 128×896, RGBA8, 112칸.
- [preview.png](preview.png): 두 레이어의 투명 합성 시트. 게임 레이어 대체 파일이 아닌 검토용.
- [review.html](review.html): 28행 애니메이션, 몸/의상 레이어, 4열 정지 화면, 양손/한손/빈손, 섭취 3단계, 손 접점 토글.
- [contact-sheet.png](contact-sheet.png): 28행 기본 자세 검토 화면. 각 카드는 한 행의 0열이다.
- [food-stage-0.png](food-stage-0.png), [food-stage-1.png](food-stage-1.png), [food-stage-2.png](food-stage-2.png): 3단계 음식 합성. 각 이미지의 큰 4열은 빈손/오른손만/왼손만/양손, 큰 4행은 애니메이션 열 0/1/2/3. 각 묶음 안에는 carry 8방향 + sitCarry 4방향의 12개 자세가 있다.

## 사진 해석과 제작

외모 참고는 이번 요청에 첨부된 여성 인물 사진이다. 긴 검은 생머리와 옆가르마, 밝고 따뜻한 피부, 어두운 눈, 작은 금색 귀걸이를 native 32×32 픽셀로 표현했다. 의상은 사진의 밝은 민소매와 가는 목걸이를 참고했다. 사진에서 보이지 않는 차콜 바지·검은 플랫슈즈·뒷모습·전신 비율은 일관되게 추정했으며 실제 사진으로 검증한 디테일이 아니다.

내장 `image_gen` 도구를 사용했다. 정확한 프롬프트와 결과 원본:

- [몸 프롬프트](sources/body-prompt.txt), [몸 생성 원본](sources/generated-body.png). 사진과 native 치수 가이드 묶음을 함께 입력했다.
- [의상 프롬프트](sources/outfit-prompt.txt), [의상 생성 원본](sources/generated-outfit.png). 확정 몸의 자세 묶음과 치수 가이드를 참조했다.
- [prepare.ts](prepare.ts): 프로젝트 가이드에서 중간 참조 묶음 생성.
- [assemble.ts](assemble.ts): 원본 8방향 머리와 상의 색상/명암을 native 픽셀로 보정하고 112칸을 조립한다. 단순히 생성 이미지 전체를 128×896으로 강제 축소한 결과가 아니다.

원본에는 과도한 이마 높이, 몸통 투명 영역의 색 노이즈, 배치/팔 크기 오차가 있었다. 머리마다 bbox를 따로 맞추지 않고 공통 셀 좌표/머리 행 대응표를 사용했다. 두개·얼굴 기준 영역은 x 8–23 / y 6–18이며 긴 옆머리/뒷머리는 몸 소유의 추가 실루엣으로 아래쪽에 이어진다. 발과 접점은 native 위치를 고정했다. 노이즈·팔레트 밖 색은 최종 PNG에 넣지 않았다. 눕기는 정면 얼굴을 하늘을 보는 머리 방향에 맞게 투영하고 25px 길이로 조립했다. 대각선 얼굴은 각 방향의 생성 뷰를 사용했다.

몸에서 carry=normal, sitCarry=sit는 의도된 레이어 재사용이다. 의상에서는 별도 팔 자세를 만들었으며 손을 한데 모으지 않았다. 누운 동작도 양쪽 파일에 포함했다. 0·2열은 같은 중립 자세이고, 쉬기 2열만 보이는 눈을 닫는다. 반복 열마다 얼굴을 새로 생성하지 않았다. 앉은 무릎은 옷자락 앞, 손바닥은 무릎 앞에 놓았다.

## 실행 및 자동 검사

저장소 루트에서 실행:

```bash
pnpm gen:guide
pnpm check:hands
pnpm exec tsx assets/sprites/review/female-photo-01/prepare.ts
pnpm exec tsx assets/sprites/review/female-photo-01/assemble.ts
pnpm check:character assets/sprites/review/female-photo-01/body-reference.png
pnpm check:character assets/sprites/review/female-photo-01/body-reference.png assets/sprites/review/female-photo-01/outfit-reference.png --hands
pnpm exec tsx assets/sprites/review/female-photo-01/verify.ts
pnpm preview:character assets/sprites/review/female-photo-01/body-reference.png assets/sprites/review/female-photo-01/outfit-reference.png --out assets/sprites/review/female-photo-01
```

원본 두 PNG는 이미 보관되어 있으므로 `assemble.ts`부터 재현할 수 있다. `sources/approved-body-bases-x8.png`는 의상 생성 당시의 참조 자료이며, 마지막 native 검수에서 중립 옆모습 신발의 접지 위치를 1px 보정했다. 최종 판정 대상은 이 폴더의 body/outfit-reference.png다.

| 검사 | 종료 코드 | 결과 | 증거 |
| --- | --- | --- | --- |
| 기존 손 규격 회귀검사 | 0 | 좌표·등록 자산·서버 슬롯 유지 통과 | [rig-check.log](rig-check.log) |
| 가이드 검사 | 0 | OK 29 / WARN 1 / FAIL 0 | [guide-check.log](guide-check.log) |
| 후보 몸 단독 | 0 | OK 29 / WARN 1 / FAIL 0 | [body-check.log](body-check.log) |
| 후보 몸+의상 `--hands` | 0 | OK 32 / WARN 2 / FAIL 0 | [pair-check.log](pair-check.log) |
| 후보 추가 픽셀 검사 | 0 | 64 손 접점, 22색, 얼굴/의상 중복 0, 112칸/레이어 | [pixel-check.json](pixel-check.json), [verify.ts](verify.ts) |
| 브라우저 실행 | 0 | 28행 모두 재생, 48 음식 조합 / 576 carry 화면, JS 오류 0 | [browser-check.json](browser-check.json) |

추가 픽셀 검사는 형식·실제 투명 픽셀·22색 팔레트·실제 손 중심 피부색·carry 몸 재사용·중립 0/2열 일치·얼굴 영역 의상 없음도 확인한다. 후보 조립/검증 TypeScript의 엄격 타입 검사도 통과했다. 검사 기준이나 런타임 접점 좌표를 후보에 맞춰 바꾸지 않았다.

### WARN 처리

1. 몸의 반투명 180px 경고: 누운 방향으로 투영된 **바닥 그림자 한 줄**이 검사기의 일반 서기 그림자 허용 y 29–31 밖에 나타난다. 추가 픽셀 검사에서 모든 반투명 픽셀이 RGB(0,0,0), alpha 48임을 확인했다. 머리·옷 가장자리 번짐이나 칠해진 체크무늬가 아니다. 의도된 누운 그림자로 수용.
2. `--hands`의 알파 점유 WARN: 검사기가 손 피부를 인식하지 않는다는 상시 안내다. 추가 검사로 보이는 64개 손의 정확한 접점 픽셀이 의상 레이어의 피부색임을 확인했고, 브라우저 음식 합성 화면과 접점 표시를 비교했다. 별도 검토 완료로 수용.

## 브라우저·시각 검수

Chromium에서 `review.html`을 열었다. [browser-review.cjs](browser-review.cjs)는 Playwright가 있는 검토 환경용이며 게임 의존성에 추가하지 않았다. 실제 실행 환경에서는 `/tmp`에 설치한 Playwright/브라우저 공유 라이브러리를 사용했다. 일반 브라우저에서는 review.html만 열면 된다.

검토 환경의 명령:

```bash
NODE_PATH=/tmp/onepark-browser/node_modules LD_LIBRARY_PATH=/tmp/onepark-browser/sysroot/usr/lib/aarch64-linux-gnu node assets/sprites/review/female-photo-01/browser-review.cjs
```

28행의 실시간 재생에서 각 행의 프레임 변화가 확인됐다. 열린/닫힌 눈과 들숨을 구분해 뒷모습 쉬기는 2개, 나머지는 3개의 고유 화면을 가진다. 0열과 2열 중립 / 1열과 3열 같은 들숨의 재사용은 정상이다.

| 항목 | 확인 |
| --- | --- |
| normal/carry 8방향 | 각 방향 뷰, 다리 교대, 팔 자세 구분, 얼굴 유지와 상체 1px 이동, 0→1→2→3→0 반복 확인 |
| sit/sitCarry 4방향 | 머리/어깨/손 +3, 무릎을 접은 자세, 걷는 다리 없음, 호흡·깜빡임 확인 |
| lie 4방향 | 머리 남/서/동/북, 하늘을 보는 얼굴, 25px 몸 길이, 가슴만 변화하는 들숨 확인 |
| 레이어 | [몸 검토](body-review.png) / [옷 검토](outfit-review.png) / 합성 비교. 머리·귀걸이·얼굴·신발은 몸, 상의·팔·손·바지는 옷 |
| 4열 | [0열](column-0.png) / [1열](column-1.png) / [2열](column-2.png) / [3열](column-3.png) 정지 화면 확인 |
| 음식·접점 | 단계 0/1/2의 빈손/오른손/왼손/양손, 각 4열의 576개 carry 화면과 [접점 표시](grip-review.png) 비교. 남은 음식의 손 접점이 바뀌지 않음 |
| 뒤쪽 | 음식이 머리/몸 뒤에 가려지고 carry의 손바닥은 등에 그려지지 않음 |

음식 12×12 프레임이 캐릭터의 얼굴/상의 일부를 가릴 수 있다. 겹침을 피하려고 음식이나 손을 임의 위치로 옮기지는 않았다. 실제 게임에서의 고개 교체·먹기 효과·김·이름표/말풍선은 이 후보 미리보기 범위 밖이며 **미확인**이다. 추후 전용 몸/의상 ID로 등록할 때 BODY_HEAD와 장발 머리 교체 경계를 포함해 런타임을 점검해야 한다.
