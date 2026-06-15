import {
  calculateMealTotals,
  createNutritionTarget,
  evaluateDailyPlan,
  generateDailyPlans,
  getExchangeGroup,
  getExchangeOption,
  getFoodItem,
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
  preferredGrains: string[];
  preferredProteins: string[];
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

export interface EditablePlanGenerationResult {
  plan?: DailyPlan;
  blockers: string[];
}

export interface DisplayQuantity {
  amount: number;
  unit: "g";
}

export const grainOptions = [
  { id: "roti", label: "Roti" },
  { id: "bread", label: "Bread" },
  { id: "cooked-rice", label: "Cooked rice" },
  { id: "raw-oats", label: "Oats" },
  { id: "raw-poha", label: "Poha" },
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
  carbs: { mode: "none", value: "100" },
  fat: { mode: "none", value: "120" },
  fiber: { mode: "none", value: "10" },
  saturatedFat: { mode: "none", value: "20" },
  dietaryLevel: "vegetarian",
  preferredGrains: grainOptions.map((option) => option.id),
  preferredProteins: proteinOptions.map((option) => option.id),
  avoidPaneer: false,
  avoidWhey: false,
  avoidEggs: false,
  avoidChickenFish: false,
};

type LegacyEditableFormState = Partial<EditableFormState> & {
  preferredGrain?: string;
  preferredProtein?: string;
};

export function normalizeEditableFormState(form: LegacyEditableFormState | undefined): EditableFormState {
  if (!form) {
    return initialFormState;
  }

  const preferredGrains = normalizedPreferenceList(form.preferredGrains, form.preferredGrain, initialFormState.preferredGrains);
  const preferredProteins = normalizedPreferenceList(form.preferredProteins, form.preferredProtein, initialFormState.preferredProteins);

  return {
    ...initialFormState,
    ...form,
    preferredGrains,
    preferredProteins,
  };
}

export function buildNutritionInput(form: EditableFormState): GenerateMealPlanInput {
  const preferredProteins = proteinPreferencesForDiet(form);
  const preferredProtein =
    preferredProteins.includes("chicken-fish-100g") &&
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
        grain: grainPreferences(form),
        "protein-serving": preferredProteins,
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
  const generation = runEditablePlanGeneration(form, lockedPlan, lockedItemIds, seed);

  return pickPassingPlan(generation.result.candidates, seed) ?? generation.result.candidates[0]?.plan;
}

export function generateEditablePlanResult(
  form: EditableFormState,
  lockedPlan: DailyPlan | undefined,
  lockedItemIds: ReadonlySet<string>,
  seed = Date.now(),
): EditablePlanGenerationResult {
  const generation = runEditablePlanGeneration(form, lockedPlan, lockedItemIds, seed);
  const plan = pickPassingPlan(generation.result.candidates, seed);

  if (plan) {
    return { plan, blockers: [] };
  }

  const bestEvaluation = generation.result.candidates
    .map((candidate) => candidate.evaluation)
    .filter((evaluation): evaluation is PlanEvaluation => Boolean(evaluation))
    .sort((left, right) => scorePlanEvaluation(left) - scorePlanEvaluation(right))[0];

  return {
    blockers: bestEvaluation
      ? failureRecoveryMessages(bestEvaluation).slice(0, 2)
      : generationRejectionMessages(generation.result.rejected, form).slice(0, 2),
  };
}

function runEditablePlanGeneration(
  form: EditableFormState,
  lockedPlan: DailyPlan | undefined,
  lockedItemIds: ReadonlySet<string>,
  seed: number,
) {
  const template = buildDynamicTemplate(form, lockedPlan, lockedItemIds, seed);
  const input = buildNutritionInput(form);
  const result = generateDailyPlans({
    template,
    target: createNutritionTarget(input),
    preferences: { ...input.preferences, dietaryLevel: input.dietaryLevel },
    maxCandidates: 120,
  });

  return { result };
}

function pickPassingPlan(candidates: ReturnType<typeof generateDailyPlans>["candidates"], seed: number) {
  const passingCandidates = candidates.filter((candidate) => candidate.evaluation?.status === "pass");

  return passingCandidates[pickIndex(passingCandidates.length, seed)]?.plan;
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
    meals: ["breakfast", "lunch", "fruit-snack", "snack", "dinner"].map((mealId, mealIndex) => {
      const lockedItems = lockedPlan?.meals
        .find((meal) => meal.id === mealId)
        ?.items.filter((item) => item.id && lockedItemIds.has(item.id)) ?? [];
      const lockedRoles = new Set(lockedItems.flatMap((item) => item.roles ?? []));
      const items: DailyPlanTemplateItem[] = lockedItems.map(toTemplateItem);

      if (mealId === "fruit-snack") {
        if (!lockedRoles.has("fruit")) {
          items.push({
            kind: "exchange",
            id: `${mealId}-fruit`,
            exchangeGroupId: "fruit",
            defaultOptionId: "banana",
            exchangeUnits: 1,
            roles: ["fruit", "snack"],
          });
        }

        return { id: mealId, displayName: "Fruit snack", patternId: "snack", items };
      }

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

        if (!lockedRoles.has("carb")) {
          const grain = pickAllowedGrain(mealId, form, seed + mealIndex);
          items.push({
            kind: "exchange",
            id: `${mealId}-grain`,
            exchangeGroupId: "grain",
            defaultOptionId: grain,
            allowedOptionIds: grainOptionsForMeal(mealId),
            exchangeUnits: 0.5,
            roles: ["snack", "carb"],
          });
        }

        return { id: mealId, displayName: mealDisplayName(mealId), patternId: "snack", items };
      }

      if (!lockedRoles.has("carb")) {
        const grain = pickAllowedGrain(mealId, form, seed + mealIndex);
        items.push({
          kind: "exchange",
          id: `${mealId}-carb`,
          exchangeGroupId: "grain",
          defaultOptionId: grain,
          allowedOptionIds: grainOptionsForMeal(mealId),
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

      return { id: mealId, displayName: mealDisplayName(mealId), patternId: "cooked-plate", items };
    }),
  };
}

export function randomizePlan(
  plan: DailyPlan,
  form: EditableFormState,
  lockedItemIds: ReadonlySet<string>,
  mealId?: string,
  seed = Date.now(),
  mealTarget?: MealMacroTarget,
): DailyPlan {
  const attempts = mealId ? 32 : 48;
  let bestPlan = plan;
  let bestScore = scorePlanEvaluation(planEvaluation(plan, form));
  let bestMealTargetScore = scoreMealTarget(plan, mealId, mealTarget);
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
    const candidateMealTargetScore = bestMealTargetScore === undefined
      ? undefined
      : scoreMealTarget(candidate, mealId, mealTarget);
    const candidateSerialized = JSON.stringify(candidate);
    if (
      isBetterRandomizedCandidate(
        candidateScore,
        candidateMealTargetScore,
        candidateSerialized,
        bestScore,
        bestMealTargetScore,
        originalSerialized,
      )
    ) {
      bestPlan = candidate;
      bestScore = candidateScore;
      bestMealTargetScore = candidateMealTargetScore;
    }
  }

  return bestPlan;
}

function isBetterRandomizedCandidate(
  candidateScore: number,
  candidateMealTargetScore: number | undefined,
  candidateSerialized: string,
  bestScore: number,
  bestMealTargetScore: number | undefined,
  originalSerialized: string,
) {
  if (candidateMealTargetScore !== undefined && bestMealTargetScore !== undefined) {
    return (
      candidateMealTargetScore < bestMealTargetScore ||
      (candidateMealTargetScore === bestMealTargetScore && candidateScore < bestScore) ||
      (
        candidateMealTargetScore === bestMealTargetScore &&
        candidateScore === bestScore &&
        candidateSerialized !== originalSerialized
      )
    );
  }

  return candidateScore < bestScore || (candidateScore === bestScore && candidateSerialized !== originalSerialized);
}

function scoreMealTarget(plan: DailyPlan, mealId: string | undefined, target: MealMacroTarget | undefined) {
  if (!mealId || !target) {
    return undefined;
  }

  const proteinTarget = positiveNumber(target.protein);
  const calorieTarget = positiveNumber(target.calories);
  if (proteinTarget === undefined && calorieTarget === undefined) {
    return undefined;
  }

  const meal = plan.meals.find((candidate) => candidate.id === mealId);
  if (!meal) {
    return undefined;
  }

  const totals = calculateMealTotals(meal);
  const proteinScore = proteinTarget === undefined
    ? 0
    : Math.max(0, proteinTarget - totals.values.protein) * metricWeights.protein;
  const calorieScore = calorieTarget === undefined
    ? 0
    : Math.max(0, Math.abs(totals.values.calories - calorieTarget) - 50) * metricWeights.calories;

  return proteinScore + calorieScore;
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
              exchangeOptionId: pickAllowedGrain(meal.id, form, seed + mealIndex + itemIndex),
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
  return updatePlanItem(plan, itemId, (item) => {
    if (item.kind !== "exchange") {
      return item;
    }

    const grams = exchangeItemGramAmount(item);
    return {
      ...item,
      exchangeOptionId: optionId,
      exchangeUnits: exchangeUnitsForGramAmount(item.exchangeGroupId, optionId, grams),
    };
  });
}

export function updateItemAmount(plan: DailyPlan, itemId: string, amount: number): DailyPlan {
  return updatePlanItem(plan, itemId, (item) => {
    if (item.kind === "food") {
      return { ...item, quantity: { ...item.quantity, amount: roundFoodAmount(item, amount) } };
    }

    return { ...item, exchangeUnits: exchangeUnitsForGramAmount(item.exchangeGroupId, item.exchangeOptionId, roundGramAmount(amount)) };
  });
}

export function removePlanItem(plan: DailyPlan, itemId: string): DailyPlan {
  return {
    ...plan,
    meals: plan.meals.map((meal) => ({
      ...meal,
      items: meal.items.filter((item) => item.id !== itemId),
    })),
  };
}

export function addMeal(plan: DailyPlan, form?: EditableFormState): DailyPlan {
  const next = plan.meals.length + 1;
  const proteinOptionId = firstAllowedProteinOption(form);

  if (!proteinOptionId) {
    return plan;
  }

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
            exchangeOptionId: proteinOptionId,
            exchangeUnits: 1,
            roles: ["protein"],
          },
        ],
      },
    ],
  };
}

