# CN TRIAL — Stage 1.5 Production Plan

**Milestone:** Stage 1 visual polish, content completion, UI/UX completion and optimization  
**Position in pipeline:** After Stage 01; before Stage 02 (Tug of War)  
**Target:** Desktop browser, private rooms, guest access, up to 30 contestants  
**Stage:** Red Light, Green Light  

## 1. Purpose

Stage 1.5 turns the already-built Stage 01 prototype into a polished, content-complete and performance-validated browser-game stage. It is not a new stage and it is not a redesign of the game concept.

The work covers:
- Polish the existing arena while preserving its approved playable layout and working Stage 01 mechanics.
- Build a layered matte-painted world around the playable arena.
- Replace repetitive distant tree geometry with transparent PNG cutouts / billboard assets; retain optimized 3D trees only where players can approach or see parallax clearly.
- Improve the ground, fences, towers, playground structures, props, sky, clouds, stars, moon, fog, lighting and atmospheric effects.
- Integrate the **already-finalized 30 contestant designs** from the supplied character-bible references and existing approved project assets.
- Retain and polish the already-approved full-body robotic doll enemy, **The Watcher**, without redesigning it.
- Complete and polish the game UI/UX.
- Add a small, carefully balanced Stage 01 obstacle twist without changing the core Red Light, Green Light rule.
- Reduce polygons, texture weight, draw calls, overdraw and asset-loading cost, then test the complete 30-player experience.

## 2. Locked decisions: do not change these

### 2.1 Final 30 contestants are locked

The six images in `references/FINAL_CHARACTER_BIBLE_LOCKED/` are supplied by the project owner as the final character-bible / contestant-roster references. Treat them as protected visual source material.

**Claude must not:**
- Invent, add, delete, replace or redesign any contestant.
- Change a character's silhouette, head shape, face, hair, mask, costume, color palette, footwear, accessories or identity.
- Create new costume variants, alternative designs or “improved” interpretations.
- Substitute generic Squid Game-style tracksuits or newly invented characters.
- Use the UI concept board's placeholder silhouettes or generated thumbnails as contestant design references.

**Claude must:**
- First inspect the current project for the already-approved 30-character roster manifest, character IDs, names, models and asset paths.
- Reuse existing finalized 3D models if they already exist.
- If a finalized design exists only as a 2D reference, create its 3D model by faithfully translating that exact approved design, not by redesigning it.
- Preserve all 30 identities and map each final character to a stable ID.
- Keep the source images unchanged and never overwrite them.

### 2.2 Roster-source conflict checkpoint

The six supplied boards visually contain different roster/name versions and different detailed-character examples. They are all retained unchanged as final project references, but they are not a single identical roster sheet. Therefore, Prompt 01 must inspect the existing project and identify which 30-character ID/name manifest is already approved and in use.

If the repository does not contain a clear canonical 30-character manifest, or if the existing character files disagree with the supplied sheets, **stop before character modeling or renaming**. Produce a discrepancy report listing the exact conflicting IDs/names/files and request the owner to identify the master mapping. Do not merge rosters or choose silently.

This checkpoint does not authorize changing the visual designs. It protects them.

### 2.3 The Watcher is locked

Use the currently approved full-body, free-standing robotic doll version of The Watcher from the existing Prompt 06 outputs. No tower-mounted version, no new enemy, and no character redesign. Stage 1.5 may refine materials, rig, animations, VFX and integration only if these changes preserve the approved model identity.

### 2.4 Existing Stage 01 gameplay is locked

Do not break or silently alter:
- Green Light = contestants may move.
- Red Light = contestants must stop.
- Movement validation and eliminations remain server-authoritative.
- Existing start/finish zones, spawn positions, collision boundaries and Stage 01 layout remain authoritative unless a documented issue is approved for correction.
- The Watcher remains the Stage 01 detection enemy.

Any gameplay twist must fit around these rules.

## 3. Visual and technical strategy

### 3.1 Three-layer environment

