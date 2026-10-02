#!/usr/bin/env node
// PostToolUse: post-write-state
// Whenever a workflow file under runs/<id>/ is written, update the persisted workflow-state.json:
// the owning step becomes `written` (gate pending) with its SHA-256, so a restart knows exactly what exists.
import fs from "node:fs";
import path from "node:path";
import { readStdinJson, locateRunFile, loadState, saveState, addEvent, runDir, sha256File, now } from "../lib/state-lib.mjs";

const input = readStdinJson();
if (!["Write", "Edit", "MultiEdit"].includes(input.tool_name)) process.exit(0);
const loc = locateRunFile(input.tool_input?.file_path);
if (!loc || loc.rel === "workflow-state.json") process.exit(0);

let state;
try { state = loadState(loc.runId); } catch { process.exit(0); }

const by = input.agent_type || "coordinator";
const hash = sha256File(loc.abs);
const step = Object.entries(state.steps).find(([, s]) => s.artifact === loc.rel);

if (step) {
  const [id, s] = step;
  Object.assign(s, { status: id === "requirements" && state.requirementsConfirmed ? "done" : "written", sha256: hash, updatedAt: now(), writtenBy: by });
  addEvent(state, "artifact-written", `${loc.rel} by ${by} (sha256 ${hash?.slice(0, 12)})`);

  // A changed draft invalidates any earlier approval; the guard would block output anyway, this keeps state honest.
  if (id === "draft" && state.approval.status === "approved" && state.approval.draftSha256 !== hash) {
    state.approval.status = "invalidated";
    addEvent(state, "approval-invalidated", "program-draft.md changed after approval");
  }
} else if (loc.rel.startsWith("output/")) {
  const out = path.join(runDir(loc.runId), "output");
  const done = ["fitness-program.html", "fitness-program.md"].every((f) => fs.existsSync(path.join(out, f)));
  addEvent(state, "output-written", `${loc.rel} by ${by}`);
  if (done) {
    Object.assign(state.steps.final, { status: "done", sha256: sha256File(path.join(out, "fitness-program.html")), updatedAt: now(), writtenBy: by });
    state.status = "completed";
    addEvent(state, "completed", "final HTML and Markdown delivered");
  }
} else {
  addEvent(state, "file-written", `${loc.rel} by ${by}`);
}
saveState(state);
process.exit(0);
