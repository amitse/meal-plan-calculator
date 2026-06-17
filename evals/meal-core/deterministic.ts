import {
  calculateEditableMealTotals,
  exchangeOptionDisplayName,
  planItemDisplayQuantity,
  planItemDisplayUnitLabel,
  type DailyPlan,
  type DailyPlanItem,
  type DietaryLevel,
  type EditableFormState,
} from "../../site/src/editable-planner.js";
import { calculateDailyPlanItemNutrition, getExchangeOption, getFoodItem, listExchangeOptions } from "../../src/index.js";
import type { MealRole } from "../../src/planning-types.js";
import type { EvalCheckResult, MealCoreScenario, ScenarioPlanOutput, VarietySummary } from "./types.js";

const hard = (id: string, pass: boolean, message: string, evidence?: unknown): EvalCheckResult => ({
  id,
  severity: "hard",
  status: pass ? "pass" : "fail",
  message,
  evidence,
});

export function evaluateDeterministicScenario(scenario: MealCoreScenario, outputs: ScenarioPlanOutput[]) {
  const checks: EvalCheckResult[] = [];

  if (scenario.kind === "impossible") {
    const output = outputs[0];
    const blockerText = output?.blockers.join(" ") ?? "";
    checks.push(hard("impossible-no-plan", outputs.every((entry) => !entry.plan), "Impossible constraints must not return a fake successful plan.", outputs));
    checks.push(hard("impossible-specific-blockers", (scenario.expected?.requiredBlockerText ?? []).some((term) => blockerText.includes(term)), "Impossible constraints must return specific recovery blockers.", output?.blockers));
    return checks;
  }

  const plans = outputs.flatMap((output) => output.plan ? [output.plan] : []);
  checks.push(hard("plan-generated", plans.length === outputs.length, "Every non-impossible scenario must produce a DailyPlan.", outputs.map((output) => ({ seed: output.seed, blockers: output.blockers }))));

  for (const output of outputs) {
    if (!output.plan || !output.evaluation) continue;

    checks.push(hard(`target-status-${output.seed}`, output.evaluation.status === "pass" || scenario.kind === "manual", "Generated scenarios must pass target and meal-pattern evaluation; manual starts may be partial while building.", summarizeEvaluation(output)));
    checks.push(hard(`diet-rules-${output.seed}`, respectsDietRules(output.plan, scenario.form.dietaryLevel), "DailyPlan must respect Indian dietary-level rules.", summarizePlanFoods(output.plan)));
    checks.push(hard(`avoid-rules-${output.seed}`, respectsAvoidRules(output.plan, scenario.form), "DailyPlan must respect active avoid rules.", summarizePlanFoods(output.plan)));
    checks.push(hard(`practical-servings-${output.seed}`, hasPracticalServingSizes(output.plan), "DailyPlan must use practical serving units and increments.", summarizePlanServings(output.plan)));
    checks.push(hard(`meal-realism-basics-${output.seed}`, hasMealRealismBasics(output.plan), "DailyPlan must keep cooked meals complete and snacks light.", summarizeMeals(output.plan)));
    checks.push(hard(`supplement-limit-${output.seed}`, countExchangeOption(output.plan, "whey-30g") <= 1, "DailyPlan must not rely on whey more than once per day.", summarizeExchangeOptions(output.plan)));
  }

  if (scenario.expected?.forbiddenExchangeOptions) {
    for (const optionId of scenario.expected.forbiddenExchangeOptions) {
      checks.push(hard(`forbidden-option-${optionId}`, plans.every((plan) => countExchangeOption(plan, optionId) === 0), `Forbidden exchange option ${optionId} must stay out.`, summarizeAllOptions(plans)));
    }
  }

  if (scenario.expected?.requiredExchangeOptions) {
    for (const optionId of scenario.expected.requiredExchangeOptions) {
      checks.push(hard(`required-option-${optionId}`, plans.some((plan) => countExchangeOption(plan, optionId) > 0), `Required/preferred exchange option ${optionId} should appear across seeds.`, summarizeAllOptions(plans)));
    }
  }

  if (scenario.kind === "generation") {
    const variety = summarizeVariety(plans);
    const allowedProteinCount = allowedProteinOptions(scenario.form).length;
    checks.push(hard("very-strict-day-variety", variety.uniqueDaySignatures >= Math.min(6, outputs.length), "Very strict variety requires at least six distinct day signatures across twelve seeds.", variety));
    checks.push(hard("protein-variety", variety.uniqueProteinOptions.length >= Math.min(3, allowedProteinCount) || outputs.length < 6, "Generated plans should vary protein choices across seeds up to the number allowed by active rules.", { observed: variety.uniqueProteinOptions, allowed: allowedProteinOptions(scenario.form) }));
    checks.push(hard("grain-variety", variety.uniqueGrainOptions.length >= 3 || outputs.length < 6, "Generated plans should vary grain choices across seeds.", variety.uniqueGrainOptions));
    checks.push(hard("duplicate-food-share", variety.mostRepeatedFoodShare <= 0.72, "No single food should dominate generated seed outputs.", variety.repeatedFoodCounts));
  }

  function allowedProteinOptions(form: EditableFormState) {
    return listExchangeOptions("protein-serving")
      .filter((option) => isDietAllowed(option.dietaryLevel ?? (option.foodItemId ? getFoodItem(option.foodItemId).dietaryLevel : "vegetarian"), form.dietaryLevel))
      .filter((option) => !(
        (form.avoidPaneer && option.foodItemId === "paneer") ||
        (form.avoidWhey && option.foodItemId === "whey") ||
        (form.avoidEggs && option.foodItemId === "egg-whole") ||
        (form.avoidChickenFish && (option.foodItemId === "chicken-breast" || option.foodItemId === "rohu-fish"))
      ))
      .map((option) => option.id);
  }

  if (scenario.kind === "locked-regenerate") {
    const output = outputs[0];
    checks.push(hard("locked-regenerate-passes", Boolean(output?.plan && output.evaluation?.status === "pass"), "Locked-item regeneration must still produce a passing DailyPlan.", output?.evaluation));
  }

  if (scenario.kind === "meal-target-randomize") {
    const output = outputs[0];
    const lunch = output?.plan?.meals.find((meal) => meal.id === "lunch");
    const protein = lunch ? calculateEditableMealTotals(lunch).values.protein : 0;
    checks.push(hard("meal-target-randomize-protein", protein >= 30, "Meal-target randomization should meet the lunch protein target.", { protein }));
  }

  return checks;
}

