ORIGINAL MULTIPLAYER GAME · CREATIVE NOMADS

# CN TRIALS

*Thirty enter. Only one survives.* (working tagline, under review: see §14)

> 

GAME DESIGN DOCUMENT

INITIAL PRE-PRODUCTION SPECIFICATION

| DOCUMENT CONTROL | VALUE |
| --- | --- |
| Project title | CN TRIALS (CN = Creative Nomads). Formerly THE LAST TRIAL |
| Document version | 0.2 - Renamed; The Shepherd; Standup mode |
| Prepared | 21 November 2026 (v0.1); updated 21 November 2026 (v0.2) |
| Owner and purpose | Creative Nomads, internal. A team icebreaker for standups, with a longer tournament for team events |
| Status | Working baseline. Gameplay, technical and production assumptions require validation. |
| Primary implementation | Claude Code + React / Three.js + Colyseus |
| 3D production | Blender, with web-ready GLB / glTF exports |

> **SCOPE NOTE** This document defines the first production baseline. It is not a claim that all systems, stage counts, player counts or performance targets have already been proven in a playable build.

### Version history

| VERSION | DATE | CHANGE | DECIDED BY |
| --- | --- | --- | --- |
| 0.1 | 21 Nov 2026 | Initial direction and pre-production baseline as THE LAST TRIAL. | Project owner |
| 0.2 | 21 Nov 2026 | Renamed to CN TRIALS. Purpose set: Creative Nomads team standup icebreaker. The Stage 01 figure becomes The Shepherd, an original design replacing the earlier doll concept. Added Standup mode (§2.3.1) alongside the full tournament. "Monetization: private" confirmed as internal use with no monetization. | Project owner (APPROVED). Standup mode details are PROPOSED |

## Document guide

This GDD is the shared source of truth for concept design, stage production, Blender asset creation and Claude Code implementation. The approved decisions are fixed for this version; all other details are proposals or validation targets until tested.

| SECTION | WHAT IT DEFINES |
| --- | --- |
| 1. Product definition | Vision, genre, audience, pillars and approved constraints. |
| 2. Core game experience | Player journey, tournament structure, match rules and controls. |
| 3. Stage design | Ten-stage content pool, default seven-round sequence and stage requirements. |
| 4. Characters and enemies | 30 selectable identities, shared rig, animation and enemy design. |
| 5. Art direction | Hybrid visual style, environment language, lighting, material and audio direction. |
| 6. UI / UX | Room creation, invitation flow, lobby, in-match HUD, spectator and results. |
| 7. Technical design | Web architecture, multiplayer authority, room lifecycle, data, hosting and performance. |
| 8. Blender pipeline | Modeling, rigging, scene handoff, export and asset acceptance. |
| 9. Production plan | Milestones, dependencies, testing and release gates. |
| 10. Risks and open decisions | Known risks, mitigations, scope boundaries and decisions still required. |
| Appendices | Acceptance criteria, Claude Code working rules and references. |

### How to read requirements

| LABEL | MEANING |
| --- | --- |
| APPROVED | Directly set by the project owner. Do not silently change. |
| PROPOSED | Recommended design for the first implementation. Can change through review. |
| TBD | Needs a decision, measurement or prototype. |
| TARGET | A desired outcome used for testing, not a guarantee. |
| OUT OF SCOPE | Not included in the initial private release. |

## 1. Product definition

### 1.1 High concept

CN TRIALS is a desktop browser-based 3D multiplayer elimination game for private groups. Up to 30 guest contestants enter a hosted room and compete through a sequence of trials that mix reaction challenges, team cooperation, obstacle racing, escape-room puzzles, horror survival and platforming. Each round removes contestants until one winner remains.

APPROVED PURPOSE: CN TRIALS is made for Creative Nomads (CN), a remote-first studio of 20+ people. Its main use is a short icebreaker at team standups (Standup mode, §2.3.1). The full seven-round tournament remains for longer team events.

The experience combines the readable, fast-to-understand competition loop of a party elimination game with high-pressure survival rules and a cinematic, dark fantasy presentation. The characters are simple, expressive and easy to distinguish. The environments are much larger, more detailed and atmospheric.

> **PLAYER PROMISE** Join from a link, pick a strange little contestant, survive a series of very different trials with friends, and become the last player standing.

### 1.2 Approved product constraints

| DECISION | APPROVED DIRECTION | IMPLICATION |
| --- | --- | --- |
| Platform | Desktop browser | Keyboard and mouse are the primary input. Mobile controls are not a launch requirement. |
| Visual style | Hybrid | Small, simplified characters paired with cinematic, detailed, atmospheric environments. |
| Match structure | Tournament | One continuous elimination sequence ending with one champion. |
| Monetization | Private | Interpreted for v0.1 as a private party game with no ads, paid items or subscriptions at launch. |
| Player accounts | Guest | No mandatory registration. Use temporary guest identity and room session. |
| Room capacity | 30 players maximum | Server and client must be designed and tested for up to 30 contestants in one room. |
| Roster | 30 character identities | Create 30 curated presets on a shared modular character system, not 30 independent rigs. |
| Stage pool | 10 stages | Seven rounds per default tournament, with alternate stages used to vary repeat matches. |
| Purpose | Team icebreaker for Creative Nomads standups | Sessions must fit inside a standup; joining must take seconds; tone must suit a workplace. |
| Session modes | Standup mode and full tournament | Standup mode (§2.3.1) is the everyday mode. The seven-round tournament (§2.3) is for team events. |

CONFIRMED (v0.2): “Monetization: private” means internal use by the Creative Nomads team, invite-only, with no monetization.

### 1.3 Genre and experience

- Primary genre: multiplayer party elimination / survival competition.
- Secondary genres: obstacle course, reaction game, team challenge, escape room, stealth horror, precision platforming.
- Camera: third-person follow camera with optional camera sensitivity and field-of-view settings.
- Session structure: private room, lobby, tournament, winner presentation, replay or return to lobby.
- Tone: tense and mysterious, with moments of physical comedy, surprise, panic and triumph.
### 1.4 Target players

Primary audience: the Creative Nomads team (20+ people, remote-first, working across time zones in US business hours) playing together at standups and team events. Secondary: other private groups who want an easy-to-organize online competition. A guest should be able to open a link, enter a nickname, select a character and join without creating an account.

- Social play is organized by the host, not by public matchmaking. At standups the host is usually the person running the meeting.
- Players range from developers to account and SEO staff, so the game must be playable by people who rarely play games.
- The rules for each stage must be understandable within a short pre-round briefing.
- Players who are eliminated should remain part of the session as spectators rather than being disconnected immediately.
- The game should work well for mixed skill levels. Stage rules should reward timing, reading the environment and cooperation, not only fast reactions.
### 1.5 Design pillars

| PILLAR | DESIGN RULE | PLAYER RESULT |
| --- | --- | --- |
| Easy to join | Guest access and a shareable private room invitation. | Friends can get into a match quickly. |
| Different trials | Each stage changes the core verb: stop, pull, run, solve, hide, cross or survive. | The tournament stays fresh. |
| Readable danger | Telegraph hazards through animation, sound, lighting and clear rules. | Players feel challenged, not cheated. |
| Cinematic world | Large scale, atmospheric environments and deliberate camera framing. | The game feels like a coherent world, not a collection of flat minigames. |
| Fair elimination | The server decides movement violations, qualification and results. | Players can trust the outcome. |
| Reusable production | Shared character rig, stage framework, materials and prop kits. | The project can expand without rebuilding its foundation. |

## 2. Core game experience

### 2.1 Player journey

1.  Host visits the game website and selects Create Private Room.

2.  The server creates a room with a maximum capacity of 30 and returns an invitation link and room code.

3.  Friends open the invitation link, choose a guest nickname and select one of the available character presets.

4.  Players appear in the lobby, see the player list and mark themselves Ready.

5.  The host starts the tournament when the room has enough players and the group is ready.

6.  The game introduces the rules for the next stage, loads the stage and begins the countdown.

