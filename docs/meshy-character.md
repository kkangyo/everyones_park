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
- 음식 들기·먹기: 믹서 업데이트 전에 직전의 기본 뼈 회전을 복원하고, 업데이트 후 기본 자세를 저장한다. 정적인 키프레임은 믹서가 다시 쓰지 않을 수 있어 `rotation +=`만 반복하면 팔이 계속 돌아간다.
- `arm-ik.js`에서 위팔·아래팔 두 관절로 손의 음식 접점을 가슴 앞에 유지한다. 먹는 손만 입 앞으로 올렸다가 내리며(2.4초 주기), 음료는 입 앞에 유지한다. 상대 손은 들고 있는 자세를 유지한다.
- 회귀 확인: 개발 서버를 켠 뒤 `PARK_REVIEW_URL=http://localhost:포트 node scripts/review-food-motion.cjs` (Playwright 필요). Meshy 세 종류와 기본 SD 인형의 양손을 여러 프레임 실행해 회전 누적·팔꿈치 굽힘·반대 손 유지·프레임 이동량을 검사한다.

### 참고 그림이 있는 인형 (곱슬머리 남자, `assets/models/meshy-curly.glb`)
사용자가 캐릭터 그림을 준 경우에는 **그림을 바꾸거나 해석하지 않는다.** 스타일·재질·외곽선·머리 모양에 대한 내 의견("비닐 장난감 질감", "외곽선 없이", "덩어리 머리")을 넣으면 전혀 다른 캐릭터가 나온다.
- 원본 그림(정면 + 큰 그림)을 그대로 참고 이미지로 넣고 "Draw this exact same character, identical in every detail ... Do not change or reinterpret the design." 로 시작한다.
- 바꿀 것은 사용자가 말한 것만 쓴다 (자세, 비율, 뺄 소품 등). 예: 머리가 키의 40%, 팔을 몸 가까이, 가방 빼기, 손은 오버핏 소매에 가려 안 보이게.
- 한 번에 다 안 되면 그 결과를 `input_task_id`로 넣고 "Keep everything exactly the same. Only ..." 로 한 가지씩 고친다.
- 그림과 결과: [docs/meshy-curly/](meshy-curly/) (원본 정면, Meshy에 넣은 그림, 동작 렌더링)

손을 소매로 덮은 인형은 Meshy가 3D에서 소매 끝에 손 덩어리를 붙인다. 후처리의 `sleeve` 옵션이 손 뼈 부분을 소매 색으로 칠한다.

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
   `node scripts/meshy-doll.mjs merged.glb walking.glb running.glb assets/models/<이름>.glb <brown|darkbrown|black> [hand|sleeve]` (머리색: 머리카락 꼭짓점을 고르는 기준 · 로그의 "머리카락 꼭짓점 → Head" 수가 0이면 머리색이 안 맞은 것. sleeve: 손을 소매색으로)
   - 원본 그림 고치기로는 머리·몸 비율이 잘 안 바뀐다. 비율은 게임 코드의 `DOLL_KINDS`(머리 뼈 배율 · 전체 배율 · 가로 배율)로 여자 인형에 맞춘다. 남자 인형: 머리 1.25 · 전체 0.91 · 가로 1.15
4. 미리보기로 서 있기·걷기·안녕·앉기를 렌더링해 확인한 뒤 게임에 넣는다.

## 4. Meshy 웹에서 동작을 묶어 받은 인형 (곱슬머리 `assets/models/meshy-child.glb`)

Meshy 웹에서 리깅하고 동작을 골라 한 파일로 받으면 뼈 이름이 `mixamorig:Head` 처럼 나오고 동작 이름도 제각각이다. [scripts/meshy-doll-clips.mjs](../scripts/meshy-doll-clips.mjs)로 게임용으로 바꾼다.

```
node scripts/meshy-doll-clips.mjs meshy_child_motion.glb assets/models/meshy-child.glb \
  "Idle_11=idle,Walking=walk,Hop_with_Arms_Raised=jump,Look_Back_and_Sit=sit@last,Wave_One_Hand=wave" darkbrown 0.55 yellow
```

- 게임에 필요한 동작: idle · walk · sit (필수), wave · jump (있으면 씀). 이름표에 없는 동작은 버린다 (지금은 Running · Stand_and_Drink · sleep. 인형은 run 을 쓰지 않는다).
- Meshy 웹에서 받은 파일이 30MB 를 넘는 건 4K PNG 텍스처 세 장(색 13MB · 노멀 11MB · 금속·거칠기 6MB) 때문이다. 툰 음영은 색만 쓰므로 노멀·금속은 지우고 색을 512 JPEG 로 줄여 약 390KB 가 된다.
- 끝에 `split` 을 붙이면 겨드랑이 아래에서 팔 옷과 몸통 옷을 잘라 따로 움직이게 한다. 팔이 몸에 거의 붙은 첫 모델에서 맞춘 값이라, 팔이 더 벌어진 지금 모델에서는 소매가 조각나서 쓰지 않는다.
- 끝에 붙이는 옵션 (여러 개 가능):
  - `longhair`: 등·팔 옆으로 길게 늘어진 머리카락을 몸통 뼈에 붙인다. 자동 리깅이 긴 머리를 팔·다리 뼈에도 붙여서, 팔을 들면 옆머리가 끌려 나오고 걸으면 뒷머리가 다리를 따라간다. 머리카락 색 덩어리 중 가장 큰 것을 머리카락 최저 높이 위는 Head, 아래는 높이에 따라 Spine2 → Spine1 → Spine → Hips 에 섞어 붙인다.
  - `standlegs`: 서 있기(idle)·안녕(wave)의 하체를 같은 자세로 고정한다. 기본 리깅 자세에서도 다리가 벌어질 수 있어 두 관절 IK로 발목을 각각 골반 아래로 모으고, 발 방향·높이는 유지한다. 추가 외부 패키지 `three`가 필요하다.
  - `skin`: 얼굴·손이 연보라빛 흰색이면 게임 음영에서 회색으로 보인다. 살 부분을 곱슬머리 인형 살색으로 옮기고, 텍스처에 그려진 가는 긁힘 선을 고르게 한다.
  - `smooth`: 노멀을 이웃끼리 평균해 툰 음영의 폴리곤 얼룩을 줄인다.
  - `tex1024`: 텍스처를 512 대신 1024 로 (약 +100KB).
