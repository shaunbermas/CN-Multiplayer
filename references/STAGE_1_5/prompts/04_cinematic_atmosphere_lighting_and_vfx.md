# PROMPT 04 — Cinematic Atmosphere, Lighting and VFX

Continue CN TRIAL Stage 1.5. Apply cinematic atmosphere to the approved Stage 01 environment without reducing gameplay readability or browser performance.

## Add / refine
- sky and distant cloud layers;
- moon and restrained stars if compatible with the chosen time of day;
- layered distance fog and subtle height fog;
- limited ground-hugging mist;
- restrained dust / airborne particles;
- key, fill and rim lighting;
- amber industrial practical lights;
- red / green signal lighting and emissive response;
- water / puddle reflections and controlled bloom;
- subtle color grading and post-processing.

## Visual hierarchy
The foreground contestants, ground, obstacle silhouettes and Watcher must remain readable. Fog and bloom must never obscure the red/green signal, contestant movement or detection cues.

## Performance constraints
- Prefer shader-based / layered fog over numerous expensive volumetric lights where practical.
- Bake static lighting where appropriate.
- Limit dynamic shadow-casting lights and shadow distance.
- Use sparse particles and control transparency overdraw.
- Provide a low-effects fallback for weaker desktop hardware.
- Keep effects synchronized only where gameplay requires it; game state remains server-authoritative.

## Deliverables
Lighting rig / configuration, sky and cloud assets, fog settings, VFX presets, red/green signal presentation, quality tiers, screenshots at gameplay camera positions, GPU / frame-time comparison and validation report. Stop for approval before final color-grade lock.
