# PROMPT 05 — Stage 01 Obstacle Twist

Design and prototype a small optional twist for CN TRIAL Stage 01: Red Light, Green Light.

## Core rule remains locked
Green Light permits movement. Red Light requires every contestant to stop. Server-authoritative movement validation and elimination remain unchanged.

## Candidate obstacle types
- static offset barricades that create a clear route choice;
- a low swinging / rotating panel active during Green Light and paused during Red Light;
- simple barrel / crate cover props that affect navigation but are not complex destructible physics.

Do not add every candidate automatically. Evaluate readability, fairness for 30 players, camera visibility, collision cost, network complexity and accessibility. Propose one or two best options and request approval before detailed production.

## Build sequence
1. Create a graybox prototype and top-down diagram.
2. Define collision and safe-clearance widths for 30 contestants.
3. Define timing, movement and hazard states.
4. Ensure obstacles pause safely during Red Light if movement could cause accidental elimination.
5. Validate server-authoritative state and collision handling.
6. Test congestion, spawn blockage, unfair lane advantage and camera obstruction.
7. Integrate approved low-poly models, LODs and VFX.

## Restrictions
- Do not require a new crouch / crawl input unless separately approved and supported by the existing control system.
- Do not add another enemy.
- Do not change Watcher behavior or the core Red Light / Green Light rules.
- Do not add complex destructible or rigid-body systems without performance evidence.

## Deliverables
Approved obstacle specification, graybox, asset models, collision setup, server rules, screenshots, multiplayer test results and a rollback switch / config flag.
