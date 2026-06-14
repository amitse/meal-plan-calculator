export type Id = string;

export type QuantityUnit = "g" | "ml" | "count" | "slice" | "scoop" | "serving";

export type FoodForm = "raw" | "cooked" | "prepared" | "packaged";

export type DietaryLevel = "vegetarian" | "eggetarian" | "nonVegetarian";

export type ProteinQuality = "complete" | "incomplete";

export type UnknownValue = null;

export type NutritionValue = number | UnknownValue;

export interface Quantity {
  amount: number;
  maxAmount?: number;
  unit: QuantityUnit;
  note?: string;
}

export interface NutritionFacts {
  protein: NutritionValue;
  carbs: NutritionValue;
  fat: NutritionValue;
  calories: NutritionValue;
  fiber: NutritionValue;
  saturatedFat: NutritionValue;
}

export interface FoodCost {
  currency: "INR";
  amount: number;
  forQuantity: Quantity;
  proteinPer100?: NutritionValue;
  totalProtein?: NutritionValue;
  proteinPerCurrencyUnit?: NutritionValue;
  proteinPer10CurrencyUnits?: NutritionValue;
}

export interface FoodItem {
  id: Id;
  displayName: string;
  aliases?: string[];
  referenceQuantity: Quantity;
  nutrition: NutritionFacts;
  dietaryLevel: DietaryLevel;
  proteinQuality?: ProteinQuality;
  cost?: FoodCost;
  tags?: string[];
  note?: string;
}

export interface ExchangeUnit {
  id: Id;
  displayName: string;
  note?: string;
}

export interface ExchangeReference {
  quantity?: Quantity;
  nutrition?: NutritionFacts;
  foodItemId?: Id;
  note?: string;
}

export interface ExchangeOption {
  id: Id;
  displayName: string;
  aliases?: string[];
  foodItemId?: Id;
  dietaryLevel?: DietaryLevel;
  quantity: Quantity;
  exchangeUnits?: number;
  foodForm?: FoodForm;
  nutritionOverride?: NutritionFacts;
  note?: string;
}

export interface ExchangeGroup {
  id: Id;
  displayName: string;
  aliases?: string[];
  exchangeUnit: ExchangeUnit;
  reference?: ExchangeReference;
  options: ExchangeOption[];
  note?: string;
}

export interface ReferenceFormulaValue {
  id: Id;
  label: string;
  [key: string]: string | number | boolean | null;
}

export interface ReferenceFormula {
  id: Id;
  displayName: string;
  kind: string;
  sourceUrl?: string;
  values: ReferenceFormulaValue[];
  note?: string;
}

export interface MasterData {
  version: string;
  foods: FoodItem[];
  exchangeGroups: ExchangeGroup[];
  referenceFormulas: ReferenceFormula[];
}
