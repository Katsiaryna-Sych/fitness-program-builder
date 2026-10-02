---
name: fitness-html-theme
description: Rendering rules and the predefined HTML template for the final Fitness Program Builder deliverable (fitness-program.html + fitness-program.md). Use when turning an approved program draft into user-facing output.
---

# fitness-html-theme

The final deliverable is two files in `runs/<run-id>/output/`:
- `fitness-program.md` — the approved draft, cleaned for the reader.
- `fitness-program.html` — the same content rendered into `template.html` (next to this file).

Both must have the **same 12 sections in the same order on every run**:
Overview · Profile & Requirements · Safety Notes · Weekly Schedule · Workout Sessions · Cardio & Conditioning ·
Progression Plan · Nutrition & Recovery · Tracking & Assessments · Exercise Reference · Sources · Disclaimer.

## Markdown output rules
1. Start from the approved `program-draft.md` verbatim — do not add, drop or reword recommendations.
2. Remove the metadata line (`> Run: … · Step: … · Owner: …`).
3. Remove any mention of internal workflow files, steps or agent names (a hook blocks the write otherwise).

## HTML rendering rules
1. Read `template.html` and replace every `{{SLOT}}` — never change the CSS, the section order, ids or numbering.
   - `{{TITLE}}` program H1 · `{{SUBTITLE}}` one sentence from the overview · `{{DATE}}` ISO date
   - `{{CHIPS}}` 4–6 `<span class="chip">` items: goal, level, days/week, minutes, weeks, location
   - each section slot ← the matching `##` section of the Markdown, converted to HTML
2. Conversion: paragraphs → `<p>`, lists → `<ul>/<ol>`, every table → `<div class="table-wrap"><table>…</table></div>`
   with `<thead>`, links → `<a href target="_blank" rel="noopener">`, bold → `<strong>`.
3. In Workout Sessions wrap each `###` session in `<div class="session">…</div>`.
4. In Safety Notes put contraindications / stop rules in `<div class="callout">`; positive tips in `<div class="note">`.
5. Escape `&`, `<`, `>` in text. No external CSS/JS/fonts/images — the file must work offline.
6. A section that is "not part of this program" still appears, with that one sentence.
7. Write the HTML with the Write tool (the approval guard only allows the `html-builder` agent, after approval).
