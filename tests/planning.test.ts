import { describe, expect, it } from "vitest";
import {
  calculateDailyPlanTotals,
  calculateExchangeSelectionNutrition,
  calculateFoodPortionNutrition,
  calculateMealTotals,
  completeMealPatternDefaults,
  createNutritionTarget,
  defaultMealPatterns,
  generateMealPlan,
  evaluateDailyPlan,
  evaluateMealPattern,
  generateDailyPlans,
  resolveDailyPlanTemplate,
  scaleNutritionFacts,
} from "../src/index.js";
import type { DailyPlan, DailyPlanTemplate, FoodPortion, NutritionTarget } from "../src/index.js";

describe("second-layer planning library", () => {
  it("scales FoodItem nutrition from reference quantity", () => {
    const portion: FoodPortion = {
      kind: "food",
      foodItemId: "soy-chunks",
      quantity: { amount: 70, unit: "g" },
    };

    const nutrition = calculateFoodPortionNutrition(portion);

    expect(nutrition.protein).toBeCloseTo(36.4);
    expect(nutrition.calories).toBeCloseTo(241.2);
  });

  it("uses ExchangeReference facts when an option has no specific facts", () => {
    const nutrition = calculateExchangeSelectionNutrition({
      kind: "exchange",
      exchangeGroupId: "fruit",
      exchangeOptionId: "watermelon",
    });

    expect(nutrition.calories).toBeCloseTo(92.9);
    expect(nutrition.carbs).toBeCloseTo(22);
  });

  it("uses ExchangeOption nutrition overrides when supplied", () => {
    const nutrition = calculateExchangeSelectionNutrition({
      kind: "exchange",
      exchangeGroupId: "protein-serving",
      exchangeOptionId: "whey-30g",
    });

    expect(nutrition.protein).toBe(21);
    expect(nutrition.calories).toBe(120);
  });

  it("calculates meal and daily totals while preserving unknown flags", () => {
    const plan: DailyPlan = {
      id: "unknown-demo",
      displayName: "Unknown demo",
      meals: [
        {
          id: "breakfast",
          displayName: "Breakfast",
          items: [
            { kind: "food", foodItemId: "soy-chunks", quantity: { amount: 35, unit: "g" } },
            { kind: "food", foodItemId: "oil-ghee", quantity: { amount: 10, unit: "g" } },
          ],
        },
      ],
    };

    const mealTotals = calculateMealTotals(plan.meals[0]!);
    const dailyTotals = calculateDailyPlanTotals(plan);

    expect(mealTotals.values.calories).toBeCloseTo(210.6);
    expect(dailyTotals.values.protein).toBeCloseTo(18.2);
    expect(dailyTotals.values.saturatedFat).toBeCloseTo(0.0175);
    expect(dailyTotals.unknown.saturatedFat).toBe(true);
  });

  it("evaluates NutritionTarget and MealConstraint using known subtotals", () => {
    const plan: DailyPlan = {
      id: "evaluation-demo",
      displayName: "Evaluation demo",
      meals: [
        {
          id: "breakfast",
          displayName: "Breakfast",
          constraints: [{ metric: "protein", min: 20, label: "Breakfast protein minimum" }],
          items: [
            { kind: "food", foodItemId: "soy-chunks", quantity: { amount: 35, unit: "g" } },
            { kind: "food", foodItemId: "oil-ghee", quantity: { amount: 10, unit: "g" } },
          ],
        },
      ],
    };
    const target: NutritionTarget = {
      displayName: "Evaluation target",
      bounds: [
        { metric: "calories", target: 210, tolerance: 5 },
        { metric: "protein", min: 20 },
        { metric: "saturatedFat", max: 1 },
      ],
    };

    const evaluation = evaluateDailyPlan(plan, target);

    expect(evaluation.status).toBe("fail");
    expect(evaluation.targetBounds.find((bound) => bound.bound.metric === "calories")?.status).toBe("pass");
    expect(evaluation.targetBounds.find((bound) => bound.bound.metric === "protein")).toMatchObject({
      status: "fail",
      shortfall: expect.any(Number),
    });
    expect(evaluation.targetBounds.find((bound) => bound.bound.metric === "saturatedFat")).toMatchObject({
      status: "pass",
      unknown: true,
    });
    expect(evaluation.meals[0]?.status).toBe("fail");
  });

  it("resolves DailyPlanTemplates into DailyPlans with concrete ExchangeSelections", () => {
    const template: DailyPlanTemplate = {
      id: "fruit-template",
      displayName: "Fruit template",
      meals: [
        {
          id: "breakfast",
          displayName: "Breakfast",
          items: [
            { kind: "food", id: "soy", foodItemId: "soy-chunks", quantity: { amount: 35, unit: "g" } },
            { kind: "exchange", id: "fruit-slot", exchangeGroupId: "fruit", defaultOptionId: "watermelon" },
          ],
        },
      ],
    };

    const plan = resolveDailyPlanTemplate(template);

    expect(plan.templateId).toBe("fruit-template");
    expect(plan.meals[0]?.items[1]).toMatchObject({
      kind: "exchange",
      exchangeGroupId: "fruit",
      exchangeOptionId: "watermelon",
    });
  });

  it("generates candidates without inventing meals and honors FoodPreference exclusions", () => {
    const template: DailyPlanTemplate = {
      id: "lean-template",
      displayName: "Lean protein template",
      meals: [
        {
          id: "dinner",
          displayName: "Dinner",
          items: [{ kind: "exchange", id: "protein", exchangeGroupId: "lean-protein" }],
        },
      ],
    };

    const result = generateDailyPlans({
      template,
      maxCandidates: 1,
      preferences: {
        excludedFoodItemIds: ["chicken-breast"],
        preferredExchangeOptionIds: { "lean-protein": ["soy-chunks-50g"] },
      },
    });

    expect(result.rejected).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.plan.meals).toHaveLength(template.meals.length);
    expect(result.candidates[0]?.plan.meals[0]?.items[0]).toMatchObject({
      kind: "exchange",
      exchangeGroupId: "lean-protein",
      exchangeOptionId: "soy-chunks-50g",
    });
  });

  it("filters generated exchange choices by vegetarian dietary level", () => {
    const template: DailyPlanTemplate = {
      id: "vegetarian-protein",
      displayName: "Vegetarian protein",
      meals: [
        {
          id: "dinner",
          displayName: "Dinner",
          items: [{ kind: "exchange", id: "protein", exchangeGroupId: "protein-serving" }],
        },
      ],
    };

    const result = generateDailyPlans({
      template,
      maxCandidates: 10,
      preferences: { dietaryLevel: "vegetarian" },
    });
    const selectedOptions = result.candidates.map((candidate) => candidate.plan.meals[0]?.items[0]);

    expect(result.rejected).toEqual([]);
    expect(selectedOptions).toContainEqual(expect.objectContaining({ kind: "exchange", exchangeOptionId: "paneer-50g" }));
    expect(selectedOptions).not.toContainEqual(
      expect.objectContaining({ kind: "exchange", exchangeOptionId: "two-whole-eggs" }),
    );
    expect(selectedOptions).not.toContainEqual(
      expect.objectContaining({ kind: "exchange", exchangeOptionId: "chicken-fish-100g" }),
    );
  });

  it("allows eggs but excludes meat and fish for eggetarian dietary level", () => {
    const template: DailyPlanTemplate = {
      id: "eggetarian-protein",
      displayName: "Eggetarian protein",
      meals: [
        {
          id: "dinner",
          displayName: "Dinner",
          items: [{ kind: "exchange", id: "protein", exchangeGroupId: "protein-serving" }],
        },
      ],
    };

    const result = generateDailyPlans({
      template,
      maxCandidates: 10,
      preferences: { dietaryLevel: "eggetarian" },
    });
    const selectedOptions = result.candidates.map((candidate) => candidate.plan.meals[0]?.items[0]);

    expect(selectedOptions).toContainEqual(
      expect.objectContaining({ kind: "exchange", exchangeOptionId: "two-whole-eggs" }),
    );
    expect(selectedOptions).not.toContainEqual(
      expect.objectContaining({ kind: "exchange", exchangeOptionId: "chicken-fish-100g" }),
    );
  });

  it("allows all dietary levels for non-vegetarian generation", () => {
    const template: DailyPlanTemplate = {
      id: "non-veg-protein",
      displayName: "Non-veg protein",
      meals: [
        {
          id: "dinner",
          displayName: "Dinner",
          items: [{ kind: "exchange", id: "protein", exchangeGroupId: "protein-serving" }],
        },
      ],
    };

    const result = generateDailyPlans({
      template,
      maxCandidates: 10,
      preferences: { dietaryLevel: "nonVegetarian" },
    });
    const selectedOptions = result.candidates.map((candidate) => candidate.plan.meals[0]?.items[0]);

    expect(selectedOptions).toContainEqual(
      expect.objectContaining({ kind: "exchange", exchangeOptionId: "two-whole-eggs" }),
    );
    expect(selectedOptions).toContainEqual(
      expect.objectContaining({ kind: "exchange", exchangeOptionId: "chicken-fish-100g" }),
    );
  });

  it("rejects direct food template items that violate dietary level", () => {
    const template: DailyPlanTemplate = {
      id: "direct-chicken",
      displayName: "Direct chicken",
      meals: [
        {
          id: "dinner",
          displayName: "Dinner",
          items: [
            {
              kind: "food",
              id: "chicken",
              foodItemId: "chicken-breast",
              quantity: { amount: 100, unit: "g" },
            },
          ],
        },
      ],
    };

    const result = generateDailyPlans({
      template,
      preferences: { dietaryLevel: "vegetarian" },
    });

    expect(result.candidates).toEqual([]);
    expect(result.rejected).toEqual(["FoodItem chicken-breast is not allowed for vegetarian dietary level"]);
  });

  it("rejects generator inputs when preferences remove all exchange options", () => {
    const template: DailyPlanTemplate = {
      id: "blocked-template",
      displayName: "Blocked template",
      meals: [
        {
          id: "dinner",
          displayName: "Dinner",
          items: [
            {
              kind: "exchange",
              id: "protein",
              exchangeGroupId: "lean-protein",
              allowedOptionIds: ["chicken-100g"],
            },
          ],
        },
      ],
    };

    const result = generateDailyPlans({
      template,
      preferences: { excludedFoodItemIds: ["chicken-breast"] },
    });

    expect(result.candidates).toEqual([]);
    expect(result.rejected).toEqual(["No allowed exchange options for template item protein"]);
  });

  it("adjusts continuous quantities toward a calorie TargetBound", () => {
    const template: DailyPlanTemplate = {
      id: "adjustable-soy",
      displayName: "Adjustable soy",
      meals: [
        {
          id: "breakfast",
          displayName: "Breakfast",
          items: [
            {
              kind: "food",
              id: "soy",
              foodItemId: "soy-chunks",
              quantity: { amount: 35, unit: "g" },
            },
          ],
        },
      ],
    };
    const target: NutritionTarget = {
      bounds: [
        { metric: "calories", target: 241.2, tolerance: 0 },
        { metric: "protein", min: 30 },
      ],
    };

    const result = generateDailyPlans({ template, target, maxCandidates: 1 });
    const item = result.candidates[0]?.plan.meals[0]?.items[0];

    expect(item).toMatchObject({ kind: "food", quantity: { amount: 70, unit: "g" } });
    expect(result.candidates[0]?.evaluation?.status).toBe("pass");
  });

  it("respects discrete unit rounding during target adjustment", () => {
    const template: DailyPlanTemplate = {
      id: "egg-discrete",
      displayName: "Egg discrete",
      meals: [
        {
          id: "breakfast",
          displayName: "Breakfast",
          items: [
            {
              kind: "food",
              id: "eggs",
              foodItemId: "egg-whole",
              quantity: { amount: 2, unit: "count" },
            },
          ],
        },
      ],
    };

    const result = generateDailyPlans({
      template,
      target: { bounds: [{ metric: "calories", target: 220.5, tolerance: 0 }] },
      maxCandidates: 1,
    });
    const item = result.candidates[0]?.plan.meals[0]?.items[0];

    expect(item).toMatchObject({ kind: "food", quantity: { amount: 3, unit: "count" } });
    expect(result.candidates[0]?.evaluation?.status).toBe("pass");
  });

  it("boosts an adjustable protein source when protein minimum is missed", () => {
    const template: DailyPlanTemplate = {
      id: "protein-boost",
      displayName: "Protein boost",
      meals: [
        {
          id: "breakfast",
          displayName: "Breakfast",
          items: [
            {
              kind: "food",
              id: "soy",
              foodItemId: "soy-chunks",
              quantity: { amount: 35, unit: "g" },
            },
          ],
        },
      ],
    };

    const result = generateDailyPlans({
      template,
      target: { bounds: [{ metric: "protein", min: 36.4 }] },
      maxCandidates: 1,
    });

    expect(result.candidates[0]?.plan.meals[0]?.items[0]).toMatchObject({
      kind: "food",
      quantity: { amount: 70, unit: "g" },
    });
    expect(result.candidates[0]?.evaluation?.status).toBe("pass");
  });

  it("adjusts exchange selections using the selected option quantity unit", () => {
    const template: DailyPlanTemplate = {
      id: "exchange-discrete",
      displayName: "Exchange discrete",
      meals: [
        {
          id: "breakfast",
          displayName: "Breakfast",
          items: [
            {
              kind: "exchange",
              id: "eggs",
              exchangeGroupId: "protein-serving",
              allowedOptionIds: ["two-whole-eggs"],
            },
          ],
        },
      ],
    };

    const result = generateDailyPlans({
      template,
      target: { bounds: [{ metric: "calories", target: 225, tolerance: 0 }] },
      maxCandidates: 1,
    });

    expect(result.candidates[0]?.plan.meals[0]?.items[0]).toMatchObject({
      kind: "exchange",
      exchangeOptionId: "two-whole-eggs",
      exchangeUnits: 1.5,
    });
    expect(result.candidates[0]?.evaluation?.status).toBe("pass");
  });

  it("creates NutritionTarget from calories with optional macro inputs", () => {
    const target = createNutritionTarget({
      calories: 2000,
      protein: 90,
      carbs: { target: 250, tolerance: 60 },
      fat: { max: 80 },
      fiber: 25,
      saturatedFat: { max: 20 },
    });

    expect(target.bounds).toEqual([
      expect.objectContaining({ metric: "calories", target: 2000, tolerance: 50 }),
      expect.objectContaining({ metric: "protein", min: 90 }),
      expect.objectContaining({ metric: "carbs", target: 250, tolerance: 60 }),
      expect.objectContaining({ metric: "fat", max: 80 }),
      expect.objectContaining({ metric: "fiber", min: 25 }),
      expect.objectContaining({ metric: "saturatedFat", max: 20 }),
    ]);
  });

  it("generates a default meal plan from calories plus optional macros", () => {
    const result = generateMealPlan({
      calories: 2000,
      protein: 75,
      carbs: { min: 100, max: 400 },
      fat: { max: 120 },
      fiber: { min: 10 },
      dietaryLevel: "vegetarian",
      maxCandidates: 1,
    });

    expect(result.target.bounds.find((bound) => bound.metric === "calories")).toMatchObject({
      target: 2000,
      tolerance: 50,
    });
    expect(result.selected?.plan.meals.map((meal) => meal.id)).toEqual(["breakfast", "lunch", "snack", "dinner"]);
    expect(result.selected?.evaluation?.status).toBe("pass");
    expect(result.selected?.evaluation?.totals.values.calories).toBeGreaterThanOrEqual(1950);
    expect(result.selected?.evaluation?.totals.values.calories).toBeLessThanOrEqual(2050);
  });

  it("keeps primitive nutrition scaling as a pure function", () => {
    const scaled = scaleNutritionFacts(
      { protein: 1, carbs: 2, fat: null, calories: 10, fiber: 0, saturatedFat: null },
      2,
    );

    expect(scaled).toEqual({ protein: 2, carbs: 4, fat: null, calories: 20, fiber: 0, saturatedFat: null });
  });

  it("evaluates missing roles for cooked plate MealPattern", () => {
    const plan: DailyPlan = {
      id: "missing-plate",
      displayName: "Missing plate",
      meals: [
        {
          id: "lunch",
          displayName: "Lunch",
          patternId: "cooked-plate",
          items: [{ kind: "food", foodItemId: "paneer", quantity: { amount: 50, unit: "g" }, roles: ["protein"] }],
        },
      ],
    };

    const pattern = evaluateMealPattern(plan.meals[0]!);

    expect(pattern).toMatchObject({
      status: "fail",
      missingRoles: ["cookingFat", "carb", "vegetables"],
    });
  });

  it("adds default oil, carb, protein, and vegetables for cooked plate patterns", () => {
    const template: DailyPlanTemplate = {
      id: "empty-cooked-plate",
      displayName: "Empty cooked plate",
      meals: [
        {
          id: "lunch",
          displayName: "Lunch",
          patternId: "cooked-plate",
          items: [],
        },
      ],
    };

    const completed = completeMealPatternDefaults(template);

    expect(completed.meals[0]?.items).toEqual([
      expect.objectContaining({ kind: "food", foodItemId: "oil-ghee", roles: ["cookingFat"] }),
      expect.objectContaining({ kind: "food", foodItemId: "veggies-excl-potato", roles: ["vegetables"] }),
      expect.objectContaining({ kind: "exchange", exchangeGroupId: "grain", roles: ["carb"] }),
      expect.objectContaining({ kind: "exchange", exchangeGroupId: "protein-serving", roles: ["protein"] }),
    ]);
  });

  it("does not add oil to meals whose pattern does not require cooking fat", () => {
    const template: DailyPlanTemplate = {
      id: "snack-template",
      displayName: "Snack template",
      meals: [
        {
          id: "snack",
          displayName: "Snack",
          patternId: "snack",
          items: [{ kind: "food", id: "nuts", foodItemId: "nuts", quantity: { amount: 15, unit: "g" }, roles: ["snack"] }],
        },
      ],
    };

    const completed = completeMealPatternDefaults(template);

    expect(completed.meals[0]?.items).toHaveLength(1);
    expect(completed.meals[0]?.items).not.toContainEqual(expect.objectContaining({ foodItemId: "oil-ghee" }));
    expect(defaultMealPatterns.find((pattern) => pattern.id === "snack")?.requiredRoles).toEqual(["snack"]);
  });

  it("generator completes cooked plate defaults and evaluation reports pattern pass", () => {
    const template: DailyPlanTemplate = {
      id: "generated-cooked-plate",
      displayName: "Generated cooked plate",
      meals: [
        {
          id: "lunch",
          displayName: "Lunch",
          patternId: "cooked-plate",
          items: [],
        },
      ],
    };

    const result = generateDailyPlans({
      template,
      target: { bounds: [{ metric: "protein", min: 1 }] },
      maxCandidates: 1,
    });

    const meal = result.candidates[0]?.plan.meals[0];

    expect(meal?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "food", foodItemId: "oil-ghee", roles: ["cookingFat"] }),
        expect.objectContaining({ kind: "food", foodItemId: "veggies-excl-potato", roles: ["vegetables"] }),
        expect.objectContaining({ kind: "exchange", exchangeGroupId: "grain", roles: ["carb"] }),
        expect.objectContaining({ kind: "exchange", exchangeGroupId: "protein-serving", roles: ["protein"] }),
      ]),
    );
    expect(result.candidates[0]?.evaluation?.meals[0]?.pattern).toMatchObject({
      status: "pass",
      missingRoles: [],
    });
  });
});
