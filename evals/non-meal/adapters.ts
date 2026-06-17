import { join } from "node:path";
import type { ComparableEvalReport, HillClimbAdapter, InfraEvalStatus } from "../infra/hill-climb.js";
import type { ImproveLoopAdapter } from "../infra/improve.js";

export type NonMealSuiteId =
  | "ui-ease"
  | "ui-quality"
  | "ease-of-use"
  | "accessibility"
  | "sharing-export"
  | "failure-recovery"
  | "regression-architecture";

export interface NonMealComparableCheck {
  id: string;
  severity: "hard" | "judge";
  status: InfraEvalStatus;
  message?: string;
  evidence?: unknown;
}

export interface NonMealComparableScenario {
  scenarioId: string;
  title?: string;
  label?: string;
  status: InfraEvalStatus;
  deterministicScore: number;
  checks: NonMealComparableCheck[];
  judge?: unknown;
}

export interface NonMealComparableReport extends ComparableEvalReport {
  generatedAt?: string;
  status: InfraEvalStatus;
  judgeEnabled?: boolean;
  results: NonMealComparableScenario[];
}

export interface NonMealSuiteDefinition {
  suiteId: NonMealSuiteId;
  evalName: string;
  printLabel: string;
  defaultReportPath: string;
  defaultBaselinePath: string;
  defaultCandidatePath: string;
  defaultHillClimbPath: string;
  defaultImprovePath: string;
  runnerSupportsJudge: boolean;
  decisiveFailureDescription: string;
  keepClimbingMessage: string;
  rubricDimensions: string[];
  productContext: string[];
  suggestedFixScope: string[];
}

