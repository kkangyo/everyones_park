# Meshy 캐릭터 만들기 가이드

공원 3D 인형을 Meshy AI로 만들 때 지킬 점과, Meshy에 같이 보낼 프롬프트를 모았다.
첫 인형(민트 패딩, `assets/models/meshy-mint.glb`)을 만들며 겪은 문제를 바탕으로 했다.

**지금 게임에서 고를 수 있는 인형 (2026-11-22)**: 마루(곱슬머리, `meshy-child.glb`, 머리 모양 값 `curly`) · 하늘(파란 후드 긴 머리, `meshy-woman.glb`, `roller`) · 펭귄 · 알파카.
여자(`meshy-mint.glb`)·남자(`meshy-boy.glb`) 인형은 고르기 탭과 `DOLL_KINDS` 에서 뺐다 (파일은 남아 있다). 예전 꾸미기 값으로 들어오는 사람은 짧은 머리(`short`) → 마루, 긴 머리 등 그 밖 → 하늘로 입힌다 (`dollKind`).
아래 글의 '곱슬머리' = 마루, '헤어롤' = 하늘.

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

- **걸음 11자**: Mixamo 걷기가 다리를 엉덩이 관절(±0.058) 바로 밑으로 곧게 내려 통통한 바지가 가운데서 겹쳐 X 자로 보였다. 게임용 파일에 바로 덧씌운다:
  `node scripts/fix-meshy-walk-width.mjs assets/models/meshy-child.glb assets/models/meshy-child.glb` (알파카 4번과 같은 방법: 키마다 허벅지를 돌려 무릎을 서 있기 발목 너비(±0.076)로, 정강이·발은 원래 방향 유지, 뜬 만큼 골반 내림. 다른 인형·동작은 `[무릎 너비] [동작 이름들]` 인자). meshy-doll-clips.mjs 를 다시 돌렸으면 이것도 다시 돌린다.
- 게임에 필요한 동작: idle · walk · sit (필수), wave · jump (있으면 씀). 이름표에 없는 동작은 버린다 (지금은 Running · Stand_and_Drink · sleep. 인형은 run 을 쓰지 않는다).
- Meshy 웹에서 받은 파일이 30MB 를 넘는 건 4K PNG 텍스처 세 장(색 13MB · 노멀 11MB · 금속·거칠기 6MB) 때문이다. 툰 음영은 색만 쓰므로 노멀·금속은 지우고 색을 512 JPEG 로 줄여 약 390KB 가 된다.
- 끝에 `split` 을 붙이면 겨드랑이 아래에서 팔 옷과 몸통 옷을 잘라 따로 움직이게 한다. 팔이 몸에 거의 붙은 첫 모델에서 맞춘 값이라, 팔이 더 벌어진 지금 모델에서는 소매가 조각나서 쓰지 않는다.
- 끝에 붙이는 옵션 (여러 개 가능):
  - `longhair`: 등·팔 옆으로 길게 늘어진 머리카락을 몸통 뼈에 붙인다. 자동 리깅이 긴 머리를 팔·다리 뼈에도 붙여서, 팔을 들면 옆머리가 끌려 나오고 걸으면 뒷머리가 다리를 따라간다. 머리카락 색 덩어리 중 가장 큰 것을 머리카락 최저 높이 위는 Head, 아래는 높이에 따라 Spine2 → Spine1 → Spine → Hips 에 섞어 붙인다.
  - `standlegs`: 서 있기(idle)·안녕(wave)의 하체를 같은 자세로 고정한다. 기본 리깅 자세에서도 다리가 벌어질 수 있어 두 관절 IK로 발목을 각각 골반 아래로 모으고, 발 방향·높이는 유지한다. 추가 외부 패키지 `three`가 필요하다.
  - `skin`: 얼굴·손이 연보라빛 흰색이면 게임 음영에서 회색으로 보인다. 살 부분을 곱슬머리 인형 살색으로 옮기고, 텍스처에 그려진 가는 긁힘 선을 고르게 한다.
  - `smooth`: 노멀을 이웃끼리 평균해 툰 음영의 폴리곤 얼룩을 줄인다.
  - `tex1024`: 텍스처를 512 대신 1024 로 (약 +100KB).