7.  The server validates gameplay, qualification and eliminations. Eliminated players enter spectator mode.

8.  Qualified players move to the next round. The process repeats until the final stage produces one champion.

9.  The winner presentation shows the champion and final placements. The group can replay or return to the lobby.

### 2.2 Core gameplay loop

| PHASE | PLAYER ACTION | SERVER RESPONSIBILITY |
| --- | --- | --- |
| Lobby | Join, choose character, ready up. | Validate invitation, capacity, nickname, character selection and host permissions. |
| Briefing | Read or hear stage rules. | Set stage seed, ruleset, timer and initial player state. |
| Trial | Move, interact, cooperate, hide or cross hazards. | Validate inputs, collisions, enemy logic, timers, qualification and elimination. |
| Results | Review who qualified and who was eliminated. | Freeze stage outcome and calculate the next roster. |
| Transition | Watch stage transition and prepare for next round. | Dispose old stage state, load next stage and place qualified players. |
| Final | Compete for the last win condition. | Declare one winner and lock the tournament result. |

### 2.3 Tournament format

PROPOSED DEFAULT: seven rounds per tournament. The game contains ten stages in its content pool. The default sequence is stable at the format level, while selected rounds can choose from approved alternate stages so repeated tournaments are not identical.

| RND | STAGE | START | ADVANCE | PURPOSE |
| --- | --- | --- | --- | --- |
| 1 | Red Light, Green Light | 30 | 22 | Opening reaction and movement test. |
| 2 | Tug of War | 22 | 11 | Team coordination. Losing team is eliminated. |
| 3 | The Factory | 11 | 8 | Obstacle race. The Last Freight can replace it. |
| 4 | The Clockwork House | 8 | 4 | Four pairs. The two fastest successful pairs advance. |
| 5 | The Quiet Ward | 4 | 3 | Horror survival. Blackout or Drowned Archive can replace it. |
| 6 | The Hollow Bridge | 3 | 2 | Precision crossing. Two fastest successful finishers advance. |
| 7 | The Last Bell | 2 | 1 | Final head-to-head survival challenge. |

> **TUNING NOTE** The 30 → 22 → 11 → 8 → 4 → 3 → 2 → 1 sequence is the target format for a full 30-player match. The server must also support smaller rooms. Qualification rules should scale to the actual starting count and avoid creating an impossible or empty round.

#### Qualification rules for variable room sizes

- Red Light, Green Light: use a target qualification count derived from the configured percentage, with a minimum of two qualifiers when at least two players start. The exact percentage and tie handling are tunable values.
- Tug of War: divide the remaining players into balanced teams. For an odd count, use a documented team-size balancing rule and normalize team power so the larger team does not win solely from having one extra player.
- Race and platforming rounds: qualify the configured number of successful finishers. If the timer ends, use objective progress checkpoints and server-recorded completion time as the tie-breaker.
- Paired escape room: create pairs. The two fastest pairs that complete the room advance together. A solo odd player in non-default room sizes receives a short solo variant or is paired with a server-controlled helper only if the team mode is deliberately designed for it.
- Horror survival: qualify by reaching the extraction point. Players caught by the enemy or still inside when the timer expires are eliminated.
- Final: the stage must produce exactly one winner. If a timer expires without a clear winner, use a sudden-death overtime rule rather than a shared win.
### 2.3.1 Standup mode

APPROVED: a short session format for team standups. All details below are PROPOSED until playtested with the team.

| ITEM | PROPOSED RULE |
| --- | --- |
| Target length | 5 to 10 minutes from opening the link to the results screen (TARGET). |
| Formats | Host picks **Quick** (1 round, about 3 to 5 minutes) or **Short** (3 rounds, about 8 to 10 minutes). Quick is the default. |
| Quick format | One race stage, normally Stage 01 Red Light, Green Light. The server ranks players by recorded finish time; the first finisher is the champion. Players still on the course at time-out rank by progress; eliminated players rank last, latest elimination first. Every player gets a placing. |
| Short format | Round 1: Stage 01 (about half advance). Round 2: one short stage from those that have passed acceptance (Tug of War, The Factory or The Hollow Bridge). Round 3: a final that produces exactly one winner (The Last Bell, or a race final where the first finisher wins). Qualification targets scale to the actual starting count. |
| Stages allowed | Only stages that have passed their acceptance gate (§3.1) and normally run 3 minutes or less. The Clockwork House (3 to 5 minutes, pairs) is excluded from the default rotation. Horror stages are excluded until the tone decision in §14 is made. |
| Briefing | At most 15 seconds, one sentence plus one icon. A player who has seen a stage's briefing before can skip it; the countdown waits for the longest remaining briefing. No stage-intro cinematics in Standup mode. |
| Results | Results screen of about 20 seconds with podium and full placings, then Play again (same room and roster) or End. |
| Late arrivals | People who join during a match wait in the lobby as spectators and enter the next match. They never join a match in progress. |
| Player count | Designed for a typical standup of 3 to 22 players; must work from 2 players. |
| Standing team room | A reusable team link for daily standups is TBD; it may need persistence (§7.1 assumes no database). |

The full seven-round tournament below remains the format for team events.

### 2.4 Match length

TARGET FOR PLAYTESTING: Standup mode 5 to 10 minutes (§2.3.1). Approximately 20 to 30 minutes for a full seven-round tournament, including briefings and transitions. This is an initial pacing hypothesis, not a measured duration. Stage timers should be tuned after real groups play the prototype.

| ROUND TYPE | INITIAL DURATION TARGET | NOTES |
| --- | --- | --- |
| Opening reaction | 2 to 3 minutes | Short rules briefing and one clear finish objective. |
| Team challenge | 2 to 3 minutes | Includes team assignment and pull sequence. |
| Obstacle race | 2 to 4 minutes | Enough time to recover from one mistake. |
| Escape room | 3 to 5 minutes | Puzzles must be solvable through observation and cooperation. |
| Horror survival | 2 to 4 minutes | Short pursuit cycles keep tension high. |
| Precision crossing | 2 to 3 minutes | Readable platforms and recoverable timing windows. |
| Final | 2 to 4 minutes | Clear escalation and a decisive win condition. |

### 2.5 Player controls

| INPUT | DEFAULT ACTION | CONTEXT |
| --- | --- | --- |
| W / A / S / D | Move | Primary movement. |
| Mouse movement | Rotate camera | Third-person camera look. |
| Space | Jump / contextual timed pull | Jump in movement stages; timed pull input in Tug of War. |
| Left Shift | Sprint | Consumes stamina where sprint is enabled. |
| Left Ctrl | Crouch / sneak | Used in stealth and selected movement sections. |
| E | Interact | Keys, levers, switches, doors and puzzle objects. |
| Esc | Pause / settings | Settings and leave-room flow. Do not pause the server match for one player. |
| Mouse click | UI selection | Menus, ready button, character choice and lobby actions. |

Keyboard mapping is proposed. Every action should be remappable later, but custom key binding is not a first-prototype requirement. The game should support keyboard-only movement and mouse camera look without requiring voice chat.

### 2.6 Player movement and physicality

- Movement should feel weighty but responsive. Characters should accelerate and stop with readable momentum rather than sliding excessively.
- Jump height, acceleration, air control and sprint duration should be shared baseline values across the roster. Character cosmetics must not change competitive hitboxes or movement stats.
- Use a consistent capsule or equivalent gameplay collider for all contestant presets. The visible character mesh may vary, but the collision body must remain consistent.
- Use animation-driven feedback for stumble, fall, landing, panic and victory. Animation must not be the authority for collision or elimination.
- Use stamina only where the stage benefits from it. Avoid adding stamina management to every round by default.
## 3. Stage design

Each stage must have one primary gameplay verb, one clear win/qualification condition, readable hazards, a defined fail state and a server-authoritative implementation. The 10 stages below form a content pool, not a promise that all ten are required for the first public test.

### STAGE 01 - RED LIGHT, GREEN LIGHT

