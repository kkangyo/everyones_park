# Handsome 팔·손 보정 — hand-rig v1

2026-11-13. 현재 게임에서 쓰는 `../../outfit-black-blazer-handsome.png`에 적용했다.

- `../../body-male-handsome.png`: 보정 전과 파일 바이트까지 동일. 얼굴·머리·목·신발·그림자 보존.
- `../../outfit-black-blazer-handsome.png`: carry 8–15행과 sitCarry 20–23행의 상체 영역만 보정. 각 4열, 총 48프레임. 기존 옷 등록 ID 그대로 사용.
- `../../preview-male-handsome.png`: 현재 몸과 옷의 128×896 투명 합성본.
- `carry-after-x8.png`: 보정 후 12자세, 0열 확대. 위부터 carry 8방향, sitCarry 4방향. 각 줄 down/left/right/up 및 대각선 순서는 review.html 설명 참조.
- `carry-food-x8.png`: 같은 자세에 왼손 닭꼬치·오른손 식혜 합성.
- `review.html`: 별도 서버/라이브러리 없이 브라우저에서 여는 애니메이션 검토 파일. 양손/한손/빈손, 3개 섭취 단계, 접점 표시, 보정 전후 전환 가능. 각 자세의 4열을 런타임과 같은 8fps/1.5fps로 재생한다. 고개를 돌리는 게임 연출은 이 미리보기에서 재현하지 않는다.

## 제작과 재현

1. `pnpm exec tsx scripts/prepare-handsome-hand-edit.ts`: 최초 백업 `before-body.png`, `before-outfit.png` 및 carry 0열 묶음/접점 가이드 준비. 이미 있는 백업은 덮어쓰지 않는다.
2. 내장 `image_gen`으로 `carry-before-x8.png`를 `carry-grip-target-x8.png`와 함께 편집했다. 정확한 프롬프트는 `edit-prompt.txt`, 생성 도구 원본은 `carry-edited.png`. 머리와 셀 배치가 완전히 보존되지는 않으므로 생성 이미지를 런타임 PNG로 직접 사용하지 않는다.
3. `pnpm fix:handsome-hands`: 생성 보정본의 검은 재킷 부위를 셀별로 샘플링하고 기존 재킷 색에 맞춘다. 이후 손목/소매와 피부 접점을 공통 hand-rig 좌표에 맞게 조립한다. 생성 이미지의 변경된 머리·발은 가져오지 않는다. 몸체 픽셀이 있는 곳에는 의상을 칠하지 않는다. 결과 PNG와 검토 자료를 갱신하고 검사한다.

정면·옆·앞대각선의 양손은 각각 공통 접점에 맞춘다. 뒤쪽 방향에는 손 피부를 그리지 않고 어깨/팔꿈치로 팔 자세를 표현한다. 모든 섭취 단계에 같은 음식 (6,9) 부착점을 쓴다. 손 1·3열 y -1, 앉기 y +3은 누적 적용한다. 0·2열 팔은 동일하고 1·3열은 같은 팔을 1px 올린 것이다.

## 검증 및 남은 문제

`pnpm check:hands`에 포함한 검사:

- 64개 보이는 손 접점의 실제 피부 픽셀과 레이어 소유권
- 기존 손 위치의 피부 잔여물 없음, 뒤쪽 방향 손 피부 없음
- 몸체 파일 및 범위 밖 의상 픽셀 불변, 합성 PNG의 정확한 레이어 일치
- 서버의 양손 슬롯 유지·빈 손 재배정 및 음식 단계별 잡는 부분

현재 보정은 3,464개 의상 픽셀을 바꿨다. 전체 규격 검사 `pnpm check:character assets/sprites/body-male-handsome.png assets/sprites/outfit-black-blazer-handsome.png --hands` 결과는 OK 4 / WARN 5 / FAIL 29다. 보정 전 FAIL 30 중 carry-up 복사 문제는 해소됐다. 기존 머리·얼굴 프레임 일렁임, 일부 머리 높이, 남·북 눕기 길이/방향은 이번 팔 보정에서 수정하지 않았다. 전체 시트를 최종 승인 자산으로 간주하지 않는다.
