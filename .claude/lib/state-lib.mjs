// Shared, dependency-free helpers for the persisted workflow state.
// Used by the `workflow-state` skill CLI and by the hooks, so every writer
// of runs/<run-id>/workflow-state.json goes through the same code.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const PROJECT_DIR =
  process.env.CLAUDE_PROJECT_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RUNS_DIR = path.join(PROJECT_DIR, "runs");
export const MAX_RETRIES = 3;

// The workflow DAG. Order matters: it is the canonical execution order.
// `conditional: true` steps may be skipped by the coordinator's plan.
export const STEPS = [
  { id: "requirements", agent: "intake-analyst", artifact: "artifacts/01-requirements.md", dependsOn: [] },
  { id: "exercises", agent: "exercise-researcher", artifact: "artifacts/02-exercise-library.md", dependsOn: ["requirements"] },
  { id: "safety", agent: "safety-analyst", artifact: "artifacts/03-safety-guidelines.md", dependsOn: ["requirements"], conditional: true },
  { id: "cardio", agent: "cardio-planner", artifact: "artifacts/04-cardio-plan.md", dependsOn: ["requirements"], conditional: true },
  { id: "program", agent: "program-designer", artifact: "artifacts/05-training-program.md", dependsOn: ["exercises", "safety", "cardio"] },
  { id: "nutrition", agent: "nutrition-planner", artifact: "artifacts/06-nutrition-recovery.md", dependsOn: ["requirements", "program"], conditional: true },
  { id: "progress", agent: "progress-planner", artifact: "artifacts/07-progress-assessment.md", dependsOn: ["program", "safety"] },
  { id: "validation", agent: "validator", artifact: "artifacts/validation-report.md", dependsOn: ["exercises", "safety", "cardio", "program", "nutrition", "progress"] },
  { id: "draft", agent: "synthesizer", artifact: "artifacts/program-draft.md", dependsOn: ["validation"] },
  { id: "approval", agent: "human", artifact: "approval.json", dependsOn: ["draft"] },
  { id: "final", agent: "html-builder", artifact: "output/fitness-program.html", dependsOn: ["approval"] },
];

// Statuses: pending -> running -> written (artifact exists, gate not yet run) -> done
//           failed (gate failed, retry allowed) | blocked (retries exhausted)
//           stale (an upstream artifact changed) | skipped (not selected by the plan)
export const SATISFIED = new Set(["done", "skipped"]);
export const RUNNABLE = new Set(["pending", "stale", "failed", "running"]);

export const now = () => new Date().toISOString();
export const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
export const sha256File = (file) => (fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null);

export const runDir = (runId) => path.join(RUNS_DIR, runId);
export const statePath = (runId) => path.join(runDir(runId), "workflow-state.json");

export function loadState(runId) {
  const file = statePath(runId);
  if (!fs.existsSync(file)) throw new Error(`No workflow state for run '${runId}' (${file})`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function saveState(state) {
  state.updatedAt = now();
  const file = statePath(state.runId);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  // Atomic replace: an interrupted write never corrupts the state. On Windows the target can be briefly
  // locked (antivirus, indexer, a concurrent hook reading it), so retry before giving up.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(err.code) || attempt >= 20) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

export function addEvent(state, event, detail = "") {
  state.history.push({ ts: now(), event, detail });
}

export function newState(runId, request) {
  const steps = {};
  for (const s of STEPS) {
    steps[s.id] = {
      agent: s.agent,
      artifact: s.artifact,
      dependsOn: s.dependsOn,
      conditional: Boolean(s.conditional),
      status: "pending",
      attempts: 0,
      sha256: null,
      updatedAt: null,
      notes: [],
    };
  }
  return {
    schemaVersion: 1,
    runId,
    request,
    status: "intake",
    maxRetries: MAX_RETRIES,
    requirementsConfirmed: false,
    plan: { selected: [], skipped: {} },
    validationRounds: 0,
    approval: { status: "none", draftSha256: null, rounds: 0 },
    steps,
    createdAt: now(),
    updatedAt: now(),
    history: [{ ts: now(), event: "init", detail: "run created" }],
  };
}

/** All steps that transitively depend on `stepId`. */
export function dependentsOf(state, stepId) {
  const out = new Set();
  const walk = (id) => {
    for (const [sid, s] of Object.entries(state.steps)) {
      if (s.dependsOn.includes(id) && !out.has(sid)) {
        out.add(sid);
        walk(sid);
      }
    }
  };
  walk(stepId);
  return [...out];
}

/** Steps that can run right now: runnable status and every dependency satisfied. */
export function nextGroup(state) {
  return STEPS.map((s) => s.id).filter((id) => {
    const s = state.steps[id];
    if (!RUNNABLE.has(s.status)) return false;
    if (s.status === "failed" && s.attempts > state.maxRetries) return false;
    return s.dependsOn.every((d) => SATISFIED.has(state.steps[d].status));
  });
}

/** Steps whose artifact was written but whose gate has not passed yet. */
export function awaitingGate(state) {
  return STEPS.map((s) => s.id).filter((id) => state.steps[id].status === "written");
}

/** Map an absolute or relative file path to { runId, rel } when it lives under runs/<id>/. */
export function locateRunFile(filePath) {
  if (!filePath) return null;
  const abs = path.resolve(PROJECT_DIR, filePath);
  const rel = path.relative(RUNS_DIR, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const [runId, ...rest] = rel.split(path.sep);
  if (!runId || rest.length === 0) return null;
  return { runId, rel: rest.join("/"), abs };
}

export function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
