import {
  findExchangeOption,
  getExchangeGroup,
  getExchangeOption,
  getFoodItem,
  masterData as defaultMasterData,
} from "./master-data.js";
import type {
  DailyPlan,
  DailyPlanItem,
  DailyPlanTemplate,
  DailyPlanTemplateItem,
  ExchangeSelection,
  FoodPortion,
  FoodPreference,
  GenerateMealPlanInput,
  GenerateMealPlanResult,
  GeneratedPlanCandidate,
  Meal,
  MealConstraint,
  MealPattern,
  MealPatternEvaluation,
  NutritionMetric,
  NutritionTarget,
  NutritionTargetInput,
  NutritionTotals,
  PlanEvaluation,
  PlanGenerationResult,
  PlanGeneratorInput,
  ResolveDailyPlanTemplateOptions,
  ResolvedTemplateSelection,
  TargetBound,
  TargetBoundInput,
} from "./planning-types.js";
import type { DietaryLevel, ExchangeGroup, ExchangeOption, Id, MasterData, NutritionFacts, Quantity } from "./types.js";

export const nutritionMetrics = [
  "protein",
  "carbs",
  "fat",
  "calories",
  "fiber",
  "saturatedFat",
] as const satisfies readonly NutritionMetric[];

export const defaultMealPatterns: readonly MealPattern[] = [
  {
    id: "cooked-plate",
    displayName: "Cooked plate",
    requiredRoles: ["cookingFat", "carb", "protein", "vegetables"],
    defaultItems: [
      {
        id: "default-cooking-fat",
        roles: ["cookingFat"],
        item: {
          kind: "food",
          id: "default-cooking-fat",
          foodItemId: "oil-ghee",
          quantity: { amount: 5, unit: "g" },
          roles: ["cookingFat"],
          adjustable: false,
        },
      },
      {
        id: "default-vegetables",
        roles: ["vegetables"],
        item: {
          kind: "food",
          id: "default-vegetables",
          foodItemId: "veggies-excl-potato",
          quantity: { amount: 150, unit: "g" },
          roles: ["vegetables"],
        },
      },
      {
        id: "default-carb",
        roles: ["carb"],
        item: {
          kind: "exchange",
          id: "default-carb",
          exchangeGroupId: "grain",
          defaultOptionId: "roti",
          exchangeUnits: 1,
          roles: ["carb"],
        },
      },
      {
        id: "default-protein",
        roles: ["protein"],
        item: {
          kind: "exchange",
          id: "default-protein",
          exchangeGroupId: "protein-serving",
          defaultOptionId: "paneer-50g",
          exchangeUnits: 1,
          roles: ["protein"],
        },
      },
    ],
  },
  {
    id: "snack",
    displayName: "Snack",
    requiredRoles: ["snack"],
  },
];

export const defaultDailyPlanTemplate: DailyPlanTemplate = {
  id: "default-daily-plan",
  displayName: "Default daily plan",
  meals: [
    {
      id: "breakfast",
      displayName: "Breakfast",
      patternId: "cooked-plate",
      items: [],
    },
    {
      id: "lunch",
      displayName: "Lunch",
      patternId: "cooked-plate",
      items: [],
    },
    {
      id: "snack",
      displayName: "Snack",
      patternId: "snack",
      items: [
        {
          kind: "food",
          id: "snack-nuts",
          foodItemId: "nuts",
          quantity: { amount: 15, unit: "g" },
          roles: ["snack"],
        },
      ],
    },
    {
      id: "dinner",
      displayName: "Dinner",
      patternId: "cooked-plate",
      items: [],
    },
  ],
};

export function createNutritionTarget(input: NutritionTargetInput): NutritionTarget {
  return {
    id: input.id,
    displayName: input.displayName,
    bounds: [
      createCalorieBound(input.calories, input.calorieTolerance),
      createOptionalMacroBound("protein", input.protein, "min", input.macroTolerance),
      createOptionalMacroBound("carbs", input.carbs, "target", input.macroTolerance),
      createOptionalMacroBound("fat", input.fat, "target", input.macroTolerance),
      createOptionalMacroBound("fiber", input.fiber, "min", input.macroTolerance),
      createOptionalMacroBound("saturatedFat", input.saturatedFat, "max", input.macroTolerance),
    ].filter((bound): bound is TargetBound => bound !== undefined),
  };
}