export function addItemToMeal(
  plan: DailyPlan,
  mealId: string,
  groupId: "grain" | "protein-serving" | "fruit",
  form?: EditableFormState,
): DailyPlan {
  const id = `${mealId}-${groupId}-${Date.now().toString(36)}`;

  if (groupId === "protein-serving") {
    const proteinOptionId = firstAllowedProteinOption(form);
    if (!proteinOptionId) {
      return plan;
    }

    return {
      ...plan,
      meals: plan.meals.map((meal) => (
        meal.id === mealId
          ? {
              ...meal,
              items: [
                ...meal.items,
                {
                  kind: "exchange",
                  id,
                  exchangeGroupId: "protein-serving",
                  exchangeOptionId: proteinOptionId,
                  exchangeUnits: 1,
                  roles: ["protein"],
                },
              ],
            }
          : meal
      )),
    };
  }

  const item: DailyPlanItem =
    groupId === "fruit"
      ? { kind: "exchange", id, exchangeGroupId: "fruit", exchangeOptionId: "banana", exchangeUnits: 1, roles: ["fruit"] }
      : { kind: "exchange", id, exchangeGroupId: "grain", exchangeOptionId: "roti", exchangeUnits: 1, roles: ["carb"] };

  return {
    ...plan,
    meals: plan.meals.map((meal) => (meal.id === mealId ? { ...meal, items: [...meal.items, item] } : meal)),
  };
}

