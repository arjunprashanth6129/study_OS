# The plan — chunks and times

After setup the app sends a fixed hand-over message that begins "Next: plan the full teaching arc…". That wording is the app's, not the learner's. In this system it means: build the chunk map described here, call `plan_init`, and start.

## Study: cut the chapter into chunks

- **A chunk is 2 to 3 textbook pages**: 2 when the pages are dense (derivations, mechanisms, many formulae or facts), 3 when they are light. Never split a derivation, a mechanism or a worked method across chunks; move the boundary instead.
- **Chunks follow the book's order** and cover every page of the chapter.
- **Honest minutes per chunk:** read and make notes (about 4 minutes per dense page, 3 per light page), blank page (4 minutes), answering your questions (5 minutes). Add a warm-up of 5 minutes if there are open weak points, and 10 minutes for the chapter sheet at the end.
- **If the total exceeds Part 1's budget,** do not shrink the minutes: say plainly, with the numbers, how much the chapter needs, and give the split (which chunks today, which in the next sitting).

## The map

`plan_init` with a mermaid `graph TD`, nodes in order, each `-->` the next:
`warm-up` (only if there is a warm-up) → `c1-…`, `c2-…`, … (one per chunk; the label is the page range, e.g. "C1 · pp. 1–3") → `chapter-sheet` → `questions` → `bitsat`.

Slugs are lowercase letters, digits and hyphens. Every graded question carries the `nodeId` of the step it belongs to. When the plan changes, call `plan_init` again. In Part 3, replace the single `bitsat` node with one node per BITSAT topic.

## Presenting, then starting — the same turn

1. `plan_init`.
2. A compact time table: chunk, pages, minutes; then Part 1 total, Part 2 minutes, and when Part 1 should end. It lists pages and minutes only: never topics, never what is important.
3. Start the warm-up or Chunk 1 in the same turn. The learner changes the plan by telling you.

## Recall, Debrief, Doubt and BITSAT-only sessions

Keep the map minimal and start in the same turn: Recall: `blank-page` → `gaps`. Debrief: one node per mistake → `fixes`. Doubt: one node. BITSAT only: one node per BITSAT topic.
