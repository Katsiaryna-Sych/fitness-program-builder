#!/usr/bin/env node
// UserPromptSubmit: approval-recorder
// The ONLY writer of runs/<id>/approval.json. It fires on prompts typed by the human, never on model output,
// so an approval cannot be fabricated by an agent. Accepted formats (case-insensitive keyword):
//   APPROVE <run-id> <first 8 chars of draft hash>
//   REJECT <run-id>: <feedback>
// The hash shown by the coordinator binds the approval to the exact draft version the human reviewed.
import fs from "node:fs";
import path from "node:path";
import { readStdinJson, loadState, saveState, addEvent, runDir, sha256File, now } from "../lib/state-lib.mjs";

const input = readStdinJson();
const prompt = String(input.prompt ?? input.user_prompt ?? "").trim();
const m = prompt.match(/^(APPROVE|REJECT)\s+([a-z0-9][a-z0-9-]+)\s*(?:([0-9a-f]{8,64})\b)?\s*[:\-]?\s*([\s\S]*)$/i);
if (!m) process.exit(0);

const [, keyword, runId, hashPrefix, feedbackRaw] = m;
const decision = keyword.toUpperCase();
const block = (reason) => {
  process.stdout.write(JSON.stringify({ decision: "block", reason: `approval-recorder: ${reason}` }));
  process.exit(0);
};

let state;
try { state = loadState(runId); } catch { block(`unknown run '${runId}'`); }

const draftFile = path.join(runDir(runId), "artifacts", "program-draft.md");
const draftSha = sha256File(draftFile);
if (!draftSha) block(`run '${runId}' has no program draft to review yet`);

const approvalFile = path.join(runDir(runId), "approval.json");
const record = fs.existsSync(approvalFile) ? JSON.parse(fs.readFileSync(approvalFile, "utf8")) : { rounds: [] };
const round = (record.rounds?.length || 0) + 1;

let context;
if (decision === "APPROVE") {
  if (!hashPrefix) block(`APPROVE needs the draft hash. Type: APPROVE ${runId} ${draftSha.slice(0, 8)}`);
  if (!draftSha.startsWith(hashPrefix.toLowerCase())) {
    block(`hash ${hashPrefix} does not match the current draft (${draftSha.slice(0, 8)}). The draft changed — review it again.`);
  }
  Object.assign(record, { status: "approved", draftSha256: draftSha, decidedAt: now(), decidedBy: "human (UserPromptSubmit hook)" });
  delete record.feedback; // feedback of earlier rejections stays in `rounds`
  record.rounds.push({ round, decision: "approved", draftSha256: draftSha, at: now() });
  state.approval = { status: "approved", draftSha256: draftSha, rounds: round };
  state.steps.approval.status = "done";
  state.status = "approved";
  context = `Human approval recorded deterministically for run ${runId} (draft sha256 ${draftSha.slice(0, 12)}, round ${round}). ` +
            `Continue the /build-program workflow: run html-builder for this run.`;
} else {
  const feedback = feedbackRaw.trim();
  if (!feedback) block(`REJECT needs feedback. Type: REJECT ${runId}: <what to change>`);
  Object.assign(record, { status: "rejected", draftSha256: draftSha, decidedAt: now(), decidedBy: "human (UserPromptSubmit hook)", feedback });
  record.rounds.push({ round, decision: "rejected", draftSha256: draftSha, feedback, at: now() });
  state.approval = { status: "rejected", draftSha256: draftSha, rounds: round };
  state.steps.approval.status = "pending";
  state.status = "revising";
  context = `Human REJECTED the draft for run ${runId} (round ${round}). Feedback: """${feedback}""". ` +
            `Continue the /build-program workflow: map the feedback to the affected steps, invalidate them, re-run them, ` +
            `re-validate, re-synthesize and request approval again.`;
}

fs.writeFileSync(approvalFile, JSON.stringify(record, null, 2) + "\n");
addEvent(state, `approval-${record.status}`, `round ${round}`);
saveState(state);
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } }));
process.exit(0);
