import { join } from "node:path";
import { resolveCopilotEvalModel, sendCopilotEvalPrompt, withCopilotEvalClient } from "../infra/copilot.js";
import type { MealCoreScenario, JudgeResult, ScenarioPlanOutput, VarietySummary, EvalCheckResult } from "./types.js";
import { humanReadablePlanSummary } from "./deterministic.js";

const judgeThreshold = 9;

export async function runCopilotJudge({
  scenario,
  outputs,
  checks,
  variety,
}: {
  scenario: MealCoreScenario;
  outputs: ScenarioPlanOutput[];
  checks: EvalCheckResult[];
  variety?: VarietySummary;
}): Promise<JudgeResult> {
  if (checks.some((check) => check.severity === "hard" && check.status === "fail")) {
    return {
      status: "skip",
      score: undefined,
      summary: "Skipped LLM judge because deterministic hard gates failed.",
    };
  }

  const plans = outputs.flatMap((output) => output.plan ? [output.plan] : []);
  if (plans.length === 0) {
    return {
      status: "skip",
      score: undefined,
      summary: "Skipped LLM judge because there is no generated plan to judge.",
    };
  }

  const rawResponse = await withCopilotEvalClient({
    baseDirectory: join(process.cwd(), "eval-results", ".copilot-sdk-meal-core"),
    run: (client) => sendCopilotEvalPrompt({
      client,
      model: resolveCopilotEvalModel(process.env.COPILOT_EVAL_JUDGE_MODEL),
      systemMessage: "You are a strict product eval judge for Meal Plan Calculator. Score harshly. Return only valid JSON.",
      prompt: buildJudgePrompt(scenario, outputs, checks, variety),
    }),
  });
  const parsed = parseJudgeResponse(rawResponse);
  const score = parsed?.score;
  const summary = parsed?.summary ?? rawResponse.slice(0, 500);

  return {
    status: typeof score === "number" && score >= judgeThreshold ? "pass" : "fail",
    score,
    summary,
    rawResponse,
  };
}

function buildJudgePrompt(
  scenario: MealCoreScenario,
  outputs: ScenarioPlanOutput[],
  checks: EvalCheckResult[],
  variety?: VarietySummary,
) {
  const compactOutputs = outputs.map((output) => ({
    seed: output.seed,
    blockers: output.blockers,
    evaluationStatus: output.evaluation?.status,
    targetBounds: output.evaluation?.targetBounds.map((bound) => ({
      metric: bound.bound.metric,
      status: bound.status,
      value: Math.round(bound.value),
      shortfall: bound.shortfall,
      excess: bound.excess,
    })),
    humanSummary: output.plan ? humanReadablePlanSummary(output.plan) : undefined,
    plan: output.plan,
  }));

  return [
    "Judge this Meal Plan Calculator eval scenario.",
    "",
    "Product bar:",
    "- Practical Indian meals around calorie/protein/diet targets.",
    "- Vegetarian means Indian vegetarian: plant/dairy allowed, eggs/meat/fish excluded.",
    "- Meals must be culturally plausible, not just numerically valid.",
    "- Serving sizes must feel practical; no weird egg grams or tiny unnatural portions.",
    "- Snacks should be light; breakfast/lunch/dinner should feel distinct.",
    "- Variety across seeds must be very strict: diverse day structures, low repetition, culturally plausible, target-passing.",
    "- Fail anything below a 9/10 bar.",
    "",
    "Return only JSON in this exact shape:",
    "{\"score\": number, \"summary\": string, \"failures\": string[], \"strengths\": string[]}",
    "",
    JSON.stringify({
      scenario: {
        id: scenario.id,
        label: scenario.label,
        kind: scenario.kind,
        form: scenario.form,
        expected: scenario.expected,
      },
      deterministicCheckResults: checks.map((check) => ({
        id: check.id,
        status: check.status,
        message: check.message,
      })),
      variety,
      outputs: compactOutputs,
    }, null, 2),
  ].join("\n");
}

function parseJudgeResponse(raw: string): { score?: number; summary?: string } | undefined {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return undefined;

  try {
    const parsed = JSON.parse(json) as { score?: unknown; summary?: unknown };
    return {
      score: typeof parsed.score === "number" ? parsed.score : undefined,
      summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
    };
  } catch {
    return undefined;
  }
}
