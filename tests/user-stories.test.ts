import { describe, expect, it } from "vitest";
import {
  calculateDailyPlanTotals,
  completeMealPatternDefaults,
  evaluateDailyPlan,
  evaluateMealPattern,
  generateMealPlan,
  generateDailyPlans,
  getExchangeGroup,
  getExchangeOption,
  getFoodItem,
  getReferenceFormula,
  listExchangeGroups,
  listFoodItems,
  resolveDailyPlanTemplate,
} from "../src/index.js";
import type { DailyPlan, DailyPlanTemplate, NutritionTarget } from "../src/index.js";

describe("documented user stories and workflows", () => {
  it("supports browsing food, exchange, cost, dietary, and reference formula MasterData", () => {
    expect(listFoodItems().length).toBeGreaterThan(0);
    expect(listExchangeGroups().length).toBeGreaterThan(0);

    expect(getFoodItem("paneer")).toMatchObject({
      dietaryLevel: "vegetarian",
      proteinQuality: "complete",
      cost: expect.objectContaining({ currency: "INR" }),
    });
    expect(getExchangeGroup("grain").exchangeUnit.id).toBe("grain-serving");
    expect(getExchangeOption("fruit", "watermelon").quantity).toEqual({ amount: 300, unit: "g" });
    expect(getReferenceFormula("physical-activity-multipliers").values).toContainEqual(
      expect.objectContaining({ id: "moderate-activity", multiplier: 1.55 }),
    );
  });

  it("supports template modeling, meal-pattern defaults, manual resolution, totals, and evaluation", () => {
    const template: DailyPlanTemplate = {
      id: "story-cooked-plate",
      displayName: "Story cooked plate",
      meals: [
        {
          id: "lunch",
          displayName: "Lunch",
          patternId: "cooked-plate",
          constraints: [{ metric: "protein", min: 10 }],
          items: [{ kind: "exchange", id: "protein", exchangeGroupId: "protein-serving", defaultOptionId: "paneer-50g", roles: ["protein"] }],
        },
      ],
    };
    const completed = completeMealPatternDefaults(template);
    const plan = resolveDailyPlanTemplate(completed, {
      selections: [
        { templateItemId: "lunch-default-carb", exchangeOptionId: "roti" },
        { templateItemId: "protein", exchangeOptionId: "paneer-50g" },
      ],
    });
    const target: NutritionTarget = {
      bounds: [
        { metric: "calories", min: 1 },
        { metric: "protein", min: 10 },
      ],
    };
    const totals = calculateDailyPlanTotals(plan);
    const evaluation = evaluateDailyPlan(plan, target);

    expect(evaluateMealPattern(plan.meals[0]!)).toMatchObject({ status: "pass", missingRoles: [] });
    expect(totals.values.calories).toBeGreaterThan(0);
    expect(evaluation.status).toBe("pass");
    expect(evaluation.meals[0]?.constraints[0]?.status).toBe("pass");
  });

  it("supports vegetarian generation while preserving Indian dietary semantics", () => {
    const template: DailyPlanTemplate = {
      id: "story-vegetarian",
      displayName: "Story vegetarian",
      meals: [
        {
          id: "dinner",
          displayName: "Dinner",
          patternId: "cooked-plate",
          items: [],
        },
      ],
    };
    const result = generateDailyPlans({
      template,
      preferences: { dietaryLevel: "vegetarian" },
      maxCandidates: 20,
      target: { bounds: [{ metric: "protein", min: 1 }] },
    });
    const selectedOptions = result.candidates.flatMap((candidate) =>
      candidate.plan.meals.flatMap((meal) =>
        meal.items.filter((item) => item.kind === "exchange").map((item) => item.exchangeOptionId),
      ),
    );

    expect(result.rejected).toEqual([]);
    expect(selectedOptions).toContain("paneer-50g");
    expect(selectedOptions).not.toContain("two-whole-eggs");
    expect(selectedOptions).not.toContain("chicken-fish-100g");
    expect(result.candidates[0]?.evaluation?.meals[0]?.pattern?.status).toBe("pass");
  });

  it("supports the main use case: calories plus optional macros into a generated meal plan", () => {
    const result = generateMealPlan({
      calories: 2000,
      protein: 75,
      carbs: { min: 100, max: 400 },
      fat: { max: 120 },
      dietaryLevel: "vegetarian",
      maxCandidates: 1,
    });

    expect(result.rejected).toEqual([]);
    expect(result.target.bounds).toContainEqual(expect.objectContaining({ metric: "calories", target: 2000 }));
    expect(result.target.bounds).toContainEqual(expect.objectContaining({ metric: "protein", target: 75, tolerance: 5 }));
    expect(result.selected?.plan.meals.map((meal) => meal.id)).toEqual(["breakfast", "lunch", "snack", "dinner"]);
    expect(result.selected?.evaluation?.status).toBe("pass");
  });

  it("supports eggetarian and non-vegetarian generation distinctions", () => {
    const template: DailyPlanTemplate = {
      id: "story-dietary-levels",
      displayName: "Story dietary levels",
      meals: [
        {
          id: "protein",
          displayName: "Protein",
          items: [{ kind: "exchange", id: "protein", exchangeGroupId: "protein-serving" }],
        },
      ],
    };

    const eggetarian = generateDailyPlans({ template, preferences: { dietaryLevel: "eggetarian" }, maxCandidates: 20 });
    const nonVegetarian = generateDailyPlans({ template, preferences: { dietaryLevel: "nonVegetarian" }, maxCandidates: 20 });
    const eggetarianOptions = eggetarian.candidates.map((candidate) => candidate.plan.meals[0]?.items[0]);
    const nonVegetarianOptions = nonVegetarian.candidates.map((candidate) => candidate.plan.meals[0]?.items[0]);

    expect(eggetarianOptions).toContainEqual(expect.objectContaining({ kind: "exchange", exchangeOptionId: "two-whole-eggs" }));
    expect(eggetarianOptions).not.toContainEqual(expect.objectContaining({ kind: "exchange", exchangeOptionId: "chicken-fish-100g" }));
    expect(nonVegetarianOptions).toContainEqual(expect.objectContaining({ kind: "exchange", exchangeOptionId: "chicken-fish-100g" }));
  });

  it("supports unknown-value preservation and explicit diagnostics", () => {
    const plan: DailyPlan = {
      id: "story-unknowns",
      displayName: "Story unknowns",
      meals: [
        {
          id: "cooked",
          displayName: "Cooked",
          items: [
            { kind: "food", foodItemId: "oil-ghee", quantity: { amount: 10, unit: "g" } },
            { kind: "food", foodItemId: "peanut-butter", quantity: { amount: 20, unit: "g" } },
          ],
        },
      ],
    };
    const evaluation = evaluateDailyPlan(plan, {
      bounds: [
        { metric: "calories", min: 1 },
        { metric: "saturatedFat", max: 1 },
      ],
    });

    expect(evaluation.totals.values.calories).toBeGreaterThan(0);
    expect(evaluation.totals.unknown.saturatedFat).toBe(true);
    expect(evaluation.targetBounds.find((bound) => bound.bound.metric === "saturatedFat")).toMatchObject({
      status: "pass",
      unknown: true,
    });
  });

  it("supports explicit rejection for impossible preferences", () => {
    const template: DailyPlanTemplate = {
      id: "story-impossible",
      displayName: "Story impossible",
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
      preferences: { dietaryLevel: "vegetarian" },
    });

    expect(result.candidates).toEqual([]);
    expect(result.rejected).toEqual(["No allowed exchange options for template item protein"]);
  });

  it("supports quantity adjustment toward nutrition targets with practical unit handling", () => {
    const template: DailyPlanTemplate = {
      id: "story-adjustment",
      displayName: "Story adjustment",
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

    expect(result.candidates[0]?.plan.meals[0]?.items[0]).toMatchObject({
      kind: "food",
      quantity: { amount: 3, unit: "count" },
    });
    expect(result.candidates[0]?.evaluation?.status).toBe("pass");
  });
});
