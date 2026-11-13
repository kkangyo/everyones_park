# 캐릭터 디테일 개편

현재 런타임은 female-longhair + ivory-sleeveless / male-handsome + black-blazer-handsome 두 조합만 사용합니다. 기존 임시 캐릭터 계정은 readAppearance에서 같은 성별의 새 기본 조합으로 읽습니다.

사람 시트는 256×1792 RGBA, 64×64 셀, 4열×28행입니다. 기존 32px 논리 좌표와 동작/손 부착 계약을 유지하며 그림은 0.5배, 캐릭터 컨테이너는 1.5배로 표시합니다. 고양이 시트와 크기는 그대로입니다. 이 사람 전용 해상도 변경은 기존 128×896 제작 문서보다 우선합니다.

기존 실루엣과 프레임 배치를 보존한 상태에서 머리카락 하이라이트, 원단 음영과 주름, 단추를 세부 픽셀로 추가했습니다. art-direction.png는 imagegen으로 만든 디자인 참고 자료이며 실제 게임 스프라이트와 구분됩니다. 실제 적용 결과는 preview.png와 review.html, male/review.html, female/review.html에서 확인합니다. *-before.png는 수정 직전 원본입니다.

검증: pnpm build / pnpm check:hands / pnpm check:character-detail.
refine-character-detail.ts는 원본 32px 시트를 입력으로 한 번만 실행하는 변환 도구입니다. 이미 변환된 시트에 다시 적용하면 중단합니다. 과거 fix-handsome-hands 스크립트는 32px 원본 복원용이므로 새 런타임에 사용하지 않습니다.
