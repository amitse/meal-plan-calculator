import { join } from "node:path";
import { runImproveLoopCli, type ImproveLoopAdapter } from "../infra/improve.js";

type UiEaseStatus = "pass" | "fail" | "skip";

interface UiEaseCheckResult {
  id?: string;
  status?: UiEaseStatus;
  severity?: "hard" | "judge";
  message?: string;
}

interface UiEaseScreenshotReport {
  id?: string;
  label?: string;
  viewport?: unknown;
  visibleText?: string[];
  observations?: string[];
  warnings?: string[];
}

interface UiEaseTraceReport {
  id?: string;
  label?: string;
  goal?: string;
  outcome?: string;
  errors?: string[];
  metrics?: Record<string, unknown>;
  steps?: Array<{
    action?: string;
    target?: string;
    result?: string;
    durationMs?: number;
    error?: string;
  }>;
}

interface UiEaseScenarioResult {
  scenarioId?: string;
  id?: string;
  label?: string;
  status?: UiEaseStatus;
  deterministicScore?: number;
  checks?: UiEaseCheckResult[];
  artifactPaths?: string[];
  screenshots?: UiEaseScreenshotReport[];
  traces?: UiEaseTraceReport[];
  judge?: {
    status?: UiEaseStatus;
    score?: number;
    summary?: string;
    failures?: string[];
    evidenceGaps?: string[];
  };
}

interface UiEaseEvalReport {
  status?: UiEaseStatus;
  judgeEnabled?: boolean;
  scenarios?: UiEaseScenarioResult[];
  results?: UiEaseScenarioResult[];
}

const uiEaseImproveAdapter: ImproveLoopAdapter<UiEaseEvalReport> = {
  evalName: "ui-ease",
  productName: "Meal Plan Calculator",
  defaultReportPath: join("eval-results", "ui-ease-report.json"),
  defaultOutputPath: join("eval-results", "ui-ease-improvement-plan.json"),
  productContext: [
    "The product should feel like a compact meal-plan calculator/workbench, not a marketing page.",
    "Users need to enter calorie/protein/diet targets, generate a plan, understand validation, edit meals, and recover from impossible states quickly.",
    "Desktop and mobile layouts should preserve density, hierarchy, and obvious workflow without clutter.",
    "Deterministic UI hard gates remain the final authority; Copilot only proposes a fix plan from sanitized symptoms.",
  ],
  suggestedFixScope: [
    "Prefer product UI, interaction, copy, hierarchy, responsive density, and recovery-state fixes before changing eval criteria.",
    "Do not weaken deterministic UI hard gates, hide required controls, or remove useful calculator detail to look cleaner in screenshots.",
    "Keep fixes small and user-behavior oriented; validate with UI hard gates, screenshots, traces, and existing test commands.",
    "Optimize for real usability and premium-but-utilitarian craft, not for likely hidden predicates.",
  ],
  sanitizeReportForImprovement,
};

await runImproveLoopCli(uiEaseImproveAdapter);

function sanitizeReportForImprovement(report: UiEaseEvalReport) {
  const results = Array.isArray(report.results) ? report.results : Array.isArray(report.scenarios) ? report.scenarios : [];
  const failingResults = results.filter((result) => result.status === "fail");
  const skippedResults = results.filter((result) => result.status === "skip");

  return {
    status: report.status,
    judgeEnabled: report.judgeEnabled,
    scenarioCount: results.length,
    failingScenarioCount: failingResults.length,
    skippedScenarioCount: skippedResults.length,
    passingScenarioCount: results.filter((result) => result.status === "pass").length,
    hardGateFirst: true,
    antiGamingBoundaries: [
      "Copilot receives this sanitized symptom digest only, not raw eval reports.",
      "No raw screenshot binaries, trace archives, hidden rubric definitions, eval source code, or deterministic check implementations are included.",
      "The improve session runs without repository, file, shell, git, skill, memory, or embedding tools.",
      "The requested output is a fix plan for real UI/ease problems, not code changes that target named eval checks.",
    ],
    failingScenarios: failingResults.map(sanitizeScenarioResult),
    skippedScenarios: skippedResults.map(sanitizeScenarioResult),
    passingScenarioLabels: results
      .filter((result) => result.status === "pass")
      .map((result) => result.label ?? result.scenarioId ?? result.id ?? "unlabeled scenario"),
  };
}

