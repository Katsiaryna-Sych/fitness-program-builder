---
name: fitness-research
description: Research protocol for Fitness Program Builder agents - how to get exercise data from the wger MCP server and evidence from the web, which sources are acceptable, and how to cite them. Use whenever an agent needs facts it must not take from model memory.
---

# fitness-research

The workflow must not rely on model memory. Every agent that produces content follows this protocol.

## Exercise data — wger MCP server (`mcp__wger__*`)

| tool | use |
|---|---|
| `list_equipment` | map the client's equipment to wger equipment ids (7 = bodyweight) |
| `list_categories` | body-area ids: Abs 10, Arms 8, Back 12, Calves 14, Cardio 15, Chest 11, Legs 9, Shoulders 13 |
| `list_muscles` | muscle ids for targeted searches |
| `search_exercises` | filter by `categoryId`, `equipmentId`, `muscleId`, `nameContains` |
| `get_exercise` | instructions + muscles for one id (use for every exercise you finally select) |

Rules:
- Search **per available equipment id**, including bodyweight (7), never for equipment the client lacks.
- Select only exercises returned by the server; keep the wger id and the `source` URL it returns.
- If the server is unreachable, retry once, then say so explicitly in the artifact Summary and stop —
  do not fall back to invented exercises.

## Evidence — WebSearch + WebFetch

Use for guidelines and numbers: weekly activity targets, volume ranges, progression rules, injury
contraindications, nutrition formulas, assessment protocols.

Acceptable sources, best first:
1. Public-health bodies and professional associations (WHO, CDC, NHS, ACSM, NSCA, ACE, national sports institutes).
2. Peer-reviewed reviews / meta-analyses (PubMed, PMC, journal sites).
3. University or hospital patient-education pages (Mayo Clinic, Cleveland Clinic, Harvard Health …).
Avoid: forums, shops, influencer blogs, AI-generated content farms.

Procedure:
1. `WebSearch` with a specific query (include the condition / goal / population).
2. `WebFetch` the 1–3 best results and extract the exact recommendation.
3. Cite it: `- [Page title — Publisher](https://exact-url) — what it supports`.
4. Never cite a URL you did not retrieve in this session. Never shorten or guess URLs.

## Confidence and safety

- If sources disagree, state the range and choose the more conservative option.
- Flag anything that requires a professional (pain, medical conditions, pregnancy, medication) instead of prescribing.
- Units follow the client preference (default kg, min, km).
