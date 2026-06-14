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
  it("generates breakfast with oats and prevents oats at dinner", () => {
    const template = buildDynamicTemplate(initialFormState, undefined, new Set(), 1);
    const breakfastCarb = template.meals.find((meal) => meal.id === "breakfast")?.items.find((item) => item.id === "breakfast-carb");
    const dinnerCarb = template.meals.find((meal) => meal.id === "dinner")?.items.find((item) => item.id === "dinner-carb");

    expect(breakfastCarb).toMatchObject({ kind: "exchange", defaultOptionId: "raw-oats" });
    expect(dinnerCarb).toMatchObject({ kind: "exchange" });
    expect(dinnerCarb && "allowedOptionIds" in dinnerCarb ? dinnerCarb.allowedOptionIds : []).not.toContain("raw-oats");
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
    const randomized = randomizePlan(plan, { ...initialFormState, preferredProtein: "whey-30g" }, new Set([lockedId]), undefined, 99);
    const after = randomized.meals.find((meal) => meal.id === "dinner")?.items.find((item) => item.id === lockedId);

    expect(after).toEqual(lockedItem);
  });

  it("supports swapping, quantity edits, adding meals, and adding items", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 4)!;
    const swapped = swapExchangeOption(plan, "lunch-carb", "cooked-rice");
    const edited = updateItemAmount(swapped, "lunch-carb", 2);
    const withMeal = addMeal(edited);
    const withItem = addItemToMeal(withMeal, "meal-5", "fruit");

    expect(withItem.meals).toHaveLength(5);
    expect(withItem.meals.find((meal) => meal.id === "lunch")?.items.find((item) => item.id === "lunch-carb")).toMatchObject({
      kind: "exchange",
      exchangeOptionId: "cooked-rice",
      exchangeUnits: 2,
    });
    expect(withItem.meals.find((meal) => meal.id === "meal-5")?.items.some((item) => item.kind === "exchange" && item.exchangeGroupId === "fruit")).toBe(true);
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
