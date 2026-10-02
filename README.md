# Fitness Program Builder — an agentic Claude Code workflow

`/build-program` turns a free-text request ("get stronger at home, 3 × 30 min, beginner") into a personalised,
source-backed training program delivered as **HTML + Markdown**. A coordinator gathers missing requirements,
plans the work, picks the needed subagents, runs them with quality gates and targeted retries, asks for a
deterministically verified human approval and only then renders the final document. Progress is persisted, so an
interrupted run resumes where it stopped.

Exercise data comes from the open [wger](https://wger.de) database via a custom **.NET MCP server**
(`mcp/WgerMcp`); guidelines and numbers come from **web search**. The rules are documented in [CLAUDE.md](CLAUDE.md).

## Architecture

```
                         ┌───────────────────────── /build-program (coordinator) ─────────────────────────┐
user ⇄ AskUserQuestion → │ intake-analyst → plan → [exercise-researcher ‖ safety-analyst? ‖ cardio-planner?]│
                         │   → program-designer → [nutrition-planner? ‖ progress-planner] → validator      │
                         │   → synthesizer → APPROVE/REJECT (human) → html-builder                          │
                         └──── state: runs/<id>/workflow-state.json · gates: artifact-validator + G1–G11 ───┘
```
`?` = selected dynamically from the confirmed requirements. 10 subagents, 4 skills, 4 hooks, 1 MCP server.

## Prerequisites

| tool | version | check |
|---|---|---|
| [Claude Code](https://code.claude.com) | 2.1+ (CLI, desktop or IDE) | `claude --version` |
| Node.js | 20+ (hooks and scripts, no npm packages) | `node --version` |
| .NET SDK | 10.0+ (MCP server) | `dotnet --version` |
| Internet access | wger.de and web search | |

### Credentials and environment

- **No API key is stored or required by this repository.** Claude Code uses your own login (Claude subscription or
  Console). If you use API billing, set `ANTHROPIC_API_KEY` in your **shell environment**, never in a file in this repo.
- The wger API is public; no key is needed. Optional: `WGER_BASE_URL` (set in `.mcp.json`) to use a self-hosted wger.
- `.env*` and `.claude/settings.local.json` are git-ignored, and the `no-leak-guard` hook refuses to write anything
  that looks like a credential. See [.env.example](.env.example).

## Setup (clean checkout)

```bash
git clone <repo-url> fitness-program-builder
```
```bash
cd fitness-program-builder
```
```bash
dotnet build mcp/WgerMcp -c Release
```
```bash
node tests/hooks.test.mjs
```
Then start Claude Code in the repository root (`claude`, or open the folder in the desktop app). Approve the
project MCP server `wger` when asked, and check that it is connected with `/mcp`. The hooks load from
`.claude/settings.json` automatically. Run `/hooks` to see them.

## Run

```
/build-program I want to get stronger at home. No equipment, only a mat. 3 times a week, 30 minutes. Complete beginner.
```

1. **Clarify.** The coordinator asks for the missing facts (program length, injuries, nutrition…) and then
   asks you to confirm the summary.
2. **Plan.** It shows which agents run and which are skipped, and why (`runs/<id>/execution-plan.md`).
3. **Execute.** Agent groups run in parallel. Every artifact is gated, and failed gates re-run only the affected agents
   (at most 3 attempts per step).
4. **Approve.** It shows the draft and a hash. Reply with **exactly** one of:
   ```
   APPROVE <run-id> <hash8>
   REJECT <run-id>: <what to change>
   ```
   A rejection is fed back to the owning agent(s). The draft is regenerated, re-validated and shown again with a new hash.
5. **Result.** You get `runs/<run-id>/output/fitness-program.html` (open it in a browser, print to PDF if needed)
   and `fitness-program.md`.

## Resume after an interruption

Closed the terminal, hit a limit, or restarted the machine? Start Claude Code again in the repo and run:
```
/build-program status
/build-program resume <run-id>
```
Completed steps (`done`/`skipped`) are reused, written-but-unchecked artifacts only get their gate, and only the remaining
or failed work runs. If the run stopped while waiting for approval, the draft and hash are shown again.
You can inspect the state directly with:
```bash
node .claude/skills/workflow-state/scripts/state.mjs status <run-id>
```

## Sample runs

| run | input | scenario shown |
|---|---|---|
| see `runs/` | [samples/01-home-beginner.md](samples/01-home-beginner.md) | minimal plan: safety, cardio and nutrition skipped; bodyweight-only equipment |
| | [samples/02-gym-hypertrophy-nutrition.md](samples/02-gym-hypertrophy-nutrition.md) | full gym, nutrition agent selected, calorie maths from real data |
| | [samples/03-knee-pain-fat-loss-5k.md](samples/03-knee-pain-fat-loss-5k.md) | every agent selected, safety constraints, rejection → revision → re-approval |

Each `runs/<run-id>/` contains `input/` (request + clarifications), `artifacts/`, `execution-plan.md`,
`workflow-state.json` (with full history), `approval.json` (all approval rounds) and `output/`.

## Repository layout

```
.claude/
  commands/build-program.md     coordinator (slash command)
  agents/                       10 subagents
  skills/
    artifact-validator/         templates/ + scripts/check-artifact.mjs  (structural + citation gate)
    workflow-state/             scripts/state.mjs                         (persisted, resumable state)
    fitness-research/           wger MCP + web research and citation protocol
    fitness-html-theme/         template.html + rendering rules
  hooks/                        approval-gate-guard, no-leak-guard, post-write-state, approval-recorder
  lib/state-lib.mjs             step DAG + state I/O shared by hooks and CLI
  settings.json                 hooks, permissions, MCP enablement
.mcp.json                       wger MCP server registration
mcp/WgerMcp/                    .NET 10 MCP server (ModelContextProtocol SDK) over the wger REST API
runs/                           sample workflow runs (inputs, artifacts, state, outputs)
samples/                        sample requests
tests/hooks.test.mjs            hook + state self-test
```

## Troubleshooting

- **`wger` MCP not connected:** run `dotnet build mcp/WgerMcp -c Release` from the repo root, then `/mcp` → reconnect.
  The server path in `.mcp.json` is relative to the repo root, so start Claude Code there.
- **Final write denied by `approval-gate-guard`:** this is expected until you send `APPROVE <run-id> <hash8>` for the
  *current* draft. If the draft changed after approval, approve the new hash.
- **`APPROVE` rejected with "hash does not match":** copy the hash from the latest approval request.
- **Run blocked:** a gate failed 3 times. `/build-program status <run-id>` shows the findings. Adjust the request and
  resume.
