#!/usr/bin/env node
// Structural + citation check for one workflow artifact.
//   node .claude/skills/artifact-validator/scripts/check-artifact.mjs <run-id> <step> [--online]
// Required H2 headings are read from the matching template in ../templates, so the template is the
// single source of truth for artifact structure. Exit code 0 = PASS, 1 = FAIL. Prints a Markdown report.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STEPS, runDir } from "../../../lib/state-lib.mjs";

const [runId, stepId, ...flags] = process.argv.slice(2);
const online = flags.includes("--online");
const step = STEPS.find((s) => s.id === stepId);
if (!runId || !step || !step.artifact.startsWith("artifacts/")) {
  console.error("usage: check-artifact.mjs <run-id> <step> [--online]   (step = a step that writes artifacts/*.md)");
  process.exit(2);
}

const templateDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates");
const file = path.join(runDir(runId), step.artifact);
const template = fs.readFileSync(path.join(templateDir, path.basename(step.artifact)), "utf8");
const h2 = (text) => [...text.matchAll(/^## (.+?)\s*$/gm)].map((m) => m[1].trim());

const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok, detail });

if (!fs.existsSync(file)) {
  check("artifact exists", false, step.artifact);
} else {
  const text = fs.readFileSync(file, "utf8");
  check("artifact exists", true, step.artifact);
  check("H1 title", /^# \S/m.test(text));
  check("metadata line", new RegExp(`^> Run: ${runId} · Step: ${stepId} · Owner: ${step.agent}`, "m").test(text),
        `expected '> Run: ${runId} · Step: ${stepId} · Owner: ${step.agent} · Attempt: N'`);

  // Required sections, in template order. Draft titles vary, so session sub-headings are not compared.
  const required = h2(template);
  const actual = h2(text);
  const missing = required.filter((r) => !actual.includes(r));
  check("required sections present", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : `${required.length} sections`);
  const order = required.filter((r) => actual.includes(r));
  const inOrder = order.every((r, i) => i === 0 || actual.indexOf(order[i - 1]) < actual.indexOf(r));
  check("sections in template order", inOrder);

  const placeholders = text.match(/\b(TODO|TBD|FIXME|lorem ipsum)\b|\{[a-z][a-z -]*\}|…\s*\|/gi) || [];
  check("no placeholders", placeholders.length === 0, placeholders.slice(0, 5).join(", "));

  const urls = [...new Set([...text.matchAll(/https?:\/\/[^\s)\]|>"']+/g)].map((m) => m[0].replace(/[.,;]+$/, "")))];
  const needsLinks = !["requirements", "validation"].includes(stepId);
  if (needsLinks) {
    const sources = text.split(/^## Sources\s*$/m)[1] || "";
    const sourceLinks = sources.match(/https?:\/\//g)?.length || 0;
    check("Sources section has links", sourceLinks >= 1, `${sourceLinks} link(s)`);
    const bad = urls.filter((u) => /example\.(com|org)|localhost|\.\.\./.test(u));
    check("no fake/placeholder URLs", bad.length === 0, bad.join(", "));
    const wger = urls.filter((u) => u.includes("wger.de/en/exercise/") && !u.endsWith("/overview/"));
    const badWger = wger.filter((u) => !/^https:\/\/wger\.de\/en\/exercise\/\d+\/view-base$/.test(u));
    check("wger links well-formed", badWger.length === 0, badWger.slice(0, 5).join(", "));
    if (stepId === "exercises") check("exercise rows link to wger", wger.length >= 5, `${wger.length} wger exercise link(s)`);
  }
  if (stepId === "validation") {
    check("verdict present", /^## Verdict\s*\n+\s*(PASS|FAIL)\b/m.test(text));
  }

  if (online && urls.length) {
    const dead = [];
    await Promise.all(urls.map(async (u) => {
      try {
        const res = await fetch(u, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 artifact-validator" } });
        if (res.status >= 400 && ![401, 403, 429].includes(res.status)) dead.push(`${u} (${res.status})`);
      } catch (e) {
        dead.push(`${u} (${e.name})`);
      }
    }));
    check("all links reachable", dead.length === 0, dead.slice(0, 8).join(", "));
  }
}

const pass = checks.every((c) => c.ok);
console.log(`### artifact-validator: ${stepId} — ${pass ? "PASS" : "FAIL"}`);
console.log("| check | result | detail |\n|---|---|---|");
for (const c of checks) console.log(`| ${c.name} | ${c.ok ? "PASS" : "FAIL"} | ${c.detail} |`);
process.exit(pass ? 0 : 1);
