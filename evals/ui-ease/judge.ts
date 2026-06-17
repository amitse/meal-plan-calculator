import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveCopilotEvalModel, sendCopilotEvalPrompt, withCopilotEvalClient } from "../infra/copilot.js";
import { buildUiEaseRubricText, uiEaseJudgeThreshold } from "./rubric.js";

type UiEaseStatus = "pass" | "fail" | "skip";
type UiEaseSeverity = "hard" | "judge";

export interface UiEaseHardGateCheck {
  id: string;
  status: UiEaseStatus;
  message: string;
  severity?: UiEaseSeverity;
  evidence?: unknown;
}

export interface UiEaseScreenshotInput {
  id: string;
  label?: string;
  viewport?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
  };
  screenshotPath?: string;
  imageDataUri?: string;
  imageBase64?: string;
  visibleText?: string[];
  observations?: string[];
  warnings?: string[];
}

export interface UiEaseTraceStep {
  action: string;
  target?: string;
  result?: string;
  durationMs?: number;
  error?: string;
  notes?: string[];
}

export interface UiEaseTraceInput {
  id: string;
  label?: string;
  goal?: string;
  steps: UiEaseTraceStep[];
  outcome?: string;
  errors?: string[];
  metrics?: Record<string, string | number | boolean | null>;
}

export interface UiEaseJudgeScenario {
  id: string;
  label: string;
  task?: string;
  expectedUserOutcome?: string;
  notes?: string[];
}

export interface UiEaseJudgeResult {
  status: UiEaseStatus;
  score: number | undefined;
  summary: string;
  failures?: string[];
  strengths?: string[];
  evidenceGaps?: string[];
  rawResponse?: string;
}

export async function runUiEaseCopilotJudge({
  scenario,
  hardGateChecks,
  screenshots,
  traces,
  model = resolveCopilotEvalModel(process.env.COPILOT_EVAL_JUDGE_MODEL),
  hardGateFailureStatus = "skip",
}: {
  scenario: UiEaseJudgeScenario;
  hardGateChecks: UiEaseHardGateCheck[];
  screenshots: UiEaseScreenshotInput[];
  traces: UiEaseTraceInput[];
  model?: string;
  hardGateFailureStatus?: Extract<UiEaseStatus, "fail" | "skip">;
}): Promise<UiEaseJudgeResult> {
  const failedHardGates = hardGateChecks.filter(isFailedHardGate);
  if (failedHardGates.length > 0) {
    return {
      status: hardGateFailureStatus,
      score: undefined,
      summary: "LLM UI/ease judge was not invoked because deterministic UI hard gates failed; hard gates remain final authority.",
      failures: failedHardGates.map((check) => `${check.id}: ${check.message}`),
    };
  }

  if (screenshots.length === 0 && traces.length === 0) {
    return {
      status: "fail",
      score: undefined,
      summary: "UI/ease judge failed closed because no screenshot or trace evidence was provided.",
      evidenceGaps: ["Provide at least one representative screenshot or workflow trace."],
    };
  }

  const sandboxRoot = join(process.cwd(), "eval-results", ".copilot-sdk-ui-ease-judge");
  const sandboxCwd = join(sandboxRoot, "workspace");
  const sandboxConfig = join(sandboxRoot, "config");
  await mkdir(sandboxCwd, { recursive: true });
  await mkdir(sandboxConfig, { recursive: true });

  const rawResponse = await withCopilotEvalClient({
    baseDirectory: join(sandboxRoot, "client-state"),
    workingDirectory: sandboxCwd,
    run: (client) => sendCopilotEvalPrompt({
      client,
      model,
      workingDirectory: sandboxCwd,
      configDirectory: sandboxConfig,
      toolAccess: "none",
      privacyMode: true,
      systemMessage: "You are a strict UI/ease product eval judge for Meal Plan Calculator. Judge only the provided screenshot and trace evidence. Return only valid JSON.",
      prompt: buildJudgePrompt({ scenario, hardGateChecks, screenshots, traces }),
    }),
  });

  const parsed = parseJudgeResponse(rawResponse);
  const score = parsed?.score;

  return {
    status: typeof score === "number" && score >= uiEaseJudgeThreshold ? "pass" : "fail",
    score,
    summary: parsed?.summary ?? rawResponse.slice(0, 500),
    failures: parsed?.failures,
    strengths: parsed?.strengths,
    evidenceGaps: parsed?.evidenceGaps,
    rawResponse,
  };
}

