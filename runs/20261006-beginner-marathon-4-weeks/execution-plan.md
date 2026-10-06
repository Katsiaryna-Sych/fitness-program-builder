# Execution Plan — 20261006-beginner-marathon-4-weeks

Flags: needs_safety=no · needs_cardio=yes · needs_nutrition=no

| group | agents | status | why |
|---|---|---|---|
| 1 | exercise-researcher | selected | always |
| 1 | safety-analyst | skipped | needs_safety=no (no injuries or conditions reported) |
| 1 | cardio-planner | selected | marathon (endurance) goal |
| 2 | program-designer | selected | always (depends on group 1) |
| 3 | nutrition-planner | skipped | needs_nutrition=no (client declined nutrition guidance) |
| 3 | progress-planner | selected | always |
| 4 | validator | selected | domain gates G1–G11, targeted retry (max 3 attempts per step) |
| 5 | synthesizer | selected | after validation PASS |
| 6 | human approval | required | typed APPROVE / REJECT with draft hash |
| 7 | html-builder | selected | after verified approval |

Risk noted at confirmation: G7 (prescription matches the primary goal) is expected to fail. The client confirmed a marathon in 4 weeks at 2 × 20 min as a complete beginner and was told the run will likely end blocked.
