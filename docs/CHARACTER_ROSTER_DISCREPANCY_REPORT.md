# CN TRIAL · Character roster discrepancy report (Stage 1.5, Prompt 01)

Status: **BLOCKED, owner decision required** (21 November 2026). Required by the Stage 1.5 Character Lock Register: "If there is no clear canonical roster in the project … stop before character modeling or renaming."

## 1. What the project contains

| Looked for | Found |
|------------|-------|
| A 30-character roster manifest (IDs, names) | **None.** No roster file, enum or data table exists in `packages/`, `apps/`, `blender/` or `docs/`. |
| Character models, rigs, animations, thumbnails | **None.** Players are drawn as coloured capsules (`apps/web/src/game/Scene.tsx`). The only `CHR_` references are the planned `CHR_Contestant_Base` in GDD §9.6 and `docs/BLENDER_PIPELINE.md`. |
| Earlier character references | None. `docs/REFERENCE_MANIFEST.md` lists slot "roster sheet" as MISSING; G1/G2 only show small hooded silhouettes. |
| GDD rule | §4.2 (PROPOSED): one shared base body and skeleton, with 30 curated presets built from modular components. |

So there is no canonical roster in the project to map the boards to.

## 2. The six locked boards

All six files were copied into `references/STAGE_1_5/FINAL_CHARACTER_BIBLE_LOCKED/` byte-for-byte. Their SHA-256 values match `templates/CHARACTER_REFERENCE_SHA256.json`. Each board shows a **different** 30-character roster: different names, different designs per number and different detailed examples. All of them are titled "THE LAST TRIAL", the old project name.

| File | Detailed example | Roster names (01–30, as legible) |
|------|------------------|----------------------------------|
| `01_character_bible_roster_reference_a.png` | Yellow-raincoat hooded child (turnaround) | The Drifter, The Mechanic, The Plague, The Tinkerer, The Runaway, The Sailor, The Chef, **The Watcher**, The Archivist, The Scout, The Janitor, The Tailor, The Orphan, The Scavenger, The Performer, The Monk, The Engineer, The Botanist, The Artist, The Messenger, The Vagabond, The Kiteboy, The Diver, The Scholar, The Hunter, The Prisoner, The Nurse, The Musician, The Alchemist, The Phantom |
| `02_character_design_bible_scout_roster.png` | 01 The Scout (yellow raincoat, goggles) | The Scout, Mechanic, The Doctor, Chef, Engineer, Artist, Boxer, Scholar, Farmer, Diver, Violinist, Prisoner, Orphan, Hunter, Jester, **Watcher**, Clockmaker, Tinkerer, Pilot, Sailor, The Monk, The Critic, Gardener, Acrobat, Librarian, Photographer, Street Kid, Tailor, Miner, Maverick |
| `03_character_design_bible_named_roster_a.png` | 01 Pip (yellow coat, orange hair, goggles) | Pip, Kai, Molly, Raven, Jett, Nora, Bruno, Lume, Fenn, Dot, Ollie, Vera, Silo, Maru, Cody, Iris, Hob, Wren, Payne, Elio, Tess, Mica, Rook, Bell, Nix, Gale, Yori, Kip, Sable, Ree |
| `04_character_design_bible_named_roster_b.png` | 07 Juli | Reed, Mika, Orin, Nell, Kai, Vera, Juli, Bran, Ela, Tov, Rune, Isla, Moss, Drew, Lune, Pax, Rhea, Silo, Kett, Yael, Fenn, Cloe, Jett, Vain, Sora, Hux, Echo, Nyx, Pike, Irene |
| `05_contestant_roster_reference_a.png` | (per-character mini turnarounds) | The Hood, The Goggles, The Plague, The Bucket, The Seamstress, The Mechanic, The Chef, The Janitor, The Boxhead, The Clockmaker, The Diver, The Radio, The Ragdoll, The Moth, The Scholar, The Miner, The Scavenger, The Circus, The Monk, The Soldier, The Fisher, The Bell, The Raven, The Explorer, The Painter, The Gardener, The Witchling, The Iceman, The Prisoner, The Wildcard |
| `06_contestant_roster_reference_b.png` | (per-character mini turnarounds) | The Hood, The Goggles, The Plague, The Bucket, The Mechanic, The Sailor, The Scholar, The Chef, The Prisoner, **The Watcher**, The Doll, The Tinkerer, The Wanderer, The Beastling, The Singer, The Clown, The Archivist, The Doctor, The Hunter, The Scout, The Monk, The Painter, The Gardener, The Locksmith, The Runaway, The Inventor, The Illusionist, The Miner, The Shadow, The Warden |

## 3. Mismatches

1. **Six incompatible rosters.** The same slot number is a different character on each board. For example, slot 01 is The Drifter, The Scout, Pip, Reed or The Hood, and slot 10 is The Scout, Diver, Dot, Tov, The Clockmaker or The Watcher. Names that appear on several boards, such as Kai, Vera, Jett, Fenn, Silo, The Monk and The Chef, sit at different numbers and have different designs.
2. **Name collision with the enemy.** Boards 01, 02 and 06 each include a contestant called "The Watcher". That is the approved Stage 01 enemy's name (decision 023).
3. **Old title.** Every board says "THE LAST TRIAL". The game is now CN TRIAL (decision 003; Stage 1.5 brief).
4. **Proportions differ.** About 3.2 heads (board 03), 3.5 heads (board 04), 2.8–3 heads (board 05), 1.35 m game scale (board 06) and about 5.2 heads (board 02).
5. **Originality.** Boards 02 and 05 describe the style as "Little Nightmares inspired". The detailed hero on boards 01, 02, 04 and 06, and slot 01 on all six boards, is a small hooded child in a yellow raincoat. That closely matches the protagonist of *Little Nightmares*. CN TRIAL already replaced its Stage 01 enemy for the same reason, because the pack design copied a recognisable character (decision 023). Building this character faithfully would reproduce an existing game character. The project should not do that, even with a new name.

## 4. Decisions needed from the owner

1. **Canonical roster:** which board, if any, is the master 30-character list (IDs 01–30, names and the design for each slot)? Alternatively, supply a single roster table.
2. **Enemy name collision:** rename or drop the contestant called "The Watcher" if that board is chosen.
3. **Hooded yellow-raincoat child, and any other character that copies an existing franchise:** approve a change, as was done for The Watcher in decision 023, or confirm another slot design to use in its place.
4. **Modelling approach:** one shared base body with 30 presets, as GDD §4.2 proposes, or individual models. Also confirm the proportion to use from §3.4.

## 5. What happens meanwhile

- No contestant has been modelled, renamed, merged or imported.
- The source boards are preserved unchanged.
- Players stay as capsules with distinct colours, which are gameplay placeholders. The character-selection screen (Prompt 07) is built to read a roster manifest and says that the roster is pending until one exists. It does not show invented characters.
- Every other Stage 1.5 workstream continues: environment, atmosphere, obstacles, Watcher polish, UI, optimisation and QA.
