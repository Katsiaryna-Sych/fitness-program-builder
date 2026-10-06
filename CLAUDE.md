# CLAUDE.md — Fitness Program Builder

This repository is an **agentic workflow for Claude Code**. The user invokes `/build-program <request>`; the
coordinator gathers requirements, plans, runs subagents with quality gates, obtains deterministic human approval and
renders a personalised training program as Markdown + HTML. There is no application code to build except the
small wger MCP server in `mcp/WgerMcp` (.NET 10).

## Components

| kind | location | purpose |
|---|---|---|
| coordinator | `.claude/commands/build-program.md` | orchestration only — plan, gates, retries, approval, state; writes no fitness content |
| subagents (10) | `.claude/agents/*.md` | one responsibility + one owned artifact each (table below) |
| skills (4) | `.claude/skills/*/SKILL.md` | `artifact-validator`, `workflow-state`, `fitness-research`, `fitness-html-theme` |
| hooks | `.claude/hooks/*.mjs`, wired in `.claude/settings.json` | approval gate, ownership, leak/secret guard, state persistence, approval recorder |
| shared lib | `.claude/lib/state-lib.mjs` | step DAG + state I/O used by hooks and the state CLI |
| MCP server | `mcp/WgerMcp`, registered in `.mcp.json` as `wger` | exercise database (wger.de) |
| runs | `runs/<run-id>/` | input, artifacts, output, `workflow-state.json`, `approval.json` |
| tests | `tests/hooks.test.mjs` | self-test for hooks + state CLI |

## Subagents and artifact ownership

| step | agent | owns (under `runs/<run-id>/`) | runs when | external source |
|---|---|---|---|---|
| requirements | intake-analyst | `artifacts/01-requirements.md` | always | user Q&A |
| exercises | exercise-researcher | `artifacts/02-exercise-library.md` | always | **wger MCP** |
| safety | safety-analyst | `artifacts/03-safety-guidelines.md` | `needs_safety=yes` | WebSearch/WebFetch |
| cardio | cardio-planner | `artifacts/04-cardio-plan.md` | `needs_cardio=yes` | WebSearch/WebFetch |
| program | program-designer | `artifacts/05-training-program.md` | always | wger MCP + web |
| nutrition | nutrition-planner | `artifacts/06-nutrition-recovery.md` | `needs_nutrition=yes` | WebSearch/WebFetch |
| progress | progress-planner | `artifacts/07-progress-assessment.md` | always | WebSearch/WebFetch |
| validation | validator | `artifacts/validation-report.md` | always | link checks, wger MCP |
| draft | synthesizer | `artifacts/program-draft.md` | always | artifacts only |
| approval | **human** | `approval.json` (written by hook) | always | chat message |
| final | html-builder | `output/fitness-program.md`, `output/fitness-program.html` | after approval | template |

Ownership is enforced by the `approval-gate-guard` hook: a subagent writing another agent's artifact is denied.

## Execution flow

```
intake-analyst ⇄ user (clarify → confirm)
  → plan (select conditional agents from Workflow Flags)
  → [exercise-researcher, safety-analyst?, cardio-planner?]     parallel
  → program-designer                                           sequential
  → [nutrition-planner?, progress-planner]                     parallel
  → validator (gates G1–G11; targeted retry, max 3 attempts per step)
  → synthesizer → human approval (REJECT → revise → re-approve) → html-builder
```
After **every** group each new artifact passes the `artifact-validator` structural gate before dependents start.

## Execution rules (the coordinator must follow these)

0. **Hooks must be live.** Every new run and every resume starts with a preflight: the coordinator writes
   `input/hook-check.md` and `state.mjs hooks-check` verifies the PostToolUse hook logged it. If not (session not started
   in the repo root), the workflow stops — approval could not be verified without hooks.
1. **Requirements first.** Missing required facts are asked with AskUserQuestion and captured in
   `input/clarifications.md`; the user explicitly confirms the summary before planning (`state.mjs confirm-requirements`).
2. **Adaptive plan.** Conditional agents are selected from the Workflow Flags of `01-requirements.md` and recorded with
   `state.mjs plan`; the plan is written to `execution-plan.md`.
3. **Parallelism.** All agents of a group are launched in one message; dependent groups wait for passed gates.
4. **Consistent outputs.** Every artifact follows its template in `.claude/skills/artifact-validator/templates/`.
   Every subagent ends with the `RESULT` block defined in its agent file.