export function generateMealPlan(
  input: GenerateMealPlanInput,
  data: MasterData = defaultMasterData,
): GenerateMealPlanResult {
  const target = createNutritionTarget(input);
  const preferences = {
    ...input.preferences,
    dietaryLevel: input.dietaryLevel ?? input.preferences?.dietaryLevel,
  };
  const template = input.template ?? defaultDailyPlanTemplate;
  const result = generateDailyPlans(
    {
      template,
      target,
      preferences,
      maxCandidates: input.maxCandidates ?? 100,
      adjustQuantities: input.adjustQuantities,
    },
    data,
  );
  const selected = result.candidates.find((candidate) => candidate.evaluation?.status === "pass");

  return {
    ...result,
    rejected:
      result.candidates.length > 0 && !selected
        ? [...result.rejected, "No generated meal plan satisfies target bounds"]
        : result.rejected,
    target,
    template,
    selected,
  };
}

function createCalorieBound(
  calories: NutritionTargetInput["calories"],
  defaultTolerance: number | undefined,
): TargetBound {
  if (typeof calories === "number") {
    return {
      metric: "calories",
      target: calories,
      tolerance: defaultTolerance ?? 50,
      label: "Calories",
    };
  }

  return {
    metric: "calories",
    target: calories.target,
    tolerance: calories.tolerance ?? defaultTolerance ?? 50,
    min: calories.min,
    max: calories.max,
    label: calories.label ?? "Calories",
  };
}

function createOptionalMacroBound(
  metric: Exclude<NutritionMetric, "calories">,
  input: TargetBoundInput | undefined,
  numberMeaning: "min" | "max" | "target",
  defaultTolerance: number | undefined,
): TargetBound | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (typeof input === "number") {
    return {
      metric,
      [numberMeaning]: input,
      tolerance: numberMeaning === "target" ? defaultTolerance ?? 10 : undefined,
      label: metric,
    };
  }

  return {
    metric,
    min: input.min,
    max: input.max,
    target: input.target,
    tolerance: input.target !== undefined ? input.tolerance ?? defaultTolerance ?? 10 : input.tolerance,
    label: input.label ?? metric,
  };
}

export function emptyNutritionTotals(): NutritionTotals {
  return {
    values: {
      protein: 0,
      carbs: 0,
      fat: 0,
      calories: 0,
      fiber: 0,
      saturatedFat: 0,
    },
    unknown: {
      protein: false,
      carbs: false,
      fat: false,
      calories: false,
      fiber: false,
      saturatedFat: false,
    },
  };
}

export function scaleNutritionFacts(facts: NutritionFacts, factor: number): NutritionFacts {
  return {
    protein: scaleNutritionValue(facts.protein, factor),
    carbs: scaleNutritionValue(facts.carbs, factor),
    fat: scaleNutritionValue(facts.fat, factor),
    calories: scaleNutritionValue(facts.calories, factor),
    fiber: scaleNutritionValue(facts.fiber, factor),
    saturatedFat: scaleNutritionValue(facts.saturatedFat, factor),
  };
}

export function addNutritionFacts(totals: NutritionTotals, facts: NutritionFacts): NutritionTotals {
  const next = cloneNutritionTotals(totals);

  for (const metric of nutritionMetrics) {
    const value = facts[metric];

    if (value === null) {
      next.unknown[metric] = true;
    } else {
      next.values[metric] += value;
    }
  }

  return next;
}

export function sumNutritionFacts(items: readonly NutritionFacts[]): NutritionTotals {
  return items.reduce((totals, facts) => addNutritionFacts(totals, facts), emptyNutritionTotals());
}

export function calculateFoodPortionNutrition(
  portion: FoodPortion,
  data: MasterData = defaultMasterData,
): NutritionFacts {
  const food = getFoodItem(portion.foodItemId, data);

  assertCompatibleUnits(food.referenceQuantity, portion.quantity, `FoodPortion ${portion.foodItemId}`);

  return scaleNutritionFacts(food.nutrition, portion.quantity.amount / food.referenceQuantity.amount);
}