- 긴 머리 여자(헤어롤, `assets/models/meshy-woman.glb`):
  ```
  node scripts/meshy-doll-clips.mjs meshy_child_woman_motion.glb assets/models/meshy-woman.glb \
    "Idle_9=idle,Walking=walk,Running=run,Happy_jump_f=jump,Wave_One_Hand=wave,Sleep_Normally=sleep" darkbrown 0.55 none longhair standlegs skin smooth tex1024
  ```
  - 머리카락이 팔 바깥까지 덮고 있어서, 팔을 들면 손이 머리카락 속으로 들어가 가려진다 (원본도 같음).
  - 원본 `assets/models/meshy_child_woman_motion.glb`도 서 있기·안녕 하체를 보정했다. 재적용: `node scripts/fix-meshy-standing.mjs <입력.glb> <출력.glb>`. 상체 동작·다른 애니메이션·텍스처는 유지한다. [보정된 대기·인사 미리보기](meshy-woman-standing.png).
  - 앉기 동작이 없어 게임은 곱슬머리 인형의 앉기 자세를 빌린다 (`DOLL_KINDS` 의 `sitFrom`). 폴짝(Happy_jump, 9.8초)은 0.7초부터 한 번 뛰는 만큼만 쓴다 (`jump`).
- `@last`: 마지막 장면만 남긴다. 뒤돌아보고 앉는 동작은 앉아 있는 자세만 쓴다.
- 마지막 인자 `yellow`: 노란 가방·가방끈을 등 뼈에만 붙인다. 안 하면 팔을 들 때 끈이 팔을 따라 늘어난다.
- 받은 파일은 키 1.2 라 `DOLL_KINDS`의 전체 배율을 1/1.2 로 한다. 앉기 보정(`sit`)은 앉았을 때 엉덩이가 여자 인형 엉덩이 자리에 오게 맞춘다.
- wave 동작이 없으면 게임이 팔 뼈를 돌려 흔든다 (`DOLL_BONE_WAVE`). jump 동작이 있으면 폴짝 이모트에 쓰고 몸 전체를 튀기지 않는다.
- 먹기는 동작 파일을 쓰지 않는다. 손에 든 간식을 입으로 가져가는 건 게임의 팔 IK 가 한다 (어느 손이든 같은 방식).

## 5. 펭귄 (Meshy 웹에서 걷기만 받은 인형, `assets/models/meshy-penguin.glb`)

```
node scripts/meshy-penguin.mjs assets/models/Meshy_AI_Penguin_motion.glb assets/models/meshy-penguin.glb
```

- **노란 선**: Meshy 텍스처는 UV 조각(252개)이 서로 맞닿아 있고 가장자리에 옆 조각 색이 번져 있다. 축소(밉맵)되면 남색 머리·몸에 노란 금이 간 것처럼 보인다.
  스크립트가 조각마다 사방 32픽셀 여백을 두어 새 텍스처(4096 → 5760, 저장은 1024)에 다시 배치한 뒤 UV 를 옮긴다.
  - 조각 가장자리 그림은 건드리지 않는다. 가장자리 띠를 안쪽 색으로 덮어 봤더니 조각 경계가 지나가는 오른쪽 눈이 잘리고 얼굴·머리 경계가 들쭉날쭉해졌다. 여백만으로 멀리서 보이던 노란 선은 사라진다.
- **동작은 Meshy 걷기를 버리고 뼈를 돌려 만든다** (크레딧 없음). 몸통·머리는 그대로 두고:
  - `idle` 3.2초: 팔을 몸 옆으로 조금 내리고 고개 갸웃 · 날개 살짝 들썩
  - `walk` 0.8초(두 걸음): 팔을 기본 자세보다 조금 벌리고, 짧은 다리만 번갈아 들었다 놓는 아장아장 (발바닥은 바닥과 나란히)
  - `wave` 4.1초: 게임 안녕 시간표(`DOLL_WAVE_T`)와 같게 0.2~0.8 들기 · 2.7 까지 흔들기 · 3.4 까지 내리기. 팔이 짧아 머리 옆까지 들면 귀마개에 가려서 옆으로 펴서 흔든다
  - `sit` 3.2초: 엉덩이를 내리고 다리를 앞으로 내밀어 발을 까딱인다. 아랫배가 허벅지 뼈에 붙어 있어 허벅지를 많이 들면 몸이 뒤로 젖혀진다
- 원본 파일은 그대로 둔다. 키 0.8 이다.
- 게임: `DOLL_KINDS.penguin` (머리 모양 값 `penguin`, 첫 화면 '펭귄' 탭). 키 그대로(사람보다 작게) · 안녕 팔 보정(`DOLL_WAVE`) 안 함 · 앉기 보정 `down -0.19, fwd 0.1`(앉으면 엉덩이가 거의 바닥이라 여자 인형 엉덩이 높이로 올린다).
