import { describe, expect, it } from "vitest";
import { generateMealPlan } from "../src/index.js";
import type { GenerateMealPlanInput, GenerateMealPlanResult } from "../src/index.js";

interface PassingScenario {
  name: string;
  input: GenerateMealPlanInput;
  expectedMealIds?: string[];
  expectedOptions?: string[];
  forbiddenOptions?: string[];
  minCalories?: number;
  maxCalories?: number;
}

const defaultMealIds = ["breakfast", "lunch", "snack", "dinner"];

function selectedExchangeOptions(result: GenerateMealPlanResult): string[] {
  return (
    result.selected?.plan.meals.flatMap((meal) =>
      meal.items.filter((item) => item.kind === "exchange").map((item) => item.exchangeOptionId),
    ) ?? []
  );
}

function expectPassingMealPlan(scenario: PassingScenario): GenerateMealPlanResult {
  const result = generateMealPlan(scenario.input);
  const evaluation = result.selected?.evaluation;

  expect(result.rejected, scenario.name).toEqual([]);
  expect(result.selected, scenario.name).toBeDefined();
  expect(evaluation?.status, scenario.name).toBe("pass");
  expect(result.selected?.plan.meals.map((meal) => meal.id), scenario.name).toEqual(
    scenario.expectedMealIds ?? defaultMealIds,
  );

  for (const meal of evaluation?.meals ?? []) {
    expect(meal.status, `${scenario.name}:${meal.mealId}`).toBe("pass");
    expect(meal.pattern?.status, `${scenario.name}:${meal.mealId}`).toBe("pass");
  }

  if (scenario.minCalories !== undefined) {
    expect(evaluation?.totals.values.calories, scenario.name).toBeGreaterThanOrEqual(scenario.minCalories);
  }

  if (scenario.maxCalories !== undefined) {
    expect(evaluation?.totals.values.calories, scenario.name).toBeLessThanOrEqual(scenario.maxCalories);
  }

  const exchangeOptions = selectedExchangeOptions(result);

  for (const option of scenario.expectedOptions ?? []) {
    expect(exchangeOptions, `${scenario.name}:expected ${option}`).toContain(option);
  }

  for (const option of scenario.forbiddenOptions ?? []) {
    expect(exchangeOptions, `${scenario.name}:forbidden ${option}`).not.toContain(option);
  }

  return result;
}

