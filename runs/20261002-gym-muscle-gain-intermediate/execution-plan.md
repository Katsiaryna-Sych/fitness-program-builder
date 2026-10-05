# Execution Plan — 20261002-gym-muscle-gain-intermediate

Flags: needs_safety=no · needs_cardio=no · needs_nutrition=yes

| group | agents | status | why |
|---|---|---|---|
| 1 | exercise-researcher | selected | always |
| 1 | safety-analyst | skipped | no injury, condition or risk factor reported |
| 1 | cardio-planner | skipped | goal is muscle gain; no cardio requested |
| 2 | program-designer | selected | always (depends on group 1) |
| 3 | nutrition-planner | selected | client asked for nutrition guidance |
| 3 | progress-planner | selected | always |
| 4 | validator | selected | domain gates G1–G11, targeted retry (max 3 attempts per step) |
| 5 | synthesizer | selected | after validation PASS |
| 6 | human approval | required | typed APPROVE / REJECT with draft hash |
| 7 | html-builder | selected | after verified approval |