- **헤어롤 자리 = 파란 후드 긴 머리 소녀 (Little Dreamer, 2026-11-22 교체, `assets/models/meshy-woman.glb`)**. 원본 `assets/models/Meshy_AI_Little_Dreamer_Rigged_20261122_animated_mixamo_All_animation.glb` (동작 Walking · Running · Hello_Run, 키 1.4, 기본 자세는 팔을 옆으로 편 T 자):
  ```
  node scripts/fix-dreamer-rig.mjs assets/models/Meshy_AI_Little_Dreamer_Rigged_20261122_animated_mixamo_All_animation.glb /tmp/dreamer-rigfix.glb
  node scripts/meshy-doll-clips.mjs /tmp/dreamer-rigfix.glb /tmp/dreamer-clips.glb "Walking=walk,Running=run,Idle=idle" darkbrown 0.64 none tex1024
  node scripts/fix-meshy-walk-width.mjs /tmp/dreamer-clips.glb assets/models/meshy-woman.glb 0.11 walk,run
  ```
  - **소매가 딸려 올라감**: 자동 리깅이 어깨·소매 윗부분을 머리 뼈에 60~80% 붙여 놓아(T 자 기본 자세라 옆머리와 소매가 같은 높이), 걸으며 팔을 내리면 소매 윗부분이 머리 쪽에 남아 위로 끌려 올라가고 옆머리 끝은 팔 뼈를 따라 소매 속으로 끌려갔다. `fix-dreamer-rig.mjs` 가 머리카락(텍스처 갈색) 아닌 턱 아래 꼭짓점을 위치로 다시 칠한다(몸통은 척추 높이 순 · 소매는 팔 축을 따라 위팔→아래팔→손 · 엉덩이 아래로 갈수록 원래 무게). 머리카락은 0.64 위는 Head, 아래 끝은 Spine2·Spine1 로. 어깨에 얹힌 머리카락 끝과 소매가 같은 꼭짓점을 써서 막처럼 늘어나던 것은 경계 꼭짓점(28개)을 복제해 머리카락 삼각형만 복제본을 쓰게 했다.
  - **서 있기**: Idle 동작이 없어 `fix-dreamer-rig.mjs` 가 기본 자세에서 팔만 몸 옆으로 내린(수직에서 0.32rad) 한 장면 Idle 을 만든다. 다리는 기본 자세(발목 ±0.133, 11 자) 그대로. 안녕·폴짝·앉기 동작은 없다(게임이 팔 뼈를 돌려 흔들고, 앉기는 곱슬머리 것을 빌린다).
  - **걸음 11자**: 걷기·뛰기 무릎이 엉덩이 관절(±0.073) 바로 밑(±0.07)이라 X 자였다. 무릎 ±0.11 로 (서 있기 ±0.12 보다 조금 좁게). 이때 `fix-meshy-walk-width.mjs` 의 골반 내림이 뼈대 배율 0.01 을 빠뜨려 거의 0 이던 것을 고쳤다 (곱슬머리는 내릴 양이 1mm 남짓이라 다시 돌리지 않았다).
  - 게임 설정 `DOLL_KINDS.roller`: `scale 1/1.4` · `h 1.4` · `head 1`(머리가 이미 크다) · 앉기 `down -0.107, fwd 0.036` (빌린 앉기 자세의 골반 높이가 키 배율만큼 낮아지는 만큼: −0.075 − 0.185·DOLL_H·(1/1.2 − 1/1.4). 같은 식이 예전 키 1.7 인형의 −0.141 과 맞는다) · `sitFix` 그대로 · 예전 인형용 `waveBones` 는 뺐다(안녕 동작이 없다).
  - 뷰어에서는 Meshy 재질이 metalness 1 이라 어둡게 보인다 (게임은 툰 음영이라 상관없다).