export function calculateExchangeSelectionNutrition(
  selection: ExchangeSelection,
  data: MasterData = defaultMasterData,
): NutritionFacts {
  const group = getExchangeGroup(selection.exchangeGroupId, data);
  const option = getExchangeOption(selection.exchangeGroupId, selection.exchangeOptionId, data);
  const exchangeUnits = selection.exchangeUnits ?? option.exchangeUnits ?? 1;

  if (option.nutritionOverride) {
    return scaleNutritionFacts(option.nutritionOverride, exchangeUnits);
  }

  if (option.foodItemId) {
    const food = getFoodItem(option.foodItemId, data);

    if (food.referenceQuantity.unit === option.quantity.unit) {
      return scaleNutritionFacts(food.nutrition, (option.quantity.amount * exchangeUnits) / food.referenceQuantity.amount);
    }
  }

  if (group.reference?.nutrition) {
    return scaleNutritionFacts(group.reference.nutrition, exchangeUnits);
  }

  throw new Error(
    `Cannot calculate nutrition for ExchangeSelection ${selection.exchangeGroupId}/${selection.exchangeOptionId}`,
  );
}

export function calculateDailyPlanItemNutrition(
  item: DailyPlanItem,
  data: MasterData = defaultMasterData,
): NutritionFacts {
  return item.kind === "food"
    ? calculateFoodPortionNutrition(item, data)
    : calculateExchangeSelectionNutrition(item, data);
}

export function calculateMealTotals(meal: Meal, data: MasterData = defaultMasterData): NutritionTotals {
  return sumNutritionFacts(meal.items.map((item) => calculateDailyPlanItemNutrition(item, data)));
}

export function calculateDailyPlanTotals(plan: DailyPlan, data: MasterData = defaultMasterData): NutritionTotals {
  return plan.meals.reduce(
    (totals, meal) => mergeNutritionTotals(totals, calculateMealTotals(meal, data)),
    emptyNutritionTotals(),
  );
}

export function resolveDailyPlanTemplate(
  template: DailyPlanTemplate,
  options: ResolveDailyPlanTemplateOptions = {},
  data: MasterData = defaultMasterData,
): DailyPlan {
  const selections = new Map((options.selections ?? []).map((selection) => [selection.templateItemId, selection]));

  return {
    id: options.id ?? `${template.id}-resolved`,
    displayName: options.displayName ?? template.displayName,
    templateId: template.id,
    note: template.note,
    meals: template.meals.map((meal) => ({
      id: meal.id,
      displayName: meal.displayName,
      patternId: meal.patternId,
      constraints: meal.constraints,
      items: meal.items.map((item) => resolveTemplateItem(item, selections.get(item.id), data)),
    })),
  };
}

export function evaluateTargetBound(bound: TargetBound, totals: NutritionTotals) {
  const value = totals.values[bound.metric];
  const min = bound.min ?? (bound.target !== undefined ? bound.target - (bound.tolerance ?? 0) : undefined);
  const max = bound.max ?? (bound.target !== undefined ? bound.target + (bound.tolerance ?? 0) : undefined);
  const shortfall = min !== undefined && value < min ? min - value : undefined;
  const excess = max !== undefined && value > max ? value - max : undefined;

  return {
    bound,
    status: shortfall === undefined && excess === undefined ? "pass" : "fail",
    value,
    unknown: totals.unknown[bound.metric],
    min,
    max,
    shortfall,
    excess,
  } as const;
}

export function evaluateMealConstraints(
  meal: Meal,
  data: MasterData = defaultMasterData,
) {
  const totals = calculateMealTotals(meal, data);
  const constraints = (meal.constraints ?? []).map((constraint) => evaluateTargetBound(constraint, totals));
  const pattern = evaluateMealPattern(meal);

  return {
    mealId: meal.id,
    totals,
    constraints,
    pattern,
    status:
      constraints.every((constraint) => constraint.status === "pass") &&
      (pattern === undefined || pattern.status === "pass")
        ? "pass"
        : "fail",
  } as const;
}

