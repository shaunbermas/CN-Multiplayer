# Acceptance Checklist — Shared Contestant System

## Design / modeling
- [ ] Supplied reference is included and reviewed.
- [ ] Canonical design keeps hooded silhouette, dark face opening, white geometric emblem, gloves, chunky boots and long coat.
- [ ] Coat is a fully modeled garment with layered panels, raised collar, seams, cuffs, belt/buckle, pockets, hem thickness and believable folds.
- [ ] Coat details read at gameplay camera distance.
- [ ] Front, 3/4 front, side, 3/4 rear and rear turnaround renders are supplied.
- [ ] No third-party franchise logo or exact character reproduction is introduced.

## Shared asset architecture
- [ ] Exactly one canonical geometry set is used by all contestants.
- [ ] One shared skeleton and animation library.
- [ ] 30 colorway records exist.
- [ ] No 30 duplicated high-resolution texture sets.
- [ ] All 30 players use shared cached model/texture assets.
- [ ] Colorway assignment is stable through reconnects.

## Movement
- [ ] Idle, walk, run, start/stop, jump, landing, dive (if used), push/pull, stumble, fall, recovery and victory clips exist or are mapped to existing clips.
- [ ] Run/walk feel is bouncy and playful, with original animation.
- [ ] Foot sliding is controlled.
- [ ] Coat does not clip severely during locomotion and action poses.
- [ ] Animation does not modify server-authoritative player position.

## Web / performance
- [ ] LOD0, LOD1 and LOD2 are implemented or an equivalent documented strategy is used.
- [ ] GLB loads in the existing browser game.
- [ ] 30 contestants can be displayed at once.
- [ ] 30 variants are visually distinguishable in Stage 01 lighting/fog.
- [ ] Download size, texture memory, geometry memory, draw calls, load time and frame time are measured before and after.
- [ ] Multiplayer movement, collisions, elimination and reconnect behavior still work.
- [ ] No test is marked passed without execution evidence.

## Deliverables
- [ ] `.blend` source file.
- [ ] `.glb` browser asset.
- [ ] Shared textures and material documentation.
- [ ] Colorway data file.
- [ ] Animation clips and manifest.
- [ ] Blender scripts, if used.
- [ ] Browser integration changes.
- [ ] Turnaround and coat-detail renders.
- [ ] Animation preview.
- [ ] Performance comparison and validation report.