| DESIGN FIELD | SPECIFICATION |
| --- | --- |
| Genre / role | Opening reaction / movement |
| Player count | 30 target starters; 22 target qualifiers. |
| Core loop | Contestants cross a large outdoor testing yard while The Shepherd, a giant mechanical observer, controls the signal. Move during green. Stop during red. Crossing the finish line before time expires qualifies. |
| Rules and failure | The Shepherd turns away or displays green. On red, The Shepherd turns and scans. Movement above an approved tolerance during the red window triggers elimination. The server validates motion and accounts for latency. |
| Environment | Large yard, start zone, finish gate, Shepherd platform, cover-free lanes, side dressing and distant silhouettes. |
| Implementation needs | Signal state machine, scan timing, movement validation, finish detection, elimination, timer, results and spectator handoff. |
| Design notes | This is the first vertical-slice stage. Its environment and mechanic must be fully playable before large-scale content production. |

### STAGE 02 - TUG OF WAR

| DESIGN FIELD | SPECIFICATION |
| --- | --- |
| Genre / role | Team cooperation / rhythm |
| Player count | 22 target starters; 11 target qualifiers. |
| Core loop | Two balanced teams pull against each other on separated platforms. Players press the contextual pull input on timed cues. The team that completes the collective pull objective wins. |
| Rules and failure | A shared rope-progress meter moves toward each team. Accurate inputs add force; missed or early inputs reduce force or create recovery delay. The losing team is eliminated at round end. No rapid button-mashing advantage. |
| Environment | Two opposing platforms, rope, central gap, team staging zones, pull timing display, distant arena machinery. |
| Implementation needs | Team assignment, balanced team scoring, beat windows, rate limiting, progress meter, overtime and loss result. |
| Design notes | Keep the action understandable from the HUD. Team voice communication is not required. |

### STAGE 03 - THE FACTORY

| DESIGN FIELD | SPECIFICATION |
| --- | --- |
| Genre / role | Obstacle racing |
| Player count | 11 target starters; 8 target qualifiers. |
| Core loop | Contestants race through an industrial production line with conveyors, crushers, rotating machinery, swinging loads and collapsing walkways. The first configured number of finishers advance. |
| Rules and failure | Hazards have telegraphed active windows. A hazard may knock a player back, stun briefly or eliminate them depending on severity. Avoid unavoidable instant kills. |
| Environment | Conveyor halls, giant press machines, loading bay, suspended cargo, maintenance walkways and finish gate. |
| Implementation needs | Obstacle schedules, collision events, moving platforms, checkpoint progress, finish-time ranking and stage reset. |
| Design notes | This is the main stage for the readable Fall Guys-style obstacle-course energy. |

### STAGE 04 - THE CLOCKWORK HOUSE

| DESIGN FIELD | SPECIFICATION |
| --- | --- |
| Genre / role | Cooperative escape room / puzzle race |
| Player count | 8 starters; 4 qualifiers. |
| Core loop | Four pairs enter parallel or mirrored puzzle rooms. Each pair discovers clues, manipulates objects and activates mechanisms. The two fastest completed pairs advance together. |
| Rules and failure | Puzzle progress is server-owned. Interactions must be validated by distance and current puzzle state. Players can ping points of interest but do not need voice chat. |
| Environment | Oversized mansion rooms, rotating clock mechanisms, symbol walls, pressure plates, key objects, mechanical doors and a visible escape route. |
| Implementation needs | Pairing, puzzle state machine, interact validation, clue sequence, timers, pair completion time and tie-breaks. |
| Design notes | Provide clear visual feedback. Do not rely on color alone to communicate symbol matches. |

### STAGE 05 - THE QUIET WARD

| DESIGN FIELD | SPECIFICATION |
| --- | --- |
| Genre / role | Horror stealth / extraction |
| Player count | 4 starters; 3 qualifiers. |
| Core loop | Contestants enter an abandoned ward patrolled by a large enemy. They hide, crouch, move between cover and reach an extraction point before time expires. |
| Rules and failure | Enemy AI uses states: patrol, investigate, chase, search and return. Noise, visibility and proximity can influence detection. The server owns enemy position and target decisions. |
| Environment | Oversized hospital corridor, waiting room, patient rooms, linen carts, lockers, broken lights, medical props and extraction door. |
| Implementation needs | Enemy perception, sound events, hiding volumes, line-of-sight tests, chase, catch, escape and time limit. |
| Design notes | Tension should come from anticipation and pursuit, not gore. Ensure players can understand why they were detected. |

### STAGE 06 - THE HOLLOW BRIDGE

| DESIGN FIELD | SPECIFICATION |
| --- | --- |
| Genre / role | Precision platforming |
| Player count | 3 starters; 2 qualifiers. |
| Core loop | Contestants cross a suspended bridge made of unstable slabs, moving beams and collapsing platforms. The first two valid finishers advance. |
| Rules and failure | Platforms use readable warning states: stable, warning, falling and inactive. Fall recovery is possible only where level design explicitly supports it. |
| Environment | Abyssal canyon, stone and metal bridge sections, suspended anchors, distant structures, fog layers and final gate. |
| Implementation needs | Platform timers, moving-platform paths, fall detection, checkpoint state, finish validation and tie-breaks. |
| Design notes | Readable geometry is essential. Fog and darkness must never conceal a platform edge unfairly. |

### STAGE 07 - THE BLACKOUT

| DESIGN FIELD | SPECIFICATION |
| --- | --- |
| Genre / role | Alternate horror / resource survival |
| Player count | Alternate for Round 5. |
| Core loop | Contestants cross an underground complex with limited portable light. They search for power cells and reach the exit while an enemy hunts through the dark. |
| Rules and failure | Battery drains while the light is on. Light attracts or exposes players to the enemy according to clear rules. Hiding and route planning are viable. |
| Environment | Subterranean service tunnels, breaker rooms, low ceilings, power cells, narrow doors, utility lights and exit shaft. |
| Implementation needs | Battery resource, pickup validation, enemy perception, light state, safe zones, exit and timeout. |
| Design notes | Use contrast and sound cues so the game remains fair when the scene is dark. |

### STAGE 08 - THE DROWNED ARCHIVE

| DESIGN FIELD | SPECIFICATION |
| --- | --- |
| Genre / role | Alternate environmental survival / puzzle |
| Player count | Alternate for Round 5. |
| Core loop | Water rises through an archive. Contestants activate pumps, find access routes and climb toward the upper exit. The fastest three survivors qualify. |
| Rules and failure | Water level advances on a server timer. Players can use valves and route controls to delay or redirect the rise. All contestants receive equivalent puzzle information. |
| Environment | Flooded library, towering shelves, ladders, upper galleries, pump controls, floating debris and extraction hatch. |
| Implementation needs | Water level, safe-height zones, valve states, swimming or wading movement, oxygen only if necessary, and exit ranking. |
| Design notes | Do not add a complex swimming controller unless it proves essential. A rising water hazard can deliver the theme more economically. |

### STAGE 09 - THE LAST FREIGHT

| DESIGN FIELD | SPECIFICATION |
| --- | --- |
| Genre / role | Alternate obstacle race / chase |
| Player count | Alternate for Round 3. |
| Core loop | Contestants move across a moving industrial transport convoy, navigating cargo, cables, gaps and machinery before the train-like structure reaches the final stop. |
| Rules and failure | The moving environment follows a server-owned path. Hazards are scheduled relative to the vehicle. Players who fall behind or fall from the structure are eliminated. |
| Environment | Freight cars, loading cranes, overhead cables, moving cargo, maintenance ladders, trackside structures and final platform. |
| Implementation needs | Vehicle path, moving platform transforms, timed hazard events, checkpoints, fall handling and finish scoring. |
| Design notes | Reuse the Factory hazard and prop systems where possible, but deliver a visibly different space and rhythm. |

### STAGE 10 - THE LAST BELL

