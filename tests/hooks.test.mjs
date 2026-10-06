// Self-test for the workflow hooks and state CLI. Creates a throw-away run, exercises every guard, cleans up.
//   node tests/hooks.test.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUN = "zz-selftest-run";
const RUN_DIR = path.join(ROOT, "runs", RUN);
const env = { ...process.env, CLAUDE_PROJECT_DIR: ROOT };
let failures = 0;

const hook = (name, payload) => {
  const r = spawnSync("node", [path.join(ROOT, ".claude", "hooks", `${name}.mjs`)], { input: JSON.stringify(payload), env, encoding: "utf8" });
  return r.stdout ? JSON.parse(r.stdout) : null;
};
const state = (...args) => spawnSync("node", [path.join(ROOT, ".claude/skills/workflow-state/scripts/state.mjs"), ...args], { env, encoding: "utf8" });
const readState = () => JSON.parse(fs.readFileSync(path.join(RUN_DIR, "workflow-state.json"), "utf8"));
const denied = (out) => out?.hookSpecificOutput?.permissionDecision === "deny";
const expect = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures++; };
const file = (rel) => path.join(RUN_DIR, ...rel.split("/"));
const write = (agent, rel, content = "x") => ({ tool_name: "Write", agent_type: agent, tool_input: { file_path: file(rel), content } });

fs.rmSync(RUN_DIR, { recursive: true, force: true });
try {
  state("init", RUN, "self test request");
  state("plan", RUN, "--skip", "nutrition", "--reason", "test");
  expect("plan skips conditional step", readState().steps.nutrition.status === "skipped");
  expect("plan refuses to skip mandatory step", state("plan", RUN, "--skip", "program").status !== 0);

  // preflight: hooks-check fails until the PostToolUse hook has logged input/hook-check.md
  expect("hooks-check fails without hook evidence", state("hooks-check", RUN).status !== 0);
  fs.writeFileSync(file("input/hook-check.md"), "hook self-check\n");
  hook("post-write-state", write(undefined, "input/hook-check.md"));
  expect("hooks-check passes after PostToolUse logged the file", state("hooks-check", RUN).status === 0);

  // post-write-state
  fs.writeFileSync(file("artifacts/02-exercise-library.md"), "# x\n");
  hook("post-write-state", { ...write("exercise-researcher", "artifacts/02-exercise-library.md"), tool_name: "Write" });
  expect("PostToolUse marks artifact written", readState().steps.exercises.status === "written");
  expect("written step reported as awaiting gate", JSON.parse(state("next", RUN).stdout).awaitingGate.includes("exercises"));

  // retry limit + stale propagation
  state("pass", RUN, "requirements");
  state("pass", RUN, "exercises", "safety", "cardio");
  state("start", RUN, "program"); state("pass", RUN, "program");
  state("start", RUN, "progress"); state("start", RUN, "progress"); // second start = restart after interruption
  expect("interrupted attempt is not counted twice", readState().steps.progress.attempts === 1);
  for (let i = 0; i < 3; i++) { state("start", RUN, "exercises"); state("fail", RUN, "exercises", `G3 attempt ${i + 1}`); }
  const s = readState();
  expect("retry limit blocks step after 3 attempts", s.steps.exercises.status === "blocked" && s.status === "blocked");
  expect("failure marks downstream stale", s.steps.program.status === "stale");
  state("invalidate", RUN, "exercises", "human feedback");
  expect("invalidate resets retry budget", readState().steps.exercises.attempts === 0);

  // ownership + approval guard
  expect("ownership: foreign agent cannot write artifact", denied(hook("approval-gate-guard", write("cardio-planner", "artifacts/02-exercise-library.md"))));
  expect("ownership: owner may write artifact", !denied(hook("approval-gate-guard", write("exercise-researcher", "artifacts/02-exercise-library.md"))));
  expect("model cannot write approval.json", denied(hook("approval-gate-guard", write(undefined, "approval.json"))));
  expect("model cannot write workflow-state.json", denied(hook("approval-gate-guard", write(undefined, "workflow-state.json"))));
  expect("shell cannot touch approval.json", denied(hook("approval-gate-guard", { tool_name: "Bash", tool_input: { command: `echo approved > runs/${RUN}/approval.json` } })));
  expect("shell cannot write output", denied(hook("approval-gate-guard", { tool_name: "PowerShell", tool_input: { command: `Set-Content runs/${RUN}/output/fitness-program.html x` } })));
  expect("output blocked without approval", denied(hook("approval-gate-guard", write("html-builder", "output/fitness-program.html"))));

  // approval recorder (UserPromptSubmit)
  fs.writeFileSync(file("artifacts/program-draft.md"), "# Draft\n");
  const short = JSON.parse(state("draft-hash", RUN).stdout).short;
  expect("wrong hash is rejected", hook("approval-recorder", { prompt: `APPROVE ${RUN} deadbeef` })?.decision === "block");
  expect("APPROVE without hash is rejected", hook("approval-recorder", { prompt: `APPROVE ${RUN}` })?.decision === "block");
  hook("approval-recorder", { prompt: `REJECT ${RUN}: shorter sessions please` });
  expect("REJECT recorded with feedback", JSON.parse(fs.readFileSync(file("approval.json"), "utf8")).feedback === "shorter sessions please");
  expect("output blocked after rejection", denied(hook("approval-gate-guard", write("html-builder", "output/fitness-program.html"))));
  hook("approval-recorder", { prompt: `APPROVE ${RUN} ${short}` });
  expect("APPROVE recorded", readState().approval.status === "approved");
  state("draft-hash", RUN);
  expect("draft-hash after APPROVE keeps the approval", readState().approval.status === "approved");
  expect("non-html-builder cannot write output", denied(hook("approval-gate-guard", write("synthesizer", "output/fitness-program.html"))));
  expect("html-builder may write output after approval", !denied(hook("approval-gate-guard", write("html-builder", "output/fitness-program.html"))));
  // completion: run is completed only after both deliverables are written
  fs.mkdirSync(file("output"), { recursive: true });
  fs.writeFileSync(file("output/fitness-program.html"), "<html></html>");
  hook("post-write-state", write("html-builder", "output/fitness-program.html"));
  expect("one output file does not complete the run", readState().status !== "completed");
  fs.writeFileSync(file("output/fitness-program.md"), "# Program\n");
  hook("post-write-state", write("html-builder", "output/fitness-program.md"));
  expect("both outputs complete the run", readState().status === "completed" && readState().steps.final.status === "done");

  fs.appendFileSync(file("artifacts/program-draft.md"), "tampered\n");
  expect("output blocked when draft changed after approval", denied(hook("approval-gate-guard", write("html-builder", "output/fitness-program.html"))));
  expect("unrelated prompts pass through", hook("approval-recorder", { prompt: "how long is week 3?" }) === null);

  // no-leak guard
  expect("internal names blocked in output", denied(hook("no-leak-guard", write("html-builder", "output/fitness-program.md", "see 05-training-program.md"))));
  expect("clean output allowed", !denied(hook("no-leak-guard", write("html-builder", "output/fitness-program.md", "# Program\nSquat 3x10"))));
  expect("secrets blocked anywhere", denied(hook("no-leak-guard", { tool_name: "Write", tool_input: { file_path: path.join(ROOT, "README.md"), content: "key sk-ant-api03-abcdefghijklmnopqrstuvwxyz" } })));
} finally {
  fs.rmSync(RUN_DIR, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
