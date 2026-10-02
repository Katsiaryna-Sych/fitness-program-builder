#!/usr/bin/env node
// CLI for the persisted workflow state. The coordinator never edits workflow-state.json by hand;
// it calls this script so state transitions stay deterministic and auditable.
//
//   node .claude/skills/workflow-state/scripts/state.mjs <command> <run-id> [args]
//
// Commands:
//   init <run-id> "<request text>"          create runs/<run-id>/ with input/, artifacts/, output/ and fresh state
//   plan <run-id> --skip a,b --reason "..."  record the execution plan (skip conditional steps)
//   confirm-requirements <run-id>            mark requirements as confirmed by the user
//   start <run-id> <step...>                 mark steps running (an attempt is counted)
//   pass <run-id> <step...>                  gate passed -> done
//   fail <run-id> <step> "<finding>"         gate failed -> failed (+ dependents become stale)
//   invalidate <run-id> <step>               step and all dependents -> stale (e.g. after rejection feedback)
//   validation-round <run-id>                increment the validation round counter
//   set-status <run-id> <status>             overall run status
//   event <run-id> "<text>"                  append a history event
//   next <run-id>                            print the next runnable group (JSON)
//   status <run-id>                          print a human-readable summary
//   draft-hash <run-id>                      hash the draft, mark approval pending, print the APPROVE/REJECT phrases
//   list                                     list runs and their status
import fs from "node:fs";
import path from "node:path";
import {
  RUNS_DIR, STEPS, loadState, saveState, newState, addEvent, dependentsOf,
  nextGroup, awaitingGate, runDir, sha256File, now,
} from "../../../lib/state-lib.mjs";

const [cmd, runId, ...rest] = process.argv.slice(2);
const die = (msg) => { console.error(`state: ${msg}`); process.exit(1); };
const stepIds = new Set(STEPS.map((s) => s.id));
const checkSteps = (ids) => ids.forEach((id) => stepIds.has(id) || die(`unknown step '${id}'`));
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

function summary(state) {
  const lines = [`Run ${state.runId} — status: ${state.status}, validation rounds: ${state.validationRounds}, approval: ${state.approval.status}`];
  lines.push("| step | agent | status | attempts | artifact |", "|---|---|---|---|---|");
  for (const s of STEPS) {
    const st = state.steps[s.id];
    lines.push(`| ${s.id} | ${st.agent} | ${st.status} | ${st.attempts} | ${st.artifact} |`);
  }
  const blocked = STEPS.filter((s) => state.steps[s.id].status === "blocked").map((s) => s.id);
  lines.push("", `next runnable: ${JSON.stringify(nextGroup(state))}`);
  lines.push(`awaiting gate: ${JSON.stringify(awaitingGate(state))}`);
  if (blocked.length) lines.push(`BLOCKED (retry limit reached): ${JSON.stringify(blocked)}`);
  return lines.join("\n");
}