| DESIGN FIELD | SPECIFICATION |
| --- | --- |
| Genre / role | Final two-player survival |
| Player count | 2 starters; 1 champion. |
| Core loop | Two finalists enter a circular arena. They must survive escalating arena hazards and activate three bell mechanisms or seals. The first valid player to complete the objective wins. |
| Rules and failure | The arena becomes more dangerous in readable phases. A player can disrupt the opponent through positioning and environmental pressure, but no weapon combat is required. If time expires, enter a clearly signaled sudden-death phase. |
| Environment | Circular arena, three bell mechanisms, collapsing outer ring, hazard emitters, dramatic backdrop, winner platform. |
| Implementation needs | Final-stage state machine, objective activation, cooldowns, arena phase changes, overtime and single-winner declaration. |
| Design notes | The final should be tense and decisive, not a longer version of the earlier obstacle races. |

### 3.1 Stage variation rules

- Round 3 selects either The Factory or The Last Freight. Both must produce the configured number of finishers and use the same tournament result interface.
- Round 5 selects The Quiet Ward, The Blackout or The Drowned Archive. All must produce a ranked set of survivors and support spectator mode.
- The stage selector should avoid repeating the exact same alternate combination in consecutive rematches when at least two options are available.
- Random selection must be seeded and recorded by the server so the chosen stage and event order can be investigated during bug reports.
- A stage must not enter the tournament pool until it passes its own functional, performance and spectator acceptance tests.
### 3.2 Shared stage structure

| STATE | PURPOSE | EXIT CONDITION |
| --- | --- | --- |
| Loading | Load stage assets and initialize server state. | Server and clients report stage ready or loading timeout policy runs. |
| Player placement | Spawn qualified players at approved spawn points. | All active players are placed or treated as disconnected. |
| Briefing | Show the stage rules and controls. | Briefing timer ends. |
| Countdown | Give players a fair starting signal. | Countdown reaches zero. |
| Active | Run hazards, objectives, enemy logic and timer. | Objective complete, elimination threshold reached or time expires. |
| Results | Freeze gameplay and calculate qualifiers. | Server finalizes one authoritative result list. |
| Cleanup | Remove stage-specific entities and clear timers. | Next stage is ready to load. |

## 4. Characters and enemies

### 4.1 Contestant design direction

Contestants should feel like small, unusual people in a world built too large for them. The character style is simplified and readable, with expressive proportions and strong silhouettes. The environments carry the high-detail cinematic treatment; character models remain efficient enough to show up to 30 players together.

- Proportions: compact body, slightly oversized head and hands, readable feet and simple limbs.
- Identity: each preset has a distinctive head silhouette, costume outline, mask, hair, hat or accessory.
- Surface treatment: worn fabric, patched garments, painted surfaces, stitched details and restrained material variation.
- Personality: curious, anxious, stubborn, sleepy, theatrical or mysterious through posture and animation, not through complex facial rigging in the first release.
- Competitive fairness: all contestants use identical movement values and gameplay collision dimensions.
### 4.2 Thirty-character production model

PROPOSED APPROACH: make one shared base body and one shared skeleton, then create 30 curated character presets from modular heads, headwear, masks, clothing kits, accessories and material combinations. A preset is a controlled combination of components, not a fully independent character pipeline.

| ASSET FAMILY | INITIAL PRODUCTION TARGET | NOTES |
| --- | --- | --- |
| Base body / rig | 1 master body and 1 shared rig | One consistent skeleton and common collider. |
| Head silhouettes | 10 to 12 | Strong shape variation is more valuable than many subtle facial variants. |
| Masks / face coverings | 8 to 12 | Use for mystery and easy identity separation. |
| Hair / headwear | 8 to 12 | Avoid tiny details that disappear at gameplay distance. |
| Upper outfit kits | 8 to 10 | Reusable tops, coats, tunics and workwear silhouettes. |
| Lower outfit kits | 5 to 7 | Keep rigging and material setup consistent. |
| Accessories | 12 to 20 | Bags, straps, patches, belts, gloves and simple props. |
| Curated presets | 30 | Name, thumbnail, palette and component recipe for each. |

### 4.3 Required character animations

| ANIMATION | PRIORITY | USE |
| --- | --- | --- |
| Idle | Required | Lobby and normal gameplay. |
| Walk / run | Required | Standard locomotion. |
| Sprint | Required | Sprint-enabled stages. |
| Jump / fall / land | Required | Platforming and obstacle stages. |
| Stumble / knockback | Required | Hazard reaction. |
| Elimination | Required | Readable out-of-round transition. |
| Crouch / sneak | Required for horror | Stealth and hiding movement. |
| Interact | Required | Levers, keys, valves and puzzle objects. |
| Pull / brace | Required for Tug of War | Team challenge pose. |
| Panic / look back | Recommended | Horror presentation. |
| Victory | Required | Winner presentation. |
| Spectator idle | Recommended | Eliminated-player presentation. |

### 4.4 Enemy design

The first release needs a small number of memorable enemy types, not a large enemy catalog. Enemy models can share animation and behavior foundations where practical, but their silhouettes and threat rules must be distinct.

| ENEMY / PRESENCE | ROLE | AI REQUIREMENTS |
| --- | --- | --- |
| The Shepherd (mechanical observer) | Red Light, Green Light stage authority expressed visually. An original design: a giant mechanical shepherd watching over the flock of contestants. PROPOSED brief: turned away with its lantern lowered means move; turned to face the players with lantern and crook raised means stop. The signal never relies on colour alone. Final look comes from an approved concept. | Signal state, rotation, scan cue and movement detection window. It may be a large animated prop rather than a full roaming enemy. |
| Ward pursuer | Main horror-stage enemy. | Patrol, investigate, chase, search and return. Server owns target selection and catch events. |
| Blackout variant | Alternate pursuer or re-skinned behavior variant. | May reuse core AI if detection rules are adjusted for light and battery mechanics. |

- Enemy attacks must have a visible or audible warning wherever reaction is expected.
- Enemy perception and catch decisions are server-authoritative.
- Players must be able to understand the cause of detection through feedback such as noise indicators, a visible search cue or a clear line-of-sight warning.
- No gore or graphic injury is required. Failure can be communicated through a fall, capture, blackout or elimination transition.
## 5. Art direction and audio

### 5.1 Hybrid visual direction

The uploaded references establish two complementary visual qualities: cinematic, painterly action imagery with dramatic lighting and rich atmospheric environments; and small, stylized, unsettling character design with simple silhouettes and worn clothing. CN TRIALS combines these qualities into an original visual identity.

| VISUAL LAYER | DIRECTION | PRODUCTION GUIDANCE |
| --- | --- | --- |
| Characters | Small, stylized, expressive and readable. | Low visual complexity at distance. Strong silhouette. Modular costumes. Shared rig. |
| Environments | Cinematic, large-scale and atmospheric. | Detailed focal areas, modular background kits, controlled sightlines and purposeful composition. |
| Lighting | Deep cool shadows with warm accents and clear hazard lighting. | Use baked or hybrid lighting where practical. Reserve dynamic lights for gameplay-critical effects. |
| Materials | Worn metal, distressed paint, old concrete, fabric, wood and stone. | Use a consistent roughness and texture language. Avoid excessive small details. |
| Atmosphere | Fog, dust, smoke, sparks, rain, water and restrained particles. | Particles must be budgeted and reduced at lower quality settings. |
| Effects | Electric arcs, warning lights, dust impacts, platform breaks and signal transitions. | Keep gameplay cues visually distinct from decorative effects. |

### 5.2 Palette and mood

- Foundation: charcoal, blue-gray, muted teal and weathered stone.
- Warm contrast: rust, faded orange, amber and dirty brass.
- Gameplay accent: controlled cyan, green, red or gold only where it communicates a rule, state or interactive object.
- Avoid constant saturated neon. Strong accent colors should identify gameplay-relevant information.
- Use color plus shape, symbols, animation or text for important signals so that the rules do not rely on color perception alone.
Palette values are intentionally not locked in this version. A visual development pass should produce the final color tokens after a first stage lighting test.

### 5.3 Camera and composition

