import { join } from "node:path";
import { runHillClimbCli, type HillClimbAdapter } from "../infra/hill-climb.js";
import type { EvalCheckResult, MealCoreEvalReport, ScenarioPlanOutput } from "./types.js";

const mealCoreHillClimbAdapter: HillClimbAdapter<MealCoreEvalReport> = {
  evalName: "meal-core",
  productName: "Meal Plan Calculator",
  printLabel: "Meal-core",
  defaultBaselinePath: join("eval-results", "meal-core-baseline.json"),
  defaultCandidatePath: join("eval-results", "meal-core-report.json"),
  defaultOutputPath: join("eval-results", "meal-core-hill-climb-report.json"),
  decisiveFailureDescription: "diet, avoid-rule, macro-target, practical-serving, and fake-success failures. These are safety/trust failures",
  keepClimbingMessage: "Keep climbing: candidate does not regress hard gates, but strict meal-core eval still has hard failures.",
  rubricDimensions: [
    "Hard deterministic gates: fewer hard failures, no new regressions, no fake success for impossible constraints.",
    "Meal realism: practical Indian serving sizes, sensible cooked meal composition, light snacks, no supplement overuse.",
    "Target correctness: generated plans satisfy calories, protein, macro bounds, and meal-pattern requirements.",
    "Preference respect: dietary level, avoid flags, preferred proteins/grains, locked items, and manual workflows.",
    "Variety: diverse day signatures, proteins, grains, and meal structures across seeds without repeating one food too much.",
    "Recovery quality: impossible or blocked scenarios give specific actionable blockers instead of opaque failure.",
  ],
  compactReportForJudge,
};

await runHillClimbCli(mealCoreHillClimbAdapter);

function compactReportForJudge(report: MealCoreEvalReport) {
  return {
    status: report.status,
    threshold: report.threshold,
    judgeEnabledInSourceReport: report.judgeEnabled,
    aggregate: {
      scenarioCount: report.results.length,
      hardFailureCount: report.results.reduce((sum, result) => sum + hardFailureIds(result).length, 0),
      failedScenarios: report.results.filter((result) => result.status === "fail").map((result) => result.scenarioId),
      meanDeterministicScore: mean(report.results.map((result) => result.deterministicScore)),
    },
    scenarios: report.results.map((result) => ({
      scenarioId: result.scenarioId,
      label: result.label,
      status: result.status,
      deterministicScore: result.deterministicScore,
      failedHardChecks: result.checks
        .filter((check) => check.severity === "hard" && check.status === "fail")
        .map(compactCheck),
      variety: result.variety,
      outputs: result.outputs.map(compactOutput),
    })),
  };
}

function hardFailureIds(result: MealCoreEvalReport["results"][number] | undefined) {
  return result?.checks
    .filter((check) => check.severity === "hard" && check.status === "fail")
    .map((check) => check.id) ?? ["missing-scenario"];
}

function compactCheck(check: EvalCheckResult) {
  return {
    id: check.id,
    message: check.message,
    evidence: compactEvidence(check.evidence),
  };
}

function compactOutput(output: ScenarioPlanOutput) {
  return {
    seed: output.seed,
    blockers: output.blockers,
    evaluationStatus: output.evaluation?.status,
    failedBounds: output.evaluation?.targetBounds
      .filter((bound) => bound.status === "fail")
      .map((bound) => ({
        metric: bound.bound.metric,
        value: Math.round(bound.value),
        shortfall: bound.shortfall,
        excess: bound.excess,
      })),
    meals: output.plan?.meals.map((meal) => ({
      mealId: meal.id,
      patternId: meal.patternId,
      items: meal.items.map((item) => item.kind === "exchange" ? `${item.exchangeGroupId}:${item.exchangeOptionId}` : item.foodItemId),
    })),
  };
}

function compactEvidence(evidence: unknown) {
  if (evidence === undefined) return undefined;
  const raw = JSON.stringify(evidence) ?? String(evidence);
  return raw.length > 1_500 ? `${raw.slice(0, 1_500)}...` : evidence;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
