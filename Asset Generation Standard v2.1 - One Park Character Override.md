# One Park Human / Animal Unified Sprite Standard — revision 2.2

This file retains its v2.1 filename for existing references; its content is revision 2.2, aligned with the current 28-row character contract.

Use this prompt with an uploaded human or animal photograph. It is self-contained. If appended to Asset Generation Standard v2.0, this profile takes precedence over ALL conflicting human/animal rules, including action defaults, direction order, variable frame counts, variable cell sizes, and separate action sheets. Static objects are outside this profile.

## Task and reference interpretation

Identify whether the principal requested subject is a human or an animal. Produce sprites of that SAME individual in ALL five pose groups below. A photograph is an appearance reference, not the sheet layout or camera reference. Preserve recognizable hair/fur, face, colors, markings, proportions, and requested clothing while adapting to readable 32×32 game art. Do not reproduce the photographic background, photographic lighting, text, or incidental subjects. Use an approved game sheet as the reference for scale and alignment when supplied.

If multiple subjects are equally plausible, identify the intended subject before production. Unseen sides should use plausible, consistent inferred details; do not claim they were verified from the photo. Do not silently switch species, individual, outfit, or art style between cells.

## Camera and style

Crisp pixel art for a cozy Korean winter park. Elevated three-quarter top-down camera, orthogonal square-tile world, fixed camera elevation, screen-space top-left light. Direction changes rotate the SUBJECT in the world, not the camera. Do not introduce diamond-shaped isometric tile projection, photographic perspective, blur, antialiasing, smooth gradients, grid lines, labels, borders, watermarks, or scenery. Use controlled pixel clusters and a consistent palette; “32-bit RPG” describes an aesthetic, not a request for larger cells or more frames.

## Mandatory unified layout

Every final sheet is an actual transparent RGBA PNG exactly **128×896 pixels**: **4 columns × 28 rows**, each cell **32×32 pixels**, total **112 cells**. No sheet margin, spacing, atlas packing, frame trimming, or independent cell resizing. Transparent padding INSIDE cells is allowed. No visible pixel may spill into another cell or be clipped. Do not split final output by action. Intermediate groups are allowed only if assembled into this exact final layout.

Coordinates start at the upper-left. Row and column indices start at zero. Frame index = row * 4 + column, from 0 through 111. Cell origin = (column * 32, row * 32).

Directions are SCREEN directions. down=S, left=W, right=E, up=N; down-left=SW, down-right=SE, up-left=NW, up-right=NE. Do not use the base standard's N-first ordering.

| Row | Pose ID | Direction meaning |
| --- | --- | --- |
| 0 | normal | down |
| 1 | normal | left |
| 2 | normal | right |
| 3 | normal | up |
| 4 | normal | down-left |
| 5 | normal | down-right |
| 6 | normal | up-left |
| 7 | normal | up-right |
| 8 | carry | down |
| 9 | carry | left |
| 10 | carry | right |
| 11 | carry | up |
| 12 | carry | down-left |
| 13 | carry | down-right |
| 14 | carry | up-left |
| 15 | carry | up-right |
| 16 | sit | looking down |
| 17 | sit | looking left |
| 18 | sit | looking right |
| 19 | sit | looking up |
| 20 | sitCarry | looking down |
| 21 | sitCarry | looking left |
| 22 | sitCarry | looking right |
| 23 | sitCarry | looking up |
| 24 | lie | HEAD toward down |
| 25 | lie | HEAD toward left |
| 26 | lie | HEAD toward right |
| 27 | lie | HEAD toward up |

Walking and carrying have eight directions. Sitting, sitting while carrying, and lying have ONLY four directions. Do not add diagonal rest rows. Lying direction means where the head lies on the screen, not where the face looks.

## Columns and motion

For rows 0–15, columns are exactly:
0 neutral standing; 1 left foot forward; 2 neutral standing; 3 right foot forward.
Left/right refer to the subject's anatomy. Columns 0 and 2 may match. Column 0 doubles as idle, with no additional idle rows. Loop 0→1→2→3→0 at 8 fps. Raise the upper body 1 pixel on columns 1 and 3 relative to columns 0 and 2. Keep body/outfit phases synchronized. Genuine diagonal views are required; do not make them by rotating a finished frontal image in the image plane.

For rows 16–27, columns are exactly:
0 base resting pose, eyes open; 1 gentle inhale, upper body 1 pixel raised; 2 base resting pose, eyes closed where visible; 3 gentle inhale, upper body 1 pixel raised.
Loop at 1.5 fps. No walking leg cycle in these rows. Do not draw visible eyes on the back of a head to show blinking. For lying poses, express the inhale as a subtle chest movement appropriate to the lying orientation; keep head direction and the footprint stable. Avoid whole-body sliding or unintended rotation.