- Third-person camera follows the local contestant with a configurable shoulder offset and sensitivity.
- Keep the next obstacle, enemy or objective visible whenever possible.
- Use controlled camera shake only for selected heavy impacts. Provide a reduced-shake setting.
- Avoid forced cinematic cameras during active multiplayer movement if they could hide hazards or create competitive disadvantage.
- Use short scripted camera moments for stage introductions and the winner reveal, with a skip option where practical.
### 5.4 Audio direction

| AUDIO GROUP | REQUIREMENTS |
| --- | --- |
| Ambient | Location-specific room tone, distant machinery, wind, ventilation, water, rain and environmental creaks. |
| Gameplay cues | Clear red/green signals, hazard warnings, countdown, objective completion, elimination and qualification. |
| Character | Footsteps by surface type, landing, jump, stumble, interaction, breathing and short reactions. |
| Enemy | Distinct patrol, search, alert and chase cues. Audio should telegraph state changes. |
| Music | A restrained suspense score that escalates between tournament rounds and gives the final a distinct identity. |
| Accessibility | Independent music, ambience and effects volume; subtitles or visual captions for gameplay-critical audio cues. |

Use original or properly licensed audio. Do not use recognizable soundtrack material from the reference games or films.

## 6. UI / UX specification

### 6.1 Required screens

| SCREEN | CORE CONTENT | PRIMARY ACTION |
| --- | --- | --- |
| Landing / title | Game title, short premise, Create Room and Join Room. | Create a private room or enter an invitation code. |
| Create room | Room capacity, host display name and room settings. | Create room. |
| Join room | Nickname, room code or invitation token. | Join as guest. |
| Character selection | 30 presets with name, large preview and selected state. | Choose character. |
| Lobby | Room code, copy invitation, roster, ready state and host controls. | Ready or start tournament. |
| Stage briefing | Stage name, objective, controls, hazards and countdown. | Continue / prepare. |
| In-game HUD | Timer, objective, progress, team, stamina or detection cues as required. | Play. |
| Elimination / spectator | Eliminated state, current players, spectator camera and round results. | Watch active players. |
| Round results | Qualified and eliminated list, placement and next-stage preview. | Continue automatically. |
| Winner screen | Champion, final placements and match duration. | Replay or return to lobby. |
| Settings / pause | Audio, camera sensitivity, graphics quality, reduced shake and leave room. | Adjust settings. |

### 6.2 Lobby requirements

- Show room code and a Copy Invite Link action clearly.
- Show the current count, for example 18 / 30, and a player roster with guest nickname and character thumbnail.
- Mark the host distinctly. Only the host can start or close the room in the first release.
- Show each player's Ready state. The host may start when the minimum required number of players is present and all connected players are ready, or explicitly override readiness after a clear warning.
- If the host disconnects, transfer host control to the next eligible connected player using a deterministic rule.
- Lock new joins when the tournament starts. Reconnection for an existing player must remain possible during the configured grace period.
### 6.3 HUD rules

- Keep the center of the screen clear. Put timers and stage objective at the top, contextual prompts near the relevant object and player status in a consistent corner.
- Only show stamina, battery, detection or team progress when the active stage needs it.
- Use brief, readable prompts. Explain a stage mechanic before the countdown, not only during the first hazard.
- Show clear state transitions: ACTIVE, QUALIFIED, ELIMINATED, SPECTATING and FINALIST.
- Avoid excessive permanent UI. A spectator should be able to understand who is still active and what the current objective is.
### 6.4 Accessibility and comfort

- Independent controls for master volume, music, ambience and effects.
- Reduced camera shake and reduced flashing / high-intensity effects options.
- Subtitles or captions for gameplay-critical sound information.
- Do not communicate critical state with color alone. Pair signal colors with a clear icon, text or animation.
- Adjustable camera sensitivity and field of view within tested limits.
- Provide readable text size and sufficient contrast for the stage objective and countdown.
## 7. Technical design

### 7.1 Recommended architecture

The recommended implementation is a browser client plus a Node.js authoritative multiplayer server. The client renders the scene and sends player inputs. The server owns room state, player status, stage rules, hazard outcomes and tournament results.

| LAYER | RECOMMENDED TECHNOLOGY | RESPONSIBILITY |
| --- | --- | --- |
| Web application | React + TypeScript + Vite | Landing page, guest flow, lobby, menus and game shell. |
| 3D renderer | Three.js + React Three Fiber + Drei | Scene rendering, camera, character models, animation and visual effects. |
| Game server | Node.js + TypeScript + Colyseus | Room lifecycle, invitations, synchronized state, match state and authoritative rules. |
| Shared code | TypeScript package | Shared types, constants, movement input contracts and stage definitions. |
| 3D assets | Blender, export to GLB / glTF | Characters, enemies, stages, animation clips, props and collision proxies. |
| Persistence | No database required for the first guest-only prototype | Add a database only when persistent accounts, history or settings are approved. |
| Hosting | Static web hosting / CDN plus WebSocket-capable Node server | Serve client assets and host live game rooms. |

### 7.2 Rendering decision

Use Three.js with React Three Fiber for the first implementation. React Three Fiber is a React renderer for Three.js. Pin a stable compatible release pair in the package lockfile; do not adopt an alpha renderer release for the initial production baseline. The official documentation describes version pairing requirements and currently identifies v10 as alpha, so use the stable line unless a deliberate technical review changes the decision. [1]

- Use WebGL 2 as the initial compatibility baseline. The current Three.js WebGLRenderer documentation states that WebGL 1 is not supported from r163. [2]
- Use GLTFLoader for Blender-exported glTF / GLB assets. The loader supports multiple glTF extensions, including mesh and texture compression options. [3]
- Use cached loading, shared geometries and materials, instancing for repeated objects, and frame-loop mutation for high-frequency animation. Avoid unnecessary React state updates inside the render loop. [4]
### 7.3 Multiplayer model

Use Colyseus rooms as isolated match instances. Each room holds its own player roster, stage state, tournament progression and messages. The framework supports private room visibility, client limits, room lifecycle hooks, server-owned schema state and client reconnection flows. [5][6][7][8]

| NETWORK CONCERN | PROPOSED DESIGN |
| --- | --- |
| Authority | Server validates movement, collision events, stage rules, qualification, elimination and winner declaration. |
| Client input | Client sends sequenced input state or input events. It does not send “I won”, “I crossed safely” or “I eliminated player X”. |
| Simulation | Begin testing with a fixed server simulation step. A 30 Hz simulation is a proposed starting point, not a final commitment. |
| State updates | Start with Colyseus default patch interval or a measured 20 Hz state update baseline, then profile. Colyseus documentation lists a 50 ms default patch rate. [5] |
| Local responsiveness | Use local prediction for the owning player only where it can be reconciled safely. Render remote players with interpolation. |
| Room isolation | One room equals one tournament. Players in one room do not see or affect another room. |
| Capacity | Set maximum clients to 30. Reject additional join requests before they can enter a running room. |
| Reconnect | Allow temporary connection loss to recover through a short grace period. Reset held movement inputs when reconnect completes. |
| Fairness | Use server timestamps and stage windows. Apply input rate limits and validate plausible movement and interactions. |

### 7.4 Private invitation and guest identity

1.  Host requests a room from the application server.

2.  Server creates a Colyseus room with a maximum of 30 clients and marks it private / unlisted according to the selected discovery behavior.

3.  Application server issues a cryptographically random invitation token that resolves to the room. The raw internal room identifier should not be treated as a secret by itself.

4.  Guest opens the invite URL, enters a display name and selects a character. The invite token is validated before room admission.

5.  Server checks room state, expiry, capacity, join policy and whether new arrivals are allowed. Once the match starts, new joins are rejected while valid reconnects remain allowed.

6.  Guest receives a temporary session identity and reconnect token. No user account is created.

- Invite tokens should be unguessable, rate-limited and revocable when a room closes or starts.
- The host can copy the invite link and room code. Do not expose an unfiltered public room browser in the first release.
- Guest nickname length and character set must be limited. Apply basic profanity and impersonation protections appropriate for a private party game.
- Avoid storing personal data that the game does not need. A display name is not an account identity.
### 7.5 Room and tournament state

