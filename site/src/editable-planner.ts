import {
  calculateMealTotals,
  createNutritionTarget,
  evaluateDailyPlan,
  generateDailyPlans,
  getExchangeGroup,
  type DailyPlan,
  type DailyPlanItem,
  type DailyPlanTemplate,
  type DailyPlanTemplateItem,
  type DietaryLevel,
  type FoodPreference,
  type GenerateMealPlanInput,
  type NutritionMetric,
  type NutritionTarget,
  type PlanEvaluation,
} from "../../src/index.js";

export interface EditableFormState {
  calories: string;
  protein: string;
  carbs: MacroField;
  fat: MacroField;
  fiber: MacroField;
  saturatedFat: MacroField;
  dietaryLevel: DietaryLevel;
  preferredGrain: string;
  preferredProtein: string;
  avoidPaneer: boolean;
  avoidWhey: boolean;
  avoidEggs: boolean;
  avoidChickenFish: boolean;
}

export type BoundField = "none" | "min" | "max" | "target";

export interface MacroField {
  mode: BoundField;
  value: string;
}

export interface MealMacroTarget {
  calories?: string;
  protein?: string;
}

export interface ShareablePlannerState {
  form: EditableFormState;
  plan?: DailyPlan;
  lockedItemIds: string[];
  mealTargets: Record<string, MealMacroTarget>;
}

export const grainOptions = [
  { id: "roti", label: "Roti" },
  { id: "cooked-rice", label: "Cooked rice" },
  { id: "raw-oats", label: "Oats" },
  { id: "dosa", label: "Dosa" },
  { id: "raw-rice", label: "Rice" },
];

export const proteinOptions = [
  { id: "paneer-50g", label: "Paneer" },
  { id: "whey-30g", label: "Whey" },
  { id: "tofu-100g", label: "Tofu" },
  { id: "two-whole-eggs", label: "Eggs" },
  { id: "chicken-fish-100g", label: "Chicken / fish" },
];

export const initialFormState: EditableFormState = {
  calories: "2000",
  protein: "75",
  carbs: { mode: "min", value: "100" },
  fat: { mode: "max", value: "120" },
  fiber: { mode: "min", value: "10" },
  saturatedFat: { mode: "max", value: "20" },
  dietaryLevel: "vegetarian",
  preferredGrain: "roti",
  preferredProtein: "paneer-50g",
  avoidPaneer: false,
  avoidWhey: false,
  avoidEggs: false,
  avoidChickenFish: false,
};

export function buildNutritionInput(form: EditableFormState): GenerateMealPlanInput {
  const preferredProtein =
    form.preferredProtein === "chicken-fish-100g" &&
    form.dietaryLevel === "vegetarian" &&
    form.avoidPaneer &&
    form.avoidWhey &&
    form.avoidEggs
      ? { allowedExchangeOptionIds: { "protein-serving": ["chicken-fish-100g"] } }
      : {};

  const input: GenerateMealPlanInput = {
    calories: Number(form.calories || 0),
    dietaryLevel: form.dietaryLevel,
    protein: Number(form.protein || 0) || undefined,
    preferences: {
      ...preferredProtein,
      preferredExchangeOptionIds: {
        grain: [form.preferredGrain],
        "protein-serving": [form.preferredProtein],
      },
      excludedFoodItemIds: [
        form.avoidPaneer ? "paneer" : undefined,
        form.avoidWhey ? "whey" : undefined,
        form.avoidEggs ? "egg-whole" : undefined,
        form.avoidChickenFish ? "chicken-breast" : undefined,
        form.avoidChickenFish ? "rohu-fish" : undefined,
      ].filter((item): item is string => Boolean(item)),
    },
  };

  addMacro(input, "carbs", form.carbs);
  addMacro(input, "fat", form.fat);
  addMacro(input, "fiber", form.fiber);
  addMacro(input, "saturatedFat", form.saturatedFat);

  return input;
}

export function createTargetFromForm(form: EditableFormState): NutritionTarget {
  return createNutritionTarget(buildNutritionInput(form));
}

