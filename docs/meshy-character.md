# Meshy 캐릭터 만들기 가이드

공원 3D 인형을 Meshy AI로 만들 때 지킬 점과, Meshy에 같이 보낼 프롬프트를 모았다.
첫 인형(민트 패딩, `assets/models/meshy-mint.glb`)을 만들며 겪은 문제를 바탕으로 했다.

## 1. 지킬 점

### 원본 그림
- **팔은 옷 소매를 입은 채 몸통 옆에 붙어 있어야 한다.** 소매 겉면이 몸통 옷 옆면에 살짝 닿을 정도.
  - 팔이 몸통에 묻혀 있으면(원본 그림 그대로) 3D에서 팔이 코트 안에 파묻혀, 걸을 때 선처럼 보인다.
  - 팔을 몸에서 너무 띄우면(A자 자세) 인형 느낌이 사라진다.
- **소매는 그 옷과 같은 두께·재질.** 옷을 바꾸면 소매도 그 옷에 맞게 다시 그린다. 옷마다 인형을 따로 만든다.
- **손은 손가락 없는 동그란 벙어리 장갑.** 손가락은 3D에서 지저분해진다.
- **정면, 좌우 대칭, 두 발을 나란히 모으고 곧게 선 자세.**
- **옷자락은 짧고 빳빳하게, 다리가 다 보이게.** 긴 치마·망토는 걸을 때 다리와 같이 끌려 다닌다.
- 배경은 밝은 단색, 그림자 없이.

### Meshy 설정
| 단계 | 설정 | 크레딧 |
|---|---|---|
| 그림 고치기 | `meshy_image_to_image`, nano-banana-2, 3:4 | 6 |
| 3D 만들기 | `meshy_image_to_3d`, smart-topology `meshy-t2.5`, `target_polycount` 10000, 텍스처 `meshy-n1`, `pose_mode` t-pose, 형식 glb | 15 |
| 리깅 | `meshy_rig`, `height_meters` 1 (걷기·뛰기 같이 나옴) | 5 |
| 동작 | `meshy_animate`, `action_ids` [0, 32, 290] 한 파일로 | 9 |

- 동작 번호: 0 Idle, 32 Chair Sit Idle Female(앉기), 290 Wave One Hand(안녕).
- Idle(0)은 고개·몸을 돌리며 둘러보는 동작이라 서 있기로 쓰지 않는다. 서 있기는 안녕 동작의 첫 장면을 쓴다(아래 후처리). 다음부터는 0을 빼고 [32, 290]만 받아도 된다.
- 모든 비용은 쓰기 전에 확인받는다. 크레딧 표: https://docs.meshy.ai/en/api/pricing

### 후처리 ([scripts/meshy-doll.mjs](../scripts/meshy-doll.mjs))
Meshy 결과물을 그대로 쓰면 생기는 문제와 스크립트가 고치는 것:
- **머리카락이 팔에 끌려감**: 자동 리깅이 옆머리 끝을 팔뚝 뼈에 붙인다. 머리카락 색 꼭짓점을 머리 뼈(Head)에만 붙인다.
- **서 있기가 걷는 도중 모습**: Idle 대신 안녕 동작 첫 장면(정면, 두 발 나란히, 팔 내림)을 서 있기로 만든다.
- **걸을 때 옷이 좌우로 과하게 흔들림**: 걷기·뛰기의 엉덩이·허리 회전을 절반 정도로 줄인다.
- **파일이 큼(동작마다 3.3MB)**: 동작 5개를 한 파일로 합치고 텍스처 512 JPEG · 접선 삭제 · 양자화 · meshopt 압축 → 약 460KB.

게임 코드([main.js](../apps/client/src/sd/main.js)의 `poseDoll`)에서 하는 것:
- 걷기 동작의 앞뒤 이동(루트 모션)을 지워 제자리걸음으로.
- 안녕할 때 든 손이 옆머리에 겹치지 않게 위팔·아래팔을 바깥으로 펴고 고개를 반대로 살짝 기울인다 (`DOLL_WAVE`).
- 앉기 동작은 엉덩이가 뒤로 빠지므로 인형을 내리고 앞으로 민다 (`DOLL_SIT`).

## 2. Meshy에 보낼 프롬프트

캐릭터 그림을 참고 이미지로 넣고 `meshy_image_to_image`(nano-banana-2)에 보낸다.
`<...>` 부분만 그 캐릭터에 맞게 바꾼다.

```text
Redraw this exact same chibi doll character (<face, eye color, hair color and style, outfit with colors and details, shoes>) as a clean front-view character sheet pose for 3D modeling.

Pose: standing straight and symmetrical, facing the camera, both feet together side by side, head facing forward.

Arms: each arm wears a full sleeve of the outfit, with the same thickness, material and cuffs as the outfit itself. Arms hang down naturally, about 10 degrees from vertical, and the inner side of each sleeve lightly touches the side of the body garment, with no big gap and not merged into it. If the outfit changes, the sleeves change to match it.

Hands: simple round mittens with no fingers, resting just beside the garment hem.

Garment: the hem is short and stiff so both legs are fully visible; no long skirt, cape or loose cloth hanging below the hips.

Full body, plain light background, soft even lighting, no cast shadow, same cute 3D toy style as the reference.
```

결과 그림에서 확인할 것: 소매가 몸통에 닿되 붙어 버리지 않았는지, 손가락이 없는지, 두 발이 나란한지, 다리가 다 보이는지.
마음에 들지 않으면 같은 작업을 참고로(`input_task_id`) 고칠 부분만 짧게 다시 요청한다. 예: `Keep everything unchanged. Only bring the arms closer so each sleeve lightly touches the side of the coat.`

## 3. 새 인형 순서

1. 그림 고치기 → 결과 확인 (6)
2. 3D 만들기 → 리깅 → 동작 (15 + 5 + 9)
3. 받은 파일 3개(동작 묶음, 걷기, 뛰기)를 후처리:
   `node scripts/meshy-doll.mjs merged.glb walking.glb running.glb assets/models/<이름>.glb`
4. 미리보기로 서 있기·걷기·안녕·앉기를 렌더링해 확인한 뒤 게임에 넣는다.
