# MASTER PROMPT — CN TRIAL Shared Contestant Character System

You are the lead character artist, Blender technical artist, rigging artist, animation engineer, and web-game performance engineer for CN TRIAL.

## OBJECTIVE

Revise the contestant character system so the game uses **one canonical, detailed 3D contestant model** with **30 selectable color/material variants**. This replaces the previous plan to build 30 individually modeled contestant characters.

The attached reference image is the visual direction for the canonical character:
- Oversized rounded hood with a deep, shadowed face opening.
- Simple, unreadable/dark face area with a bold, clean white geometric emblem on the faceplate.
- Short, stylized body proportions.
- Long, highly detailed dark coat with a raised collar, layered construction, seams, paneling, belt, buckle, pockets, cuffs, and substantial hem.
- Gloves and chunky boots.
- A clean, consistent front / three-quarter / side / rear silhouette.

Treat the uploaded image as a design reference, not as permission to reproduce any third-party character exactly. Build an original CN TRIAL contestant identity using the general hooded-uniform concept and the specific construction notes below. Do not add recognisable franchise marks, costumes, or character details.

## NON-NEGOTIABLE DESIGN PRIORITY: THE COAT

The coat is the defining visual feature and should account for roughly 90% of the character's perceived visual identity. This means the coat receives the majority of modeling, material, texture, and detailing effort. It does NOT mean the coat should literally occupy 90% of the polygon budget.

Make the coat a genuinely modeled garment, not a flat texture or a simple cone:
- Distinct hood-to-shoulder transition and raised collar.
- Layered front opening / overlapping coat panels.
- Readable lapel or storm-flap construction.
- Tailored shoulder and sleeve volume.
- Elbow articulation that deforms cleanly.
- Cuffs, seams, topstitching, reinforced panels, subtle piping.
- Functional-looking belt, buckle, strap anchors, and restrained utility pockets.
- Separate front coat panels / tails with controlled secondary motion.
- Visible hem thickness and believable garment folds.
- High-quality fabric surface: woven roughness, subtle wear, edge abrasion, stitch details and restrained dirt.
- Avoid noisy micro-detail that disappears at gameplay camera distance.
- Ensure the coat silhouette remains readable from front, side, rear and three-quarter views.

Model the hood and coat carefully. The face opening should remain dark and visually simple. The white geometric face emblem must be a clean, readable, separate mesh/decal/material element, aligned to the faceplate and easy to replace if the design is updated. Do not invent additional facial features.

## ONE MODEL, 30 COLORWAYS

Create exactly one canonical base mesh and one canonical rig. All 30 contestants must use:
- The same geometry.
- The same UV layout.
- The same skeleton / bone hierarchy.
- The same animation clips.
- The same texture atlas set.
- The same LOD meshes.

Differentiate contestants using 30 material presets / colorways only. Each preset may change coat main color, secondary fabric color, trim, belt accent, and small emissive or identifier accent. Keep the emblem shape, garment design, proportions, and model geometry identical.

Use material parameters, material instances, vertex colors, or a compact palette texture. Do not duplicate texture files for each contestant. Prefer one shared texture set and 30 small material parameter records. Do not use 30 unique high-resolution texture sets.

Color variants must be easy to manage through a single data file, for example:
`contestantColorways.ts` or `contestant-colorways.json`.

Each player should receive a stable colorway ID. Avoid relying on random color assignment that can change on reconnect. Ensure the 30 variants remain visually distinguishable in a dark, foggy environment and remain accessible for common color-vision deficiencies. Use value/brightness and trim differences as well as hue.

## FALL-GUYS-LIKE MOVEMENT FEEL

Movement should feel playful, readable, weighty and responsive, inspired by the broad movement feel of party-platformer games, without copying proprietary animations or character designs.

Implement or adapt original animations for:
- Idle with subtle breathing and coat settling.
- Walk with short, clear steps and gentle body bob.
- Run with quicker short strides, forward lean, stronger arm swing and lively bounce.
- Start / stop transitions.
- Jump takeoff, airborne pose and landing compression.
- Dive / forward lunge if supported by the game mechanics.
- Push / pull for Tug of War.
- Stumble / hit reaction.
- Fall / knockdown and recovery.
- Elimination / spectator transition.
- Victory pose.

Movement requirements:
- The character should have a slightly top-heavy, rounded, charming silhouette.
- Use controlled squash-and-stretch on the body/coat as a secondary animation, not destructive mesh deformation.
- Add subtle coat-tail and hood/collar secondary motion.
- Keep foot planting credible. Avoid visible foot sliding at normal gameplay speed.
- Animation must blend smoothly between idle, walk, run, jump, fall and recovery.
- Movement authority, collision and player position remain server-controlled. Do not let animation alter authoritative gameplay coordinates.
- Use the existing game movement system and input mapping. Do not replace multiplayer movement architecture unnecessarily.

## TECHNICAL PRODUCTION WORKFLOW

### Step 1 — Audit first
Inspect the existing CN TRIAL repository, previous contestant assets, Blender files, GLB exports, rig, animation controller, player spawn system, material pipeline and network representation.

Create a backup / Git checkpoint. Identify where the old 30-character roster is instantiated. Do not delete old assets yet.