export function evaluateMealPattern(
  meal: Meal,
  patterns: readonly MealPattern[] = defaultMealPatterns,
): MealPatternEvaluation | undefined {
  if (!meal.patternId) {
    return undefined;
  }

  const pattern = getMealPattern(meal.patternId, patterns);
  const presentRoles = new Set(meal.items.flatMap((item) => item.roles ?? []));
  const roles = pattern.requiredRoles.map((role) => ({ role, present: presentRoles.has(role) }));
  const missingRoles = roles.filter((role) => !role.present).map((role) => role.role);

  return {
    mealId: meal.id,
    patternId: pattern.id,
    roles,
    missingRoles,
    status: missingRoles.length === 0 ? "pass" : "fail",
  };
}

export function evaluateDailyPlan(
  plan: DailyPlan,
  target: NutritionTarget,
  data: MasterData = defaultMasterData,
): PlanEvaluation {
  const totals = calculateDailyPlanTotals(plan, data);
  const targetBounds = target.bounds.map((bound) => evaluateTargetBound(bound, totals));
  const meals = plan.meals.map((meal) => evaluateMealConstraints(meal, data));

  return {
    planId: plan.id,
    totals,
    targetBounds,
    meals,
    status:
      targetBounds.every((bound) => bound.status === "pass") &&
      meals.every((meal) => meal.status === "pass")
        ? "pass"
        : "fail",
  };
}

export function completeMealPatternDefaults(
  template: DailyPlanTemplate,
  patterns: readonly MealPattern[] = defaultMealPatterns,
): DailyPlanTemplate {
  return {
    ...template,
    meals: template.meals.map((meal) => {
      if (!meal.patternId) {
        return meal;
      }

      const pattern = getMealPattern(meal.patternId, patterns);
      const presentRoles = new Set(meal.items.flatMap((item) => item.roles ?? []));
      const missingDefaults =
        pattern.defaultItems?.filter((defaultItem) => defaultItem.roles.some((role) => !presentRoles.has(role))) ?? [];

      if (missingDefaults.length === 0) {
        return meal;
      }

      return {
        ...meal,
        items: [
          ...meal.items,
          ...missingDefaults.map((defaultItem) => ({
            ...defaultItem.item,
            id: `${meal.id}-${defaultItem.item.id}`,
          })),
        ],
      };
    }),
  };
}

export function generateDailyPlans(
  input: PlanGeneratorInput,
  data: MasterData = defaultMasterData,
): PlanGenerationResult {
  const maxCandidates = input.maxCandidates ?? 20;
  const completedTemplate = completeMealPatternDefaults(input.template);
  const rejected = validateTemplateFoodItems(completedTemplate, input.preferences, data);
  const exchangeItems = completedTemplate.meals.flatMap((meal) =>
    meal.items.filter((item): item is Extract<DailyPlanTemplateItem, { kind: "exchange" }> => item.kind === "exchange"),
  );
  const choicesByItem = exchangeItems.map((item) => ({
    item,
    options: listAllowedExchangeOptions(item, input.preferences, data),
  }));
  for (const choice of choicesByItem) {
    if (choice.options.length === 0) {
      rejected.push(`No allowed exchange options for template item ${choice.item.id}`);
    }
  }

  if (rejected.length > 0) {
    return { candidates: [], rejected };
  }

  const combinations = buildSelectionCombinations(choicesByItem, maxCandidates);
  const candidates: GeneratedPlanCandidate[] = combinations.map((selections, index) => {
    const plan = resolveDailyPlanTemplate(
      completedTemplate,
      {
        id: `${completedTemplate.id}-candidate-${index + 1}`,
        selections,
      },
      data,
    );
    const adjustedPlan =
      input.adjustQuantities === false || !input.target ? plan : adjustDailyPlanToTarget(plan, input.target, data);

    return {
      plan: adjustedPlan,
      evaluation: input.target ? evaluateDailyPlan(adjustedPlan, input.target, data) : undefined,
    };
  });

  return { candidates, rejected };
}

