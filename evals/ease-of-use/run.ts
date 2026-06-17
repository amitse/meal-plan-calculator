import { join } from "node:path";
import { argValue, firstPositionalArg, hasToken } from "../infra/cli.js";
import { writeJsonReport } from "../infra/report-io.js";
import { uiTraceScenarios } from "../ui-ease/trace-scenarios.js";

type EvalStatus = "pass" | "fail";

interface EaseScenarioSpec {
  id: string;
  title: string;
  traceIds: string[];
  requiredActions: string[];
  requiredTags: string[];
}

const scenarioSpecs: EaseScenarioSpec[] = [
  { id: "first-run-generate-share", title: "First run to generated shareable plan", traceIds: ["first-run-generate", "share-url-roundtrip", "export-sheet-actions"], requiredActions: ["click", "expect-visible", "screenshot"], requiredTags: ["generation", "share"] },
  { id: "customize-food-rules-before-generation", title: "Customize food rules before generation", traceIds: ["first-run-generate"], requiredActions: ["expect-visible"], requiredTags: ["primary-inputs"] },
  { id: "edit-generated-plan", title: "Edit generated plan", traceIds: ["swap-edit-serving", "lock-regenerate", "adjust-regenerate", "randomize-meal-target"], requiredActions: ["click", "fill", "expect-visible"], requiredTags: ["meal-edit"] },
  { id: "manual-start-add-foods", title: "Manual start and add foods", traceIds: ["manual-add-foods"], requiredActions: ["click", "expect-visible", "screenshot"], requiredTags: ["manual"] },
  { id: "blocked-state-recovery", title: "Blocked state recovery", traceIds: ["blocked-plan-recovery"], requiredActions: ["click", "expect-visible"], requiredTags: ["recovery"] },
];

const args = process.argv.slice(2);
const outputPath = argValue(args, "--output") ?? process.env.COPILOT_EVAL_OUTPUT ?? firstPositionalArg(args, {
  flagsWithValues: ["--output"],
  ignoredAssignments: ["output"],
  ignoredBareTokens: ["no-exit-code"],
}) ?? join("eval-results", "ease-of-use-report.json");
const noExitCode = hasToken(args, "--no-exit-code") || process.env.COPILOT_EVAL_NO_EXIT_CODE === "1";
const results = scenarioSpecs.map(runScenario);
const report = {
  generatedAt: new Date().toISOString(),
  status: results.some((result) => result.status === "fail") ? "fail" as const : "pass" as const,
  traceSource: "evals\\ui-ease\\trace-scenarios.ts",
  results,
};

await writeJsonReport(outputPath, report);
printReport(report, outputPath);
if (report.status === "fail" && !noExitCode) process.exitCode = 1;

function runScenario(spec: EaseScenarioSpec) {
  const traces = spec.traceIds.map((id) => uiTraceScenarios.find((trace) => trace.id === id));
  const missingTraces = spec.traceIds.filter((_, index) => !traces[index]);
  const presentTraces = traces.filter((trace): trace is NonNullable<typeof trace> => Boolean(trace));
  const actions = new Set(presentTraces.flatMap((trace) => trace.steps.map((step) => step.action)));
  const tags = new Set(presentTraces.flatMap((trace) => trace.tags));
  const checks = [
    check("trace-declarations-present", missingTraces.length === 0, "All required trace declarations exist.", { missingTraces }),
    check("required-actions-covered", spec.requiredActions.every((action) => actions.has(action as never)), "Trace steps cover the required user action types.", { required: spec.requiredActions, observed: [...actions] }),
    check("required-tags-covered", spec.requiredTags.every((tag) => tags.has(tag)), "Trace tags cover the intended workflow area.", { required: spec.requiredTags, observed: [...tags] }),
    check("artifact-expectations-declared", presentTraces.every((trace) => trace.artifactExpectations.some((artifact) => artifact.required)), "Each task trace declares required artifacts.", presentTraces.map((trace) => ({ id: trace.id, artifacts: trace.artifactExpectations }))),
    check("terminal-evidence-step", presentTraces.every((trace) => trace.steps.some((step) => step.action === "screenshot" || step.action === "expect-visible")), "Every trace ends with visible evidence or screenshot capture.", presentTraces.map((trace) => ({ id: trace.id, lastStep: trace.steps.at(-1) }))),
  ];

  return {
    scenarioId: spec.id,
    title: spec.title,
    status: checks.some((entry) => entry.status === "fail") ? "fail" as const : "pass" as const,
    deterministicScore: scoreChecks(checks),
    traceIds: spec.traceIds,
    checks,
  };
}

function check(id: string, pass: boolean, message: string, evidence?: unknown) {
  return { id, severity: "hard" as const, status: pass ? "pass" as EvalStatus : "fail" as EvalStatus, message, evidence };
}

function scoreChecks(checks: Array<{ status: EvalStatus }>) {
  return checks.length === 0 ? 0 : checks.filter((check) => check.status === "pass").length / checks.length;
}

function printReport(report: { status: EvalStatus; results: Array<{ scenarioId: string; status: EvalStatus; checks: unknown[] }> }, path: string) {
  console.log(`Ease-of-use eval: ${report.status.toUpperCase()} (${report.results.length} scenarios)`);
  for (const result of report.results) console.log(`- ${result.status.toUpperCase()} ${result.scenarioId}: ${result.checks.length} checks`);
  console.log(`Report: ${path}`);
}