| Layer | Content | Preferred implementation |
|---|---|---|
| Foreground / playable | Ground, contestants, Watcher, nearby fences, obstacles, nearby playground pieces | Real-time 3D geometry and PBR materials |
| Midground | Observation towers, nearby industrial buildings, overpass sections, nearby trees, floodlights | Optimized modular 3D, instancing and selected billboards |
| Background | Distant forest, hills, factories, skyline, far overpass, distant trees and cloud banks | Panoramic matte painting, skybox / sky dome and transparent PNG cutouts |

Matte painting and cutouts are scenery only. They must not replace playable geometry or create false collision surfaces. Test parallax and camera rotation so the world does not look like a flat card.

### 3.2 Tree strategy

- Distant trees: transparent PNG cutouts on camera-facing or carefully oriented billboard planes.
- Tree clusters: small atlases or crossed billboards where the camera can rotate without revealing obvious flat edges.
- Mid-distance trees: low-poly 3D variants or impostors, selected by camera distance.
- Foreground / reachable trees: optimized 3D models with appropriate collision only if gameplay needs it.
- Use alpha clipping / alpha hash where visually acceptable; avoid large amounts of blended transparency because of overdraw.
- Use mipmaps and appropriate texture compression. Do not use a high-resolution unique texture for every tree.

### 3.3 Atmosphere and lighting

- Dark teal / blue environment base, with restrained violet dusk and warm amber industrial practical lights.
- A composed sky with clouds, moon and optional stars where appropriate to the scene's time of day.
- Layered distance fog and subtle height fog; volumetric effects only where the renderer and target hardware can sustain them.
- Ground-hugging mist in limited areas, subtle dust and environmental particles.
- Clear key / fill / rim-light hierarchy. Preserve gameplay visibility and readable red/green signals.
- Use baked or precomputed lighting for static elements when practical; limit dynamic shadow-casting lights.
- Avoid excessive post-processing, bloom, film grain, transparent particles or screen-space effects that obscure contestants.

### 3.4 Ground and foreground focus

Prioritize the playable ground, player silhouettes, obstacles and The Watcher. Improve asphalt / concrete / dirt, lane markings, puddles, roughness variation, cracks, debris, drainage, decals and reflections using optimized PBR maps and shared materials. Maintain traction and collision behavior consistent with game physics.

### 3.5 Gameplay twist

Prototype one or two optional low-cost obstacles, not a new game mode. Candidate set:
- Static offset barricades that create a readable route choice.
- A low swinging / rotating panel that is active during Green Light and pauses during Red Light.
- A simple barrel / crate cover obstacle for navigation, not a physics-heavy destructible system.

The core rule remains unchanged. Do not require a new crouch / crawl control unless it is explicitly approved and implemented consistently. All obstacles must have server-authoritative collision / state where they can affect qualification or elimination. Add them only after a graybox test and balance approval.

## 4. Final UI/UX scope

The included UI concept board is for composition and style direction only. It contains placeholder character slots and generated environmental imagery; it is **not** a character reference or a pixel-perfect functional specification.

Required desktop-first UI flow:
1. Main menu / title screen (CN TRIAL branding).
2. How to Play / controls.
3. Settings (audio, graphics, controls, accessibility basics).
4. Create private room / join room.
5. Invitation code and copy-link state.
6. 30-slot lobby, ready state, host controls and countdown.
7. Character selection using the locked final 30 character assets.
8. Countdown transition into Stage 01.
9. In-game HUD: stage name, timer, signal state, objective, alive / eliminated count, connection indicator and controls.
10. Red Light detection feedback and elimination notification.
11. Spectator UI for eliminated players.
12. Stage results, qualified / eliminated count, rankings and Next Stage / Exit.
13. Reconnect / connection-lost / room-closed states.

Ensure text contrast, safe margins, keyboard focus, scalable layouts, and that the HUD does not obscure the gameplay camera. The final UI must use actual game state, not hardcoded preview numbers.