| STATE OBJECT | EXAMPLE FIELDS | OWNER |
| --- | --- | --- |
| Room | roomId, inviteTokenHash, hostSessionId, maxPlayers, phase, createdAt, locked | Server |
| Player | sessionId, displayName, characterPresetId, ready, connected, teamId, status, transform, progress | Server |
| Tournament | currentRound, stageId, stageSeed, activePlayerIds, eliminatedPlayerIds, resultOrder | Server |
| Stage | stagePhase, startTime, endTime, timerRemaining, hazardStates, objectiveStates | Server |
| Client preferences | volume, cameraSensitivity, graphicsQuality, reducedShake | Client local settings |

Do not broadcast every internal value to every player. Synchronize only the fields clients need to render the current game state. Keep authoritative scoring and validation data server-side.

### 7.6 Room lifecycle

| ROOM PHASE | RULE |
| --- | --- |
| Created | Host is assigned. Invitation is generated. Room is open to invited guests. |
| Lobby | Players may join, choose preset and ready up. Capacity is 30. |
| Countdown | Room locks against new players. Existing reconnects are permitted. |
| Tournament active | Stage progression and eliminations are server-controlled. |
| Results | Winner and placements are frozen. Spectators can remain. |
| Replay choice | Host may create a new tournament in the same room after a reset, or return to a fresh lobby state. |
| Closed | Room is disposed after all clients leave or after an approved empty-room / post-match timeout. |

### 7.7 Physics and collision decision

Do not allow the browser to be the sole authority for collisions. The first technical spike should compare a lightweight server-side kinematic controller with a shared physics implementation such as Rapier. Select the simplest approach that can reliably validate movement, hazards, moving platforms and falls across the first two stages.

- Use simple server collision proxies for static floors, walls, platforms and hazard volumes.
- Avoid simulating decorative rigid bodies on the server unless they affect qualification or elimination.
- Keep gameplay collider dimensions consistent across characters and visual meshes.
- Moving platforms and stage hazards must have server-owned transforms or deterministic schedules.
- Use the same coordinate scale and stage collision metadata in Blender and game code.
### 7.8 Hosting and operations

- Serve the frontend over HTTPS from a CDN or static host.
- Host the Colyseus server on infrastructure that supports persistent WebSocket connections and appropriate session routing.
- Choose the initial server region based on where the first real player groups are located and measured latency, not assumption.
- Log room lifecycle, match results, disconnections, stage transitions and server errors. Avoid logging unnecessary guest data.
- Add health checks, room metrics, crash reporting and an admin-only way to inspect or close stuck rooms before a larger test.
- A database is not a launch requirement for guest-only private matches. Add persistent storage only when a specific feature requires it.
## 8. Performance and quality targets

These are initial engineering targets for testing. They are not guaranteed performance claims. Establish named reference hardware and a test region before treating them as release gates.

| AREA | INITIAL TARGET | VALIDATION |
| --- | --- | --- |
| Room capacity | 30 concurrent players in one room. | Automated load test with 30 clients plus at least one real-browser test at full capacity. |
| Frame rate | Target 60 FPS at 1080p on the chosen reference desktop; provide a reduced-quality mode for weaker machines. | Measure per-stage frame time with 30 visible contestants, enemy and hazard effects active. |
| Minimum playability | Avoid sustained performance below 30 FPS on the agreed minimum test machine. | Run extended playtests with lower graphics settings. |
| Network update | Start with server simulation around 30 Hz and state sync around 20 Hz for evaluation. | Measure bandwidth, server CPU, correction events and visual smoothness. |
| Match stability | Complete a full tournament without room crash, state divergence or stuck transition. | Repeated end-to-end matches and soak testing. |
| Reconnection | Recover a temporary disconnect within the configured grace period. | Drop network during lobby and during a live stage. |
| Asset loading | Load only the current stage and required shared assets; avoid downloading the full game-world pool at startup. | Network waterfall and memory profiling. |
| Browser baseline | Current stable desktop Chrome and Edge; test Firefox as a compatibility target. | Browser QA matrix. Safari desktop support is TBD. |

### 8.1 Optimization rules

- Use shared materials and geometries for repeated props and character components.
- Use instancing for repeated objects such as bolts, debris, lamps, shelves and environmental clutter where practical.
- Create level-of-detail versions for large scenes and objects visible at multiple distances.
- Use baked lighting or hybrid lighting for static environments; reserve real-time lights for important gameplay moments.
- Use texture atlases and compressed texture formats after validating visual quality on supported browsers.
- Keep particle counts, transparent materials, dynamic shadows and post-processing within a measured budget.
- Load only assets required for the current stage plus shared character and UI assets.
- Profile with 30 characters on screen. A scene that performs well with one player is not an acceptable performance test.
## 9. Blender and asset production specification

### 9.1 Blender-to-web pipeline

1.  Concept and blockout are approved before detailed modeling.

2.  Create the Blender scene using the project scale and naming conventions.

3.  Separate visual meshes from gameplay collision geometry.

4.  Create materials with a consistent PBR approach and restrained texture sizes.

5.  Rig and animate reusable characters and enemies.

6.  Prepare LODs and simplified collision meshes where required.

7.  Export selected assets to GLB / glTF and validate in the web game, not only inside Blender.

8.  Run visual, animation, collision, loading and performance checks before an asset is marked approved.

### 9.2 Asset conventions

| RULE | SPECIFICATION |
| --- | --- |
| Scale | Use a consistent metric scale. Define one game unit as one meter unless the technical spike identifies a reason to change it. |
| Origins | Character origin at the ground contact / root location. Props use deliberate pivots suited to their interaction or animation. |
| Naming | Use stable prefixes: CHR_ character, ENM_ enemy, STG_ stage, PRP_ prop, VFX_ effect, COL_ collision. |
| Materials | Use shared, named materials. Avoid accidental duplicate materials and excessive material slots. |
| Geometry | Apply transforms and validate normals. Keep high-detail sculpt or source meshes separate from game export meshes. |
| Collision | Use simple named collision meshes or authored collider metadata. Do not use detailed visual meshes as physics by default. |
| Animation | Use consistent clip names and shared skeleton conventions. Validate root motion behavior before integration. |
| Export | GLB / glTF is the web interchange format. Keep the source .blend file in the asset repository. |
| Metadata | Attach stable object IDs or a sidecar manifest for interactive props, spawn points, hazards and stage triggers. |

### 9.3 Naming examples

- CHR_Contestant_Base.blend / CHR_Contestant_Base.glb
- CHR_Head_ClockworkMask.blend / CHR_Head_ClockworkMask.glb
- ENM_WardPursuer.blend / ENM_WardPursuer.glb
- STG01_RedLightGreenLight.blend / STG01_RedLightGreenLight.glb
- COL_STG01_StaticCollision.glb
- PRP_STG04_ClockMechanism.blend / PRP_STG04_ClockMechanism.glb
- VFX_ElectricArc_Short.glb
### 9.4 Stage handoff package

| DELIVERABLE | CONTENTS |
| --- | --- |
| Source scene | Organized .blend file with collections named for environment, props, lighting, collision and gameplay markers. |
| Runtime export | Optimized .glb / glTF assets, split into sensible load groups where needed. |
| Collision package | Simplified collision meshes or a validated collider manifest. |
| Gameplay manifest | Stable IDs for spawn points, hazards, interactables, exits, checkpoints and enemy paths. |
| Lighting notes | Which lights are baked, dynamic or decorative; required post-processing assumptions. |
| Asset preview | Screenshots from Blender and in-game screenshots at target gameplay camera distance. |
| Validation report | Triangle counts, texture sizes, file sizes, animation list and known limitations. |

### 9.5 First visual production batch