export function summarizeVariety(plans: DailyPlan[]): VarietySummary {
  const daySignatures = new Set(plans.map((plan) => plan.meals.map((meal) => `${meal.id}:${meal.items.map(itemKey).join(",")}`).join("|")));
  const mealStructures = new Set(plans.flatMap((plan) => plan.meals.map((meal) => `${meal.id}:${meal.items.map((item) => item.roles?.join("+") ?? "none").join(",")}`)));
  const proteinOptions = new Set<string>();
  const grainOptions = new Set<string>();
  const repeatedFoodCounts: Record<string, number> = {};
  let totalItems = 0;

  for (const plan of plans) {
    for (const item of plan.meals.flatMap((meal) => meal.items)) {
      totalItems += 1;
      const key = itemKey(item);
      repeatedFoodCounts[key] = (repeatedFoodCounts[key] ?? 0) + 1;

      if (item.kind === "exchange" && item.exchangeGroupId === "protein-serving") proteinOptions.add(item.exchangeOptionId);
      if (item.kind === "exchange" && item.exchangeGroupId === "grain") grainOptions.add(item.exchangeOptionId);
    }
  }

  const mostRepeatedFoodShare = totalItems === 0 ? 0 : Math.max(0, ...Object.values(repeatedFoodCounts)) / totalItems;

  return {
    seedCount: plans.length,
    uniqueDaySignatures: daySignatures.size,
    uniqueMealStructures: mealStructures.size,
    uniqueProteinOptions: [...proteinOptions].sort(),
    uniqueGrainOptions: [...grainOptions].sort(),
    mostRepeatedFoodShare,
    repeatedFoodCounts,
  };
}

export function scenarioScore(checks: EvalCheckResult[]) {
  if (checks.length === 0) return 0;
  return checks.filter((check) => check.status === "pass").length / checks.length;
}

export function humanReadablePlanSummary(plan: DailyPlan) {
  return plan.meals.map((meal) => {
    const totals = calculateEditableMealTotals(meal);
    const items = meal.items.map((item) => {
      const quantity = planItemDisplayQuantity(item);
      const unit = planItemDisplayUnitLabel(item, quantity.amount);
      const amount = `${quantity.amount}${quantity.unit === "g" ? "" : " "}${unit}`;
      const label = item.kind === "food" ? getFoodItem(item.foodItemId).displayName : exchangeOptionDisplayName(item.exchangeGroupId, item.exchangeOptionId);
      return `${label} (${amount})`;
    });

    return `${meal.displayName}: ${items.join(", ")} — ${Math.round(totals.values.calories)} kcal, ${Math.round(totals.values.protein)}gm protein`;
  }).join("\n");
}

function respectsDietRules(plan: DailyPlan, dietaryLevel: DietaryLevel) {
  return plan.meals.flatMap((meal) => meal.items).every((item) => isDietAllowed(itemDietaryLevel(item), dietaryLevel));
}

