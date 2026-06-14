import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import masterDataSchema from "../schemas/master-data.schema.json" with { type: "json" };
import {
  assertMasterDataIntegrity,
  assertMasterDataReferences,
  assertUniqueMasterDataIds,
  calculateExchangeSelectionNutrition,
  getExchangeGroup,
  getExchangeOption,
  getFoodItem,
  getReferenceFormula,
  listExchangeGroups,
  listExchangeOptions,
  listFoodItems,
  masterData,
} from "../src/index.js";

describe("MasterData read API", () => {
  it("conforms to the canonical JSON Schema", () => {
    const ajv = new Ajv2020({ allErrors: true });
    const validate = ajv.compile(masterDataSchema);

    expect(validate(masterData), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it("loads the bundled MasterData", () => {
    expect(masterData.version).toBe("0.1.0");
    expect(listFoodItems()).toHaveLength(38);
    expect(listExchangeGroups()).toHaveLength(8);
  });

  it("keeps ids unique and FoodItem references valid", () => {
    expect(assertUniqueMasterDataIds()).toBe(true);
    expect(assertMasterDataReferences()).toBe(true);
    expect(assertMasterDataIntegrity()).toBe(true);
  });

  it("reads FoodItems by stable Id", () => {
    const soyChunks = getFoodItem("soy-chunks");

    expect(soyChunks.displayName).toBe("Soy chunks");
    expect(soyChunks.referenceQuantity).toEqual({ amount: 35, unit: "g" });
    expect(soyChunks.nutrition.protein).toBe(18.2);
    expect(soyChunks.cost?.currency).toBe("INR");
  });

  it("includes provided FYI protein-cost rows without making cost a target", () => {
    const costFoodIds = [
      "soy-chunks",
      "besan",
      "black-chana",
      "green-moong-lentil",
      "lobia",
      "rajma",
      "peanuts",
      "dalia",
      "kabuli-chana",
      "split-moong",
      "egg-whole",
      "roasted-chana",
      "sattu",
      "oats",
      "peanut-butter",
      "rohu-fish",
      "flax-seeds",
      "toned-milk",
      "chicken-breast",
      "whey",
      "curd",
      "paneer",
      "tofu",
      "high-protein-peanut-butter",
      "sprout",
    ];

    for (const id of costFoodIds) {
      expect(getFoodItem(id).cost, id).toBeDefined();
    }
  });

  it("preserves unknown values as null instead of zero", () => {
    expect(getFoodItem("oil-ghee").nutrition.saturatedFat).toBeNull();
    expect(getFoodItem("peanut-butter").nutrition.fiber).toBeNull();
    expect(getFoodItem("veggies-excl-potato").nutrition.saturatedFat).toBeNull();
  });

  it("classifies every food and unlinked exchange option by dietary level", () => {
    for (const food of listFoodItems()) {
      expect(["vegetarian", "eggetarian", "nonVegetarian"], food.id).toContain(food.dietaryLevel);
    }

    for (const group of listExchangeGroups()) {
      for (const option of group.options) {
        if (!option.foodItemId) {
          expect(["vegetarian", "eggetarian", "nonVegetarian"], `${group.id}/${option.id}`).toContain(
            option.dietaryLevel,
          );
        }
      }
    }
  });

  it("keeps Indian vegetarian, eggetarian, and non-vegetarian classifications distinct", () => {
    expect(getFoodItem("paneer").dietaryLevel).toBe("vegetarian");
    expect(getFoodItem("whey").dietaryLevel).toBe("vegetarian");
    expect(getFoodItem("egg-whole").dietaryLevel).toBe("eggetarian");
    expect(getFoodItem("chicken-breast").dietaryLevel).toBe("nonVegetarian");
    expect(getFoodItem("rohu-fish").dietaryLevel).toBe("nonVegetarian");
    expect(getExchangeOption("protein-serving", "chicken-fish-100g").dietaryLevel).toBe("nonVegetarian");
  });

  it("reads ExchangeGroups with reference facts and options", () => {
    const fruit = getExchangeGroup("fruit");
    const watermelon = fruit.options.find((option) => option.id === "watermelon");

    expect(fruit.exchangeUnit.id).toBe("banana-equivalent");
    expect(fruit.reference?.nutrition?.calories).toBe(92.9);
    expect(watermelon?.quantity).toEqual({ amount: 300, unit: "g" });
  });

  it("reads nested ExchangeOptions by stable group and option Ids", () => {
    expect(listExchangeOptions("grain")).toHaveLength(11);
    expect(getExchangeOption("grain", "cooked-rice").quantity).toEqual({
      amount: 150,
      maxAmount: 180,
      unit: "g",
    });
  });

  it("calculates raw oats exchange nutrition from known food facts", () => {
    const oats = calculateExchangeSelectionNutrition({
      kind: "exchange",
      exchangeGroupId: "grain",
      exchangeOptionId: "raw-oats",
      exchangeUnits: 1,
    });

    expect(oats.calories).toBeCloseTo(194.5);
    expect(oats.carbs).toBeCloseTo(33.15);
    expect(oats.fat).toBeCloseTo(3.45);
    expect(oats.fiber).toBeCloseTo(5.3);
  });

  it("reads optional ReferenceFormula data", () => {
    const activity = getReferenceFormula("physical-activity-multipliers");

    expect(activity.values.find((value) => value.id === "moderate-activity")).toMatchObject({
      label: "Moderate activity, 3-5 days",
      multiplier: 1.55,
    });
  });

  it("throws for unknown ids instead of silently returning fallback data", () => {
    expect(() => getFoodItem("not-a-food")).toThrow("FoodItem not found: not-a-food");
    expect(() => getExchangeGroup("not-a-group")).toThrow("ExchangeGroup not found: not-a-group");
    expect(() => getExchangeOption("grain", "not-an-option")).toThrow("ExchangeOption not found: grain/not-an-option");
  });

  it("keeps first-layer MasterData free of generated plan data", () => {
    expect(Object.keys(masterData).sort()).toEqual(["exchangeGroups", "foods", "referenceFormulas", "version"]);
  });
});
