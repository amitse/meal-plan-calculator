import { describe, expect, it } from "vitest";
import {
  addItemToMeal,
  addMeal,
  buildDynamicTemplate,
  decodeShareState,
  encodeShareState,
  failureRecoveryMessages,
  generateEditablePlan,
  initialFormState,
  mealTargetStatus,
  planEvaluation,
  randomizePlan,
  swapExchangeOption,
  updateItemAmount,
} from "../site/src/editable-planner.js";

describe("editable planner workflows", () => {
  it("categorizes grains so breakfast varies and dinner excludes snack grains", () => {
    const template = buildDynamicTemplate(
      { ...initialFormState, preferredGrains: ["raw-oats", "raw-poha", "roti", "cooked-rice"] },
      undefined,
      new Set(),
      1,
    );
    const breakfastCarb = template.meals.find((meal) => meal.id === "breakfast")?.items.find((item) => item.id === "breakfast-carb");
    const dinnerCarb = template.meals.find((meal) => meal.id === "dinner")?.items.find((item) => item.id === "dinner-carb");

    expect(breakfastCarb).toMatchObject({ kind: "exchange" });
    expect(breakfastCarb && "allowedOptionIds" in breakfastCarb ? breakfastCarb.allowedOptionIds : []).toEqual(expect.arrayContaining(["raw-oats", "raw-poha", "roti"]));
    expect(breakfastCarb && "defaultOptionId" in breakfastCarb ? breakfastCarb.defaultOptionId : "").not.toBe("cooked-rice");
    expect(dinnerCarb).toMatchObject({ kind: "exchange" });
    expect(dinnerCarb && "allowedOptionIds" in dinnerCarb ? dinnerCarb.allowedOptionIds : []).not.toContain("raw-oats");
    expect(dinnerCarb && "allowedOptionIds" in dinnerCarb ? dinnerCarb.allowedOptionIds : []).not.toContain("raw-poha");
  });

  it("always includes a dedicated fruit snack meal with one fruit serving", () => {
    const template = buildDynamicTemplate(initialFormState, undefined, new Set(), 1);
    const fruitSnack = template.meals.find((meal) => meal.id === "fruit-snack");

    expect(fruitSnack?.displayName).toBe("Fruit snack");
    expect(fruitSnack?.items).toContainEqual(expect.objectContaining({
      kind: "exchange",
      exchangeGroupId: "fruit",
      defaultOptionId: "banana",
      exchangeUnits: 1,
    }));
  });

  it("varies unlocked generated choices across seeds", () => {
    const first = generateEditablePlan(initialFormState, undefined, new Set(), 1);
    const second = generateEditablePlan(initialFormState, undefined, new Set(), 2);

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(JSON.stringify(first)).not.toEqual(JSON.stringify(second));
  });

  it("preserves locked exchange items while randomizing others", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 3)!;
    const lockedId = "dinner-protein";
    const lockedItem = plan.meals.find((meal) => meal.id === "dinner")?.items.find((item) => item.id === lockedId);
    const randomized = randomizePlan(plan, { ...initialFormState, preferredProteins: ["whey-30g"] }, new Set([lockedId]), undefined, 99);
    const after = randomized.meals.find((meal) => meal.id === "dinner")?.items.find((item) => item.id === lockedId);

    expect(after).toEqual(lockedItem);
  });

  it("randomizes whole plans toward passing target evaluations", () => {
    const plan = updateItemAmount(generateEditablePlan(initialFormState, undefined, new Set(), 4)!, "lunch-carb", 12);
    const randomized = randomizePlan(plan, initialFormState, new Set(), undefined, 101);

    expect(planEvaluation(randomized, initialFormState).status).toBe("pass");
  });

  it("supports swapping, quantity edits, adding meals, and adding items", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 4)!;
    const swapped = swapExchangeOption(plan, "lunch-carb", "cooked-rice");
    const edited = updateItemAmount(swapped, "lunch-carb", 2);
    const withMeal = addMeal(edited);
    const withItem = addItemToMeal(withMeal, "meal-6", "fruit");

    expect(withItem.meals).toHaveLength(6);
    expect(withItem.meals.find((meal) => meal.id === "lunch")?.items.find((item) => item.id === "lunch-carb")).toMatchObject({
      kind: "exchange",
      exchangeOptionId: "cooked-rice",
      exchangeUnits: 2,
    });
    expect(withItem.meals.find((meal) => meal.id === "meal-6")?.items.some((item) => item.kind === "exchange" && item.exchangeGroupId === "fruit")).toBe(true);
  });

  it("rounds exchange serving edits to half servings", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 4)!;
    const edited = updateItemAmount(plan, "lunch-carb", 2.08);

    expect(edited.meals.find((meal) => meal.id === "lunch")?.items.find((item) => item.id === "lunch-carb")).toMatchObject({
      kind: "exchange",
      exchangeUnits: 2,
    });
  });

  it("generates exchange servings in practical half-serving increments", () => {
    const plan = generateEditablePlan({ ...initialFormState, calories: "2450" }, undefined, new Set(), 4)!;
    const exchangeUnits = plan.meals
      .flatMap((meal) => meal.items)
      .filter((item) => item.kind === "exchange")
      .map((item) => item.kind === "exchange" ? item.exchangeUnits ?? 1 : 1);

    expect(exchangeUnits.length).toBeGreaterThan(0);
    expect(exchangeUnits.every((units) => Number.isInteger(units * 2))).toBe(true);
  });

  it("rounds vegetable gram edits to 50g steps", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 4)!;
    const vegetable = plan.meals
      .flatMap((meal) => meal.items)
      .find((item) => item.kind === "food" && item.foodItemId === "veggies-excl-potato");
    const edited = updateItemAmount(plan, vegetable?.id ?? "", 312);

    expect(edited.meals.flatMap((meal) => meal.items).find((item) => item.id === vegetable?.id)).toMatchObject({
      kind: "food",
      foodItemId: "veggies-excl-potato",
      quantity: { amount: 300, unit: "g" },
    });
  });

  it("generates vegetable amounts in 50g steps", () => {
    const plan = generateEditablePlan({ ...initialFormState, calories: "2600" }, undefined, new Set(), 4)!;
    const vegetableAmounts = plan.meals
      .flatMap((meal) => meal.items)
      .filter((item) => item.kind === "food" && item.foodItemId === "veggies-excl-potato")
      .map((item) => item.kind === "food" ? item.quantity.amount : 0);

    expect(vegetableAmounts.length).toBeGreaterThan(0);
    expect(vegetableAmounts.every((amount) => amount % 50 === 0)).toBe(true);
  });

  it("evaluates meal-specific macro targets and roundtrips share state", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 5)!;
    const mealTargets = { lunch: { protein: "10", calories: "500" } };
    const statuses = mealTargetStatus(plan, "lunch", mealTargets.lunch);
    const encoded = encodeShareState({ form: initialFormState, plan, lockedItemIds: ["lunch-carb"], mealTargets });
    const decoded = decodeShareState(encoded);

    expect(statuses.length).toBeGreaterThan(0);
    expect(decoded?.lockedItemIds).toEqual(["lunch-carb"]);
    expect(decoded?.mealTargets).toEqual(mealTargets);
    expect(decoded?.plan?.meals.map((meal) => meal.id)).toEqual(plan.meals.map((meal) => meal.id));
  });

  it("explains failed target bounds with recovery actions", () => {
    const form = { ...initialFormState, fat: { mode: "max" as const, value: "1" } };
    const plan = generateEditablePlan(form, undefined, new Set(), 6)!;
    const messages = failureRecoveryMessages(planEvaluation(plan, form));
    const fatMessage = messages.find((message) => message.includes("Fat is over max"));

    expect(fatMessage).toMatch(/Fat is over max/);
    expect(fatMessage).toMatch(/Relax the fat max/);
    expect(fatMessage).toMatch(/before regenerating/);
  });
});