switch (cmd) {
  case "init": {
    if (!runId) die("init needs <run-id>");
    if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(runId)) die("run-id must be lowercase kebab-case");
    const dir = runDir(runId);
    if (fs.existsSync(path.join(dir, "workflow-state.json"))) die(`run '${runId}' already exists — use resume`);
    for (const sub of ["input", "artifacts", "output"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    const request = rest.join(" ").trim();
    fs.writeFileSync(path.join(dir, "input", "request.md"), `# Original request\n\n${request}\n`);
    saveState(newState(runId, request));
    console.log(`initialized ${path.relative(process.cwd(), dir)}`);
    break;
  }
  case "plan": {
    const state = loadState(runId);
    const skip = (flag("skip") || "").split(",").map((s) => s.trim()).filter(Boolean);
    checkSteps(skip);
    for (const id of skip) {
      if (!state.steps[id].conditional) die(`step '${id}' is mandatory and cannot be skipped`);
    }
    const reason = flag("reason") || "";
    for (const s of STEPS) {
      const st = state.steps[s.id];
      if (skip.includes(s.id)) {
        st.status = "skipped";
        state.plan.skipped[s.id] = reason;
      } else if (st.status === "skipped") {
        st.status = "pending"; // a re-plan can re-enable a previously skipped step
        delete state.plan.skipped[s.id];
      }
    }
    state.plan.selected = STEPS.map((s) => s.id).filter((id) => state.steps[id].status !== "skipped");
    state.status = "running";
    addEvent(state, "plan", `selected=${state.plan.selected.join(",")} skipped=${skip.join(",") || "none"} ${reason}`);
    saveState(state);
    console.log(summary(state));
    break;
  }
  case "confirm-requirements": {
    const state = loadState(runId);
    state.requirementsConfirmed = true;
    state.steps.requirements.status = "done";
    state.steps.requirements.sha256 = sha256File(path.join(runDir(runId), state.steps.requirements.artifact));
    addEvent(state, "requirements-confirmed", "user confirmed requirements");
    saveState(state);
    console.log("requirements confirmed");
    break;
  }
  case "start": {
    const state = loadState(runId);
    checkSteps(rest);
    for (const id of rest) {
      const st = state.steps[id];
      if (st.status === "blocked") die(`step '${id}' is blocked (retry limit reached)`);
      st.status = "running";
      st.attempts += 1;
      st.updatedAt = now();
    }
    addEvent(state, "start", rest.join(","));
    saveState(state);
    console.log(`started: ${rest.join(", ")}`);
    break;
  }
  case "pass": {
    const state = loadState(runId);
    checkSteps(rest);
    for (const id of rest) {
      const st = state.steps[id];
      st.status = "done";
      st.sha256 = sha256File(path.join(runDir(runId), st.artifact)) ?? st.sha256;
      st.updatedAt = now();
    }
    addEvent(state, "gate-pass", rest.join(","));
    saveState(state);
    console.log(`passed: ${rest.join(", ")}`);
    break;
  }
  case "fail": {
    const state = loadState(runId);
    const [stepId, ...finding] = rest;
    checkSteps([stepId]);
    const st = state.steps[stepId];
    const note = finding.join(" ");
    st.notes.push({ ts: now(), attempt: st.attempts, finding: note });
    if (st.attempts >= state.maxRetries) {
      st.status = "blocked";
      state.status = "blocked";
      addEvent(state, "blocked", `${stepId}: retry limit ${state.maxRetries} reached — ${note}`);
    } else {
      st.status = "failed";
      addEvent(state, "gate-fail", `${stepId} (attempt ${st.attempts}): ${note}`);
    }
    const stale = dependentsOf(state, stepId).filter((d) => !["skipped", "pending"].includes(state.steps[d].status));
    for (const d of stale) state.steps[d].status = "stale";
    saveState(state);
    console.log(`${stepId} -> ${st.status}; stale dependents: ${JSON.stringify(stale)}`);
    break;
  }
  case "invalidate": {
    const state = loadState(runId);
    const [stepId] = rest;
    checkSteps([stepId]);
    const affected = [stepId, ...dependentsOf(state, stepId)].filter((d) => state.steps[d].status !== "skipped");
    // A human-driven revision starts a fresh retry budget for the affected steps.
    for (const d of affected) Object.assign(state.steps[d], { status: "stale", attempts: 0 });
    addEvent(state, "invalidate", `${affected.join(",")} ${rest.slice(1).join(" ")}`.trim());
    saveState(state);
    console.log(`stale: ${JSON.stringify(affected)}`);
    break;
  }
  case "validation-round": {
    const state = loadState(runId);
    state.validationRounds += 1;
    addEvent(state, "validation-round", String(state.validationRounds));
    saveState(state);
    console.log(`validation round ${state.validationRounds}`);
    break;
  }
  case "set-status": {
    const state = loadState(runId);
    state.status = rest[0] || die("set-status needs a value");
    addEvent(state, "status", state.status);
    saveState(state);
    console.log(`status: ${state.status}`);
    break;
  }
  case "event": {
    const state = loadState(runId);
    addEvent(state, "note", rest.join(" "));
    saveState(state);
    break;
  }
  case "next": {
    const state = loadState(runId);
    console.log(JSON.stringify({ next: nextGroup(state), awaitingGate: awaitingGate(state), status: state.status }));
    break;
  }
  case "status": {
    console.log(summary(loadState(runId)));
    break;
  }
  case "draft-hash": {
    const state = loadState(runId);
    const hash = sha256File(path.join(runDir(runId), state.steps.draft.artifact));
    if (!hash) die("program-draft.md does not exist yet");
    state.approval = { ...state.approval, status: "pending", draftSha256: hash };
    state.status = "awaiting-approval";
    addEvent(state, "approval-requested", hash.slice(0, 12));
    saveState(state);
    console.log(JSON.stringify({ sha256: hash, short: hash.slice(0, 8),
      approve: `APPROVE ${runId} ${hash.slice(0, 8)}`, reject: `REJECT ${runId}: <what to change>` }));
    break;
  }
  case "list": {
    if (!fs.existsSync(RUNS_DIR)) break;
    for (const id of fs.readdirSync(RUNS_DIR)) {
      try {
        const s = loadState(id);
        console.log(`${id}\t${s.status}\tapproval=${s.approval.status}\tupdated=${s.updatedAt}`);
      } catch { /* not a run directory */ }
    }
    break;
  }
  default:
    die(`unknown command '${cmd ?? ""}'. See header of state.mjs for usage.`);
}
