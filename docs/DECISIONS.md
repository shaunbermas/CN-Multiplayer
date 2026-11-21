# Decision log

Records owner decisions and technical choices (GDD §15.1 rule 8). Newest first. Anything not here is
still PROPOSED or TBD in the GDD and plans.

| # | Date | Decision | Status | Where it applies |
|---|------|----------|--------|------------------|
| 018 | 21 Nov 2026 | Greybox scene structure and names follow Prompt 03: `STAGE_01_GREYBOX.blend`, `generate_stage_01_greybox.py`, collections `00_REFERENCE`–`08_CAMERAS`, `ZONE_`/`REF_` prefixes, `review_only` objects excluded from the game | APPLIED | `docs/STAGE_01_GREYBOX_REPORT.md` |
| 017 | 21 Nov 2026 | **Stage 01 environment design approved** (all of E1–E14 as proposed): playground mood blended into the night floodlit yard; The Shepherd keeps its name; installation option A (figure on platform) with the rocket-frame relic; eerie atmosphere, playful outcomes; start zone 15 m; 22 m floodlight towers at X ±38; 9 m finish gate; violet added to the palette; detection not line-of-sight; camera-only collision; naming additions; mood reference kept out of the repo; row shuffle; gantry, booth, benches and service gates | APPROVED | `docs/STAGE_01_DESIGN_SPEC.md`, spec v0.2 |
| 016 | 21 Nov 2026 | **Game server on Cloudflare Durable Objects** (one per room), replacing Colyseus; GDD v0.4. Deployed with `wrangler deploy` from GitHub Actions on every merge to `main` | APPROVED | `docs/adr/0002-hosting.md`, `wrangler.jsonc` |
| 015 | 21 Nov 2026 | Hosting: **Cloudflare and GitHub only**, managed in the browser and deployed by GitHub Actions. Option still to confirm: Durable Objects (recommended) or Containers | APPROVED (constraint) | `docs/adr/0002-hosting.md` |
| 014 | 21 Nov 2026 | **The Shepherd is 28 m tall** (was 18 m) after the S1-3 walk test; HUD objective moved to the bottom so nothing covers it | APPROVED | `STAGE_01_SPEC.md` L9 |
| 013 | 21 Nov 2026 | Pinned stack for M0: Colyseus 0.16 (server later replaced, see 016), React 19.2, R3F 9, three 0.187, Vite 7, TypeScript 5.9 | ACCEPTED | `docs/adr/0003-stack-versions.md` |
| 012 | 21 Nov 2026 | Kinematic shared movement on the server; Rapier deferred to the first stage with moving platforms | ACCEPTED | `docs/adr/0001-physics-and-movement.md` |
| 011 | 21 Nov 2026 | Blender work runs **headless in Claude cloud sessions** by default (`bash blender/scripts/run_stage.sh`), so the owner needs no setup. The owner's desktop Blender + MCP stays optional for hand edits | AGREED | `blender/README.md` |
| 010 | 21 Nov 2026 | Stage 01 spec v0.1 values adopted as starting values (owner asked Claude to proceed) | APPROVED | `STAGE_01_SPEC.md` |
| 009 | 21 Nov 2026 | **Git LFS** for Blender files, GLB/glTF binaries, textures and audio (`.gitattributes`) | APPROVED | `BLENDER_PIPELINE.md` §6 |
| 008 | 21 Nov 2026 | **Playful tone**: light suspense and comedy, no horror imagery; horror-themed stages reworked before production | APPROVED | GDD §1.3, §14 |
| 007 | 21 Nov 2026 | Stage 01 setting: **night floodlit yard** (concept board G1) | APPROVED | GDD §3; manifest C2 |
| 006 | 21 Nov 2026 | **Standup mode** added as the everyday session format (5–10 min target). Quick (1 round) and Short (3 rounds) formats, briefing and late-arrival rules are proposals until playtested | APPROVED (mode); details PROPOSED | GDD §2.3.1, Stage 01 plan §6.1 |
| 005 | 21 Nov 2026 | The Stage 01 figure is **The Shepherd** (`ENM_Shepherd`), an original giant mechanical shepherd. The doll figure on the concept boards is retired | APPROVED | GDD §3, §4.4; manifest C1, C5 |
| 004 | 21 Nov 2026 | Purpose: **Creative Nomads team icebreaker** for standups, plus full tournaments for team events. "Monetization: private" = internal use, no monetization | APPROVED | GDD §1 |
| 003 | 21 Nov 2026 | Project renamed **CN Trials** (CN = Creative Nomads), formerly THE LAST TRIAL | APPROVED | All docs |
| 002 | 21 Nov 2026 | Blender pinned to **5.3.0** (owner's desktop); `bpy==5.3.0` for headless runs | APPROVED | `BLENDER_PIPELINE.md` §3 |
| 001 | 21 Nov 2026 | Blender work happens in a local Claude Code session on the owner's Windows PC (Blender Lab MCP extension, `localhost:9876`); GitHub is the bridge to cloud sessions | AGREED | `BLENDER_PIPELINE.md` §1–2 |

## Open (owner to decide)

| Item | Current proposal | Source |
|------|------------------|--------|
| Stage 01 greybox approval (G1: start barrier raised to 6 m; G4: no obstacles inside the course) | See the report's last section | `docs/STAGE_01_GREYBOX_REPORT.md` |
| Tagline | Keep "Thirty enter. Only one survives." for now; candidates: "Move with intent.", "We guide. You go." | GDD §14 |
| Theme names (stage names, Basecamp, Nomads, Trailblazer) | Proposed in chat on 21 Nov 2026; not adopted | — |
