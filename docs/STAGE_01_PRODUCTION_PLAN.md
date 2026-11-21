# Stage 01 production plan: Red Light, Green Light

Status: v0.1 PROPOSED, 21 November 2026. Awaiting owner approval. Nothing in this plan has been built.

Sources: `docs/GAME_DESIGN_DOCUMENT.md` (GDD v0.1: §2.3, §3 Stage 01, §4.4, §9.5, §10, §11, §15–16),
`docs/REFERENCE_MANIFEST.md`, `docs/BLENDER_PIPELINE.md`.

## 1. What Stage 01 is (from the GDD; not changed here)

| Field | GDD definition |
|-------|----------------|
| Role | Opening reaction / movement trial; round 1 of 7; first vertical-slice stage |
| Players | 30 target starters, 22 target qualifiers; must scale to smaller rooms with a minimum of 2 qualifiers when at least 2 start |
| Loop | Cross a large outdoor yard. Move on green, stop on red. Cross the finish line before time expires to qualify |
| Fail | Moving above an approved tolerance during red → eliminated. Server validates motion and accounts for latency. Still on the field at time-out → not qualified |
| Observer | Giant mechanical observer that turns, scans and signals. May be a large animated prop, not a roaming enemy |
| Environment | Large yard, start zone, finish gate, observer platform, cover-free lanes, side dressing, distant silhouettes |
| Authority | Server owns signal state, motion validation, finish detection, elimination and results |
| Done (GDD §16) | Host creates a room, 2+ guests join by link, players move in the same 3D stage, Stage 01 runs with server-owned rules, eliminated players spectate, server declares correct qualifiers |

## 2. Dependencies outside Stage 01

Stage 01 cannot be finished in isolation. The GDD milestone order applies (§10, §15.4):

| Milestone | Needed for Stage 01 because |
|-----------|-----------------------------|
| M0 Technical spike | Repo structure, pinned versions, one Blender GLB rendered in the browser, two clients in one Colyseus room, 30 simulated clients, physics choice (Rapier vs kinematic), **hosting decision** |
| M1 Graybox core | Third-person controller, camera, collision, one greybox arena; Stage 01's greybox can be that arena |
| M2 Private room | Room, invite link, guest join, presets, ready, host, capacity 30 |
| M3 First playable stage | This plan's gameplay phases |
| M4 30-player slice | Stage 01 is the stage used to prove 30 players |

## 3. Phases and gates

Each phase ends at a gate. The next phase starts only after the owner signs off the gate.

| Phase | Work | Owner inputs needed | Gate |
|-------|------|---------------------|------|
| **S1-0 References and decisions** | Resolve manifest conflicts C1–C5; supply or approve Stage 01 references (overview, layout, environment, observer turnaround); pick base setting (night yard vs dusk field) | Decisions and images | Manifest shows the Stage 01 slots APPROVED or explicitly waived |
| **S1-1 Stage 01 spec** | Write `docs/STAGE_01_SPEC.md`: every number in §5 with a chosen starting value, the signal state machine, elimination and spectator presentation, audio cue list, HUD list | Approve values | Spec approved; no TBD left that blocks greybox or server rules |
| **S1-2 Greybox in Blender** | `build_stg01_greybox.py` builds primitives only from the spec JSON: ground, start zone, finish gate, observer platform, a box-and-cylinder observer placeholder, bounds, `COL_` proxies, 30 `GMK_SPAWN_` markers; export GLB + collision + marker JSON; validation report; preview renders | Review renders | Validation passes; layout matches spec in metres |
| **S1-3 Greybox in the browser (with M1)** | Load the greybox in Three.js / R3F with a capsule contestant and the third-person camera; test sightlines to the observer from every spawn; walk the course and time it at the spec speed | Play it | Owner confirms the space reads; measured crossing time is within the spec target |
| **S1-4 Server rules (with M0, M2)** | Signal state machine, red-window motion validation with latency handling, finish detection, timer, qualification scaling, elimination, results, spectator hand-off; automated tests (§7) | None beyond spec | Tests pass; a small real-browser group plays a full round to results |
| **S1-5 Observer** | Original observer design approved (C5) → turnaround → model, simple rig (head and torso turn, signal parts), clips `idle`, `turn_to_red`, `scan`, `turn_to_green` | Design approval | Validation passes; turn timing matches server state; reads at full field distance |
| **S1-6 Art pass** | Environment kit from the approved environment reference: ground materials, start and finish structures, floodlight masts or chosen dressing, background silhouettes as cards, fog, lighting (baked where possible) | Art approval | Owner approves screenshots at gameplay distance; budgets in `BLENDER_PIPELINE.md` §9 met |
| **S1-7 30-player readability and performance (M4)** | 30 contestants on screen on the reference desktop; reduced-quality preset; 30-client load test | Reference hardware | GDD §8 targets met under agreed conditions; test report recorded (GDD §15.1 rule 10) |

