WEB MULTIPLAYER PARK GAME
UNIVERSAL PIXEL ART ASSET GENERATOR
Production Standard v2.0
Create professional, game-ready 2D isometric pixel art assets based on the uploaded reference photograph.
These assets are intended for a browser-based multiplayer park simulation game.
The visual style must remain consistent across all objects, characters, and animals in the same game world.
The asset generation process must automatically distinguish between:
	1. Static Objects
	2. Human Characters
	3. Animals
Apply the appropriate production rules depending on the subject category.

1. GLOBAL VISUAL STYLE
Art Direction
	• High-quality 32-bit RPG pixel art.
	• Cozy fantasy park simulation aesthetic.
	• Rich, detailed, colorful, and polished pixel graphics.
	• Professional pixel clustering and sophisticated shading.
	• Natural and harmonious color palettes.
	• Consistent visual style across every asset.
Camera Perspective
	• High-angle 3/4 top-down perspective.
	• Slightly higher viewing angle than conventional isometric RPG games.
	• Show more of the upper surfaces of objects and characters.
	• Consistent orthographic-style projection.
	• Maintain the same camera elevation for all assets.
	• No realistic camera perspective or extreme foreshortening.
Pixel Art Requirements
	• Crisp and clearly defined pixel clusters.
	• Detailed pixel shading and highlights.
	• No photorealism.
	• No blurry edges.
	• No excessive anti-aliasing.
	• No vector graphics or smooth 3D rendering.
	• Preserve recognizable characteristics of the reference photograph.

2. OBJECT SIZE STANDARD
Use 32px as the fundamental game tile unit.
Choose the appropriate sprite size based on the actual object.
	• Small objects: 32 × 32 px
	• Medium objects: 64 × 64 px
	• Large objects: 96 × 96 px
	• Extra-large objects: multiples of 32px when necessary.
Do not force large objects into a small canvas.
Preserve natural proportions and visual details.

3. CATEGORY A: STATIC OBJECTS
Automatically apply this section when the reference image contains non-living objects.
Examples:
	• Trees
	• Flowers
	• Bushes
	• Rocks
	• Benches
	• Fountains
	• Buildings
	• Fences
	• Lamps
	• Park decorations
	• Furniture
Directional Requirements
Generate exactly 8 directional views:
N, NE, E, SE, S, SW, W, NW.
Requirements:
	• Each view must represent a genuine change in viewing direction.
	• Do not simply mirror the original image.
	• Preserve the same geometry and proportions.
	• Maintain consistent lighting, colors, and details.
	• Keep the same camera elevation.
Static objects require 8 directional sprites only.
Do not generate unnecessary animation frames.

4. CATEGORY B: HUMAN CHARACTERS
Automatically apply this section when the reference image contains a person.
Examples:
	• Player characters
	• NPCs
	• Park visitors
	• Children
	• Adults
	• Other human characters
Directional Requirements
Support all 8 directions:
N, NE, E, SE, S, SW, W, NW.
Action Requirements
Generate the actions requested by the user.
If no specific actions are provided, use these default actions:
	1. Idle / Standing
	2. Walking
	3. Sitting
	4. Lying Down
Additional actions can include:
	• Running
	• Waving
	• Jumping
	• Dancing
	• Talking
	• Interacting with objects
	• Fishing
	• Reading
	• Sleeping
Animation Requirements
Idle / Standing
	• Create a natural standing pose.
	• Optionally include 2–4 subtle animation frames.
	• Examples: blinking, breathing, slight body movement.
Walking
	• Create 4–6 animation frames per direction.
	• Show a natural alternating leg movement.
	• Maintain consistent body position and proportions.
	• Ensure a seamless animation loop.
Sitting
	• Create a recognizable sitting pose.
	• Support all 8 viewing directions.
	• Optional subtle animation frames.
Lying Down
	• Create a natural lying pose.
	• Support all 8 viewing directions.
	• Preserve body proportions and character identity.
Additional Actions
	• Create animation frames appropriate to the requested action.
	• Ensure the motion looks natural and consistent.
Character Consistency
The same character must remain visually identical across all actions and directions.
Preserve:
	• Face and hairstyle
	• Clothing
	• Body proportions
	• Colors
	• Accessories
	• Character identity
Do not redesign the character between animation frames.

5. CATEGORY C: ANIMALS
Automatically apply this section when the reference image contains an animal.
Examples:
	• Cats
	• Dogs
	• Rabbits
	• Birds
	• Squirrels
	• Other park animals
