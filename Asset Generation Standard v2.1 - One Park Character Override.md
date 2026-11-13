# One Park Character Override — revision 3.0

The v2.1 filename is retained for existing links. This profile overrides conflicting human/animal instructions in Asset Generation Standard v2.0. Static objects are outside its scope.

## Human production: 64px detailed art, frozen rig

The complete human production entry point, including copyable prompts, exact row order, layer instructions, coordinate conversion, source templates, checks and limitations, is [캐릭터_그래픽_프롬프트_8방향.md](./캐릭터_그래픽_프롬프트_8방향.md). Read and follow it for every human request. The previous 32px human instructions and universal-palm assumption are superseded.

- Final body AND outfit: each actual 256×1792 transparent 8bit RGBA PNG, 4 columns × 28 rows of 64×64 cells; no gutters, outer padding, trimming or independent resizing.
- Fine pixel art must be redrawn at native 64px. Preserve the approved identity, hairstyle, shape and palette while adding clustered hair/eye/skin/fabric shading. Upscaling old 32px sprites or showing a detailed concept without applying that artwork is insufficient.
- Approved geometry templates: body-female-longhair + outfit-ivory-sleeveless, or body-male-handsome + outfit-black-blazer-handsome in assets/sprites/. Use the exact matching row/column as the geometry reference. Freeze head/torso/shoulders/waist/limbs/clothing boundaries and feet; do not normalize per-cell or per-row bounding boxes. Appearance references do not override rig geometry.
- Art anchor (32,64), logical anchor (16,32). Runtime pixelRatio=2, layer scale=0.5, worldScale=1.5: a 64px cell occupies 48 world pixels. Do not alter runtime scale to fit new art.
- Body owns hair/head/face/ears/neck/base legs/shoes; outfit owns torso clothing/trousers or skirt/sleeves/arms/hands. Preserve long hair on body. Split by anatomy and approved part masks, not a simple horizontal cut or color threshold. No duplicate parts, gaps or food painted into layers.
- Runtime headBottom=14 and biteY=-18 are LOGICAL values. The base head crop height is 30 ART pixels. Preserve eating/head-turn compatibility as well as the static composite.

### Layout and motion

Rows 0–7 normal and 8–15 carry: down, left, right, up, down-left, down-right, up-left, up-right. Rows 16–19 sit and 20–23 sitCarry: down, left, right, up. Rows 24–27 lie: HEAD toward down, left, right, up.

Walking columns: neutral / left foot forward / neutral / right foot forward, 8fps. Rest columns: base eyes open / inhale / base eyes closed / inhale, 1.5fps. Preserve the exact template geometry for each phase. Do not add bob/sitting offsets a second time. True diagonal views; no rotated frontal sprites. Carry arms support empty space; seated carry must retain that support. Lying means supine with stable head orientation, including head-up; do not substitute standing. No furniture or held objects.

### Frozen human palms and food

The current human contact source is apps/client/src/character-art-grips.json, consumed by characterArt.ts. Entries are body ID → row:column → anatomical left/right → logical offset from feet. Freeze existing values when refining art. The shared hand-rig.ts remains the default/fallback and server/food contract, not a replacement for authored per-frame human palms.

ART palm = (32 + 2×JSON.x, 64 + 2×JSON.y). For example female-longhair 8:0 left=(3.5,-9) maps to (39,46), right=(-4.5,-9) to (23,46). Preserve fractional logical values. Entries already include pose/phase: do NOT add sitDrop or bob. Align actual palms and connected arms to the overlay; do not re-detect skin and rewrite coordinates to fit generated art. For a new ID, copy and freeze its chosen compatible template mapping before production; register it only when game integration is requested.

Food remains 12×12 with fixed grip (6,9), three stages in 36×12. Do not upscale food assets because character art doubled. Place using logical hand offsets and food origin (0.5,0.75). First item stays in anatomical right hand, second in left; removing one never moves the other. Up/back diagonals occlude food behind body; otherwise far hand first. Eating uses head/effects while food stays at the palm. A 64px art review canvas doubles logical food display size only.

### Production and acceptance

Save candidate sources, prompts, template hashes/masks, fixed palm overlays and frame mapping. Generate pose groups if needed, then assemble 112 exact cells without moving fixed parts to accommodate generated art. The initial assemble-character-actions.ts normalizes bounds, estimates palms and overwrites runtime files; do not rerun it unchanged for frozen-rig refinement. Use candidate assembly with frozen metadata as input.

Validate all layers and 28 animated rows at native art resolution and actual Phaser scale, including single/both hands, all food stages, back occlusion, head turns, steam, nameplates and bubbles. Current check:character-detail/check:hands validate registered runtime structure/ranges and server/food contracts; they do not prove candidate alignment, anatomy or art quality. Legacy check:character uses 32px proportional assumptions and is not the 64px art acceptance authority. preview:character currently downsamples to a logical canvas and selects authored palms by filename; verify candidate identity and native art separately. See the main document for exact limitations and commands.

Deliver matched body/outfit PNGs, plus review evidence in a separate candidate folder. Apply to existing runtime assets/registries when requested; do not leave project assets only in the generation tool's storage. A prompt does not guarantee exact geometry: compare against frozen templates/masks/contacts and correct the artwork. Report incomplete work explicitly. Lying assets do not implement a gameplay lying interaction.

## Animal profile: unchanged 32px layout

These rules apply to animal production only; they do not resize the existing runtime cat or replace its own atlas contract. For a newly requested animal under this unified profile: 128×896 transparent RGBA, 4×28 cells of 32×32, anchor (16,32), same row order and four motion phases listed above. Human palms, body/outfit splitting and the human 64px resolution do not apply. Use a stable approved animal pose template and preserve anatomy and markings. No photographic backgrounds, antialiasing, labels or gridlines.

## Animal deliverables and anatomy

For an animal photo, default to ONE complete animal-[subject-id].png with all 112 cells, including body, fur/feathers, limbs, tail, and subtle shadow. Do not split fur into human clothing layers. Preserve species anatomy, recognizable markings, and individual identity.

Default animal behavior is NATURAL, not anthropomorphic. Quadrupeds remain quadrupeds when walking. Use the four walking columns as base stance, left-leading stride, base stance, right-leading stride with a plausible species-specific supporting-leg cycle. Birds and other species use their own anatomy; do not add human hands or unnecessary flight frames.

To preserve the shared row contract without inventing human anatomy:
- natural animal carry rows 8–15 repeat the corresponding normal rows 0–7;
- natural animal sitCarry rows 20–23 repeat the corresponding sit rows 16–19;
- do not draw carried food or make an animal stand upright to satisfy a carry row;
- sit is a species-appropriate settled rest pose; lie is a species-appropriate lying/resting pose with the head oriented as specified;
- preserve all rows even when anatomy requires equivalent poses. Report reused groups in the delivery note, outside the image.

Only if explicitly requested as an ANTHROPOMORPHIC game character, use a consistent upright design and supporting forelimbs for carry/sitCarry. Keep that design consistent in every group; never switch between natural and anthropomorphic anatomy mid-sheet. Human attachment coordinates may require code adjustments for such a character.

The present One Park appearance registry and CharacterView are human body/outfit based. An animal sheet can conform to this asset layout, but requires animal registration/rendering integration; this prompt does not implement that integration or make human food offsets valid for natural animals.


Verify actual PNG dimensions, transparency, all 112 cells and directions, stable scale/anchors, loop continuity and anatomy. If the generator cannot produce the exact grid, assemble inspected frame groups deterministically. Intermediate/sample sheets never replace a complete final sheet. Hidden photographic details are inferred; do not claim they were verified.