export function generateEditablePlan(
  form: EditableFormState,
  lockedPlan: DailyPlan | undefined,
  lockedItemIds: ReadonlySet<string>,
  seed = Date.now(),
): DailyPlan | undefined {
  const template = buildDynamicTemplate(form, lockedPlan, lockedItemIds, seed);
  const input = buildNutritionInput(form);
  const result = generateDailyPlans({
    template,
    target: createNutritionTarget(input),
    preferences: input.preferences,
    maxCandidates: 120,
  });

  const passingCandidates = result.candidates.filter((candidate) => candidate.evaluation?.status === "pass");

  return passingCandidates[pickIndex(passingCandidates.length, seed)]?.plan ?? result.candidates[0]?.plan;
}

export function buildDynamicTemplate(
  form: EditableFormState,
  lockedPlan: DailyPlan | undefined,
  lockedItemIds: ReadonlySet<string>,
  seed = Date.now(),
): DailyPlanTemplate {
  return {
    id: "editable-daily-plan",
    displayName: "Editable daily plan",
    meals: ["breakfast", "lunch", "snack", "dinner"].map((mealId, mealIndex) => {
      const lockedItems = lockedPlan?.meals
        .find((meal) => meal.id === mealId)
        ?.items.filter((item) => item.id && lockedItemIds.has(item.id)) ?? [];
      const lockedRoles = new Set(lockedItems.flatMap((item) => item.roles ?? []));
      const items: DailyPlanTemplateItem[] = lockedItems.map(toTemplateItem);

      if (mealId === "snack") {
        if (!lockedRoles.has("snack")) {
          items.push({
            kind: "food",
            id: `${mealId}-nuts`,
            foodItemId: "nuts",
            quantity: { amount: 15, unit: "g" },
            roles: ["snack"],
          });
        }

        return { id: mealId, displayName: titleCase(mealId), patternId: "snack", items };
      }

      if (!lockedRoles.has("carb")) {
        const grain = mealId === "breakfast" ? "raw-oats" : pickAllowedGrain(mealId, form, seed + mealIndex);
        items.push({
          kind: "exchange",
          id: `${mealId}-carb`,
          exchangeGroupId: "grain",
          defaultOptionId: grain,
          allowedOptionIds: mealId === "breakfast" ? ["raw-oats"] : grainOptionsForMeal(mealId),
          exchangeUnits: 1,
          roles: ["carb"],
        });
      }

      if (!lockedRoles.has("protein")) {
        const protein = pickAllowedProtein(form, seed + mealIndex * 11);
        items.push({
          kind: "exchange",
          id: `${mealId}-protein`,
          exchangeGroupId: "protein-serving",
          defaultOptionId: protein,
          allowedOptionIds: proteinOptionsForDiet(form.dietaryLevel),
          exchangeUnits: 1,
          roles: ["protein"],
        });
      }

      return { id: mealId, displayName: titleCase(mealId), patternId: "cooked-plate", items };
    }),
  };
}

export function randomizePlan(
  plan: DailyPlan,
  form: EditableFormState,
  lockedItemIds: ReadonlySet<string>,
  mealId?: string,
  seed = Date.now(),
): DailyPlan {
  const attempts = mealId ? 32 : 48;
  let bestPlan = plan;
  let bestScore = scorePlanEvaluation(planEvaluation(plan, form));
  const originalSerialized = JSON.stringify(plan);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidateSeed = seed + attempt * 17;
    const candidate =
      mealId === undefined
        ? restoreLockedItems(generateEditablePlan(form, plan, lockedItemIds, candidateSeed), plan, lockedItemIds)
        : randomizePlanItems(plan, form, lockedItemIds, mealId, candidateSeed);

    if (!candidate) {
      continue;
    }

    const candidateScore = scorePlanEvaluation(planEvaluation(candidate, form));
    const candidateSerialized = JSON.stringify(candidate);
    if (
      candidateScore < bestScore ||
      (candidateScore === bestScore && candidateSerialized !== originalSerialized)
    ) {
      bestPlan = candidate;
      bestScore = candidateScore;
    }
  }

  return bestPlan;
}