normal: natural walking. carry: same gait with arms held forward in a stable supporting pose. sit: seated resting, without a walking leg cycle. sitCarry: seated with stable forward supporting arms. lie: human lying on the back, or animal resting naturally according to the animal rules below. Do not draw benches, beds, seats, food, cups, or carried objects in any cell. Runtime scenery and food are separate. Do not add running, waving, eating, jumping, or other actions to this contract.

## Anchors and human food alignment

All sheets use the SAME local renderer anchor (16,32), bottom center, including seated and lying cells. Use the approved pose reference for the visible body's position relative to that anchor; do not auto-center each visible bounding box. Lying need not touch the bottom edge, and its body must fit inside the cell without truncating head or feet. Keep the stylized proportions consistent with the standing character.

For human sit and sitCarry, lower the upper body by 3 pixels relative to the corresponding standing base pose and bend the legs into a seated posture. Apply inhale offsets on top of this 3-pixel shift. Use identical pose alignment in body and outfit sheets.

Human carry food centers below are renderer offsets relative to the anchor, NOT painted food. Align supporting arms plausibly around these existing attachment positions. “Two” lists the two food centers; the sprite need not have three different hand positions for the one/two cases.

| Direction | One food (x,y) | Two foods (x,y) |
| --- | --- | --- |
| down | (0,-12) | (-5,-12), (5,-12) |
| left | (-6,-12) | (-7,-13), (-3,-11) |
| right | (6,-12) | (7,-13), (3,-11) |
| up | (0,-14) | (-5,-14), (5,-14) |
| down-left | (-4,-12) | (-6,-12), (1,-12) |
| down-right | (4,-12) | (6,-12), (-1,-12) |
| up-left | (-3,-14) | (-6,-14), (2,-15) |
| up-right | (3,-14) | (6,-14), (-2,-15) |

Runtime adds y=-1 on columns 1/3 and y=+3 for sitting. Food is behind the body in up, up-left, up-right views, and in front in the other views. Preserve plausible occlusion; do not paint fake food or cut holes through the body.

## Human deliverables — default: runtime body/outfit layers

“All actions unified” means all five pose groups are in EACH sheet. It does not mean flattening the body's separately selectable clothing into one runtime layer.

For a human photo, deliver matched **body and outfit PNGs**, each 128×896 with the full 112-cell layout. Produce them in separate referenced passes if necessary:

- body-male.png OR body-female.png, according to the requested runtime slot: head, hair, face, neck, base legs, shoes, subtle ground shadow. Exclude upper clothing, sleeves/arms, scarves, and food. Follow the existing game's unusual ownership rule: arms are supplied by the outfit sheet. Corresponding normal/carry body frames may match; corresponding sit/sitCarry body frames may match.
- outfit-[configured-outfit-id].png: only specified clothing, sleeves/arms, scarf, trousers/skirt. Exclude duplicate head, face, hair, shoes, ground shadow, and food. All other areas must be transparent. Match the approved body sheet pixel placement, pose, direction, proportions, and motion phase. Distinguish normal/carry and sit/sitCarry arm poses.

Apply this ownership to lying rows as well: head/legs/shoes on body; torso clothing/arms/trousers on outfit. Do not make a fully dressed body layer and then add another outfit on top. If no runtime slot or outfit ID is supplied, use body-reference.png and outfit-reference.png as review filenames; do not imply they are already registered in the game. Do not infer a runtime gender slot solely from a photo.

A fully composited human sheet may be provided as preview-[subject-id].png if requested. It is a review artifact, not a replacement for the two runtime layers.

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

## Acceptance and production limits

Check actual PNG dimensions, RGBA transparency (not a painted checkerboard), 28 correct rows, 4 columns, frame indices 0–111, no clipping/overlap, all five groups, correct rest directions, lie HEAD directions, loop continuity, stable anchors, and body/outfit composites where applicable. Preview each row in animation. Do not claim photo-hidden details are verified.

A text prompt cannot guarantee exact image-generation geometry. If the tool cannot output the exact 128×896 transparent grid, use referenced frame groups, inspect/correct frames, then assemble all 112 cells deterministically into the final PNG. Do not silently deliver only sample poses, only walking, separate action sheets, an approximate resized grid, or a 128×512 sheet. Report any requirements that remain unverified. Separate intermediate files never replace the final unified sheet(s).

Lying graphics are prepared assets; the current game does not yet expose a lying interaction. “All actions” in this profile means the five groups defined above, not every imaginable action.