Phases S1-2 to S1-4 use placeholders only. Final art (S1-5, S1-6) does not start until S1-4 has proven
the round (GDD §10.1: "prove it with real clients before building the full roster").

## 4. Stage 01 asset list

| ID | Asset | Phase | Notes |
|----|-------|-------|-------|
| `STG01_RedLightGreenLight.blend` | Stage scene | S1-2 | Collections per `BLENDER_PIPELINE.md` §5 |
| `COL_STG01_*` | Ground, boundary walls, finish trigger volume, observer platform | S1-2 | Primitives; exported as `STG01_collision.json` |
| `GMK_SPAWN_01–30`, `GMK_FINISH`, `GMK_OBSERVER`, `GMK_BOUNDS`, `GMK_SPECTATOR_01–n` | Gameplay markers | S1-2 | Exported as `STG01_markers.json` |
| `ENM_Observer` (placeholder, then final) | Observer | S1-2 / S1-5 | Name pending C1 |
| `PRP_STG01_FinishGate`, `PRP_STG01_StartLine`, `PRP_STG01_ObserverPlatform` | Gameplay-relevant props | S1-6 | Must read clearly; no decorative geometry with collision |
| Side dressing (masts, banners, fences, or field elements, per C2) | Decorative props | S1-6 | No collision; instanced |
| Background silhouettes, sky, fog | Environment | S1-6 | Low-poly cards |
| `VFX_SignalSweep`, signal-change VFX, elimination VFX | Effects | S1-5 / S1-6 | No gore (GDD §4.4) |
| `CHR_Contestant_Base` + 3 presets | Characters | Parallel track (GDD §9.5 item 1) | Capsule placeholder until then |
| Audio: green, warning, red, scan, finish, eliminated, ambient | Audio | S1-6 | Original or licensed (GDD §5.4) |

## 5. Numbers the spec must fix (PROPOSED test ranges)

The GDD leaves these open. The ranges below are **starting points for the greybox test, not design
decisions**; S1-1 replaces them with owner-approved values. Making every value a spec parameter means
tuning never needs a rebuild.

| Value | Proposed starting range | Reasoning |
|-------|-------------------------|-----------|
| Contestant capsule | Height 1.2 m, radius 0.3 m | Small characters in an oversized world; shared by all presets (GDD §2.6) |
| Walk speed | 3.5–4.5 m/s | Weighty but responsive (GDD §2.6); sprint off in Stage 01 unless the spec enables it |
| Field length (start line to finish) | Derived: `length ≈ walk speed × expected green time to finish`. Example: 4 m/s × 45 s of green ≈ 180 m | Hits the 2–3 minute round target (GDD §2.4) with room for mistakes |
| Field width | 50–60 m | 30 spawns at about 1.5 m spacing plus margins; "cover-free lanes" |
| Round timer | 120–150 s | GDD §2.4 opening reaction 2–3 min including briefing |
| Green duration | Random 3–6 s, seeded | Unpredictable but fair |
| Warning before red | 0.6–1.0 s audio + visual cue | "Readable danger" pillar |
| Red duration | 3–5 s | |
| Red grace window | 0.3 s + measured one-way latency, capped | Avoids false eliminations from latency (GDD §7.3, §11.1) |
| Red movement tolerance | Speed above about 0.3 m/s, or displacement above about 0.15 m, after the grace window | Camera turning and idle animation never count (GDD §11.1) |
| Qualification | 22 of 30 (≈ 73 %), minimum 2; ties by server-recorded finish time | GDD §2.3; percentage is tunable |

## 6. Feedback, readability and UI

Based on the project game-design skill and GDD §5–6.

- **Red and green never rely on colour alone** (GDD §5.2, §6.4): each change uses at least three
  channels: observer pose (turned away vs facing), a distinct sound, a HUD icon and word, plus colour
  and light. Affordance cues (81).
- **Telegraph red** with a warning cue before the turn so a stop is a skill, not luck. Fairness (5).
- **Explain the rule before the countdown**, in one sentence plus one icon in the briefing.
  Advance organizers (80); Don't make me think (91).