export function planItemDisplayQuantity(item: DailyPlanItem): DisplayQuantity {
  if (item.kind === "food") {
    return { amount: roundGramAmount(item.quantity.amount), unit: "g" };
  }

  return { amount: exchangeItemGramAmount(item), unit: "g" };
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

function positiveNumber(value: string | undefined) {
  const parsed = Number(value || 0);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function encodeShareState(state: ShareablePlannerState): string {
  return btoa(encodeURIComponent(JSON.stringify(state)));
}

export function decodeShareState(encoded: string): ShareablePlannerState | undefined {
  try {
    const state = JSON.parse(decodeURIComponent(atob(encoded))) as ShareablePlannerState;
    return {
      ...state,
      form: normalizeEditableFormState(state.form),
    };
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

function generationRejectionMessages(rejected: string[], form: EditableFormState): string[] {
  const messages = rejected.map((reason) => rejectionRecoveryMessage(reason, form));
  const uniqueMessages = [...new Set(messages)];

  return uniqueMessages.length > 0
    ? uniqueMessages
    : ["Required food choices are blocked. Relax a food rule or reset preferences before regenerating."];
}

function rejectionRecoveryMessage(reason: string, form: EditableFormState) {
  const noOptionsPrefix = "No allowed exchange options for template item ";
  if (reason.startsWith(noOptionsPrefix)) {
    return noAllowedExchangeOptionsMessage(reason.slice(noOptionsPrefix.length), form);
  }

  const excludedFoodMatch = reason.match(/^FoodItem (.+) is excluded for template item /);
  const excludedFoodId = excludedFoodMatch?.[1];
  if (excludedFoodId) {
    const food = getFoodItem(excludedFoodId);
    return `${food.displayName} is excluded by your food rules. Remove that exclusion or unlock and swap the item before regenerating.`;
  }

  const dietaryFoodMatch = reason.match(/^FoodItem (.+) is not allowed for (.+) dietary level$/);
  const dietaryFoodId = dietaryFoodMatch?.[1];
  const dietaryLevel = dietaryFoodMatch?.[2];
  if (dietaryFoodId) {
    const food = getFoodItem(dietaryFoodId);
    const dietLabel = isDietaryLevel(dietaryLevel) ? dietaryLevelLabels[dietaryLevel] : "the selected diet";
    return `${food.displayName} does not fit ${dietLabel}. Change dietary level or unlock and swap the item before regenerating.`;
  }

  return `${reason}. Relax the related food rule before regenerating.`;
}

function noAllowedExchangeOptionsMessage(templateItemId: string, form: EditableFormState) {
  if (templateItemId.includes("protein")) {
    const proteinRules = activeProteinRuleLabels(form);
    const ruleCopy = proteinRules.length > 0 ? ` (${proteinRules.join(", ")})` : "";
    return `Protein is blocked by your diet or food rules${ruleCopy}. Unlock the fixed protein, remove an exclusion, or change dietary level before regenerating.`;
  }

  if (templateItemId.includes("grain") || templateItemId.includes("carb")) {
    return "Grain choices are blocked for a required meal. Select another grain preference or reset food rules before regenerating.";
  }

  if (templateItemId.includes("fruit")) {
    return "Fruit choices are blocked for the snack. Relax the related food rule before regenerating.";
  }

  return "A required food slot has no allowed choices. Relax food preferences or remove an exclusion before regenerating.";
}

function activeProteinRuleLabels(form: EditableFormState) {
  return [
    dietaryLevelLabels[form.dietaryLevel],
    form.avoidPaneer ? "avoid paneer" : undefined,
    form.avoidWhey ? "avoid whey" : undefined,
    form.dietaryLevel !== "vegetarian" && form.avoidEggs ? "avoid eggs" : undefined,
    form.dietaryLevel === "nonVegetarian" && form.avoidChickenFish ? "avoid chicken/fish" : undefined,
  ].filter((label): label is string => Boolean(label));
}

function isDietaryLevel(value: string | undefined): value is DietaryLevel {
  return value === "vegetarian" || value === "eggetarian" || value === "nonVegetarian";
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

function exchangeItemGramAmount(item: Extract<DailyPlanItem, { kind: "exchange" }>) {
  const units = item.exchangeUnits ?? getExchangeOption(item.exchangeGroupId, item.exchangeOptionId).exchangeUnits ?? 1;
  return roundGramAmount(exchangeOptionGramAmount(item.exchangeGroupId, item.exchangeOptionId) * units);
}

function exchangeUnitsForGramAmount(groupId: string, optionId: string, amount: number) {
  const gramsPerUnit = exchangeOptionGramAmount(groupId, optionId);
  return gramsPerUnit > 0 ? Math.max(0, roundGramAmount(amount) / gramsPerUnit) : 0;
}

export function exchangeOptionGramAmount(groupId: string, optionId: string) {
  const option = getExchangeOption(groupId, optionId);
  const optionUnits = option.exchangeUnits ?? 1;

  if (option.quantity.unit === "g") {
    return option.quantity.amount / optionUnits;
  }

  const groupReference = getExchangeGroup(groupId).reference?.quantity;
  if (groupReference?.unit === "g") {
    return groupReference.amount;
  }

  const estimatedGrams = estimatedGramAmounts[optionId];
  if (estimatedGrams) {
    return estimatedGrams;
  }

  return option.quantity.amount;
}

const estimatedGramAmounts: Record<string, number> = {
  "two-whole-eggs": 100,
};

function pickAllowedGrain(mealId: string, form: EditableFormState, seed: number) {
  const options = grainOptionsForMeal(mealId);
  const preferred = grainPreferences(form).filter((option) => options.includes(option));
  const pool = preferred.length > 0 ? preferred : options;

  return pool[pickIndex(pool.length, seed)] ?? "roti";
}

function grainOptionsForMeal(mealId: string) {
  if (mealId === "breakfast" || mealId === "snack") {
    return ["roti", "bread", "raw-oats", "raw-poha", "dosa"];
  }

  return ["roti", "bread", "cooked-rice", "dosa", "raw-rice"];
}

function pickAllowedProtein(form: EditableFormState, seed: number) {
  const pool = proteinChoicePool(form);

  return pool[pickIndex(pool.length, seed)] ?? "paneer-50g";
}

function firstAllowedProteinOption(form: EditableFormState | undefined) {
  return form ? proteinChoicePool(form)[0] : "paneer-50g";
}

function proteinChoicePool(form: EditableFormState) {
  const options = proteinOptionsForFoodRules(form);
  const preferred = proteinPreferencesForDiet(form).filter((option) => options.includes(option));

  return preferred.length > 0 ? preferred : options;
}

export function proteinOptionsForFoodRules(form: EditableFormState) {
  return proteinOptionsForDiet(form.dietaryLevel).filter((option) => isProteinOptionAllowedByFoodRules(option, form));
}

function grainPreferences(form: EditableFormState) {
  return form.preferredGrains.length > 0 ? form.preferredGrains : initialFormState.preferredGrains;
}

function proteinPreferencesForDiet(form: EditableFormState) {
  const allowed = new Set(proteinOptionsForDiet(form.dietaryLevel));
  const selected = form.preferredProteins.filter((option) => allowed.has(option));
  return selected.length > 0 ? selected : defaultProteinsForDiet(form.dietaryLevel);
}

function defaultProteinsForDiet(dietaryLevel: DietaryLevel) {
  const visibleProteinOptionIds = proteinOptions.map((option) => option.id);
  return proteinOptionsForDiet(dietaryLevel).filter((option) => visibleProteinOptionIds.includes(option));
}

function normalizedPreferenceList(value: string[] | undefined, legacyValue: string | undefined, fallback: string[]) {
  if (Array.isArray(value) && value.length > 0) {
    return [...new Set(value)];
  }

  return legacyValue ? [legacyValue] : [...fallback];
}

function mealDisplayName(mealId: string) {
  if (mealId === "fruit-snack") return "Fruit snack";
  return titleCase(mealId);
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

const dietaryLevelLabels: Record<DietaryLevel, string> = {
  vegetarian: "vegetarian",
  eggetarian: "eggetarian",
  nonVegetarian: "non-vegetarian",
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
  return `${Math.ceil(value)}${metric === "calories" ? " kcal" : "gm"}`;
}

function roundGramAmount(value: number) {
  return Math.max(0, Math.round(value));
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

export function exchangeOptionsForItem(item: DailyPlanItem, form: EditableFormState, mealId?: string) {
  if (item.kind !== "exchange") {
    return [];
  }

  const options = getExchangeGroup(item.exchangeGroupId).options;

  if (item.exchangeGroupId === "protein-serving") {
    const allowed = new Set(proteinOptionsForFoodRules(form));
    return options.filter((option) => allowed.has(option.id));
  }

  if (item.exchangeGroupId === "grain") {
    const allowed = mealId ? new Set(grainOptionsForMeal(mealId)) : undefined;
    return options.filter((option) => {
      if (allowed && !allowed.has(option.id)) return false;
      return option.id !== "raw-oats" || item.roles?.includes("carb");
    });
  }

  return options;
}

function isProteinOptionAllowedByFoodRules(optionId: string, form: EditableFormState) {
  const option = getExchangeOption("protein-serving", optionId);

  if (form.avoidPaneer && option.foodItemId === "paneer") return false;
  if (form.avoidWhey && option.foodItemId === "whey") return false;
  if (form.avoidEggs && option.foodItemId === "egg-whole") return false;
  if (form.avoidChickenFish && (option.id === "chicken-fish-100g" || option.foodItemId === "chicken-breast" || option.foodItemId === "rohu-fish")) return false;

  return true;
}
