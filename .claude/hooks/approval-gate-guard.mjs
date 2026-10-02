#!/usr/bin/env node
// PreToolUse: approval-gate-guard
// 1. Blocks any write to runs/<id>/output/** unless approval.json records a human approval whose
//    draftSha256 equals the SHA-256 of the *current* artifacts/program-draft.md (deterministic check).
// 2. Blocks any model/agent write to approval.json — only the UserPromptSubmit approval-recorder hook writes it.
// 3. Enforces artifact ownership: a subagent may only write the artifact it owns.
import fs from "node:fs";
import path from "node:path";
import { readStdinJson, locateRunFile, runDir, sha256File, STEPS } from "../lib/state-lib.mjs";

const input = readStdinJson();
const tool = input.tool_name || "";
const ti = input.tool_input || {};
const agent = input.agent_type || null;

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `approval-gate-guard: ${reason}` },
  }));
  process.exit(0);
}

function approvalProblem(runId) {
  const approvalFile = path.join(runDir(runId), "approval.json");
  const draftFile = path.join(runDir(runId), "artifacts", "program-draft.md");
  if (!fs.existsSync(approvalFile)) return "no human approval recorded for this run (approval.json missing)";
  let approval;
  try { approval = JSON.parse(fs.readFileSync(approvalFile, "utf8")); } catch { return "approval.json is unreadable"; }
  if (approval.status !== "approved") return `approval status is '${approval.status}', expected 'approved'`;
  const current = sha256File(draftFile);
  if (!current) return "program-draft.md is missing";
  if (current !== approval.draftSha256) return "program-draft.md changed after approval (SHA-256 mismatch) — request approval again";
  return null;
}

// --- File-editing tools -----------------------------------------------------
if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) {
  const loc = locateRunFile(ti.file_path || ti.notebook_path);
  if (!loc) process.exit(0);

  if (loc.rel === "approval.json") deny("approval.json is written only by the human approval hook (type APPROVE/REJECT in chat)");
  if (loc.rel === "workflow-state.json") deny("workflow-state.json is updated only by hooks and the workflow-state skill script");

  if (loc.rel.startsWith("output/")) {
    if (agent && agent !== "html-builder") deny(`only html-builder may write final output (caller: ${agent})`);
    const problem = approvalProblem(loc.runId);
    if (problem) deny(`final output blocked — ${problem}`);
    process.exit(0);
  }

  const owner = STEPS.find((s) => s.artifact === loc.rel);
  if (owner && agent && owner.agent !== agent) {
    deny(`artifact ${loc.rel} is owned by '${owner.agent}', not '${agent}'`);
  }
  process.exit(0);
}

// --- Shell tools: no side doors around the guards ------------------------------
if (tool === "Bash" || tool === "PowerShell") {
  const cmd = String(ti.command || "");
  const readOnly = /^\s*(cat|type|head|tail|less|more|Get-Content|gc|ls|dir|Get-ChildItem|grep|rg|Select-String|wc|sha256sum|Get-FileHash)\b/i;
  const writes = /(>|\btee\b|\bcp\b|\bmv\b|\brm\b|Copy-Item|Move-Item|Remove-Item|Set-Content|Add-Content|Out-File|New-Item|writeFile|sed\s+-i)/i;
  if (/approval\.json/i.test(cmd) && !readOnly.test(cmd)) {
    deny("shell access to approval.json is not allowed; approvals are recorded only from the user's chat message");
  }
  if (/runs[\\/][^\s"']+[\\/]output[\\/]/i.test(cmd) && writes.test(cmd)) {
    deny("final output must be written with the Write tool by html-builder so the approval gate applies");
  }
  if (/workflow-state\.json/i.test(cmd) && writes.test(cmd)) {
    deny("modify workflow state only via .claude/skills/workflow-state/scripts/state.mjs");
  }
}
process.exit(0);