| ORDER | ASSET | WHY FIRST |
| --- | --- | --- |
| 1 | One contestant base body, rig and 3 preset variations. | Validate silhouette, scale, animation and modular costume workflow. |
| 2 | Red Light, Green Light greybox and collision. | Prove the first full stage before high-detail modeling. |
| 3 | The Shepherd / signal prop. | Core visual identity and gameplay signal. |
| 4 | Red Light, Green Light final environment art pass. | Test lighting, fog, materials and 30-player readability. |
| 5 | Factory modular prop kit. | Create reusable hazard and industrial asset workflows. |
| 6 | Ward pursuer and stealth room kit. | Validate enemy rig, animation and stage-specific AI presentation. |
| 7 | Remaining character presets and stage kits. | Scale production after the first assets and runtime pipeline are proven. |

## 10. Production plan and milestone gates

The production sequence is risk-first. Prove room networking and one complete stage before producing the entire stage pool or all 30 character presets. Each milestone has a gate; do not move forward just because code or assets exist.

| MILESTONE | WORK | EXIT / ACCEPTANCE GATE |
| --- | --- | --- |
| M0 - Technical spike | Create repo, confirm stable dependency versions, render one Blender GLB, connect two browser clients to one room, test 30 simulated clients. | Architecture decision record, a working local client/server connection, 30-client load-test report and known-risk list. |
| M1 - Graybox core | Third-person controller, camera, basic collision, lobby shell, one graybox arena. | One player can complete a simple test course. No final art required. |
| M2 - Private room | Room creation, invite token, guest join, character preset selection, ready state, host permissions, capacity. | At least two real browsers join through a link; room rejects a 31st player. |
| M3 - First playable stage | Red Light, Green Light rules, Shepherd state, movement validation, timer, qualification, elimination, spectator view. | A full small-group round completes correctly from start to results. |
| M4 - 30-player vertical slice | Optimize shared character model, sync movement, validate full lobby, reconnect, stage load and performance. | 30 clients complete the first stage under agreed test conditions. |
| M5 - Two-stage tournament | Add Tug of War and inter-round tournament state. | Two rounds run sequentially with correct team assignment and qualified roster. |
| M6 - Core stage framework | Implement common stage lifecycle, stage result contract and server-owned hazard pattern. | A new stage can be added without rewriting room/tournament logic. |
| M7 - Content production | Build the remaining stage pool and enemy variants; create 30 preset combinations. | Each stage passes its own functional and performance gate. |
| M8 - Full tournament | Complete all seven round slots and alternate stage selection. | Full end-to-end tournament produces one champion. |
| M9 - Private beta | Invite groups, gather feedback, run soak tests, improve onboarding and balance. | No critical issues in room entry, progression, scoring or reconnect. |
| M10 - Web release | Production hosting, monitoring, final art/audio, legal asset review and public-facing website. | Release checklist signed off; host can create and share a playable private room. |

### 10.1 First playable vertical slice

> **NON-NEGOTIABLE FIRST BUILD** One real browser room, one character controller, one finished stage, one authoritative elimination rule, spectator mode and a winner/results state. Prove it with real clients before building the full roster and stage set.

- Temporary character and greybox environment assets are acceptable in the first pass.
- Do not start by modeling all 30 contestants.
- Do not start by building all 10 stages in parallel.
- Do not add public matchmaking, accounts, cosmetics or progression before the core private match is stable.
## 11. Testing and acceptance criteria

### 11.1 Core gameplay tests

| TEST | PASS CONDITION |
| --- | --- |
| Movement | Movement is responsive, bounded by the stage, and consistent across character presets. |
| Red Light detection | Server detects movement during red within defined tolerance and does not falsely eliminate a player solely due to camera movement or decorative animation. |
| Tug of War | Team scoring is based on timed inputs, not raw message spam. Team assignment and result are deterministic. |
| Obstacle collision | Hazards and platforms produce consistent outcomes. Players cannot pass through critical barriers or stand on non-collidable decorative geometry. |
| Escape-room logic | Puzzle state is shared, interactions are validated and the stage cannot become permanently blocked by one invalid interaction. |
| Enemy AI | Enemy state transitions are visible and authoritative. Repeated target changes do not cause unstable behavior. |
| Qualification | The server produces one stable result order and only qualified players enter the next stage. |
| Final winner | Exactly one champion is declared, including timeout / overtime conditions. |

### 11.2 Multiplayer tests

- Two real desktop browsers can create and join a room through an invitation link.
- A room supports a full set of 30 player sessions. A 31st new session is rejected with a clear message.
- All connected players receive a consistent roster, stage phase, player status and results.
- A temporary network drop follows the documented reconnect flow and does not create a duplicate player slot.
- An eliminated player cannot re-enter active gameplay or change the tournament result.
- A non-host cannot start the match or change host-only room settings.
- When the host leaves, host transfer follows the documented rule without giving the new host server authority.
- The room closes cleanly after the final timeout or when all players leave.
### 11.3 Security and abuse tests

- Invitation tokens are unguessable, expire or become invalid when a room closes, and are rate-limited.
- Every join request is validated against room phase and capacity.
- Nickname input is length-limited and sanitized for display.
- Client message rate limits prevent input flooding.
- Server rejects impossible movement, invalid interaction distance, impossible stage transitions and forged result messages.
- No client can directly mutate authoritative room state.
### 11.4 Quality assurance matrix

| TEST GROUP | SCENARIOS |
| --- | --- |
| Browser | Current Chrome and Edge; Firefox compatibility pass; reload, tab close and reconnect. |
| Hardware | Reference desktop, integrated GPU system and lower-quality graphics preset. |
| Network | Low latency, moderate latency, packet loss, temporary disconnect and reconnect. |
| Concurrency | 2, 10, 20 and 30 clients. Include load-test bots and real browsers. |
| Tournament | Normal completion, all players eliminated edge cases, timer expiry, host departure and room restart. |
| Stage | Each hazard, objective, spawn, checkpoint, spectator camera and cleanup path. |
| Content | All 30 presets, all animation clips, audio cues, subtitles and reduced-effect settings. |

## 12. Scope boundaries

### 12.1 Included in the initial release

- Desktop browser client with keyboard and mouse controls.
- Private rooms with shareable invitation links and room codes.
- Guest nickname and no mandatory account registration.
- Up to 30 contestants per room.
- 30 curated character presets on a shared modular character system.
- Seven-round default tournament with a 10-stage content pool.
- Server-authoritative elimination and tournament results.
- Spectator mode, results screen and replay / return to lobby flow.
- Original 3D assets and audio created for the project or properly licensed.
### 12.2 Explicitly out of scope

- Mobile browser controls or native mobile applications.
- Public matchmaking, public leaderboards or ranked seasons.
- Mandatory user accounts, friends lists or persistent player progression.
- Paid cosmetics, in-game currency, advertisements or subscriptions.
- Voice chat and open text chat.
- Player-generated stages or mod support.
- Direct weapon combat or complex fighting systems.
- Large persistent world, MMO systems or cross-region seamless lobbies.
- A large catalog of unique enemy types beyond what the stage pool requires.
## 13. Risk register

| RISK | WHY IT MATTERS | MITIGATION / RESPONSE |
| --- | --- | --- |
| 30-player performance | 30 animated characters, effects, enemy AI and large environments may overwhelm browser GPU or server CPU. | Profile with 30 entities early. Use shared rigs, instancing, LOD, selective shadows and stage asset budgets. |
| Network fairness | Latency can create false movement violations or inconsistent collisions. | Server timestamps, tolerances, interpolation, input sequencing, reconnection and authoritative validation. |
| Scope expansion | Ten distinct stages and 30 character presets are substantial content production. | Finish a vertical slice first; add stages through a common interface; prioritize default tournament slots. |
| Physics mismatch | Client and server collision logic may disagree. | Choose physics approach during M0. Keep authoritative colliders simple and test moving platforms early. |
| Enemy AI complexity | Unpredictable or invisible detection can feel unfair. | Use explicit AI states, visible cues, debug overlays and reproducible stage seeds. |
| Asset pipeline problems | Blender exports can differ from in-editor appearance or contain expensive materials. | Validate every GLB in the actual browser scene and track file size, texture size and draw calls. |
| Guest abuse | Invite links can be forwarded; nicknames may be inappropriate. | Rate-limit join attempts, allow host removal, sanitize names and keep rooms invite-only. |
| No persistent identity | Players may lose a session after closing the tab. | Set expectations clearly. Provide reconnection tokens for transient drops only; do not promise account recovery. |
| Small-room balancing | A tournament designed for 30 may break with 2 to 10 players. | Test dynamic qualification and team balancing across multiple room sizes. |

