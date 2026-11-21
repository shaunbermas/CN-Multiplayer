# ADR 0001: Kinematic server movement for now; Rapier deferred

Status: ACCEPTED for M0 / Stage 01 (21 November 2026). Revisit at The Factory or The Hollow Bridge.

## Context

GDD §7.7 asks M0 to compare a lightweight server-side kinematic controller with a shared physics engine
such as Rapier, and pick the simplest option that reliably validates movement for the first stages.
Stage 01 is a flat yard: no jumping (spec M6), no slopes, no moving platforms. Walls are axis-aligned.

## Decision

Use a small deterministic kinematic step shared by server and client (`packages/shared/src/movement.ts`):

- acceleration and deceleration from the spec (0.15 s to full speed, 0.12 s to stop), speed capped at 4 m/s
- player = circle of radius 0.3 m on the ground plane; walls = axis-aligned rectangles from
  `STG01_collision.json`; push-out with velocity projection
- fixed 30 Hz step; the server runs it on queued client inputs with a token bucket (one step per tick
  sustained), so a client cannot move faster than real time
- the client runs the same function for prediction and replays unacknowledged inputs on each server
  update

## Consequences

- Server cost is tiny: 30 players at 30 Hz averaged 0.1 ms per tick (`tests/reports/load-30-clients.json`).
- Server and client agree exactly (prediction error 0.000 m in the two-browser test).
- Not enough for moving platforms, rotating hazards, slopes or jumping. When the first such stage starts,
  re-run this comparison with Rapier (`@dimforge/rapier3d-compat`) on the server, keeping the same
  input/ack protocol.