const definitions: Record<NonMealSuiteId, NonMealSuiteDefinition> = {
  "ui-ease": {
    suiteId: "ui-ease",
    evalName: "ui-ease",
    printLabel: "UI-ease",
    defaultReportPath: join("eval-results", "ui-ease-report.json"),
    defaultBaselinePath: join("eval-results", "ui-ease-baseline.json"),
    defaultCandidatePath: join("eval-results", "ui-ease-candidate.json"),
    defaultHillClimbPath: join("eval-results", "ui-ease-hill-climb-report.json"),
    defaultImprovePath: join("eval-results", "ui-ease-improvement-plan.json"),
    runnerSupportsJudge: false,
    decisiveFailureDescription: "task-completion, accessibility, touch target, overflow, dialog, and hidden-blocker failures",
    keepClimbingMessage: "Keep climbing: candidate does not regress hard gates, but UI/ease still has incomplete, skipped, or failing coverage.",
    rubricDimensions: [
      "Workflow completion: users can generate, edit, share/export, and recover without hidden blockers.",
      "Mobile usability: first viewport priority, touch targets, focus states, and no horizontal overflow.",
      "Interaction clarity: controls are named, actions are obvious, and dialogs/drawers are reachable.",
      "Recovery quality: blocked states show a visible reason and next action.",
      "Evidence quality: screenshots/traces prove the path, not just source declarations.",
    ],
    productContext: [
      "The app is a compact meal-plan calculator/workbench for entering targets, generating plans, editing meals, and sharing/exporting.",
      "UI/ease quality means users can complete realistic workflows without dead ends, hidden dependencies, or confusing recovery states.",
    ],
    suggestedFixScope: [
      "Prefer product UI, interaction, copy, responsive density, accessibility, and recovery-state fixes.",
      "Do not weaken UI hard gates or remove useful calculator detail just to simplify a trace.",
    ],
  },
  "ui-quality": {
    suiteId: "ui-quality",
    evalName: "ui-quality",
    printLabel: "UI-quality",
    defaultReportPath: join("eval-results", "ui-quality-report.json"),
    defaultBaselinePath: join("eval-results", "ui-quality-baseline.json"),
    defaultCandidatePath: join("eval-results", "ui-quality-candidate.json"),
    defaultHillClimbPath: join("eval-results", "ui-quality-hill-climb-report.json"),
    defaultImprovePath: join("eval-results", "ui-quality-improvement-plan.json"),
    runnerSupportsJudge: true,
    decisiveFailureDescription: "missing story, visual snapshot, mobile hierarchy, polish, and screenshot coverage failures",
    keepClimbingMessage: "Keep climbing: candidate does not regress hard gates, but visual/story coverage or judged UI quality still needs work.",
    rubricDimensions: [
      "Mobile visual hierarchy: targets, primary actions, meal cards, and drawer content are clearly prioritized.",
      "Premium-but-utilitarian polish: spacing, typography, contrast, and density feel intentional, not generic.",
      "Story coverage: important app states, drawers, blocked states, and light/dark theme remain represented.",
      "Screenshot reliability: baselines are deterministic, complete, and suitable for visual regression review.",
      "Product fit: screens feel like a calculator/workbench, not a marketing page.",
    ],
    productContext: [
      "UI quality is judged from mobile-first Storybook states and screenshot baselines.",
      "The product should feel warm-modern, compact, and workbench-like while preserving enough nutritional detail.",
    ],
    suggestedFixScope: [
      "Prefer product UI polish, layout hierarchy, spacing, copy, and state coverage fixes.",
      "Do not update snapshots or visual thresholds unless the visual change is intentionally better.",
    ],
  },
  "ease-of-use": {
    suiteId: "ease-of-use",
    evalName: "ease-of-use",
    printLabel: "Ease-of-use",
    defaultReportPath: join("eval-results", "ease-of-use-report.json"),
    defaultBaselinePath: join("eval-results", "ease-of-use-baseline.json"),
    defaultCandidatePath: join("eval-results", "ease-of-use-candidate.json"),
    defaultHillClimbPath: join("eval-results", "ease-of-use-hill-climb-report.json"),
    defaultImprovePath: join("eval-results", "ease-of-use-improvement-plan.json"),
    runnerSupportsJudge: false,
    decisiveFailureDescription: "missing task trace, required action, workflow tag, artifact expectation, and terminal evidence failures",
    keepClimbingMessage: "Keep climbing: candidate does not regress hard gates, but task-trace coverage still has gaps.",
    rubricDimensions: [
      "Primary tasks are covered end-to-end: first run, customization, edit, manual start, blocked recovery, and sharing.",
      "Trace declarations include meaningful user actions instead of shallow source presence.",
      "Required artifacts prove completion and recovery rather than just avoiding crashes.",
      "The trace set avoids hidden dependencies and reflects real user behavior.",
    ],
    productContext: [
      "Ease-of-use evals prove that real user task paths are represented and recoverable.",
      "The workflow should remain obvious for generating, customizing, editing, manually building, and sharing a meal plan.",
    ],
    suggestedFixScope: [
      "Prefer product workflow and trace coverage fixes that reflect actual user tasks.",
      "Do not fake completion with shallow trace declarations or remove necessary task complexity.",
    ],
  },
  accessibility: {
    suiteId: "accessibility",
    evalName: "accessibility",
    printLabel: "Accessibility",
    defaultReportPath: join("eval-results", "accessibility-report.json"),
    defaultBaselinePath: join("eval-results", "accessibility-baseline.json"),
    defaultCandidatePath: join("eval-results", "accessibility-candidate.json"),
    defaultHillClimbPath: join("eval-results", "accessibility-hill-climb-report.json"),
    defaultImprovePath: join("eval-results", "accessibility-improvement-plan.json"),
    runnerSupportsJudge: false,
    decisiveFailureDescription: "critical accessibility, keyboard, dialog, live-region, contrast, and reduced-motion failures",
    keepClimbingMessage: "Keep climbing: candidate does not regress hard gates, but accessibility coverage still has gaps.",
    rubricDimensions: [
      "Hard accessibility gates: no critical/serious violations, visible focus, named forms, labelled dialogs, and keyboard reachability.",
      "Perceivable recovery: blockers, stale state, export status, and target feedback are announced appropriately.",
      "Mobile accessibility: touch targets, contrast, density, and motion behavior work for the phone-first UI.",
      "Coverage realism: first-run, generated plan, drawers, blocked states, and theme states are all represented.",
    ],
    productContext: [
      "Accessibility failures are deterministic hard gates and cannot be waived by subjective judging.",
      "The mobile-first planner must remain keyboard, screen-reader, contrast, and motion safe.",
    ],
    suggestedFixScope: [
      "Prefer semantic markup, labels, focus, status/live-region, contrast, and reduced-motion fixes.",
      "Do not hide controls or remove feedback to pass accessibility checks.",
    ],
  },
  "sharing-export": {
    suiteId: "sharing-export",
    evalName: "sharing-export",
    printLabel: "Sharing/export",
    defaultReportPath: join("eval-results", "sharing-export-report.json"),
    defaultBaselinePath: join("eval-results", "sharing-export-baseline.json"),
    defaultCandidatePath: join("eval-results", "sharing-export-candidate.json"),
    defaultHillClimbPath: join("eval-results", "sharing-export-hill-climb-report.json"),
    defaultImprovePath: join("eval-results", "sharing-export-improvement-plan.json"),
    runnerSupportsJudge: false,
    decisiveFailureDescription: "CSV, TSV, spreadsheet, share-text, target-context, practical-unit, share-state, and fallback failures",
    keepClimbingMessage: "Keep climbing: candidate does not regress hard gates, but sharing/export behavior still has gaps.",
    rubricDimensions: [
      "Export correctness: CSV, TSV, spreadsheet HTML, and share text include rows, totals, escaping, and target context.",
      "Practical units: exported quantities read naturally on phones and spreadsheets.",
      "Share integrity: encoded URLs preserve form, plan, locks, and meal targets.",
      "Fallback behavior: image/share failures expose a useful text fallback rather than silent failure.",
    ],
    productContext: [
      "Sharing/export turns a meal plan into phone-readable text and spreadsheet-compatible artifacts.",
      "Users must trust that exported data preserves targets, totals, practical units, and share state.",
    ],
    suggestedFixScope: [
      "Prefer export formatting, share-state, target-context, stale-state, and fallback fixes.",
      "Do not remove nutrition detail or weaken escaping/state preservation.",
    ],
  },
  "failure-recovery": {
    suiteId: "failure-recovery",
    evalName: "failure-recovery",
    printLabel: "Failure-recovery",
    defaultReportPath: join("eval-results", "failure-recovery-report.json"),
    defaultBaselinePath: join("eval-results", "failure-recovery-baseline.json"),
    defaultCandidatePath: join("eval-results", "failure-recovery-candidate.json"),
    defaultHillClimbPath: join("eval-results", "failure-recovery-hill-climb-report.json"),
    defaultImprovePath: join("eval-results", "failure-recovery-improvement-plan.json"),
    runnerSupportsJudge: false,
    decisiveFailureDescription: "fake-success, impossible-target, locked-conflict, avoid-rule, blocker-copy, and visible-recovery failures",
    keepClimbingMessage: "Keep climbing: candidate does not regress hard gates, but failure recovery still has incomplete or unclear paths.",
    rubricDimensions: [
      "No fake success: impossible constraints return blockers instead of misleading plans.",
      "Specific copy: failed metric, locked item, diet conflict, avoid rule, and recovery action are named.",
      "Visible recovery: UI blocked states expose a next action that a non-expert can follow.",
      "Trust: recovery copy is concise, actionable, and consistent with product semantics.",
    ],
    productContext: [
      "Failure recovery is a trust surface: impossible targets and locked conflicts must explain what to change.",
      "The planner should guide users to relax, unlock, regenerate, or adjust rules without pretending success.",
    ],
    suggestedFixScope: [
      "Prefer blocker semantics, recovery copy, stale-state, locked-item, and impossible-target fixes.",
      "Do not hide failures or return fake plans to satisfy success paths.",
    ],
  },
  "regression-architecture": {
    suiteId: "regression-architecture",
    evalName: "regression-architecture",
    printLabel: "Regression/architecture",
    defaultReportPath: join("eval-results", "regression-architecture-report.json"),
    defaultBaselinePath: join("eval-results", "regression-architecture-baseline.json"),
    defaultCandidatePath: join("eval-results", "regression-architecture-candidate.json"),
    defaultHillClimbPath: join("eval-results", "regression-architecture-hill-climb-report.json"),
    defaultImprovePath: join("eval-results", "regression-architecture-improvement-plan.json"),
    runnerSupportsJudge: false,
    decisiveFailureDescription: "source-boundary, eval-layering, typecheck wiring, test script, build script, and ADR failures",
    keepClimbingMessage: "Keep climbing: candidate does not regress hard gates, but architecture/regression gates still have gaps.",
    rubricDimensions: [
      "Architecture boundaries: core stays independent from site code and React consumes core through adapters/services.",
      "Eval layering: shared infra owns mechanics while product eval domains own rubrics and scenarios.",
      "Regression discipline: typecheck, full unit tests, library build, and ADR presence remain wired.",
      "Maintainability: fixes reduce drift without coupling evals to product internals unnecessarily.",
    ],
    productContext: [
      "Regression/architecture gates prevent product-quality work from breaking unit tests, type safety, builds, or eval boundaries.",
      "Eval infra must not become a product-specific dumping ground.",
    ],
    suggestedFixScope: [
      "Prefer architecture boundary, script wiring, type safety, and eval-layering fixes.",
      "Do not weaken unit tests, typecheck, build, or anti-gaming eval separation.",
    ],
  },
};

