# Execution Plan — 20261005-home-weight-loss-5k

Flags: needs_safety=yes · needs_cardio=yes · needs_nutrition=yes

| group | agents | status | why |
|---|---|---|---|
| 1 | exercise-researcher | selected | always |
| 1 | safety-analyst | selected | doctor-diagnosed patellofemoral knee pain |
| 1 | cardio-planner | selected | fat-loss goal and 5 km continuous-run target |
| 2 | program-designer | selected | always (depends on group 1) |
| 3 | nutrition-planner | selected | client asked for nutrition tips |
| 3 | progress-planner | selected | always |
| 4 | validator | selected | domain gates G1–G11, targeted retry (max 3 attempts per step) |
| 5 | synthesizer | selected | after validation PASS |
| 6 | human approval | required | typed APPROVE / REJECT with draft hash |
| 7 | html-builder | selected | after verified approval |