function validateTemplateFoodItems(
  template: DailyPlanTemplate,
  preferences: FoodPreference | undefined,
  data: MasterData,
): string[] {
  if (!preferences) {
    return [];
  }

  const allowedFoods = preferences.allowedFoodItemIds ? new Set(preferences.allowedFoodItemIds) : undefined;
  const excludedFoods = new Set(preferences.excludedFoodItemIds ?? []);
  const rejected: string[] = [];

  for (const meal of template.meals) {
    for (const item of meal.items) {
      if (item.kind !== "food") {
        continue;
      }

      const food = getFoodItem(item.foodItemId, data);

      if (allowedFoods && !allowedFoods.has(food.id)) {
        rejected.push(`FoodItem ${food.id} is not allowed for template item ${item.id}`);
        continue;
      }

      if (excludedFoods.has(food.id)) {
        rejected.push(`FoodItem ${food.id} is excluded for template item ${item.id}`);
        continue;
      }

      if (preferences.dietaryLevel && !isDietaryLevelAllowed(food.dietaryLevel, preferences.dietaryLevel)) {
        rejected.push(`FoodItem ${food.id} is not allowed for ${preferences.dietaryLevel} dietary level`);
      }
    }
  }

  return rejected;
}

function getMealPattern(patternId: Id, patterns: readonly MealPattern[]): MealPattern {
  const pattern = patterns.find((candidate) => candidate.id === patternId);

  if (!pattern) {
    throw new Error(`MealPattern not found: ${patternId}`);
  }

  return pattern;
}

export function adjustDailyPlanToTarget(
  plan: DailyPlan,
  target: NutritionTarget,
  data: MasterData = defaultMasterData,
): DailyPlan {
  let adjustedPlan = plan;
  const calorieBound = target.bounds.find((bound) => bound.metric === "calories" && bound.target !== undefined);

  if (calorieBound?.target) {
    const totals = calculateDailyPlanTotals(adjustedPlan, data);
    const currentCalories = totals.values.calories;

    if (currentCalories > 0) {
      const min = calorieBound.target - (calorieBound.tolerance ?? 0);
      const max = calorieBound.target + (calorieBound.tolerance ?? 0);

      if (currentCalories < min || currentCalories > max) {
        const calorieSplit = calculateAdjustableMetricSplit(adjustedPlan, "calories", data);
        const factor =
          calorieSplit.adjustable > 0
            ? (calorieBound.target - calorieSplit.fixed) / calorieSplit.adjustable
            : calorieBound.target / currentCalories;

        adjustedPlan = adjustAllDailyPlanItems(adjustedPlan, factor, data);
      }
    }
  }

  const proteinBound = target.bounds.find((bound) => bound.metric === "protein" && bound.min !== undefined);

  if (proteinBound?.min !== undefined) {
    const totals = calculateDailyPlanTotals(adjustedPlan, data);
    const currentProtein = totals.values.protein;

    if (currentProtein < proteinBound.min) {
      const bestProteinItem = findBestAdjustableProteinItem(adjustedPlan, data);

      if (bestProteinItem && bestProteinItem.protein > 0) {
        const targetProteinForItem = bestProteinItem.protein + (proteinBound.min - currentProtein);
        adjustedPlan = adjustOneDailyPlanItem(
          adjustedPlan,
          bestProteinItem.mealIndex,
          bestProteinItem.itemIndex,
          targetProteinForItem / bestProteinItem.protein,
          data,
        );
      }
    }
  }

  return adjustedPlan;
}

function calculateAdjustableMetricSplit(plan: DailyPlan, metric: NutritionMetric, data: MasterData) {
  let fixed = 0;
  let adjustable = 0;

  for (const meal of plan.meals) {
    for (const item of meal.items) {
      const value = calculateDailyPlanItemNutrition(item, data)[metric];

      if (value === null) {
        continue;
      }

      if (item.adjustable === false) {
        fixed += value;
      } else {
        adjustable += value;
      }
    }
  }

  return { fixed, adjustable };
}

function scaleNutritionValue(value: number | null, factor: number): number | null {
  return value === null ? null : value * factor;
}

function cloneNutritionTotals(totals: NutritionTotals): NutritionTotals {
  return {
    values: { ...totals.values },
    unknown: { ...totals.unknown },
  };
}

function mergeNutritionTotals(left: NutritionTotals, right: NutritionTotals): NutritionTotals {
  const next = cloneNutritionTotals(left);

  for (const metric of nutritionMetrics) {
    next.values[metric] += right.values[metric];
    next.unknown[metric] = next.unknown[metric] || right.unknown[metric];
  }

  return next;
}

function assertCompatibleUnits(reference: Quantity, actual: Quantity, context: string): void {
  if (reference.unit !== actual.unit) {
    throw new Error(`${context} uses ${actual.unit}, but reference quantity uses ${reference.unit}`);
  }
}

