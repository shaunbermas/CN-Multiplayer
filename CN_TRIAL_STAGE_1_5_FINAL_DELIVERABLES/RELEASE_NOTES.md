# CN TRIAL · Stage 1.5 release notes

Branch `claude/stage-1-5` (not deployed; awaiting the owner's approval).

## World and atmosphere
- **Painted world** around the yard: hazy mountain ridges; an industrial skyline with lit windows, chimneys, cranes, a truss bridge and pylons; a forest line. All original procedural art.
- **Distant trees:** 1,100 tree cutouts drawn in one instanced batch. The old stacked-cone trees are replaced by 49 lit tree impostors at the approved positions.
- **Night sky** with moon, twinkling stars and drifting clouds. Fog matches the sky horizon.
- **Puddles, wet asphalt and steel** reflect the sky; the black-hole puddles are fixed.
- **Floodlights** with soft light cones; ground mist along the fences.
- **High tier:** bloom on the lamps and signals, with a restrained colour grade and vignette.
- **Signal wash:** green, amber or red light washes the far end of the yard with the signal.

## The Watcher
The approved design is unchanged:
- its signal lens glows brighter;
- when the server spots a player, a red beam runs from its lens to that player, with a ring at their feet;
- a red searchlight sweeps the field during red;
- the retired Shepherd lantern light no longer lights it.

## Optional obstacle twist (host toggle, off by default)
- Four rows of jersey barriers with mirror-symmetric 6 m gaps.
- A gate that slides across the course only on green and amber, and freezes on red.
- The server enforces both. Unticking the toggle restores the original rules.

## Interface
- Main menu with the CN TRIAL wordmark, guest nickname, create a private room, join with a code, How to play, Settings.
- Invite code with Copy code and Copy link (`?room=CODE`).
- A 30-slot lobby with ready ticks and host controls.
- Character-selection screen: shows "roster pending" until the owner confirms the roster.
- New HUD: stage label, GREEN LIGHT / GET READY / RED LIGHT banners with icons, timer, alive / eliminated / qualified counts, objective, connection quality.
- Red-light feedback: a SCANNING label and a red edge pulse; a "YOU WERE SPOTTED" stamp; an elimination feed.
- Spectator view showing who you watch.
- Results with qualified and eliminated counts, the stage winner and rankings.
- Clear screens for connection lost (Reconnect), room full and update needed.
- Settings: graphics (Auto / High / Medium / Low), mouse sensitivity, invert look, interface size, red edge pulse.

## Performance
- **Stage models:** download size halved (8.7 MB → 3.9 MB) with meshopt-compressed copies; the approved originals are untouched.
- **Code split:** the menu loads a 325 KB chunk (was 1.6 MB); the 3D game loads in the background.
- **Quality tiers:** tier by tier, effects switch off, with an adaptive fallback from High.

## Server and protocol
- Protocol v4: the round state carries `obstacles`, and a lobby `ready` message was added.
- Rooms by invite code (the existing Durable Object per room).