describe("primary use case: generate meal plan from calories and optional macros", () => {
  it.each<PassingScenario>([
    {
      name: "vegetarian calories-only lower target",
      input: { calories: 1400, dietaryLevel: "vegetarian" },
      minCalories: 1350,
      maxCalories: 1450,
      forbiddenOptions: ["two-whole-eggs", "chicken-fish-100g"],
    },
    {
      name: "vegetarian 1600 kcal with protein and broad macros",
      input: {
        calories: 1600,
        protein: 60,
        carbs: { min: 100, max: 350 },
        fat: { max: 120 },
        dietaryLevel: "vegetarian",
      },
      minCalories: 1550,
      maxCalories: 1650,
      forbiddenOptions: ["two-whole-eggs", "chicken-fish-100g"],
    },
    {
      name: "vegetarian 2000 kcal with fiber and saturated fat guardrails",
      input: {
        calories: 2000,
        protein: 75,
        carbs: { min: 100, max: 400 },
        fat: { max: 120 },
        fiber: { min: 10 },
        saturatedFat: { max: 20 },
        dietaryLevel: "vegetarian",
      },
      minCalories: 1950,
      maxCalories: 2050,
      forbiddenOptions: ["two-whole-eggs", "chicken-fish-100g"],
    },
    {
      name: "eggetarian 1800 kcal with egg preference",
      input: {
        calories: 1800,
        protein: 80,
        dietaryLevel: "eggetarian",
        preferences: { preferredExchangeOptionIds: { "protein-serving": ["two-whole-eggs"] } },
      },
      minCalories: 1750,
      maxCalories: 1850,
      expectedOptions: ["two-whole-eggs"],
      forbiddenOptions: ["chicken-fish-100g"],
    },
    {
      name: "non-vegetarian 2200 kcal with chicken fish preference",
      input: {
        calories: 2200,
        protein: 100,
        dietaryLevel: "nonVegetarian",
        preferences: { preferredExchangeOptionIds: { "protein-serving": ["chicken-fish-100g"] } },
      },
      minCalories: 2150,
      maxCalories: 2250,
      expectedOptions: ["chicken-fish-100g"],
    },
    {
      name: "vegetarian taste preference for cooked rice and whey",
      input: {
        calories: 1900,
        protein: 80,
        dietaryLevel: "vegetarian",
        preferences: { preferredExchangeOptionIds: { grain: ["cooked-rice"], "protein-serving": ["whey-30g"] } },
      },
      minCalories: 1850,
      maxCalories: 1950,
      expectedOptions: ["cooked-rice", "whey-30g"],
      forbiddenOptions: ["two-whole-eggs", "chicken-fish-100g"],
    },
    {
      name: "vegetarian excludes paneer and whey",
      input: {
        calories: 1900,
        protein: 70,
        dietaryLevel: "vegetarian",
        preferences: { excludedFoodItemIds: ["paneer", "whey"] },
      },
      minCalories: 1850,
      maxCalories: 1950,
      expectedOptions: ["tofu-100g"],
      forbiddenOptions: ["paneer-50g", "whey-30g", "two-whole-eggs", "chicken-fish-100g"],
    },
    {
      name: "higher calorie non-vegetarian plan with loose macro bounds",
      input: {
        calories: 2500,
        protein: 100,
        carbs: { min: 150, max: 500 },
        fat: { max: 160 },
        dietaryLevel: "nonVegetarian",
      },
      minCalories: 2450,
      maxCalories: 2550,
    },
  ])("$name", (scenario) => {
    expectPassingMealPlan(scenario);
  });

  it("uses only selected dietary options in the final selected plan", () => {
    const vegetarian = expectPassingMealPlan({
      name: "strict vegetarian final plan",
      input: { calories: 1800, protein: 70, dietaryLevel: "vegetarian" },
      forbiddenOptions: ["two-whole-eggs", "chicken-fish-100g"],
    });
    const eggetarian = expectPassingMealPlan({
      name: "eggetarian final plan",
      input: {
        calories: 1800,
        protein: 70,
        dietaryLevel: "eggetarian",
        preferences: { preferredExchangeOptionIds: { "protein-serving": ["two-whole-eggs"] } },
      },
      expectedOptions: ["two-whole-eggs"],
      forbiddenOptions: ["chicken-fish-100g"],
    });
    const nonVegetarian = expectPassingMealPlan({
      name: "non-vegetarian final plan",
      input: {
        calories: 1800,
        protein: 70,
        dietaryLevel: "nonVegetarian",
        preferences: { preferredExchangeOptionIds: { "protein-serving": ["chicken-fish-100g"] } },
      },
      expectedOptions: ["chicken-fish-100g"],
    });

    expect(selectedExchangeOptions(vegetarian)).not.toEqual(selectedExchangeOptions(eggetarian));
    expect(selectedExchangeOptions(eggetarian)).not.toEqual(selectedExchangeOptions(nonVegetarian));
  });

  it("returns an explicit rejection instead of selecting a failing plan for impossible macro constraints", () => {
    const result = generateMealPlan({
      calories: 2000,
      fat: { max: 1 },
      dietaryLevel: "vegetarian",
    });

    expect(result.selected).toBeUndefined();
    expect(result.rejected).toContain("No generated meal plan satisfies target bounds");
    expect(result.candidates.some((candidate) => candidate.evaluation?.status === "pass")).toBe(false);
  });

  it("returns explicit rejection when taste and dietary filters remove all valid protein choices", () => {
    const result = generateMealPlan({
      calories: 1800,
      dietaryLevel: "vegetarian",
      preferences: { allowedExchangeOptionIds: { "protein-serving": ["chicken-fish-100g"] } },
    });

    expect(result.selected).toBeUndefined();
    expect(result.candidates).toEqual([]);
    expect(result.rejected).toEqual([
      "No allowed exchange options for template item breakfast-default-protein",
      "No allowed exchange options for template item lunch-default-protein",
      "No allowed exchange options for template item dinner-default-protein",
    ]);
  });

  it("keeps taste customization as preference data, not hardcoded generated meals", () => {
    const riceWhey = expectPassingMealPlan({
      name: "rice whey preference",
      input: {
        calories: 1900,
        protein: 80,
        dietaryLevel: "vegetarian",
        preferences: { preferredExchangeOptionIds: { grain: ["cooked-rice"], "protein-serving": ["whey-30g"] } },
      },
      expectedOptions: ["cooked-rice", "whey-30g"],
    });
    const rotiPaneer = expectPassingMealPlan({
      name: "roti paneer preference",
      input: {
        calories: 1900,
        protein: 80,
        dietaryLevel: "vegetarian",
        preferences: { preferredExchangeOptionIds: { grain: ["roti"], "protein-serving": ["paneer-50g"] } },
      },
      expectedOptions: ["roti", "paneer-50g"],
    });

    expect(selectedExchangeOptions(riceWhey)).not.toEqual(selectedExchangeOptions(rotiPaneer));
  });
});