## 5. Character integration scope

- Exactly the final 30 contestants. No new characters.
- Preserve character names, IDs, silhouettes, costumes and accessories from the canonical approved roster in the project.
- Reuse existing character models where available.
- If a character is not modeled yet, model only that approved character from the locked reference, with no concept changes.
- Use a shared humanoid rig / animation set only where compatible with the approved proportions and clothing. Do not distort characters to force a one-size-fits-all rig.
- Required gameplay animations should include the already-approved set used by the current project: idle, walk/run, jump, fall/stumble, hit/elimination and victory; add others only if the existing control scheme requires them.
- Use LODs and optimize materials without changing the character's visible design.
- Character selection must display the correct locked character assets and map them to stable IDs.
- The Watcher is a separate approved enemy asset and is not counted among the 30 contestants.

## 6. Performance strategy

Measure before optimizing. Record a Stage 01 baseline, then compare each change.

Focus areas:
- Reduce repeated distant geometry using matte painting and PNG cutouts.
- Use instancing for repeated props, lights, fences, barriers and repeated environment details where appropriate.
- Use LOD0 / LOD1 / LOD2 or impostors for environment assets and characters as distance allows.
- Share materials and texture atlases.
- Compress GLB meshes and textures using tools compatible with the project pipeline (e.g. Meshopt / Draco for geometry where appropriate, KTX2 / Basis for textures where supported).
- Use frustum culling, distance culling and sensible shadow distances.
- Limit real-time dynamic lights and shadow maps.
- Keep transparent effects sparse; control overdraw.
- Optimize fog and post-processing for desktop browser GPUs.
- Avoid loading all high-resolution assets before they are needed; use staged / lazy loading.
- Test 30 visible contestants, The Watcher, obstacles, UI, effects and networking together.

Performance targets are provisional until measured on named reference hardware. Claude must report actual frame time, FPS, memory, draw calls, triangles, texture memory, initial download size, stage asset download size, load time, server tick / state update behavior, and network latency. Do not claim success based on estimates.

## 7. Stage 1.5 eight-prompt sequence

1. Preflight audit, protect the existing Stage 01 build, lock visual references and confirm the canonical 30-character manifest.
2. Matte-painted surrounding world, sky/backdrop, distant environment and tree-cutout asset plan / production.
3. Foreground and midground environment polish, including ground, fences, towers, playground props and tree LOD strategy.
4. Cinematic atmosphere: sky, clouds, moon/stars if appropriate, fog, lighting, color grading, particles and controlled post-processing.
5. Obstacle twist: graybox, collision, server-authoritative state and gameplay balance approval.
6. Integrate the final 30 contestant models and the already-approved Watcher; preserve every character design.
7. Complete and implement the full CN TRIAL UI/UX flow using the UI concept board as layout/style guidance only.
8. Performance optimization, 30-player multiplayer QA, visual/gameplay QA, regression testing and Stage 1.5 sign-off.

Do not proceed to Stage 02 until all Stage 1.5 acceptance criteria are met or explicitly waived by the owner.

## 8. Stage 1.5 definition of done

- Existing Stage 01 game still works and core rules are unchanged.
- Environment has a coherent foreground / midground / background composition.
- Matte painting and tree cutouts are integrated without visible camera gaps or false collision.
- Ground, props, materials and lighting are polished.
- Fog, sky, clouds, moon/stars and particles are tuned without obscuring gameplay.
- Approved obstacles are playable, fair and server-authoritative where necessary.
- All 30 final characters are present, correctly mapped and visually unchanged.
- The approved Watcher is correctly integrated and visually unchanged except approved polish.
- Main menu, lobby, character select, HUD, elimination, spectator, results, settings and connection states are complete.
- Actual 30-player test completed and results documented.
- Performance baseline and optimized metrics documented.
- No critical regressions, missing assets or console errors.
- Final source files, build, screenshots, manifests and QA report delivered.
- Stage 1.5 is frozen before Stage 02 begins.
