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

| run | input | agents selected | what it demonstrates |
|---|---|---|---|
| [20261002-home-beginner-strength](runs/20261002-home-beginner-strength/) | [samples/01-home-beginner.md](samples/01-home-beginner.md) | safety and cardio **skipped** | clarification mid-run (a chair added → requirements and exercise library regenerated); **G2 fail** (sessions 30–31 min > 30) → only program + dependents re-run, 2 validation rounds; **resume in a new session** at the approval step |
| [20261002-gym-muscle-gain-intermediate](runs/20261002-gym-muscle-gain-intermediate/) | [samples/02-gym-hypertrophy-nutrition.md](samples/02-gym-hypertrophy-nutrition.md) | safety and cardio skipped, **nutrition selected** | calorie/protein maths from real body data; 3 validation rounds with **targeted retries** of exercises (rack/incline exercises removed), nutrition and progress — progress succeeded on its **last allowed attempt** |
| [20261005-home-weight-loss-5k](runs/20261005-home-weight-loss-5k/) | [samples/03-knee-pain-fat-loss-5k.md](samples/03-knee-pain-fat-loss-5k.md) | **all agents** | safety ‖ cardio conflict resolved by re-asking the user and re-confirming requirements; **interrupted + app restarted** during program design, resumed without repeating exercises/safety/cardio; **REJECT** with feedback → cardio + program regenerated, 4 validation rounds (G4, G2 fails) → **APPROVE** of the new hash |

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