function respectsAvoidRules(plan: DailyPlan, form: EditableFormState) {
  const optionIds = new Set(plan.meals.flatMap((meal) => meal.items.flatMap((item) => item.kind === "exchange" ? [item.exchangeOptionId] : [])));
  const foodIds = new Set(plan.meals.flatMap((meal) => meal.items.map(itemFoodId).filter((id): id is string => Boolean(id))));
  return !(
    (form.avoidPaneer && (optionIds.has("paneer-50g") || foodIds.has("paneer"))) ||
    (form.avoidWhey && (optionIds.has("whey-30g") || foodIds.has("whey"))) ||
    (form.avoidEggs && (optionIds.has("two-whole-eggs") || foodIds.has("egg-whole"))) ||
    (form.avoidChickenFish && (optionIds.has("chicken-fish-100g") || foodIds.has("chicken-breast") || foodIds.has("rohu-fish")))
  );
}

function hasPracticalServingSizes(plan: DailyPlan) {
  return plan.meals.flatMap((meal) => meal.items).every((item) => {
    const quantity = planItemDisplayQuantity(item);
    if (!Number.isFinite(quantity.amount) || quantity.amount <= 0) return false;
    if (quantity.unit === "count" || quantity.unit === "slice" || quantity.unit === "scoop" || quantity.unit === "serving") {
      return Number.isInteger(quantity.amount);
    }
    if (quantity.unit === "g" && item.roles?.includes("vegetables")) {
      return quantity.amount % 50 === 0;
    }
    return Number.isInteger(quantity.amount) && quantity.amount >= 5;
  });
}

function hasMealRealismBasics(plan: DailyPlan) {
  return plan.meals.every((meal) => {
    const calories = calculateEditableMealTotals(meal).values.calories;
    if (meal.id.includes("snack")) return calories <= 450;
    if (meal.patternId === "cooked-plate") {
      const roles = new Set(meal.items.flatMap((item) => item.roles ?? []));
      const requiredRoles: MealRole[] = ["cookingFat", "carb", "protein", "vegetables"];
      return requiredRoles.every((role) => roles.has(role));
    }
    return true;
  });
}

function itemDietaryLevel(item: DailyPlanItem): DietaryLevel {
  if (item.kind === "food") return getFoodItem(item.foodItemId).dietaryLevel;
  const option = getExchangeOption(item.exchangeGroupId, item.exchangeOptionId);
  return option.dietaryLevel ?? (option.foodItemId ? getFoodItem(option.foodItemId).dietaryLevel : "vegetarian");
}

function itemFoodId(item: DailyPlanItem) {
  if (item.kind === "food") return item.foodItemId;
  return getExchangeOption(item.exchangeGroupId, item.exchangeOptionId).foodItemId;
}

function isDietAllowed(itemLevel: DietaryLevel, activeLevel: DietaryLevel) {
  if (activeLevel === "nonVegetarian") return true;
  if (activeLevel === "eggetarian") return itemLevel === "vegetarian" || itemLevel === "eggetarian";
  return itemLevel === "vegetarian";
}

function countExchangeOption(plan: DailyPlan, optionId: string) {
  return plan.meals.flatMap((meal) => meal.items).filter((item) => item.kind === "exchange" && item.exchangeOptionId === optionId).length;
}

function itemKey(item: DailyPlanItem) {
  return item.kind === "food" ? item.foodItemId : item.exchangeOptionId;
}

function summarizeEvaluation(output: ScenarioPlanOutput) {
  return {
    seed: output.seed,
    status: output.evaluation?.status,
    targetBounds: output.evaluation?.targetBounds.map((bound) => ({
      metric: bound.bound.metric,
      status: bound.status,
      value: Math.round(bound.value),
      shortfall: bound.shortfall,
      excess: bound.excess,
    })),
    meals: output.evaluation?.meals.map((meal) => ({ mealId: meal.mealId, status: meal.status, missingRoles: meal.pattern?.missingRoles })),
  };
}

function summarizePlanFoods(plan: DailyPlan) {
  return plan.meals.map((meal) => ({ meal: meal.id, items: meal.items.map((item) => ({ key: itemKey(item), dietaryLevel: itemDietaryLevel(item), foodId: itemFoodId(item) })) }));
}

function summarizePlanServings(plan: DailyPlan) {
  return plan.meals.map((meal) => ({ meal: meal.id, items: meal.items.map((item) => ({ key: itemKey(item), display: planItemDisplayQuantity(item), nutrition: calculateDailyPlanItemNutrition(item) })) }));
}

function summarizeMeals(plan: DailyPlan) {
  return plan.meals.map((meal) => ({ meal: meal.id, patternId: meal.patternId, calories: calculateEditableMealTotals(meal).values.calories, roles: [...new Set(meal.items.flatMap((item) => item.roles ?? []))] }));
}

function summarizeExchangeOptions(plan: DailyPlan) {
  return plan.meals.flatMap((meal) => meal.items.flatMap((item) => item.kind === "exchange" ? [{ meal: meal.id, optionId: item.exchangeOptionId }] : []));
}

function summarizeAllOptions(plans: DailyPlan[]) {
  return plans.map((plan) => summarizeExchangeOptions(plan));
}