function randomizePlanItems(
  plan: DailyPlan,
  form: EditableFormState,
  lockedItemIds: ReadonlySet<string>,
  mealId: string | undefined,
  seed: number,
): DailyPlan {
  return {
    ...plan,
    meals: plan.meals.map((meal, mealIndex) => {
      if (mealId && meal.id !== mealId) {
        return meal;
      }

      return {
        ...meal,
        items: meal.items.map((item, itemIndex) => {
          if (!item.id || lockedItemIds.has(item.id) || item.kind !== "exchange") {
            return item;
          }

          if (item.exchangeGroupId === "grain") {
            return {
              ...item,
              exchangeOptionId:
                meal.id === "breakfast" ? "raw-oats" : pickAllowedGrain(meal.id, form, seed + mealIndex + itemIndex),
            };
          }

          if (item.exchangeGroupId === "protein-serving") {
            return {
              ...item,
              exchangeOptionId: pickAllowedProtein(form, seed + mealIndex + itemIndex),
            };
          }

          return item;
        }),
      };
    }),
  };
}

function restoreLockedItems(
  candidate: DailyPlan | undefined,
  original: DailyPlan,
  lockedItemIds: ReadonlySet<string>,
): DailyPlan | undefined {
  if (!candidate || lockedItemIds.size === 0) {
    return candidate;
  }

  const lockedItemsById = new Map(
    original.meals.flatMap((meal) => meal.items.filter((item) => item.id && lockedItemIds.has(item.id)).map((item) => [item.id, item])),
  );

  return {
    ...candidate,
    meals: candidate.meals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => (item.id && lockedItemsById.has(item.id) ? lockedItemsById.get(item.id)! : item)),
    })),
  };
}

function scorePlanEvaluation(evaluation: PlanEvaluation) {
  const targetScore = evaluation.targetBounds.reduce((score, bound) => {
    const miss = bound.shortfall ?? bound.excess ?? 0;
    return score + (bound.status === "fail" ? 1_000 : 0) + miss * metricWeights[bound.bound.metric];
  }, 0);
  const mealPenalty = evaluation.meals.filter((meal) => meal.status === "fail").length * 250;

  return (evaluation.status === "pass" ? 0 : 10_000) + targetScore + mealPenalty;
}

export function swapExchangeOption(plan: DailyPlan, itemId: string, optionId: string): DailyPlan {
  return updatePlanItem(plan, itemId, (item) => (item.kind === "exchange" ? { ...item, exchangeOptionId: optionId } : item));
}

export function updateItemAmount(plan: DailyPlan, itemId: string, amount: number): DailyPlan {
  return updatePlanItem(plan, itemId, (item) => {
    if (item.kind === "food") {
      return { ...item, quantity: { ...item.quantity, amount: roundFoodAmount(item, amount) } };
    }

    return { ...item, exchangeUnits: roundServingUnits(amount) };
  });
}

export function addMeal(plan: DailyPlan): DailyPlan {
  const next = plan.meals.length + 1;

  return {
    ...plan,
    meals: [
      ...plan.meals,
      {
        id: `meal-${next}`,
        displayName: `Meal ${next}`,
        patternId: "snack",
        items: [
          {
            kind: "exchange",
            id: `meal-${next}-protein`,
            exchangeGroupId: "protein-serving",
            exchangeOptionId: "paneer-50g",
            exchangeUnits: 1,
            roles: ["protein"],
          },
        ],
      },
    ],
  };
}

export function addItemToMeal(plan: DailyPlan, mealId: string, groupId: "grain" | "protein-serving" | "fruit"): DailyPlan {
  const id = `${mealId}-${groupId}-${Date.now().toString(36)}`;
  const item: DailyPlanItem =
    groupId === "fruit"
      ? { kind: "exchange", id, exchangeGroupId: "fruit", exchangeOptionId: "banana", exchangeUnits: 1, roles: ["fruit"] }
      : groupId === "grain"
        ? { kind: "exchange", id, exchangeGroupId: "grain", exchangeOptionId: "roti", exchangeUnits: 1, roles: ["carb"] }
        : {
            kind: "exchange",
            id,
            exchangeGroupId: "protein-serving",
            exchangeOptionId: "paneer-50g",
            exchangeUnits: 1,
            roles: ["protein"],
          };

  return {
    ...plan,
    meals: plan.meals.map((meal) => (meal.id === mealId ? { ...meal, items: [...meal.items, item] } : meal)),
  };
}

