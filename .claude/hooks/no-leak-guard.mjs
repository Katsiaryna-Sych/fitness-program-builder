#!/usr/bin/env node
// PreToolUse: no-leak-guard
// 1. User-facing output (runs/<id>/output/**) must not mention internal workflow files or agent names.
// 2. No file anywhere may receive something that looks like a credential.
import { readStdinJson, locateRunFile } from "../lib/state-lib.mjs";

const input = readStdinJson();
const tool = input.tool_name || "";
const ti = input.tool_input || {};
if (!["Write", "Edit", "MultiEdit"].includes(tool)) process.exit(0);

const content = [
  ti.content,
  ti.new_string,
  ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e.new_string) : []),
].filter(Boolean).join("\n");

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `no-leak-guard: ${reason}` },
  }));
  process.exit(0);
}

const SECRET_PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic API key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\b(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i, "credential assignment"],
];
for (const [re, label] of SECRET_PATTERNS) {
  if (re.test(content)) deny(`content looks like it contains a ${label}; secrets must never be written to the repository`);
}

const loc = locateRunFile(ti.file_path);
if (loc && loc.rel.startsWith("output/")) {
  const INTERNAL = [
    /\b0\d-[a-z-]+\.md\b/i,            // numbered workflow artifacts
    /workflow-state\.json/i,
    /approval\.json/i,
    /validation-report\.md/i,
    /program-draft\.md/i,
    /\bartifacts[\\/]/i,
    /\b(intake-analyst|exercise-researcher|safety-analyst|cardio-planner|program-designer|nutrition-planner|progress-planner|synthesizer|html-builder)\b/i,
  ];
  const hits = INTERNAL.map((re) => content.match(re)?.[0]).filter(Boolean);
  if (hits.length) deny(`user-facing output mentions internal workflow names: ${[...new Set(hits)].join(", ")} — remove them`);
}
process.exit(0);
