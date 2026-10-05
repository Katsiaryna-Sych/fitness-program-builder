# Validation Report
> Run: 20261002-gym-muscle-gain-intermediate · Step: validation · Owner: validator · Attempt: 3 · Round: 3

## Summary
Verdict: PASS. No gate fails. The one round-2 finding (G9, progress) is fixed. The week-4 and week-8 body-weight pass criteria now match the plan's 0.25-0.5% BW/wk target and the 0.4 kg/wk calorie-reduction trigger.

The structural check (`check-artifact.mjs --online`) passed for requirements, exercises, program, nutrition and progress, and every URL was reachable. Safety and cardio were skipped (needs_safety=no, needs_cardio=no), so their gates are N/A. Requirements, exercises, program and nutrition are unchanged since round 2. Their SHA-256 values match the done hashes in state: 38f75623…, c1b55795…, 1021ef7d…, 1ccd47f7…. Progress attempt 3 has hash f39e2e02….

## Gate Results
| gate | name | status | affected step | evidence |
|---|---|---|---|---|
| G1 | Schedule matches requested days | PASS | program | Unchanged. 4 days were requested and 4 are scheduled: Mon Upper A, Tue Lower A, Thu Upper B, Fri Lower B. Wed, Sat and Sun are rest days. No preferred days were given. |
| G2 | Session duration within limit | PASS | program / progress | Recalculated. Upper A: 11.25 + 9 + 6.75 + 6.75 + 5.25 + 7.5 = 46.5, so 7 + 46.5 + 4 = 57.5 min. Lower A: 9 + 11.25 + 7.5 + 6.75 + 8.75 + 3.5 = 46.75, so 57.75 min. Upper B: 11.25 + 10 + 6.75 + 6.75 + 5.25 + 7.5 = 47.5, so 58.5 min. Lower B: 6.75 + 9 + 11.25 + 7.5 + 8.75 + 4 = 47.25, so 58.25 min. All are ≤ 60. Test sets are "the first work set… Rest is the normal 90 s; no extra rest is added", so test weeks add no time. No cardio blocks are scheduled. |
| G3 | Equipment available | PASS | exercises / program | Client equipment: Barbell, Bench, Dumbbell. Spot-checked again with get_exercise this round: 1776 Suitcase Carry uses Dumbbell; 1366 Dumbbell Split Squat uses Dumbbell; 245 Skullcrusher Dumbbells uses Bench and Dumbbell. Earlier rounds verified 75, 83, 294, 507, 567, 1273, 1434, 1640 and 2661. Every library row lists only Barbell, Bench or Dumbbell. Progress needs only a tape measure and a scale, which are measuring tools. |
| G4 | Safety: no contraindicated movement | PASS | program / progress (safety skipped) | No injuries are reported, so there is no Contraindicated Movements list. Limits are applied: compound lifts stay at RIR ≥ 1 ("no rack, safety bars or spotter"), and the floor-loaded barbell avoids rack-dependent lifts. Progress uses submaximal tests ("8-rep load at RIR 2… Never go below RIR 1"), with no 1RM and no test to failure. |
| G5 | Muscle-group balance & volume | PASS | program | Unchanged. Fractional sets per week: chest 11.5, back 14, shoulders 17, biceps 10, triceps 14, quads 14, hamstrings 13, glutes 18, calves 10. All are inside the cited 10-20 range (Bernárdez-Vázquez 2022; Baz-Valle 2022). Push/pull is 16 : 14 (about 1.1 : 1). |
| G6 | Progression covers every week | PASS | program | The Progression Plan has a row for each of weeks 1 to 8. Week 5 is a deload ("cut sets by about 50%… RIR 4"), which the 8-week length requires. |
| G7 | Goal alignment | PASS | program / cardio (skipped) | Goal is muscle gain. Compound lifts use 6-10 or 8-12 reps and isolation lifts 10-15 or 12-15, at RIR 3→1 with 60-90 s rest. This matches ACSM 2009 (6-12 RM, 1-2 min rest) and Schoenfeld 2021. No cardio is planned, which matches needs_cardio=no. |
| G8 | Nutrition sanity | PASS | nutrition | Unchanged. BMR = 10×76 + 6.25×180 − 5×29 + 5 = 1,745. ×1.55 = 2,705 and ×1.375 = 2,399, giving the stated 2,400-2,700 range. The 2,950 target is +9%, a surplus, which matches the goal. Protein 137 g (548 kcal) + fat 76 g (684 kcal) + carbohydrate 430 g (1,718 kcal) = 2,950 kcal. Adjustment rule: below 0.15 kg/wk add 150-250 kcal; above 0.4 kg/wk remove 150-250 kcal. There are no medical claims and the disclaimer is present. |
| G9 | Assessments safe & aligned | PASS | progress | There are 6 tests: body weight, arm and waist circumference, plus submaximal 8-rep RIR-2 sets on ids 75, 83 and 507, all with available equipment. Checkpoints are in weeks 1, 4 and 8, and the week-5 deload is not tested. **Round-2 fix verified:** week 4 now reads "up about 0.6-1.2 kg on baseline (about 0.2-0.4 kg… per week over 3 weeks)", and 0.2-0.4 × 3 = 0.6-1.2. Week 8 now reads "up about 1.3-2.8 kg (about 0.2-0.4 kg per week over 7 weeks)". Its upper bound is 2.8/7 = 0.40 kg/wk, which equals the 0.4 trigger, and its lower bound is 1.3/7 = 0.19 kg/wk, which is above the 0.15 add-calories trigger and about 0.25% × 76. Both are consistent with Iraki 2019 and with the Adjustment Rules. Waist, arm and lift criteria, the Adjustment Rules and the log template are unchanged and consistent. |
| G10 | Real sources for every recommendation | PASS | any | `--online` passed for all five artifacts, with every link reachable: program 9 links, nutrition 8, progress 7, plus the exercise library. Progress cites Iraki 2019 for the weight-gain rate, Zourdos 2016 for RPE 8 = RIR 2, PhenX for the MUAC and waist protocols, and PMC6775190 and PMC11679921 as procedure references with their limits stated. The wger links are well-formed: 25 in the library, and ids 75, 83 and 507 in progress. |
| G11 | No duplicate exercises within a session | PASS | program / exercises | Upper A uses 75, 83, 20, 1273, 348, 92 and 245. Lower A uses 1640, 507, 1366, 294, 2661 and 1415. Upper B uses 1084, 2642, 567, 1434, 348, 92 and 245. Lower B uses 294, 203, 1652, 205, 2661 and 1776. All ids within each session are distinct. The library has 25 rows and 25 unique ids. |

## Findings
None blocking. The round-2 G9 finding is resolved.

Advisory (non-blocking, no re-run required):
1. Progress, week 8: the parenthetical "about 0.2-0.4 kg per week over 7 weeks" gives exactly 1.4-2.8 kg. The stated lower bound of 1.3 kg corresponds to about 0.25% BW/wk and is covered by "about". This is acceptable as written.
2. Carried over (program): the Pullover (1273) is chest-primary in wger but is used as a lat-focused substitute. Its sets are counted as 0.5 toward chest and as 1 toward back. This does not change any gate result, because chest and back stay inside the 10-20 range either way.

## Retry Plan
None.

## Verdict
PASS