export function mealTargetStatus(plan: DailyPlan, mealId: string, target: MealMacroTarget) {
  const meal = plan.meals.find((candidate) => candidate.id === mealId);

  if (!meal) {
    return [];
  }

  const totals = calculateMealTotals(meal);
  const statuses: string[] = [];
  const protein = Number(target.protein || 0);
  const calories = Number(target.calories || 0);

  if (protein) {
    statuses.push(totals.values.protein >= protein ? `Protein met` : `Protein short ${Math.ceil(protein - totals.values.protein)}g`);
  }

  if (calories) {
    statuses.push(
      Math.abs(totals.values.calories - calories) <= 50
        ? `Calories met`
        : `${Math.round(totals.values.calories)} / ${calories} kcal`,
    );
  }

  return statuses;
}

export function encodeShareState(state: ShareablePlannerState): string {
  return btoa(encodeURIComponent(JSON.stringify(state)));
}

export function decodeShareState(encoded: string): ShareablePlannerState | undefined {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded))) as ShareablePlannerState;
  } catch {
    return undefined;
  }
}

export function shareUrlForState(state: ShareablePlannerState, base = window.location.href): string {
  const url = new URL(base);
  url.searchParams.set("s", encodeShareState(state));
  return url.toString();
}

export function planEvaluation(plan: DailyPlan, form: EditableFormState) {
  return evaluateDailyPlan(plan, createTargetFromForm(form));
}

export function failureRecoveryMessages(evaluation: PlanEvaluation): string[] {
  return evaluation.targetBounds
    .filter((bound) => bound.status === "fail")
    .map((bound) => {
      const metric = metricLabels[bound.bound.metric];

      if (bound.shortfall !== undefined) {
        return `${metric} short by ${formatAmount(bound.shortfall, bound.bound.metric)}. ${recoveryAction(bound.bound.metric, "min")}`;
      }

      if (bound.excess !== undefined) {
        return `${metric} is over max by ${formatAmount(bound.excess, bound.bound.metric)}. ${recoveryAction(bound.bound.metric, "max")}`;
      }

      return `${metric} misses target. Relax this target before regenerating.`;
    });
}

function addMacro(input: GenerateMealPlanInput, key: "carbs" | "fat" | "fiber" | "saturatedFat", field: MacroField) {
  const value = Number(field.value || 0);

  if (!value || field.mode === "none") {
    return;
  }

  input[key] = { [field.mode]: value };
}

function toTemplateItem(item: DailyPlanItem) {
  if (item.kind === "food") {
    return {
      kind: "food" as const,
      id: item.id ?? `locked-food-${Date.now()}`,
      foodItemId: item.foodItemId,
      quantity: item.quantity,
      roles: item.roles,
      adjustable: false,
    };
  }

  return {
    kind: "exchange" as const,
    id: item.id ?? `locked-exchange-${Date.now()}`,
    exchangeGroupId: item.exchangeGroupId,
    defaultOptionId: item.exchangeOptionId,
    allowedOptionIds: [item.exchangeOptionId],
    exchangeUnits: item.exchangeUnits,
    roles: item.roles,
    adjustable: false,
  };
}

function updatePlanItem(plan: DailyPlan, itemId: string, update: (item: DailyPlanItem) => DailyPlanItem): DailyPlan {
  return {
    ...plan,
    meals: plan.meals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => (item.id === itemId ? update(item) : item)),
    })),
  };
}

function pickAllowedGrain(mealId: string, form: EditableFormState, seed: number) {
  const options = grainOptionsForMeal(mealId);
  const preferred = options.includes(form.preferredGrain) ? form.preferredGrain : undefined;
  const pool = preferred ? [preferred, ...options.filter((option) => option !== preferred)] : options;

  return pool[pickIndex(pool.length, seed)] ?? "roti";
}

function grainOptionsForMeal(mealId: string) {
  return mealId === "dinner"
    ? ["roti", "cooked-rice", "dosa", "raw-rice"]
    : ["roti", "cooked-rice", "raw-oats", "dosa", "raw-rice"];
}