5. **Gates.** Structural gate = `check-artifact.mjs` (deterministic) + brief semantic review. Domain gates G1–G11 are
   run by the validator. Gate failures call `state.mjs fail`, which marks downstream steps `stale`.
6. **Targeted retries.** Only failed steps and their stale dependents are re-run, with the findings as revision
   instructions. Max **3 attempts per step**; then the step is `blocked`, dependent work stops and the coordinator
   reports the unresolved gate. Restarting a step interrupted while `running` continues the same attempt (interruptions
   do not consume the retry budget); a human rejection (`invalidate`) starts a fresh budget. A failure the validator
   classifies as **requirement-bound** (cannot pass unless the user changes confirmed requirements) is not retried:
   `state.mjs block` marks the owning step `blocked` at once and the run stops with a report of what to change.
7. **State.** Never edit `workflow-state.json` by hand — use `state.mjs`; the PostToolUse hook records each written
   artifact with its SHA-256. On resume, `done`/`skipped` steps are never repeated; `written` steps only get their gate.
8. **Approval is deterministic.** The coordinator shows the draft with its hash and ends its turn. Only the human's typed
   `APPROVE <run-id> <hash8>` / `REJECT <run-id>: <feedback>` is recorded — by the UserPromptSubmit hook. The PreToolUse
   guard allows output only for `html-builder` and only if `approval.json` is `approved` **and** its hash equals the
   current draft's SHA-256. `state.mjs draft-hash` never downgrades a valid approval; `state.mjs sync-approval`
   re-derives the state summary from `approval.json` if they ever diverge. A rejection is mapped to the most upstream owning step, invalidated and regenerated.
9. **No model memory as source.** Exercises come from the wger MCP server; guidelines and numbers from pages fetched
   with WebSearch/WebFetch, cited in each artifact's `## Sources`.
10. **Clean output.** The final files contain no internal file, step or agent names (no-leak-guard) and the same
    12 sections in the same order on every run (fitness-html-theme).
11. **No secrets.** Nothing that looks like a credential may be written to any file (no-leak-guard).

## Quality gates

| id | gate | owner step(s) |
|---|---|---|
| S | structure: template sections in order, metadata line, no placeholders, sources present, URLs reachable | each artifact |
| G1 | training days = requested days/week | program |
| G2 | each session ≤ max minutes (incl. cardio block) | program, cardio |
| G3 | only available equipment | exercises, program |
| G4 | no contraindicated movement; limits applied | safety, program, progress |
| G5 | muscle-group balance and weekly volume in cited range | program |
| G6 | progression for every week; deload if ≥ 6 weeks | program |
| G7 | prescription matches the primary goal | program, cardio |
| G8 | nutrition numbers follow formula and real inputs | nutrition |
| G9 | assessments safe, equipment-feasible, checkpoint weeks exist | progress |
| G10 | every recommendation has a real, reachable source; valid wger links | any |
| G11 | no duplicate exercise within a session / library | program, exercises |

## Hooks

| event | script | behaviour |
|---|---|---|
| PreToolUse `Write\|Edit\|MultiEdit\|NotebookEdit\|Bash\|PowerShell` | `approval-gate-guard.mjs` | blocks output until verified approval; blocks writes to `approval.json`/`workflow-state.json`; enforces artifact ownership; closes shell side doors |
| PreToolUse `Write\|Edit\|MultiEdit` | `no-leak-guard.mjs` | blocks internal names in user-facing output and credentials in any file |
| PostToolUse `Write\|Edit\|MultiEdit` | `post-write-state.mjs` | marks the owning step `written` with SHA-256; marks run `completed` when both outputs exist; invalidates approval if the draft changes |
| UserPromptSubmit | `approval-recorder.mjs` | parses `APPROVE`/`REJECT`, verifies the draft hash, writes `approval.json` and state |

## Developing this repo

- Run `node tests/hooks.test.mjs` after changing hooks or the state library.
- Rebuild the MCP server after changes: `dotnet build mcp/WgerMcp -c Release`.
- When adding a step: update `STEPS` in `.claude/lib/state-lib.mjs`, add a template, an agent, the coordinator table and
  this file.
- Keep `runs/` sample runs committed — they are part of the deliverable.