## 14. Open decisions and validation backlog

The following topics are not blockers for drafting the first prototype, but they must be resolved before their dependent milestone.

| ITEM | CURRENT POSITION | DECISION / TEST REQUIRED BY |
| --- | --- | --- |
| Meaning of “private” monetization | RESOLVED v0.2: internal Creative Nomads use, no monetization. | Done. |
| Tone for a workplace game | Proposed: tense but playful. Keep suspense, drop horror imagery; frame elimination as leaving the round, not harm. Affects The Quiet Ward, The Blackout and enemy designs. | Before any horror-stage production. |
| Tagline | "Thirty enter. Only one survives." kept as a working line. | Before the art and title pass. |
| Standup mode defaults | Quick (1 round) default; Short (3 rounds) optional. | Playtest with the team after Stage 01 is playable. |
| Standing team room | Reusable daily link; may need storage. | Before Standup mode beta. |
| Minimum player count | Proposed minimum 2; full design tuned for 30. | Test 2, 4, 8, 16 and 30-player tournaments. |
| Tournament stage selection | Fixed seven round slots with alternatives in selected slots. | Approve after first stage prototypes and match pacing tests. |
| Physics engine | Rapier versus lightweight custom server kinematic controller. | M0 technical spike. |
| Target hardware | Not yet defined. | Select reference and minimum desktop devices before performance sign-off. |
| Server region | Not yet defined. | Choose based on expected player geography and measured latency. |
| Host departure behavior | Transfer host to next eligible connected player. | Validate UX and permission model in M2. |
| Final stage rules | Three-seal objective plus escalating hazards proposed. | Prototype and playtest before final art production. |
| Character roster theme | 30 presets, exact names and costume themes not yet approved. | Character design pass before full production. |
| Audio and language | English baseline assumed; voice chat excluded. | Confirm captions and language needs before beta. |
| Desktop browser support | Chrome and Edge primary; Firefox compatibility target. | Confirm operating systems and minimum browser versions during M0. |

## 15. Claude Code implementation brief

### 15.1 Project rules

1.  Treat this GDD as the product source of truth. Do not change an approved constraint without recording a proposed change and its reason.

2.  Keep web client, game server and shared types in separate packages or application folders.

3.  The server owns the room state, player status, stage rules, scoring, elimination, qualification and winner declaration.

4.  Use a modular stage interface. Do not hard-code all stage logic into one room class or one React component.

5.  Use Blender GLB assets through a documented asset manifest. Temporary placeholders must be labeled as placeholders.

6.  Build one milestone at a time. Run unit tests, browser tests and room integration tests before declaring a milestone complete.

7.  Add structured logs for room lifecycle and stage transitions, but do not log unnecessary personal information.

8.  Keep a decision log for physics, networking, hosting, browser support and performance thresholds.

9.  Provide reproducible setup scripts and a README for local client and server startup.

10.  Never claim support for 30 players until a 30-client test has passed and the test report is recorded.

### 15.2 Proposed repository structure

CN-Multiplayer/   (repository; formerly THE-LAST-TRIAL/)
  apps/
    web/                  # React UI, Three.js scene, camera, input, HUD
    server/               # Colyseus rooms, simulation, stages, match rules
  packages/
    shared/               # Types, constants, messages, stage contracts
    game-rules/           # Pure functions for qualification and scoring
  assets/
    characters/           # GLB files, thumbnails, preset manifests
    enemies/
    stages/
    props/
    audio/
  blender/                # Source .blend files and export scripts
  docs/                   # GDD, art direction, stage specs, ADRs
  tests/
    unit/
    integration/
    load/
  README.md
  CLAUDE.md

### 15.3 Stage module contract

Every stage should implement the same lifecycle contract. The actual TypeScript interface is to be defined during M0 / M1, but it should cover the responsibilities below:

| METHOD / EVENT | RESPONSIBILITY |
| --- | --- |
| load | Load visual assets and register stage definitions. |
| setup | Place players, create stage state and initialize hazards. |
| brief | Publish rules, controls and stage-specific UI configuration. |
| start | Start the timer and enable stage interactions. |
| update | Advance authoritative hazards, enemies and objectives. |
| handleInput | Validate contextual player input. |
| eliminate / qualify | Update player status based on server-verified events. |
| getResults | Return a stable ordered result and qualifier list. |
| cleanup | Cancel timers, remove entities and release stage-specific state. |

### 15.4 Initial Claude Code task sequence

1.  Inspect the repository and report its current state. Do not overwrite existing project files without inspection.

2.  Create the client, server and shared package structure with stable dependency versions.

3.  Create a local development setup and health-check endpoints.

4.  Implement private room creation, invite validation, guest join, host designation and maximum capacity 30.

5.  Implement a basic third-person placeholder character and local camera.

6.  Synchronize player transforms through the authoritative room and demonstrate two real browser clients.

7.  Implement reconnect handling and host transfer.

8.  Implement Red Light, Green Light as the first server-authoritative stage.

9.  Add automated tests for room capacity, red-light movement detection, elimination, qualification and stage reset.

10.  Run the 30-client load and real-browser visual test before moving to the next stage.

## 16. Definition of done

> **FIRST PLAYABLE** The first playable milestone is complete only when a host can create a private room, at least two guests can join through the invitation URL, players can control a character in the same 3D stage, Red Light / Green Light runs with server-owned rules, eliminated players can spectate, and the server declares the correct qualifiers.

> **30-PLAYER VERTICAL SLICE** The 30-player milestone is complete only after 30 clients can join the same room, see a consistent player roster and participate in one complete round without critical desynchronization, crash or performance failure under the agreed test conditions.

> **FULL INITIAL RELEASE** The initial release is complete when the seven-round tournament flow, all approved stage variants, 30 character presets, spectator/results flow, private invitation system, operational monitoring and release checks are working together in production.

## Appendix A. Technical reference links

The following official documentation was checked while preparing the technical baseline. Framework versions and APIs should be rechecked at implementation time and pinned in the project lockfile.

[1] React Three Fiber - Introduction and version pairing

https://r3f.docs.pmnd.rs/getting-started/introduction

React Three Fiber describes itself as a React renderer for Three.js and documents compatibility between React and R3F versions; current docs identify v10 as alpha.

[2] Three.js - WebGLRenderer

https://threejs.org/docs/pages/WebGLRenderer.html

Renderer documentation, including the WebGL 2 baseline and WebGL 1 support note.

[3] Three.js - GLTFLoader

https://threejs.org/docs/pages/GLTFLoader.html

glTF 2.0 loading and supported extensions.

[4] React Three Fiber - Performance pitfalls

https://r3f.docs.pmnd.rs/advanced/pitfalls

Guidance on sharing geometry and materials, instancing, avoiding state updates in render loops and reusing loaded assets.

[5] Colyseus - Rooms

https://docs.colyseus.io/room

Room isolation, lifecycle, game loop, maxClients and patch rate settings.

[6] Colyseus - Room visibility and access

https://docs.colyseus.io/matchmaker/visibility

Differences between locked, private and unlisted rooms.

[7] Colyseus - State synchronization

https://docs.colyseus.io/state

Server-owned room state and synchronized client updates.

[8] Colyseus - Reconnection

https://docs.colyseus.io/room/reconnection

Automatic and manual reconnection flows.

[9] Blender Manual - glTF 2.0

https://docs.blender.org/manual/en/dev/addons/scene_gltf2.html

Blender glTF export settings and scene asset handoff.
