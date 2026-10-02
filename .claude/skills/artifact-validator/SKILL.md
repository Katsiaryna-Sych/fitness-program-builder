---
name: artifact-validator
description: Structural and citation quality gate for Fitness Program Builder workflow artifacts. Use after any agent writes or revises an artifact under runs/<run-id>/artifacts/, before dependent work starts, and when writing an artifact to know its required structure.
---

# artifact-validator

Reusable gate that every artifact must pass before the next execution group starts.
It has two parts: **templates** (what an artifact must look like) and a **deterministic checker** (does it?).

## 1. Writing an artifact (for producing agents)

- Copy the structure of `.claude/skills/artifact-validator/templates/<artifact-file-name>` exactly:
  the same H1 role, the metadata line, every `##` section **in the same order**, the same table columns.
- Metadata line, second line of the file:
  `> Run: <run-id> · Step: <step-id> · Owner: <agent-name> · Attempt: <n>`
- Fill every section. If something does not apply write `Not applicable — <reason>.`. Never leave
  `TODO`, `TBD`, `…`, `{placeholders}` or empty tables.
- Every recommendation (exercise, guideline, number) must trace to a real source in the `## Sources`
  section. Exercises link to `https://wger.de/en/exercise/<id>/view-base` with a real wger id from the MCP server.
- Never invent URLs. Only cite pages you actually retrieved with WebSearch/WebFetch or the wger MCP.

## 2. Checking an artifact (for the coordinator and the validator)

Run, for every artifact written in the current group:

```bash
node .claude/skills/artifact-validator/scripts/check-artifact.mjs <run-id> <step-id> --online
```

The script checks: file exists, H1, metadata line, required sections present and ordered (taken from the
template), no placeholders, `## Sources` contains links, no fake URLs, wger links well-formed, ≥5 wger
links in the exercise library, a `PASS|FAIL` verdict in the validation report, and with `--online` that every
URL responds (401/403/429 count as reachable because many sites block bots).

- Exit code `0` → structural gate **PASS** → `state.mjs pass <run-id> <step>`.
- Exit code `1` → **FAIL** → `state.mjs fail <run-id> <step> "<failed checks>"`, then re-run the owning agent
  with the failed-check table as revision instructions. The retry budget is enforced by `state.mjs`.

## 3. Semantic review (model judgment, after the script passes)

Also read the artifact and confirm, briefly:
1. It answers the confirmed requirements in `01-requirements.md` (goal, level, days, minutes, equipment, constraints).
2. Tables are internally consistent (e.g. sessions listed in the schedule exist in Sessions).
3. Sources actually support the claims next to them (spot-check 2–3 with WebFetch when unsure).

Report as: `artifact-validator <step>: PASS` or `FAIL — <numbered findings with fix instructions>`.