### Step 2 — Design lock and proportions
Create a production-ready character specification with:
- Overall height and head/body proportions in meters.
- Front, side, rear and three-quarter orthographic views.
- Coat construction breakdown.
- Material and color palette.
- Rig and deformation plan.
- Gameplay-camera readability checks.

Use the supplied reference image as the visual anchor. If a key design interpretation is ambiguous, document the assumption rather than inventing a different character.

### Step 3 — Build the canonical Blender asset
Create the complete detailed character in Blender:
- `CNTRIAL_CONTESTANT_MASTER.blend`
- Cleanly named mesh objects and collections.
- Separate coat, hood, faceplate/emblem, gloves, boots, belt and accessories where useful.
- One shared UV layout.
- Optimized topology and clean deformation loops.
- Applied transforms, sensible origins and consistent scale.
- Non-destructive source materials and packed/organized textures.
- No hidden duplicate meshes or unused high-resolution assets.

The coat must be the highest-quality modeled component. Prioritize silhouette, garment layering, folds, stitching and material quality.

### Step 4 — Rig and animation
Build one reusable humanoid rig suitable for the stylized proportions and coat. Use clean bone naming and sensible bone roll. Include coat-tail bones or another lightweight secondary-motion solution. Test extreme poses for clipping and deformation.

Create original animation clips for the movement list above. Keep clips reusable by every colorway.

### Step 5 — LOD and web export
Create at least:
- LOD0: close / hero view.
- LOD1: normal gameplay view.
- LOD2: distant crowd view.

Use shared geometry and shared materials. Export:
- `CNTRIAL_CONTESTANT_MASTER.glb`
- Animation clips in the agreed project format, preferably embedded or separately referenced GLB clips if supported by the current pipeline.
- `CNTRIAL_CONTESTANT_MASTER.blend`
- Shared texture maps.
- A machine-readable manifest describing mesh, skeleton, clips, LODs, material slots and scale.

Use the current project’s supported export/import conventions. Do not invent a new pipeline if an existing one works.

### Step 6 — Implement 30 colorway variants
Create 30 stable colorway definitions. Keep the model and textures shared. Add a clear player-to-colorway mapping and persist the assignment through room joins/reconnects.

The 30 colorways are not 30 different characters. They are 30 material configurations on the same character.

### Step 7 — Browser integration
Integrate the canonical GLB and shared animation controller into the existing browser game. Ensure all player entities reference the same cached geometry, textures and animation assets. Use instancing or a shared asset cache where technically appropriate. Ensure each player can display its own colorway without cloning the entire model or texture set.

Keep network state and animation state separate. Replicate only the minimum state needed for remote players, such as movement state, facing, grounded state and action triggers, using the existing network architecture.

### Step 8 — Validate
Test:
- 30 contestants spawned simultaneously.
- 30 distinguishable colorways.
- Animation transitions and foot planting.
- Coat clipping during run, jump, dive, fall and Tug of War poses.
- Character readability under Stage 01 fog and lighting.
- Browser loading and memory behavior.
- Reconnect persistence of colorway assignment.
- No duplicated 30x geometry or texture payload.
- No regression to collisions, movement, elimination or multiplayer synchronization.

## DELIVERABLES

Provide:
1. `CNTRIAL_CONTESTANT_MASTER.blend`
2. `CNTRIAL_CONTESTANT_MASTER.glb`
3. Shared texture set and material documentation.
4. 30-colorway data file.
5. Shared rig and animation clips.
6. LOD0 / LOD1 / LOD2 assets or documented equivalent.
7. Blender generation/build scripts where used.
8. Browser integration code.
9. Character asset manifest.
10. Turnaround renders: front, 3/4 front, side, 3/4 back, rear.
11. Coat close-up renders: hood/collar, chest/front opening, sleeve/cuff, belt/buckle, pocket, hem and fabric surface.
12. Animation preview sheet or video.
13. Performance comparison against the previous 30-character implementation.
14. Validation report with measured results and any unverified tests.

## ACCEPTANCE RULES

- One canonical geometry set, not 30 independently modeled contestants.
- One canonical skeleton and shared animation set.
- Exactly 30 color/material presets.
- Coat visibly receives the majority of art-direction and modeling attention.
- Character reads clearly at normal gameplay camera distance.
- Fall-Guys-like playful movement feel, with original animation work.
- No regression to existing multiplayer gameplay.
- Do not claim performance improvement without measured comparison.
- Do not delete old assets until the new system is integrated, tested and confirmed.

## EXECUTION MODE

Work autonomously through the implementation:
1. Audit and checkpoint.
2. Produce the character spec.
3. Build the canonical model.
4. Rig and animate.
5. Export and optimize.
6. Create 30 material presets.
7. Integrate into the browser game.
8. Validate with 30 players / player representations.
9. Produce final deliverables and report.

Do not stop for routine approvals. If blocked by a genuinely ambiguous approved design decision, destructive migration risk, missing essential asset, credentials or external paid service, document the blocker and continue independent safe work.

Do not stop after writing a plan. Implement the actual Blender asset and browser integration wherever the environment permits. Clearly report anything that could not be executed or tested.