function sanitizeScenarioResult(result: UiEaseScenarioResult) {
  const checks = Array.isArray(result.checks) ? result.checks : [];
  const failingChecks = checks.filter((check) => check.status === "fail");

  return {
    label: result.label ?? result.scenarioId ?? result.id ?? "unlabeled scenario",
    status: result.status,
    approximateDeterministicScore: typeof result.deterministicScore === "number"
      ? Math.round(result.deterministicScore * 100)
      : undefined,
    failingHardGateSummaries: summarizeChecks(failingChecks.filter((check) => (check.severity ?? "hard") === "hard")),
    failingJudgeSummaries: summarizeChecks(failingChecks.filter((check) => check.severity === "judge")),
    artifactCount: result.artifactPaths?.length ?? 0,
    judge: result.judge ? {
      status: result.judge.status,
      score: result.judge.score,
      summary: truncate(result.judge.summary, 500),
      failures: result.judge.failures?.slice(0, 8).map((failure) => truncate(failure, 240)),
      evidenceGaps: result.judge.evidenceGaps?.slice(0, 8).map((gap) => truncate(gap, 240)),
    } : undefined,
    screenshotSymptoms: sanitizeScreenshots(result.screenshots),
    traceSymptoms: sanitizeTraces(result.traces),
  };
}

function summarizeChecks(checks: UiEaseCheckResult[]) {
  const byMessage = new Map<string, number>();
  for (const check of checks) {
    const message = truncate(check.message ?? check.id ?? "Unspecified UI/ease failure", 240) ?? "Unspecified UI/ease failure";
    byMessage.set(message, (byMessage.get(message) ?? 0) + 1);
  }

  return [...byMessage.entries()].map(([message, count]) => ({ message, count }));
}

function sanitizeScreenshots(screenshots: UiEaseScreenshotReport[] | undefined) {
  return (screenshots ?? []).slice(0, 8).map((screenshot) => ({
    id: screenshot.id,
    label: screenshot.label,
    viewport: screenshot.viewport,
    visibleTextExcerpt: screenshot.visibleText?.slice(0, 24).map((text) => truncate(text, 120)),
    observations: screenshot.observations?.slice(0, 16).map((observation) => truncate(observation, 220)),
    warnings: screenshot.warnings?.slice(0, 10).map((warning) => truncate(warning, 220)),
  }));
}

function sanitizeTraces(traces: UiEaseTraceReport[] | undefined) {
  return (traces ?? []).slice(0, 8).map((trace) => ({
    id: trace.id,
    label: trace.label,
    goal: truncate(trace.goal, 180),
    outcome: truncate(trace.outcome, 240),
    errors: trace.errors?.slice(0, 10).map((error) => truncate(error, 220)),
    metrics: sanitizeMetrics(trace.metrics),
    stepSummary: trace.steps?.slice(0, 20).map((step) => ({
      action: truncate(step.action, 120),
      target: truncate(step.target, 120),
      result: truncate(step.result, 180),
      durationMs: step.durationMs,
      error: truncate(step.error, 180),
    })),
  }));
}

function sanitizeMetrics(metrics: Record<string, unknown> | undefined) {
  if (!metrics) return undefined;
  return Object.fromEntries(
    Object.entries(metrics)
      .slice(0, 20)
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value) || value === null)
      .map(([key, value]) => [key, typeof value === "string" ? truncate(value, 160) : value]),
  );
}

function truncate(value: string | undefined, maxLength: number) {
  if (!value) return undefined;
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}
