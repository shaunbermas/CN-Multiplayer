# CN TRIAL · Stage 1.5 known-issues register

| # | Severity | Issue | Impact | Owner action / next step |
|---|----------|-------|--------|--------------------------|
| K1 | **Blocker for "30 final characters"** | No canonical 30-character roster: the six locked boards show six different rosters, and the project had no roster or character asset. Two boards call the style "Little Nightmares inspired", and their hero closely matches that game's protagonist | No contestant models, selection thumbnails or character ID sync. Players remain coloured capsule placeholders | Decide the canonical roster and the originality question (`docs/CHARACTER_ROSTER_DISCREPANCY_REPORT.md` §4) |
| K2 | High (verification gap) | No real-GPU measurements: every frame-rate figure comes from software WebGL (SwiftShader) on a 4-core cloud machine with no GPU | Smoothness on players' computers is not proven. The adaptive fallback is tested only on software rendering | Run the game on named reference hardware (one mid-range laptop, one desktop) and record FPS, frame time and 1 % lows |
| K3 | Medium (verification gap) | 30 **real** players were not tested together: the 30-player test uses 5 real browsers and 25 simulated clients | Congestion through the obstacle gaps and 30-human behaviour are untested | A team playtest with 20–30 people |
| K4 | Medium | No audio exists in the game | No sound cues for signals or eliminations (visual cues only) | A future audio pass (the GDD lists the sounds) |
| K5 | Low | No true height fog or baked lightmaps (see the Prompt 04 report) | The low-lying mist is approximated with mist sheets and painted haze | Acceptable; revisit with a renderer upgrade |
| K6 | Low | The obstacle twist is off by default (the host ticks it) | Players see it only when the host enables it | Owner decides whether it should become the default |
| K7 | Low | Reconnecting after a drop rejoins as a new player (mid-round: watches until the next round) | A dropped player loses their run for that round | Session resume would need a protocol change; out of Stage 1.5 scope |
| K8 | Info | `?quality=` and the test hooks (`window.__cnView`, `__cnSignalHold`) exist for testing | They only change what one client sees, never server decisions | — |
| K9 | Info | Stage 1.5 is **not deployed** (branch `claude/stage-1-5`, held in a PR). Merging to `main` deploys publicly; the owner's Stage 1.5 brief requires their authorisation | The live site still runs Stage 01 (plus PR #17's High default once merged) | Owner reviews and approves the merge |