function resolveTemplateItem(
  item: DailyPlanTemplateItem,
  selection: ResolvedTemplateSelection | undefined,
  data: MasterData,
): DailyPlanItem {
  if (item.kind === "food") {
    return {
      kind: "food",
      id: item.id,
      foodItemId: item.foodItemId,
      quantity: item.quantity,
      roles: item.roles,
      adjustable: item.adjustable,
      note: item.note,
    };
  }

  const group = getExchangeGroup(item.exchangeGroupId, data);
  const optionId = selection?.exchangeOptionId ?? item.defaultOptionId ?? item.allowedOptionIds?.[0] ?? group.options[0]?.id;

  if (!optionId) {
    throw new Error(`ExchangeGroup has no options: ${item.exchangeGroupId}`);
  }

  if (!findExchangeOption(item.exchangeGroupId, optionId, data)) {
    throw new Error(`ExchangeOption not found: ${item.exchangeGroupId}/${optionId}`);
  }

  return {
    kind: "exchange",
    id: item.id,
    exchangeGroupId: item.exchangeGroupId,
    exchangeOptionId: optionId,
    exchangeUnits: item.exchangeUnits ?? 1,
    roles: item.roles,
    adjustable: item.adjustable,
    note: item.note,
  };
}

function listAllowedExchangeOptions(
  item: Extract<DailyPlanTemplateItem, { kind: "exchange" }>,
  preferences: FoodPreference | undefined,
  data: MasterData,
): readonly ExchangeOption[] {
  const group = getExchangeGroup(item.exchangeGroupId, data);
  const itemAllowed = item.allowedOptionIds ? new Set(item.allowedOptionIds) : undefined;
  const allowedOptions = preferences?.allowedExchangeOptionIds?.[group.id]
    ? new Set(preferences.allowedExchangeOptionIds[group.id])
    : undefined;
  const excludedOptions = new Set(preferences?.excludedExchangeOptionIds?.[group.id] ?? []);
  const preferredOptions = new Set(preferences?.preferredExchangeOptionIds?.[group.id] ?? []);
  const allowedFoods = preferences?.allowedFoodItemIds ? new Set(preferences.allowedFoodItemIds) : undefined;
  const excludedFoods = new Set(preferences?.excludedFoodItemIds ?? []);
  const preferredFoods = new Set(preferences?.preferredFoodItemIds ?? []);

  return group.options
    .filter((option) => {
      if (itemAllowed && !itemAllowed.has(option.id)) {
        return false;
      }

      if (allowedOptions && !allowedOptions.has(option.id)) {
        return false;
      }

      if (excludedOptions.has(option.id)) {
        return false;
      }

      if (option.foodItemId && allowedFoods && !allowedFoods.has(option.foodItemId)) {
        return false;
      }

      if (option.foodItemId && excludedFoods.has(option.foodItemId)) {
        return false;
      }

      if (preferences?.dietaryLevel) {
        const optionLevel = getExchangeOptionDietaryLevel(option, group, data);

        if (!isDietaryLevelAllowed(optionLevel, preferences.dietaryLevel)) {
          return false;
        }
      }

      return true;
    })
    .sort(
      (left, right) =>
        optionPreferenceRank(right, item.defaultOptionId, preferredOptions, preferredFoods) -
        optionPreferenceRank(left, item.defaultOptionId, preferredOptions, preferredFoods),
    );
}

function getExchangeOptionDietaryLevel(option: ExchangeOption, group: ExchangeGroup, data: MasterData): DietaryLevel {
  if (option.dietaryLevel) {
    return option.dietaryLevel;
  }

  if (option.foodItemId) {
    return getFoodItem(option.foodItemId, data).dietaryLevel;
  }

  throw new Error(`ExchangeOption ${group.id}/${option.id} is missing dietaryLevel`);
}

function isDietaryLevelAllowed(foodLevel: DietaryLevel, preferenceLevel: DietaryLevel): boolean {
  if (preferenceLevel === "nonVegetarian") {
    return true;
  }

  if (preferenceLevel === "eggetarian") {
    return foodLevel === "vegetarian" || foodLevel === "eggetarian";
  }

  return foodLevel === "vegetarian";
}