function isFailedHardGate(check: UiEaseHardGateCheck) {
  return (check.severity ?? "hard") === "hard" && check.status === "fail";
}

function buildJudgePrompt({
  scenario,
  hardGateChecks,
  screenshots,
  traces,
}: {
  scenario: UiEaseJudgeScenario;
  hardGateChecks: UiEaseHardGateCheck[];
  screenshots: UiEaseScreenshotInput[];
  traces: UiEaseTraceInput[];
}) {
  return [
    "Judge this Meal Plan Calculator UI/ease scenario from screenshots and workflow traces.",
    "",
    "Product intent:",
    "- A compact, practical meal-plan calculator for entering targets, generating a plan, editing meals, and recovering from impossible or invalid states.",
    "- It should not look or read like a marketing page.",
    "- Strictly fail below a 9/10 UI/ease bar.",
    "",
    buildUiEaseRubricText(),
    "",
    "Return only JSON in this exact shape:",
    JSON.stringify({
      score: "number from 0 to 10",
      summary: "one concise verdict",
      failures: ["specific UI/ease failures grounded in screenshot or trace evidence"],
      strengths: ["specific strengths grounded in evidence"],
      evidenceGaps: ["missing evidence that limits confidence"],
    }),
    "",
    "Evidence payload:",
    JSON.stringify({
      scenario,
      deterministicHardGateResults: hardGateChecks.map((check) => ({
        id: check.id,
        status: check.status,
        message: check.message,
      })),
      screenshots: screenshots.map(compactScreenshot),
      traces: traces.map(compactTrace),
    }, null, 2),
  ].join("\n");
}

function compactScreenshot(screenshot: UiEaseScreenshotInput) {
  return {
    id: screenshot.id,
    label: screenshot.label,
    viewport: screenshot.viewport,
    screenshotPathReference: screenshot.screenshotPath,
    imageDataUri: compactImagePayload(screenshot.imageDataUri),
    imageBase64: compactImagePayload(screenshot.imageBase64),
    visibleText: screenshot.visibleText?.slice(0, 80),
    observations: screenshot.observations?.slice(0, 40),
    warnings: screenshot.warnings?.slice(0, 20),
  };
}

function compactTrace(trace: UiEaseTraceInput) {
  return {
    id: trace.id,
    label: trace.label,
    goal: trace.goal,
    outcome: trace.outcome,
    errors: trace.errors?.slice(0, 20),
    metrics: trace.metrics,
    steps: trace.steps.slice(0, 80).map((step) => ({
      action: step.action,
      target: step.target,
      result: step.result,
      durationMs: step.durationMs,
      error: step.error,
      notes: step.notes?.slice(0, 10),
    })),
  };
}

function compactImagePayload(payload: string | undefined) {
  if (!payload) return undefined;
  const maxLength = 120_000;
  return payload.length <= maxLength
    ? payload
    : `${payload.slice(0, maxLength)}...<truncated ${payload.length - maxLength} chars>`;
}

function parseJudgeResponse(raw: string): {
  score?: number;
  summary?: string;
  failures?: string[];
  strengths?: string[];
  evidenceGaps?: string[];
} | undefined {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return undefined;

  try {
    const parsed = JSON.parse(json) as {
      score?: unknown;
      summary?: unknown;
      failures?: unknown;
      strengths?: unknown;
      evidenceGaps?: unknown;
    };

    return {
      score: typeof parsed.score === "number" ? parsed.score : undefined,
      summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
      failures: stringArray(parsed.failures),
      strengths: stringArray(parsed.strengths),
      evidenceGaps: stringArray(parsed.evidenceGaps),
    };
  } catch {
    return undefined;
  }
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}
