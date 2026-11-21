# Character Lock Register — CN TRIAL

## Owner decision
The supplied 30-character designs are final. They must not be changed during Stage 1.5.

The six source boards have been copied byte-for-byte into `references/FINAL_CHARACTER_BIBLE_LOCKED/`. They are visual source references, not permission to redesign or create variants.

## Non-negotiable rules
- Exactly 30 contestant identities.
- No new characters, no replacements, no deleted contestants.
- No changes to silhouette, face, hair, mask, headwear, clothing, footwear, accessories, colors or personality-defining visual features.
- No new costume skins or alternate concepts.
- Reuse existing approved 3D models if present.
- If a model must still be built, reproduce the final approved 2D design faithfully.
- Preserve original reference files. Never overwrite or edit them.
- The Watcher is a separate existing approved enemy, not a contestant.

## Source roster discrepancy checkpoint
The uploaded boards show multiple roster/name versions and different detailed-character examples. They must not be treated as one merged list. Claude must inspect the existing repository and find the current approved 30-character roster manifest / IDs and model mapping.

If there is no clear canonical roster in the project, or the names / IDs / appearances conflict, Claude must stop before character modeling or renaming and create `docs/CHARACTER_ROSTER_DISCREPANCY_REPORT.md` with:
- each supplied reference file;
- visible roster names / IDs where legible;
- current project manifest and asset names;
- exact mismatch list;
- the decisions required from the project owner.

Do not make a guess, merge the rosters, or silently select one board over another.

## Integrity
A SHA-256 manifest for the six untouched reference images is available in `templates/CHARACTER_REFERENCE_SHA256.json`.
