import { describe, expect, it } from "vitest";
import { calculateMealTotals, type DailyPlan } from "../src/index.js";
import {
  addItemToMeal,
  addMeal,
  buildNutritionInput,
  buildDynamicTemplate,
  decodeShareState,
  encodeShareState,
  exchangeOptionsForItem,
  failureRecoveryMessages,
  generateEditablePlan,
  generateEditablePlanResult,
  grainOptions,
  initialFormState,
  mealTargetStatus,
  parseServingAmountInput,
  planItemDisplayQuantity,
  planEvaluation,
  proteinOptions,
  randomizePlan,
  removePlanItem,
  swapExchangeOption,
  updateItemAmount,
  unusedFoodPreferenceLabels,
} from "../site/src/editable-planner.js";

describe("editable planner workflows", () => {
  it("selects every visible grain and protein preference by default", () => {
    expect(initialFormState.preferredGrains).toEqual(grainOptions.map((option) => option.id));
    expect(initialFormState.preferredProteins).toEqual(proteinOptions.map((option) => option.id));
  });

  it("keeps optional macro limits off for fresh and omitted shared states", () => {
    expect(initialFormState.carbs.mode).toBe("none");
    expect(initialFormState.fat.mode).toBe("none");
    expect(initialFormState.fiber.mode).toBe("none");
    expect(initialFormState.saturatedFat.mode).toBe("none");

    const input = buildNutritionInput(initialFormState);
    expect(input).not.toHaveProperty("carbs");
    expect(input).not.toHaveProperty("fat");
    expect(input).not.toHaveProperty("fiber");
    expect(input).not.toHaveProperty("saturatedFat");

    const encoded = btoa(encodeURIComponent(JSON.stringify({
      form: { calories: "1800", protein: "80", dietaryLevel: "vegetarian" },
      lockedItemIds: [],
      mealTargets: {},
    })));
    const decoded = decodeShareState(encoded);

    expect(decoded?.form.carbs.mode).toBe("none");
    expect(decoded?.form.fat.mode).toBe("none");
    expect(decoded?.form.fiber.mode).toBe("none");
    expect(decoded?.form.saturatedFat.mode).toBe("none");
  });

  it("preserves explicit optional macro rules from decoded shared states", () => {
    const encoded = encodeShareState({
      form: {
        ...initialFormState,
        carbs: { mode: "min", value: "120" },
        fat: { mode: "max", value: "70" },
        fiber: { mode: "min", value: "25" },
        saturatedFat: { mode: "max", value: "18" },
      },
      lockedItemIds: [],
      mealTargets: {},
    });
    const decoded = decodeShareState(encoded);
    const input = decoded ? buildNutritionInput(decoded.form) : undefined;

    expect(input).toMatchObject({
      carbs: { min: 120 },
      fat: { max: 70 },
      fiber: { min: 25 },
      saturatedFat: { max: 18 },
    });
  });

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

  it("always includes a dedicated fruit snack meal with 100g fruit", () => {
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

  it("randomizes a meal toward its protein target when one is set", () => {
    const form = {
      ...initialFormState,
      preferredProteins: ["paneer-50g", "whey-30g", "tofu-100g"],
    };
    const plan = swapExchangeOption(generateEditablePlan(form, undefined, new Set(), 4)!, "lunch-protein", "paneer-50g");
    const beforeLunch = plan.meals.find((meal) => meal.id === "lunch")!;
    const beforeProtein = calculateMealTotals(beforeLunch).values.protein;
    const target = { protein: String(Math.ceil(beforeProtein + 5)) };
    const randomized = randomizePlan(plan, form, new Set(), "lunch", 101, target);
    const afterLunch = randomized.meals.find((meal) => meal.id === "lunch")!;
    const afterProtein = calculateMealTotals(afterLunch).values.protein;

    expect(afterProtein).toBeGreaterThan(beforeProtein);
    expect(mealTargetStatus(randomized, "lunch", target)).toContain("Protein met");
  });

  it("keeps untargeted meal randomization behavior for empty meal targets", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 4)!;
    const untargeted = randomizePlan(plan, initialFormState, new Set(), "lunch", 101);
    const emptyTarget = randomizePlan(plan, initialFormState, new Set(), "lunch", 101, { calories: "", protein: "" });

    expect(emptyTarget).toEqual(untargeted);
  });

  it("supports swapping, deleting, quantity edits, adding meals, and adding items", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 4)!;
    const swapped = swapExchangeOption(plan, "lunch-carb", "cooked-rice");
    const edited = updateItemAmount(swapped, "lunch-carb", 300);
    const deleted = removePlanItem(edited, "lunch-carb");
    const withMeal = addMeal(edited);
    const withItem = addItemToMeal(withMeal, "meal-6", "fruit");
    const lunchCarb = withItem.meals.find((meal) => meal.id === "lunch")?.items.find((item) => item.id === "lunch-carb");

    expect(deleted.meals.find((meal) => meal.id === "lunch")?.items.some((item) => item.id === "lunch-carb")).toBe(false);
    expect(withItem.meals).toHaveLength(6);
    expect(lunchCarb).toMatchObject({
      kind: "exchange",
      exchangeOptionId: "cooked-rice",
      exchangeUnits: 2,
    });
    expect(lunchCarb ? planItemDisplayQuantity(lunchCarb).amount : 0).toBe(300);
    expect(withItem.meals.find((meal) => meal.id === "meal-6")?.items.some((item) => item.kind === "exchange" && item.exchangeGroupId === "fruit")).toBe(true);
  });

  it("filters protein swaps by active diet and avoid rules", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 4)!;
    const proteinItem = plan.meals.find((meal) => meal.id === "lunch")?.items.find((item) => item.id === "lunch-protein");
    const form = {
      ...initialFormState,
      dietaryLevel: "nonVegetarian" as const,
      avoidPaneer: true,
      avoidWhey: true,
      avoidEggs: true,
      avoidChickenFish: true,
    };
    const optionIds = proteinItem ? exchangeOptionsForItem(proteinItem, form, "lunch").map((option) => option.id) : [];

    expect(optionIds).not.toEqual(expect.arrayContaining(["paneer-50g", "whey-30g", "two-whole-eggs", "chicken-fish-100g"]));
    expect(optionIds).toEqual(expect.arrayContaining(["tofu-100g", "soy-chunks-dal-40g"]));
  });

  it("prioritizes narrowed liked grain and protein swaps", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 4)!;
    const grainItem = plan.meals.find((meal) => meal.id === "lunch")?.items.find((item) => item.id === "lunch-carb");
    const proteinItem = plan.meals.find((meal) => meal.id === "lunch")?.items.find((item) => item.id === "lunch-protein");
    const form = {
      ...initialFormState,
      preferredGrains: ["cooked-rice", "raw-rice"],
      preferredProteins: ["tofu-100g"],
    };
    const grainOptionIds = grainItem ? exchangeOptionsForItem(grainItem, form, "lunch").map((option) => option.id) : [];
    const proteinOptionIds = proteinItem ? exchangeOptionsForItem(proteinItem, form, "lunch").map((option) => option.id) : [];
    const defaultGrainOrder = grainItem ? exchangeOptionsForItem(grainItem, initialFormState, "lunch").map((option) => option.id) : [];
    const defaultProteinOrder = proteinItem ? exchangeOptionsForItem(proteinItem, initialFormState, "lunch").map((option) => option.id) : [];
    const expectedGrainOrder = [
      ...defaultGrainOrder.filter((optionId) => form.preferredGrains.includes(optionId)),
      ...defaultGrainOrder.filter((optionId) => !form.preferredGrains.includes(optionId)),
    ];
    const expectedProteinOrder = [
      ...defaultProteinOrder.filter((optionId) => form.preferredProteins.includes(optionId)),
      ...defaultProteinOrder.filter((optionId) => !form.preferredProteins.includes(optionId)),
    ];

    expect(grainOptionIds).toEqual(expectedGrainOrder);
    expect(proteinOptionIds).toEqual(expectedProteinOrder);
  });

  it("keeps automatic and fully selected swap order unchanged", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 4)!;
    const grainItem = plan.meals.find((meal) => meal.id === "lunch")?.items.find((item) => item.id === "lunch-carb");
    const proteinItem = plan.meals.find((meal) => meal.id === "lunch")?.items.find((item) => item.id === "lunch-protein");
    const defaultGrainOrder = grainItem ? exchangeOptionsForItem(grainItem, initialFormState, "lunch").map((option) => option.id) : [];
    const defaultProteinOrder = proteinItem ? exchangeOptionsForItem(proteinItem, initialFormState, "lunch").map((option) => option.id) : [];

    expect(grainItem ? exchangeOptionsForItem(grainItem, { ...initialFormState, preferredGrains: [] }, "lunch").map((option) => option.id) : []).toEqual(defaultGrainOrder);
    expect(proteinItem ? exchangeOptionsForItem(proteinItem, { ...initialFormState, preferredProteins: [] }, "lunch").map((option) => option.id) : []).toEqual(defaultProteinOrder);
    expect(grainItem ? exchangeOptionsForItem(grainItem, { ...initialFormState, preferredGrains: grainOptions.map((option) => option.id) }, "lunch").map((option) => option.id) : []).toEqual(defaultGrainOrder);
    expect(proteinItem ? exchangeOptionsForItem(proteinItem, { ...initialFormState, preferredProteins: proteinOptions.map((option) => option.id) }, "lunch").map((option) => option.id) : []).toEqual(defaultProteinOrder);
  });

  it("adds a protein item that respects active avoid rules", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 4)!;
    const form = {
      ...initialFormState,
      dietaryLevel: "nonVegetarian" as const,
      preferredProteins: ["paneer-50g", "whey-30g", "two-whole-eggs", "chicken-fish-100g"],
      avoidPaneer: true,
      avoidWhey: true,
      avoidEggs: true,
      avoidChickenFish: true,
    };
    const withProtein = addItemToMeal(plan, "lunch", "protein-serving", form);
    const added = withProtein.meals.find((meal) => meal.id === "lunch")?.items.at(-1);

    expect(added).toMatchObject({ kind: "exchange", exchangeGroupId: "protein-serving" });
    expect(added && "exchangeOptionId" in added ? added.exchangeOptionId : "").toBe("tofu-100g");
  });

  it("adds a meal with a protein that respects active avoid rules", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 4)!;
    const form = {
      ...initialFormState,
      preferredProteins: ["paneer-50g", "tofu-100g"],
      avoidPaneer: true,
    };
    const withMeal = addMeal(plan, form);
    const addedProtein = withMeal.meals.at(-1)?.items.find((item) => item.kind === "exchange" && item.exchangeGroupId === "protein-serving");

    expect(withMeal.meals).toHaveLength(plan.meals.length + 1);
    expect(addedProtein).toMatchObject({ kind: "exchange", exchangeGroupId: "protein-serving" });
    expect(addedProtein && "exchangeOptionId" in addedProtein ? addedProtein.exchangeOptionId : "").toBe("tofu-100g");
  });

  it("reports narrowed liked foods that are absent from the current plan", () => {
    const plan: DailyPlan = {
      id: "preference-feedback",
      displayName: "Preference feedback",
      meals: [
        {
          id: "lunch",
          displayName: "Lunch",
          items: [
            { kind: "exchange", exchangeGroupId: "grain", exchangeOptionId: "cooked-rice", exchangeUnits: 1 },
            { kind: "exchange", exchangeGroupId: "protein-serving", exchangeOptionId: "tofu-100g", exchangeUnits: 1 },
          ],
        },
      ],
    };
    const form = {
      ...initialFormState,
      preferredGrains: ["cooked-rice", "raw-rice"],
      preferredProteins: ["whey-30g", "tofu-100g"],
    };

    expect(unusedFoodPreferenceLabels(plan, form)).toEqual(["rice", "whey"]);
  });

  it("does not report automatic or fully represented liked foods", () => {
    const plan: DailyPlan = {
      id: "represented-preferences",
      displayName: "Represented preferences",
      meals: [
        {
          id: "lunch",
          displayName: "Lunch",
          items: [
            { kind: "exchange", exchangeGroupId: "grain", exchangeOptionId: "cooked-rice", exchangeUnits: 1 },
            { kind: "exchange", exchangeGroupId: "grain", exchangeOptionId: "raw-rice", exchangeUnits: 1 },
            { kind: "exchange", exchangeGroupId: "protein-serving", exchangeOptionId: "whey-30g", exchangeUnits: 1 },
            { kind: "exchange", exchangeGroupId: "protein-serving", exchangeOptionId: "tofu-100g", exchangeUnits: 1 },
          ],
        },
      ],
    };
    const narrowedForm = {
      ...initialFormState,
      preferredGrains: ["cooked-rice", "raw-rice"],
      preferredProteins: ["whey-30g", "tofu-100g"],
    };

    expect(unusedFoodPreferenceLabels(plan, initialFormState)).toEqual([]);
    expect(unusedFoodPreferenceLabels(plan, { ...initialFormState, preferredGrains: [], preferredProteins: [] })).toEqual([]);
    expect(unusedFoodPreferenceLabels(plan, narrowedForm)).toEqual([]);
  });

  it("edits exchange items in grams", () => {
    const plan = generateEditablePlan(initialFormState, undefined, new Set(), 4)!;
    const swapped = swapExchangeOption(plan, "lunch-carb", "raw-oats");
    const edited = updateItemAmount(swapped, "lunch-carb", 125);
    const lunchCarb = edited.meals.find((meal) => meal.id === "lunch")?.items.find((item) => item.id === "lunch-carb");

    expect(lunchCarb).toMatchObject({
      kind: "exchange",
      exchangeUnits: 2.5,
    });
    expect(lunchCarb ? planItemDisplayQuantity(lunchCarb).amount : 0).toBe(125);
  });

  it("treats empty or invalid serving drafts as uncommitted edits", () => {
    expect(parseServingAmountInput("")).toEqual({ status: "empty" });
    expect(parseServingAmountInput("   ")).toEqual({ status: "empty" });
    expect(parseServingAmountInput("not a number")).toEqual({ status: "invalid" });
    expect(parseServingAmountInput("-5")).toEqual({ status: "invalid" });
    expect(parseServingAmountInput("0")).toEqual({ status: "valid", amount: 0 });
    expect(parseServingAmountInput("150")).toEqual({ status: "valid", amount: 150 });
  });

  it("generates exchange quantities as whole grams", () => {
    const plan = generateEditablePlan({ ...initialFormState, calories: "2450" }, undefined, new Set(), 4)!;
    const exchangeGrams = plan.meals
      .flatMap((meal) => meal.items)
      .filter((item) => item.kind === "exchange")
      .map((item) => planItemDisplayQuantity(item).amount);

    expect(exchangeGrams.length).toBeGreaterThan(0);
    expect(exchangeGrams.every((grams) => Number.isInteger(grams))).toBe(true);
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
    expect(decoded?.form.preferredGrains).toEqual(initialFormState.preferredGrains);
    expect(decoded?.form.preferredProteins).toEqual(initialFormState.preferredProteins);
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

  it("returns blocker copy instead of a plan when no candidate satisfies macro bounds", () => {
    const result = generateEditablePlanResult(
      { ...initialFormState, fat: { mode: "max", value: "1" } },
      undefined,
      new Set(),
      6,
    );

    expect(result.plan).toBeUndefined();
    expect(result.blockers[0]).toMatch(/Fat is over max/);
    expect(result.blockers[0]).toMatch(/Relax the fat max/);
  });

  it("returns blocker copy when a locked protein conflicts with dietary rules", () => {
    const nonVegetarianPlan = generateEditablePlan(
      {
        ...initialFormState,
        dietaryLevel: "nonVegetarian",
        preferredProteins: ["chicken-fish-100g"],
        avoidEggs: false,
        avoidChickenFish: false,
      },
      undefined,
      new Set(),
      8,
    )!;
    const result = generateEditablePlanResult(
      initialFormState,
      nonVegetarianPlan,
      new Set(["lunch-protein"]),
      8,
    );

    expect(result.plan).toBeUndefined();
    expect(result.blockers[0]).toMatch(/Protein is blocked/);
    expect(result.blockers[0]).toMatch(/change dietary level/);
  });
});