- **Juice is local presentation only.** No hit-stop or time-scale change in a networked round; the
  server clock never pauses. Camera shake only for the local player's own elimination, with the
  reduced-shake setting.

| Event | Tier | Channels |
|-------|------|----------|
| Green | small | Sound, observer turns away, HUD "GO" |
| Warning before red | small | Rising sound, observer starts to turn, HUD flash (≤ 3 flashes/s) |
| Red | medium | Sound, observer faces players, scan light, HUD "STOP" |
| Another player eliminated | small | Short sound, that player's elimination animation |
| You are eliminated | medium | Elimination animation, light camera shake (setting-scaled), "ELIMINATED" state, then spectator |
| You qualify | medium | Finish sound, "QUALIFIED" state, camera hold |

HUD (GDD §6.3): timer and objective at the top; signal state at top centre with icon + word;
qualified counter (for example 14 / 22); centre of the screen kept clear.

## 7. Tests for Stage 01 (from GDD §11)

| Test | Pass condition |
|------|----------------|
| Signal state machine | Seeded sequence reproduces exactly; no red without a warning cue |
| Red detection | Moving during red after the grace window eliminates; standing still with camera movement does not; tested at 0, 50, 150 and 300 ms simulated latency |
| Finish | Crossing the finish volume qualifies once; finish order recorded by server time |
| Qualification scaling | Correct qualifier counts for 2, 4, 8, 16 and 30 starters; never 0 qualifiers when 2+ start |
| Time-out | Players still on the field are not qualified; results are frozen |
| Forged messages | Client "I finished" or position jumps are rejected |
| Spectator | Eliminated players cannot re-enter or move; they see active players and the timer |
| 30 players | 30 clients complete the round under agreed conditions (M4) |

## 8. Risks specific to Stage 01

| Risk | Impact | Response |
|------|--------|----------|
| **Hosting.** The repo's deploy pipeline targets Cloudflare Workers, but Colyseus needs a long-running Node.js WebSocket server, which a Worker cannot run | M0 cannot finish without a decision | Decide in M0. Options: (a) static client on Cloudflare, Colyseus on Cloudflare Containers; (b) static client on Cloudflare, Colyseus on a separate Node host; (c) replace Colyseus with Cloudflare Durable Objects. Option (c) changes the GDD's technology and needs the owner's approval |
| **Originality of the observer** (manifest C5) | Legal review failure at M10; costly remodel | Original design before S1-5 |
| False eliminations from latency | Players feel cheated; core pillar fails | Grace window, server timestamps, latency tests (§7) |
| 30-player GPU cost on a large open field | Below 30 FPS on weaker desktops | Budgets in `BLENDER_PIPELINE.md` §9; instancing; profile in S1-7 |
| Field too long or too short | Round drags or ends in seconds | Parametric greybox; timed walk test in S1-3 |
| Observer not visible from all spawns | Unreadable signal | Sightline test in S1-3 |

## 9. Exact next steps after approval

1. Owner: answer the decisions in §10 below.
2. Claude: write `docs/STAGE_01_SPEC.md` (S1-1) with the approved numbers, and `docs/DECISIONS.md`
   for the decision log (GDD §15.1 rule 8).
3. Claude: add `pip install bpy==<pinned>` to the cloud environment setup and write
   `blender/scripts/build_stg01_greybox.py`, `export_stage.py` and `validate_asset.py`; run them; commit
   the greybox `.blend`, GLB, JSON and validation report (S1-2).
4. In parallel, M0: scaffold `apps/web`, `apps/server`, `packages/shared` with pinned versions; connect
   two browser clients to one Colyseus room locally; load the greybox GLB in the browser.

## 10. Decisions needed from the owner

| # | Decision | Default if you agree |
|---|----------|----------------------|
| D1 | Stage 01 figure name (C1) | `ENM_Observer` |
| D2 | Stage 01 base setting (C2) | G1 night floodlit yard |
| D3 | Original observer design to replace the doll look (C5) | Yes, before S1-5 |
| D4 | Approve G1 and G2 as mood-only global references | Yes, mood only |
| D5 | Who supplies the missing Stage 01 references (artist, AI concept tool, or Claude-written spec instead of a layout image) | Layout from the written spec; images for environment and observer |
| D6 | Blender version on your desktop (or none yet) | Pin 5.3.x |
| D7 | Hosting approach for the Colyseus server | Decide in M0 after a short comparison |
| D8 | Git LFS for `.blend`, `.glb` and textures | Yes, after a quota check |
