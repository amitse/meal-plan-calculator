import {
  addItemToMeal,
  addMeal,
  applyDietaryLevel,
  createManualDailyPlan,
  generateEditablePlan,
  generateEditablePlanResult,
  initialFormState,
  planEvaluation,
  randomizePlan,
  type DailyPlan,
  type EditableFormState,
} from "../../site/src/editable-planner.js";
import type { MealCoreScenario, ScenarioPlanOutput } from "./types.js";

const defaultSeeds = [101, 203, 307, 409, 503, 607, 709, 811, 907, 1009, 1103, 1201];

function form(overrides: Partial<EditableFormState>): EditableFormState {
  return {
    ...initialFormState,
    ...overrides,
    carbs: overrides.carbs ?? initialFormState.carbs,
    fat: overrides.fat ?? initialFormState.fat,
    fiber: overrides.fiber ?? initialFormState.fiber,
    saturatedFat: overrides.saturatedFat ?? initialFormState.saturatedFat,
  };
}

const eggetarianForm = applyDietaryLevel(initialFormState, "eggetarian");
const nonVegetarianForm = applyDietaryLevel(initialFormState, "nonVegetarian");

export const mealCoreScenarios: MealCoreScenario[] = [
  {
    id: "default-vegetarian-2000",
    label: "Default vegetarian 2000 kcal",
    kind: "generation",
    form: initialFormState,
    seeds: defaultSeeds,
  },
  {
    id: "high-protein-vegetarian",
    label: "High-protein vegetarian",
    kind: "generation",
    form: form({ calories: "2200", protein: "120" }),
    seeds: defaultSeeds,
  },
  {
    id: "eggetarian-with-eggs",
    label: "Eggetarian with eggs preferred",
    kind: "generation",
    form: { ...eggetarianForm, calories: "2000", protein: "85", preferredProteins: ["two-whole-eggs"] },
    seeds: defaultSeeds,
    expected: {
      requiredExchangeOptions: ["two-whole-eggs"],
      forbiddenExchangeOptions: ["chicken-fish-100g"],
    },
  },
  {
    id: "non-vegetarian-with-chicken-fish",
    label: "Non-vegetarian with chicken/fish preferred",
    kind: "generation",
    form: { ...nonVegetarianForm, calories: "2100", protein: "100", preferredProteins: ["chicken-fish-100g"] },
    seeds: defaultSeeds,
    expected: {
      requiredExchangeOptions: ["chicken-fish-100g"],
    },
  },
  {
    id: "paneer-whey-avoided",
    label: "Vegetarian with paneer and whey avoided",
    kind: "generation",
    form: form({
      calories: "2000",
      protein: "85",
      avoidPaneer: true,
      avoidWhey: true,
      preferredProteins: ["paneer-50g", "whey-30g", "tofu-100g"],
    }),
    seeds: defaultSeeds,
    expected: {
      forbiddenExchangeOptions: ["paneer-50g", "whey-30g"],
      requiredExchangeOptions: ["tofu-100g"],
    },
  },
  {
    id: "grain-preference-cooked-rice-vs-roti",
    label: "Cooked rice and roti preference",
    kind: "generation",
    form: form({
      calories: "1900",
      protein: "80",
      preferredGrains: ["cooked-rice", "roti"],
    }),
    seeds: defaultSeeds,
    expected: {
      requiredExchangeOptions: ["cooked-rice", "roti"],
    },
  },
  {
    id: "impossible-macro-bounds",
    label: "Impossible macro bounds return blockers",
    kind: "impossible",
    form: form({
      calories: "1800",
      protein: "150",
      carbs: { mode: "max", value: "20" },
      fat: { mode: "max", value: "20" },
      fiber: { mode: "min", value: "60" },
    }),
    seeds: [101],
    expected: {
      requiredBlockerText: ["Protein", "Carbs", "Fat", "Fiber"],
    },
  },
  {
    id: "manual-plan-then-add-foods",
    label: "Manual plan then add foods",
    kind: "manual",
    form: initialFormState,
    seeds: [101],
  },
  {
    id: "locked-item-then-regenerate",
    label: "Locked item then regenerate",
    kind: "locked-regenerate",
    form: initialFormState,
    seeds: [101],
  },
  {
    id: "meal-targets-randomize",
    label: "Meal targets randomize",
    kind: "meal-target-randomize",
    form: initialFormState,
    seeds: [101],
    mealTargets: { lunch: { protein: "30" } },
  },
];

export function runScenario(scenario: MealCoreScenario): ScenarioPlanOutput[] {
  if (scenario.kind === "manual") {
    const plan = addItemToMeal(addItemToMeal(addMeal(createManualDailyPlan(), scenario.form), "meal-1", "protein-serving", scenario.form), "meal-1", "grain", scenario.form);
    return [{ seed: scenario.seeds?.[0] ?? 0, plan, evaluation: planEvaluation(plan, scenario.form), blockers: [] }];
  }

  if (scenario.kind === "locked-regenerate") {
    const seed = scenario.seeds?.[0] ?? 0;
    const firstPlan = generateEditablePlan(scenario.form, undefined, new Set(), seed);
    if (!firstPlan) {
      return [{ seed, blockers: ["Initial locked-item plan did not generate."] }];
    }

    const lockedId = firstPlan.meals.find((meal) => meal.id === "lunch")?.items.find((item) => item.id?.includes("protein"))?.id;
    const nextForm = form({ calories: "2100", protein: "95" });
    const nextPlan = generateEditablePlan(nextForm, firstPlan, lockedId ? new Set([lockedId]) : new Set(), seed + 1);

    return [{
      seed,
      plan: nextPlan,
      evaluation: nextPlan ? planEvaluation(nextPlan, nextForm) : undefined,
      blockers: lockedId ? [] : ["No lockable lunch protein found."],
    }];
  }

  if (scenario.kind === "meal-target-randomize") {
    const seed = scenario.seeds?.[0] ?? 0;
    const plan = generateEditablePlan(scenario.form, undefined, new Set(), seed);
    const randomized = plan ? randomizePlan(plan, scenario.form, new Set(), "lunch", seed + 1, scenario.mealTargets?.lunch) : undefined;
    return [{ seed, plan: randomized, evaluation: randomized ? planEvaluation(randomized, scenario.form) : undefined, blockers: plan ? [] : ["Initial meal-target plan did not generate."] }];
  }

  return (scenario.seeds ?? defaultSeeds).map((seed) => {
    const result = generateEditablePlanResult(scenario.form, undefined, new Set(), seed);
    return {
      seed,
      plan: result.plan,
      evaluation: result.plan ? planEvaluation(result.plan, scenario.form) : undefined,
      blockers: result.blockers,
    };
  });
}

export function findPlanItem(plan: DailyPlan, itemId: string) {
  return plan.meals.flatMap((meal) => meal.items).find((item) => item.id === itemId);
}
