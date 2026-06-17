import type { DailyPlan, EditableFormState, MealMacroTarget, PlanEvaluation } from "../../site/src/editable-planner.js";

export type EvalSeverity = "hard" | "judge";
export type EvalStatus = "pass" | "fail" | "skip";

export interface MealCoreScenario {
  id: string;
  label: string;
  form: EditableFormState;
  seeds?: number[];
  kind: "generation" | "impossible" | "manual" | "locked-regenerate" | "meal-target-randomize";
  mealTargets?: Record<string, MealMacroTarget>;
  expected?: {
    requiredExchangeOptions?: string[];
    forbiddenExchangeOptions?: string[];
    requiredBlockerText?: string[];
  };
}

export interface ScenarioPlanOutput {
  seed: number;
  plan?: DailyPlan;
  evaluation?: PlanEvaluation;
  blockers: string[];
}

export interface ScenarioEvalResult {
  scenarioId: string;
  label: string;
  status: EvalStatus;
  deterministicScore: number;
  checks: EvalCheckResult[];
  outputs: ScenarioPlanOutput[];
  variety?: VarietySummary;
  judge?: JudgeResult;
}

export interface EvalCheckResult {
  id: string;
  severity: EvalSeverity;
  status: EvalStatus;
  message: string;
  evidence?: unknown;
}

export interface VarietySummary {
  seedCount: number;
  uniqueDaySignatures: number;
  uniqueMealStructures: number;
  uniqueProteinOptions: string[];
  uniqueGrainOptions: string[];
  mostRepeatedFoodShare: number;
  repeatedFoodCounts: Record<string, number>;
}

export interface JudgeResult {
  status: EvalStatus;
  score: number | undefined;
  summary: string;
  rawResponse?: string;
}

export interface MealCoreEvalReport {
  generatedAt: string;
  threshold: number;
  judgeEnabled: boolean;
  status: EvalStatus;
  results: ScenarioEvalResult[];
}