Directional Requirements
Support all 8 directions:
N, NE, E, SE, S, SW, W, NW.
Action Requirements
Generate the actions requested by the user.
If no specific actions are provided, use these default actions:
	1. Idle
	2. Walking
	3. Sitting
	4. Lying Down
Additional actions can include:
	• Running
	• Jumping
	• Sleeping
	• Eating
	• Drinking
	• Looking Around
	• Playing
	• Tail Wagging
	• Flying (for birds)
	• Swimming (for aquatic animals)
Animation Requirements
Idle
	• Natural resting or standing pose.
	• Optional subtle breathing, blinking, or tail movement.
Walking
	• Create 4–6 animation frames per direction.
	• Use natural leg movement.
	• Maintain consistent body proportions.
	• Ensure seamless looping.
Sitting
	• Create a recognizable seated animal pose.
	• Support all 8 directions.
Lying Down
	• Create a natural resting or sleeping pose.
	• Support all 8 directions.
Additional Actions
	• Generate suitable animation frames according to the requested action.
	• Preserve natural animal movement and anatomy.
Animal Consistency
Maintain identical:
	• Fur or skin colors
	• Body shape
	• Facial features
	• Ear shape
	• Tail shape
	• Distinctive markings
	• Overall proportions
All actions must depict the same animal.

6. SPRITE SHEET AND ANIMATION LAYOUT
Generate organized sprite sheets.
Static Objects
	• One 4-column × 2-row sprite sheet.
	• Exactly 8 directional sprites.
	• Order: N, NE, E, SE / S, SW, W, NW.
Human Characters and Animals
	• Organize sprites by action and direction.
	• Prefer one separate sprite sheet per action.
	• Arrange animation frames consistently.
	• Use the same directional order for every action.
	• Keep all frames aligned to a consistent cell grid.
	• Avoid overlapping sprites.
For example:
Character_Walk:
	• N: 4–6 frames
	• NE: 4–6 frames
	• E: 4–6 frames
	• SE: 4–6 frames
	• S: 4–6 frames
	• SW: 4–6 frames
	• W: 4–6 frames
	• NW: 4–6 frames
Use a consistent sprite cell size based on the subject's dimensions.
Do not force every character or animal into a 32 × 32 px canvas.

7. LIGHTING AND SHADING
	• Use a consistent top-left light source.
	• Apply pixel-based highlights and shadows.
	• Maintain consistent lighting across all directions and actions.
	• Use subtle ambient occlusion where appropriate.
	• Avoid realistic photographic lighting.
	• Keep the visual appearance consistent with a cozy isometric RPG park.

8. WEB-BASED MULTIPLAYER COMPATIBILITY
These assets are intended for browser-based multiplayer games.
They must be independent of any specific game engine.
Requirements:
	• Standard transparent PNG format.
	• Compatible with HTML5 Canvas and WebGL-based rendering.
	• Suitable for browser sprite-sheet rendering.
	• Consistent frame dimensions and alignment.
	• Crisp pixel rendering at integer scaling factors.
	• No unnecessary image filters or smoothing.
	• Static graphics must remain separate from dynamic game logic.
	• Assets must be reusable across multiple browser clients.

9. OUTPUT FILES
Static Objects
Provide:
	• One combined 8-direction sprite sheet.
	• Eight individual directional PNG files.
Human Characters and Animals
Provide:
	• One sprite sheet per requested action.
	• Individual directional sprite sheets where practical.
	• Individual PNG files for each animation frame.
	• Consistent filenames identifying action, direction, and frame.
Example naming:
cat_idle_N.png
cat_walk_N_01.png
cat_walk_N_02.png
cat_walk_NE_01.png
cat_sit_S.png
cat_lie_W.png
Use transparent backgrounds for all files.

10. FINAL QUALITY CONTROL
Before finalizing, verify:
	1. Correct subject category was identified.
	2. All 8 directional views are included.
	3. All requested actions are included.
	4. Animation frames are consistent.
	5. Character or animal identity is preserved.
	6. Camera perspective is consistent.
	7. Pixel art style matches the global art direction.
	8. Object and character scale is appropriate.
	9. No sprite is cropped or overlapping.
	10. Background is transparent.
	11. Sprite sheets and individual PNGs are organized correctly.
If the requested output exceeds image generation limitations, split the work into multiple sprite sheets rather than reducing quality or omitting directions.
FINAL GOAL:
Create a complete, consistent, production-ready 2D isometric 32-bit RPG pixel art asset collection for a browser-based multiplayer park game.
