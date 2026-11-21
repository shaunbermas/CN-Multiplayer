# Decision log

Records owner decisions and technical choices (GDD §15.1 rule 8). Newest first. Anything not here is
still PROPOSED or TBD in the GDD and plans.

| # | Date | Decision | Status | Where it applies |
|---|------|----------|--------|------------------|
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
| Tagline | Keep "Thirty enter. Only one survives." for now; candidates: "Move with intent.", "We guide. You go." | GDD §14 |
| Theme names (stage names, Basecamp, Nomads, Trailblazer) | Proposed in chat on 21 Nov 2026; not adopted | — |
| Colyseus hosting | Compare options in M0 | Plan §8, D7 |
| Shepherd size on screen | From the start line the 18 m Shepherd is about 1/12 of the screen height. Test in S1-3; options: taller (about 25 m) or a closer platform | `STAGE_01_SPEC.md` L8–L9 |