- (예전) 긴 머리 여자(헤어롤, 라벤더 래글런 맨투맨):
  ```
  node scripts/meshy-doll-clips.mjs assets/models/meshy_woman_blender.glb assets/models/meshy-woman.glb \
    "Walking=walk,Running=run,Wave_One_Hand=wave,Wave_One_Hand=idle@first" darkbrown 0.55 none longhair standlegs skin smooth tex1024 armweights hemweights paint
  ```
  - 원본은 Blender 에서 내보낸 `assets/models/meshy_woman_blender.glb` (동작 Running · Walking · Wave_One_Hand 뿐). Idle 이 없어 `@first` 로 안녕 첫 장면을 서 있기로 쓴다. 폴짝 동작은 없다.
  - `@first`: 그 동작의 첫 장면만 남긴 새 동작을 만든다. 같은 원래 이름을 여러 번 써서 원래 동작도 함께 남길 수 있다.
  - `armweights` (안녕할 때 손·옷 이음매): 자동 리깅이 ① 가슴 앞·등 조끼를 위팔 뼈에 붙여 팔을 들면 조끼가 팔을 따라 부풀고 ② 손을 허벅지 뼈에도 20~30% 붙여(기본 자세에서 손이 허벅지 옆) 팔을 들면 손이 허리 쪽으로 길게 늘어나고 ③ 어깨 소매를 머리 뼈에 붙여 놓았다 ④ 기본 자세에서 아래팔이 허리 옆에 늘어져 조끼 옆구리가 아래팔 뼈에 붙고, 소매 안쪽과 옆구리가 메시로 이어져 팔을 들면 흰 조끼가 길게 끌려 올라갔다. 소매가 통통해 몸통에 닿아 위치로는 못 가르므로 텍스처 색(밝은 조끼 / 어두운 소매)으로 가른다: 팔꿈치 전 밝은 꼭짓점은 팔 뼈를 빼고, 아래팔·손은 팔 뼈에만, 목 아래 팔 쪽은 머리 뼈를 뺀다. 같은 자리 꼭짓점(UV 이음매)은 한 점으로 보고 겨드랑이 둘레만 경계를 이웃끼리 평균해 찢어지지 않게 한다(아래팔 옆 조끼는 딱 자른다). 끝으로 팔(겨드랑이 아래)·손과 몸통을 잇는 삼각형을 지운다 (기본 자세에서는 팔과 몸 사이에 숨어 있다).
  - `paint` (색 다듬기, 기준 그림: 크림 맨투맨 · 라벤더 래글런 소매): 원본은 맨투맨(255,237,227)·살(252,236,227)이 거의 같은 색이라 게임 음영에서 얼굴·목·몸통이 한 덩어리로 보이고 소매도 옅었다. 삼각형을 뼈 무게·색으로 나눠 UV 위에 칠한다: 맨투맨 따뜻한 크림 · 소매 진한 라벤더 · 목깃(맨투맨 맨 위 4cm)·밑단·소매 끝(위팔→손 축 0.84 넘게)은 진한 크림 골지 (칸마다 3D 위치를 보간해 둘레 각도로 줄무늬). 주름 음영은 남기고, 가슴 구름 무늬는 칠하지 않는다 (원본부터 조각나 있다).
  - `hemweights` (앉기): 허리 아래로 내려오는 조끼 아랫단이 허벅지 뼈에 붙어 앉으면 등 쪽 옷자락이 뒤로 부풀었다. 무릎 위 밝은 꼭짓점의 다리 뼈 무게를 골반 관절 위는 모두, 아래는 엉덩이 쪽만 Hips 로 옮긴다 (앞자락은 무릎 위에 덮이게 둔다).
  - 게임 설정(`DOLL_KINDS.roller`): 원본이 키 1.7 이라 `scale 1/1.7` · `h 1.7` (1/1.2 로 두면 다른 인형보다 1.4배 크다). 머리가 작고 목이 드러나 처져 보여서 `head 1.15`. 앉기 보정 `down -0.141, fwd 0.03` (앉았을 때 골반이 다른 인형과 같은 높이).
  - 안녕(`waveBones`): 동작 그대로는 팔꿈치를 100° 넘게 접어 손이 어깨에 붙고 소매가 뭉개진다. 흔드는 중간 장면의 팔 방향에서 "위팔 옆으로 30° · 아래팔 세움" 으로 돌리는 축·각을 구해 `DOLL_WAVE` 대신 쓴다. 머리가 커서 손은 볼 바깥 끝에 온다.
  - 앉기 자세는 곱슬머리 것을 빌려서 고개를 27° 숙이고 등이 굽어 게임 카메라에서 정수리만 보였다. 게임 코드에서 허리를 펴고 고개를 든다 (`DOLL_KINDS.roller.sitFix`: Spine1·Spine2 −0.15, Head −0.2, 앉은 정도만큼).
  - 머리카락이 팔 바깥까지 덮고 있어서, 팔을 들면 손이 머리카락 속으로 들어가 가려진다 (원본도 같음).
  - 앉기 동작이 없어 게임은 곱슬머리 인형의 앉기 자세를 빌린다 (`DOLL_KINDS` 의 `sitFrom`).
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
- **털 색**: 얼굴·귀마개 털이 노란 크림색(약 250,228,170)이라 흰색 쪽으로 바꿨다. 게임용 파일에 바로 덧씌운다:
  `node scripts/whiten-meshy-fur.mjs assets/models/meshy-penguin.glb assets/models/meshy-penguin.glb` (초록·파랑이 밝은 크림 화소만 채도 0.25 로 줄이고 밝기를 흰색 쪽으로 0.5 올린다. 노란 패딩·빨간 목도리·주황 부리·발·분홍 볼은 그대로. 더 희게: 뒤에 `[채도] [밝기]` 예 `0.1 0.7`). meshy-penguin.mjs 를 다시 돌렸으면 이것도 다시 돌린다.
