# CN TRIAL · Stage 1.5 sign-off sheet

For the owner. Ticked items are verified by the evidence named. Unticked items need your decision or a test this environment could not run.

| Pack checklist item | State | Evidence |
|---------------------|-------|----------|
| Prompt 01 baseline audit complete; existing Stage 01 backup captured | ✅ | `docs/stage15/STAGE_1_5_BASELINE_AUDIT.md`; checkpoint `main` 7c8e507 and PR #17 history (tag pushes are blocked here) |
| Canonical 30-character roster verified; no unresolved name / ID mismatch | ❌ **Owner** | `docs/CHARACTER_ROSTER_DISCREPANCY_REPORT.md` |
| All six final character reference sheets preserved unchanged | ✅ | `references/STAGE_1_5/FINAL_CHARACTER_BIBLE_LOCKED/`, SHA-256 match |
| Matte-painted background integrated; camera seams checked | ✅ | P02 report, before / after |
| Distant tree PNG cutouts integrated; no false collision or visible repeating pattern | ✅ | P02 / P03 reports (decorative only, never sent to the server) |
| Foreground ground, fences, towers, props and materials polished | ✅ (runtime polish; approved geometry unchanged) | P03 report |
| Sky, clouds, moon / stars, fog, lighting and VFX tuned | ✅ (colour-grade lock: owner) | P04 report, signal captures |
| Obstacle twist approved, fair and server-authoritative | ✅ built and tested; ☐ **owner approval** of the design and the off-by-default choice | P05 spec, `test:obstacles` |
| Exactly the 30 approved contestants integrated | ❌ **Blocked** | Roster report |
| Existing approved Watcher integrated without redesign | ✅ | P06 report |
| Complete UI flow connected to live game state | ✅ (character select pending the roster) | P07 report, `test:ui` |
| 30-player lobby and stage test completed | ✅ 5 real browsers + 25 simulated; ☐ 30 humans | P08 report |
| Performance baseline vs final measurements documented | ✅ software-rendering and server metrics; ☐ real GPU | P08 report |
| No critical regressions or missing assets | ✅ | Full regression green |
| Final screenshots, manifests, build and reports delivered | ✅ | `INDEX.md` |
| Owner approves the Stage 1.5 freeze before Stage 02 | ☐ **Owner** | — |

To approve: review the Stage 1.5 pull request and the screenshots. Decide the roster (decision 028) and decision 027. Then merge, which deploys.

## Owner decision, 22 November 2026

"Approve all then merge it":
- Decision 027 approved; Stage 1.5 merged (PR #18) and deployed.
- Roster recommendations approved: rename "The Watcher" contestant, original redesigns for copied designs, shared base body.
- **Still needed before character production:** the master roster (which board, or a roster table).
- Still recommended: a check on real computers and a 20–30-person playtest.