export function nonMealSuiteIds() {
  return Object.keys(definitions) as NonMealSuiteId[];
}

export function getNonMealSuiteDefinition(id: string | undefined) {
  if (id && id in definitions) return definitions[id as NonMealSuiteId];
  throw new Error(`Unknown non-meal eval suite "${id ?? ""}". Expected one of: ${nonMealSuiteIds().join(", ")}`);
}

export function hillClimbAdapterFor(definition: NonMealSuiteDefinition): HillClimbAdapter<NonMealComparableReport> {
  return {
    evalName: definition.evalName,
    productName: "Meal Plan Calculator",
    printLabel: definition.printLabel,
    defaultBaselinePath: definition.defaultBaselinePath,
    defaultCandidatePath: definition.defaultCandidatePath,
    defaultOutputPath: definition.defaultHillClimbPath,
    decisiveFailureDescription: definition.decisiveFailureDescription,
    keepClimbingMessage: definition.keepClimbingMessage,
    rubricDimensions: definition.rubricDimensions,
    compactReportForJudge,
  };
}

export function improveAdapterFor(definition: NonMealSuiteDefinition): ImproveLoopAdapter<NonMealComparableReport> {
  return {
    evalName: definition.evalName,
    productName: "Meal Plan Calculator",
    defaultReportPath: definition.defaultReportPath,
    defaultOutputPath: definition.defaultImprovePath,
    productContext: definition.productContext,
    suggestedFixScope: definition.suggestedFixScope,
    sanitizeReportForImprovement,
  };
}