- 원본 파일은 그대로 둔다. 키 0.8 이다.
- 게임: `DOLL_KINDS.penguin` (머리 모양 값 `penguin`, 첫 화면 '펭귄' 탭). 키 그대로(사람보다 작게) · 안녕 팔 보정(`DOLL_WAVE`) 안 함 · 앉기 보정 `down -0.19, fwd 0.1`(앉으면 엉덩이가 거의 바닥이라 여자 인형 엉덩이 높이로 올린다).

## 6. 알파카 리깅 수정 (Meshy 자동 리깅, 2족 SD 비인간형)

```
python3 scripts/fix-alpaca-rig.py assets/models/Meshy_AI_Cozy_Alpaca_Reference_Texture_20261121_animated_mixamo_All_animation.glb assets/models/Meshy_AI_Cozy_Alpaca_rigfix.glb
```

- Meshy 자동 리깅은 사람 뼈대(Mixamo)를 큰 머리 동물에 그대로 씌워 가중치가 엉망이었다: 왼손 밑 `Bone_028` 이 머리 속에 있어 팔을 흔들면 머리·귀가 찌그러짐 · 위팔을 어깨 뼈가 잡아 팔이 안 따라옴 · 머리 가중치가 가슴·팔로 번짐 · 발바닥을 정강이가 잡음.
- 스크립트: `Bone_028`·왼손에만 있던 손가락 뼈 삭제 → 어깨 뼈 좌우 대칭 → 가중치를 위치로 새로 칠함(머리·귀는 Head 하나, 몸통·목도리·꼬리는 척추 높이 순, 소매는 팔 축 반지름, 짧은 다리는 높이 순, 가랑이 위 가운데는 Hips).
- **걸음 11자**: 서 있는 자세는 무릎·발목이 x ±0.149 인데 Mixamo 걷기·달리기가 다리를 엉덩이 관절(±0.07) 밑으로 곧게 내려 바지·발굽이 가운데서 겹쳤다(X 자). 키마다 허벅지를 돌려 무릎을 서 있을 때 너비로, 정강이·발은 원래 방향을 유지, 벌어져 뜬 만큼 골반을 내린다.
- **털 색**: 따뜻한 베이지(평균 218,185,150)를 살짝 흰 크림으로. 메시 위치로 털 부위(머리·귀, 코트 밑 다리, 꼬리)만 골라 UV 마스크를 만들고 그 안의 크림색 화소만 채도를 줄이고(`FUR_CHROMA` 0.45) 밝기를 올린다(`FUR_LIFT` 0.35). 코트 밑단·소매 끝 털 장식, 목도리, 분홍 볼·귀 안, 눈·코, 발굽은 그대로. PNG 는 macOS `sips` 로 풀고 묶는다.
- 원본 파일은 그대로 둔다.
- **게임용**: `python3 scripts/meshy-alpaca.py assets/models/Meshy_AI_Cozy_Alpaca_rigfix.glb assets/models/meshy-alpaca.glb` (1.5MB)
  - 뼈 이름의 `mixamorig:` 떼기 · 걷기(11자 보정) = `walk` · 달리기는 버림 · `idle`(팔을 몸 옆에 내리고 숨쉬기·고개 갸웃) · `sit`(허벅지를 들어 짧은 다리를 내밀고 발 까딱)은 뼈를 돌려 만든다 · `wave` 없음(게임이 팔 뼈를 돌려 흔든다) · 텍스처 1024 JPEG(sips).
  - 메시 압축(meshopt)은 안 했다(다른 인형은 400KB 안팎). gltf-transform 을 설치하면 meshy-doll-clips.mjs 처럼 줄일 수 있다.
- 게임: `DOLL_KINDS.alpaca` (머리 모양 값 `alpaca`, 첫 화면 '알파카' 탭). 키 1.7 로 만들어져 `scale 1/1.7`(여자 인형 키) · `h 1.7` · 뼈 단위가 m 라 `boneUnit: 1`(손에 든 간식 자리 계산, 다른 인형은 cm) · 앉기 보정 `down -0.3, fwd -0.28`(엉덩이를 벤치 높이로 올리고 좌석 안쪽으로).
- 확인: `/park3d/rig-viewer/` (원본·수정본을 나란히 재생, 바닥 선은 발목이 지나간 자리). 다른 모델은 `?a=<경로>&b=<경로>`.