function pickAllowedProtein(form: EditableFormState, seed: number) {
  const options = proteinOptionsForDiet(form.dietaryLevel).filter((option) => {
    if (form.avoidPaneer && option === "paneer-50g") return false;
    if (form.avoidWhey && option === "whey-30g") return false;
    if (form.avoidEggs && option === "two-whole-eggs") return false;
    if (form.avoidChickenFish && option === "chicken-fish-100g") return false;
    return true;
  });
  const preferred = options.includes(form.preferredProtein) ? form.preferredProtein : undefined;
  const pool = preferred ? [preferred, ...options.filter((option) => option !== preferred)] : options;

  return pool[pickIndex(pool.length, seed)] ?? "paneer-50g";
}

function proteinOptionsForDiet(dietaryLevel: DietaryLevel) {
  if (dietaryLevel === "vegetarian") {
    return ["paneer-50g", "whey-30g", "tofu-100g", "soy-chunks-dal-40g"];
  }

  if (dietaryLevel === "eggetarian") {
    return ["two-whole-eggs", "paneer-50g", "whey-30g", "tofu-100g", "soy-chunks-dal-40g"];
  }

  return ["chicken-fish-100g", "two-whole-eggs", "paneer-50g", "whey-30g", "tofu-100g", "soy-chunks-dal-40g"];
}

function pickIndex(length: number, seed: number) {
  if (length <= 1) {
    return 0;
  }

  const value = Math.sin(seed * 999) * 10000;
  return Math.abs(Math.floor(value)) % length;
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

const metricLabels: Record<NutritionMetric, string> = {
  calories: "Calories",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
  fiber: "Fiber",
  saturatedFat: "Saturated fat",
};

const metricWeights: Record<NutritionMetric, number> = {
  calories: 0.2,
  protein: 8,
  carbs: 2,
  fat: 4,
  fiber: 6,
  saturatedFat: 6,
};

function formatAmount(value: number, metric: NutritionMetric) {
  return `${Math.ceil(value)}${metric === "calories" ? " kcal" : "g"}`;
}

function roundServingUnits(value: number) {
  return Math.max(0, Math.round(value * 2) / 2);
}

function roundFoodAmount(item: DailyPlanItem, value: number) {
  if (item.kind === "food" && item.foodItemId === "veggies-excl-potato" && item.quantity.unit === "g") {
    return Math.max(0, Math.round(value / 50) * 50);
  }

  return value;
}

function recoveryAction(metric: NutritionMetric, direction: "min" | "max") {
  if (metric === "protein") {
    return direction === "min"
      ? "Choose a higher-protein preference, remove protein exclusions, or relax the protein minimum before regenerating."
      : "Choose a lighter protein preference or relax the protein maximum before regenerating.";
  }

  if (metric === "calories") {
    return direction === "min"
      ? "Increase the calorie target or relax the calorie minimum before regenerating."
      : "Lower the calorie target or relax the calorie maximum before regenerating.";
  }

  if (metric === "fat" || metric === "saturatedFat") {
    return direction === "min"
      ? "Relax the fat minimum or change food preferences before regenerating."
      : "Relax the fat max, choose leaner protein, or remove high-fat preferences before regenerating.";
  }

  if (metric === "fiber") {
    return direction === "min"
      ? "Add fiber-rich preferences or relax the fiber minimum before regenerating."
      : "Relax the fiber maximum or change food preferences before regenerating.";
  }

  return direction === "min"
    ? "Relax the macro minimum or change preferences before regenerating."
    : "Relax the macro max or change preferences before regenerating.";
}

export function exchangeOptionsForItem(item: DailyPlanItem, dietaryLevel: DietaryLevel) {
  if (item.kind !== "exchange") {
    return [];
  }

  const options = getExchangeGroup(item.exchangeGroupId).options;

  if (item.exchangeGroupId === "protein-serving") {
    const allowed = new Set(proteinOptionsForDiet(dietaryLevel));
    return options.filter((option) => allowed.has(option.id));
  }

  if (item.exchangeGroupId === "grain") {
    return options.filter((option) => option.id !== "raw-oats" || item.roles?.includes("carb"));
  }

  return options;
}