function compactReportForJudge(report: NonMealComparableReport) {
  return {
    status: report.status,
    judgeEnabledInSourceReport: report.judgeEnabled,
    aggregate: {
      scenarioCount: report.results.length,
      hardFailureCount: report.results.reduce((sum, result) => sum + failedHardChecks(result).length, 0),
      skippedScenarioCount: report.results.filter((result) => result.status === "skip").length,
      failedScenarios: report.results.filter((result) => result.status === "fail").map((result) => result.scenarioId),
      meanDeterministicScore: mean(report.results.map((result) => result.deterministicScore)),
    },
    scenarios: report.results.map((result) => ({
      scenarioId: result.scenarioId,
      label: result.label ?? result.title,
      status: result.status,
      deterministicScore: result.deterministicScore,
      failedHardChecks: failedHardChecks(result).map(compactCheck),
      skippedChecks: result.checks.filter((check) => check.status === "skip").slice(0, 12).map(compactCheck),
      judge: compactUnknown(result.judge, 1_000),
    })),
  };
}

function sanitizeReportForImprovement(report: NonMealComparableReport) {
  const failingResults = report.results.filter((result) => result.status === "fail");
  const skippedResults = report.results.filter((result) => result.status === "skip");

  return {
    status: report.status,
    judgeEnabled: report.judgeEnabled,
    scenarioCount: report.results.length,
    failingScenarioCount: failingResults.length,
    skippedScenarioCount: skippedResults.length,
    passingScenarioCount: report.results.filter((result) => result.status === "pass").length,
    hardGateFirst: true,
    antiGamingBoundaries: [
      "Copilot receives this sanitized symptom digest only, not raw eval reports.",
      "No raw screenshots, trace archives, hidden rubric definitions, eval source code, or deterministic check implementations are included.",
      "The improve session runs without repository, file, shell, git, skill, memory, or embedding tools.",
      "The requested output is a fix plan for real product behavior, not code changes that target named eval checks.",
    ],
    failingScenarios: failingResults.map(sanitizeScenario),
    skippedScenarios: skippedResults.map(sanitizeScenario),
    passingScenarioLabels: report.results
      .filter((result) => result.status === "pass")
      .map((result) => result.label ?? result.title ?? result.scenarioId),
  };
}

function sanitizeScenario(result: NonMealComparableScenario) {
  return {
    scenarioId: result.scenarioId,
    label: result.label ?? result.title,
    status: result.status,
    approximateDeterministicScore: Math.round(result.deterministicScore * 100),
    failingHardGateSummaries: summarizeChecks(result.checks.filter((check) => check.status === "fail" && check.severity === "hard")),
    skippedCheckSummaries: summarizeChecks(result.checks.filter((check) => check.status === "skip")),
    failingJudgeSummaries: summarizeChecks(result.checks.filter((check) => check.status === "fail" && check.severity === "judge")),
    judge: compactUnknown(result.judge, 1_000),
  };
}

function failedHardChecks(result: NonMealComparableScenario) {
  return result.checks.filter((check) => check.severity === "hard" && check.status === "fail");
}

function summarizeChecks(checks: NonMealComparableCheck[]) {
  const byMessage = new Map<string, number>();
  for (const check of checks) {
    const message = truncate(check.message ?? check.id, 240);
    byMessage.set(message, (byMessage.get(message) ?? 0) + 1);
  }

  return [...byMessage.entries()].map(([message, count]) => ({ message, count }));
}

function compactCheck(check: NonMealComparableCheck) {
  return {
    id: check.id,
    message: truncate(check.message ?? check.id, 240),
    evidence: compactUnknown(check.evidence, 800),
  };
}

function compactUnknown(value: unknown, maxLength: number) {
  if (value === undefined) return undefined;
  const json = JSON.stringify(value);
  if (!json) return undefined;
  return json.length <= maxLength ? value : `${json.slice(0, maxLength)}...`;
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
