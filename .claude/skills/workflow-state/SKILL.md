---
name: workflow-state
description: Persisted, resumable state for /build-program runs - create a run, record the plan, start/pass/fail steps with a retry limit, invalidate downstream steps, compute the next runnable group, and resume after interruption. Use for every state transition in the Fitness Program Builder workflow.
---

# workflow-state

State lives in `runs/<run-id>/workflow-state.json`. **Never edit it by hand** (a hook blocks it).
All transitions go through one CLI; hooks write the same file through the same library
(`.claude/lib/state-lib.mjs`), so the state is always consistent.

```bash
S="node .claude/skills/workflow-state/scripts/state.mjs"
```

| when | command |
|---|---|
| new run | `$S init <run-id> "<request text>"` |
| after requirements are confirmed by the user | `$S confirm-requirements <run-id>` |
| record the execution plan | `$S plan <run-id> --skip safety,nutrition --reason "<why>"` (mandatory steps cannot be skipped) |
| before launching agents | `$S start <run-id> <step> [<step>…]` |
| gate passed | `$S pass <run-id> <step> [<step>…]` |
| gate failed | `$S fail <run-id> <step> "<finding>"` → `failed`, or `blocked` once attempts reach the limit (3); dependents become `stale` |
| failure no retry can fix (requirement-bound) | `$S block <run-id> <step> "<gate>: <why>"` → step `blocked`, run stops immediately |
| human rejection / upstream change | `$S invalidate <run-id> <step> "<reason>"` → step + all dependents `stale`, fresh retry budget |
| each validator run | `$S validation-round <run-id>` |
| before asking for approval | `$S draft-hash <run-id>` → `{short, approved, approve, reject}` (keeps a valid approval) |
| approval summary out of sync | `$S sync-approval <run-id>` (re-derives it from `approval.json`) |
| what to run next | `$S next <run-id>` → `{"next":[…],"awaitingGate":[…],"status":…}` |
| human summary | `$S status <run-id>` |
| all runs | `$S list` |

## Step DAG (canonical order)

```
requirements ─┬─ exercises ─┐
              ├─ safety? ───┼─ program ─┬─ nutrition? ─┐
              └─ cardio? ───┘           └─ progress ───┴─ validation ─ draft ─ approval(human) ─ final
```
(`?` = conditional; `progress` also depends on `safety`, `nutrition` on `requirements`.)

## Statuses

`pending` → `running` → `written` (set by the PostToolUse hook when the artifact file is saved) →
`done` (gate passed) · `failed` (gate failed, retry allowed) · `blocked` (retry limit reached) ·
`stale` (upstream changed, must be regenerated) · `skipped` (not selected by the plan).

## Resume algorithm

1. `$S status <run-id>` and read it.
2. Steps in `written`: the agent finished but the gate never ran → run the gate only, do **not** re-run the agent.
3. Steps in `done` / `skipped`: never re-run.
4. `$S next <run-id>` gives the group to run now (`running` steps that were interrupted reappear here).
5. If `approval` is next: re-present the draft (or, if `approval.json` says approved with the current hash, continue to `final`).
6. If any step is `blocked`: stop and report — do not run dependents.