function optionPreferenceRank(
  option: ExchangeOption,
  defaultOptionId: Id | undefined,
  preferredOptions: ReadonlySet<Id>,
  preferredFoods: ReadonlySet<Id>,
): number {
  return (
    (preferredOptions.has(option.id) ? 8 : 0) +
    (option.foodItemId && preferredFoods.has(option.foodItemId) ? 4 : 0) +
    (option.id === defaultOptionId ? 2 : 0)
  );
}

function buildSelectionCombinations(
  choicesByItem: readonly {
    item: Extract<DailyPlanTemplateItem, { kind: "exchange" }>;
    options: readonly ExchangeOption[];
  }[],
  maxCandidates: number,
): ResolvedTemplateSelection[][] {
  const combinations: ResolvedTemplateSelection[][] = [[]];

  for (const choice of choicesByItem) {
    const next: ResolvedTemplateSelection[][] = [];

    for (const current of combinations) {
      for (const option of choice.options) {
        if (next.length >= maxCandidates) {
          break;
        }

        next.push([...current, { templateItemId: choice.item.id, exchangeOptionId: option.id }]);
      }
    }

    combinations.splice(0, combinations.length, ...next);
  }

  return combinations.slice(0, maxCandidates);
}

function adjustAllDailyPlanItems(plan: DailyPlan, factor: number, data: MasterData): DailyPlan {
  return {
    ...plan,
    meals: plan.meals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => adjustDailyPlanItem(item, factor, data)),
    })),
  };
}

function adjustOneDailyPlanItem(
  plan: DailyPlan,
  mealIndex: number,
  itemIndex: number,
  factor: number,
  data: MasterData,
): DailyPlan {
  return {
    ...plan,
    meals: plan.meals.map((meal, currentMealIndex) => ({
      ...meal,
      items: meal.items.map((item, currentItemIndex) =>
        currentMealIndex === mealIndex && currentItemIndex === itemIndex ? adjustDailyPlanItem(item, factor, data) : item,
      ),
    })),
  };
}

function findBestAdjustableProteinItem(plan: DailyPlan, data: MasterData) {
  let best:
    | {
        mealIndex: number;
        itemIndex: number;
        protein: number;
        proteinPerCalorie: number;
      }
    | undefined;

  plan.meals.forEach((meal, mealIndex) => {
    meal.items.forEach((item, itemIndex) => {
      if (item.adjustable === false) {
        return;
      }

      const nutrition = calculateDailyPlanItemNutrition(item, data);
      const protein = nutrition.protein ?? 0;
      const calories = nutrition.calories ?? 0;

      if (protein <= 0) {
        return;
      }

      const proteinPerCalorie = calories > 0 ? protein / calories : protein;

      if (!best || proteinPerCalorie > best.proteinPerCalorie) {
        best = { mealIndex, itemIndex, protein, proteinPerCalorie };
      }
    });
  });

  return best;
}

function adjustDailyPlanItem(item: DailyPlanItem, factor: number, data: MasterData): DailyPlanItem {
  if (item.adjustable === false) {
    return item;
  }

  if (item.kind === "exchange") {
    const option = getExchangeOption(item.exchangeGroupId, item.exchangeOptionId, data);
    const currentExchangeUnits = item.exchangeUnits ?? option.exchangeUnits ?? 1;
    const currentAmount = option.quantity.amount * currentExchangeUnits;
    const adjustedAmount = normalizeAmountByUnit(currentAmount, option.quantity.unit, factor);

    return {
      ...item,
      exchangeUnits: option.quantity.amount === 0 ? currentExchangeUnits : adjustedAmount / option.quantity.amount,
    };
  }

  return {
    ...item,
    quantity: {
      ...item.quantity,
      amount: normalizeAmountByUnit(item.quantity.amount, item.quantity.unit, factor),
    },
  };
}

function normalizeAmountByUnit(amount: number, unit: Quantity["unit"], factor: number): number {
  const scaled = amount * factor;

  switch (unit) {
    case "count":
    case "slice":
    case "scoop":
      return Math.max(0, Math.round(scaled));
    case "serving":
      return Math.round(scaled * 2) / 2;
    case "g":
    case "ml":
      return Math.round(scaled);
  }
}
