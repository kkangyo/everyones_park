# 남자 사진 레퍼런스 캐릭터 초안

Built-in image_gen으로 생성한 원본은 generated-source.png, 사용 프롬프트는 prompt.txt입니다.
기존 런타임 파일을 교체하거나 의상 ID를 등록하지 않았습니다.

- ../preview-male-reference.png: 모든 동작을 담은 합성 미리보기
- ../body-male-reference.png: 머리/목/신발 위주 몸체 레이어
- ../outfit-black-blazer-reference.png: 검은 재킷과 팔/바지 레이어
- 각 PNG: 128×896, RGBA, 32×32 셀 4열×28행, 112개 비어 있지 않은 프레임

원본 전체 시트를 단순 축소하지 않고, 생성된 각 자세를 같은 1/3 스케일로 샘플링해 규정 행에 조립했습니다. 출력은 제한된 색상과 이진 알파를 사용합니다. 원본의 검은 재킷에 맞춰 사진에 없는 하의/신발은 검정으로 추정했습니다.

## 아직 충족을 확정할 수 없는 항목

이 결과는 개정 2.2의 완전 승인 자산이 아닙니다. 생성 원본은 26행으로, 누락된 carry-up은 normal-up으로 재사용했고 carry-down-right는 carry-down-left를 좌우 반전했습니다. 해당 뒤쪽 팔 지지는 별도 수정이 필요합니다. 일반 걷기의 정확한 해부학적 좌우 발 교대, rest 프레임의 눈 깜빡임/호흡, 누운 자세에서 얼굴이 위를 향하는지, 모든 방향의 일관된 카메라와 정확한 음식 부착점 정렬은 확인되지 않았습니다.

레이어는 위치 마스크로 나눴으므로 특히 앉기/눕기에서 목·옷·팔 경계를 수작업 검수해야 합니다. 원래 생성된 장식성 작은 픽셀이 남을 수 있으며, 픽셀 아트 품질은 기존 게임 기본 시트와 다릅니다. 자동 검사는 파일 형식·크기·112셀 비어 있지 않음까지만 확인합니다. 합성본은 두 레이어를 정확하게 재합성할 수 있습니다.

조립 재현: pngjs를 설치한 환경에서 `node assemble.cjs`.

## 게임 적용 (2026-11-11)

`body-male-reference.png`·`outfit-black-blazer-reference.png`(이 폴더로 옮김)를 고쳐서 게임 그림으로 등록했다.

- `../body-male-handsome.png`, `../outfit-black-blazer-handsome.png` — 옷 id `black-blazer-handsome`(검은 블레이저). 얼굴 `male-handsome`(웨이브 머리)과 같은 사진 비율 묶음이라 그 얼굴에서만 고를 수 있다 (`packages/shared/src/character.ts` FACES·FRAME_OF)
- 고친 것: 전체 2px 아래로(신발 바닥 y 30), 턱까지의 얼굴을 몸 레이어로 옮김, 바닥 그림자 추가
- 남은 것 (`pnpm check:character` FAIL): 프레임 사이 일렁임, 11행 carry up = 3행 복사, 남·북 눕기 14×14

## 손·음식 고정 규격 적용 (2026-11-13)

코드는 `packages/shared/src/hand-rig.ts`의 방향별 양손 접점을 사용하며 음식의 (6,9)를 그 점에 붙인다. 먹는 동안 음식만 입으로 움직이지 않는다. 기본 임시 의상 8벌은 새 접점으로 재생성했다.

이후 런타임 `../outfit-black-blazer-handsome.png`도 새 손 좌표에 맞춰 보정했다. 들고 걷기·들고 앉기 48프레임의 팔/손을 수정했으며, 보이는 손 접점 64곳을 픽셀 검사한다. 몸체 PNG와 normal/sit/lie 자세는 보정 전과 동일하다. `../preview-male-handsome.png`는 현재 몸·의상 합성본이다.

원본 백업, 이미지 생성 보정본, 사용 프롬프트, 음식 합성 및 애니메이션 미리보기는 [hand-rig-v1/README.md](hand-rig-v1/README.md)에 정리했다. `pnpm check:hands`에 handsome 팔·손 검사를 포함했다. 손 부착점은 맞췄지만 기존 얼굴 일렁임과 눕기 비율은 여전히 전체 규격 검사의 실패 항목이다. 전체 시트가 개정 2.3의 모든 기준을 통과한 것은 아니다.
