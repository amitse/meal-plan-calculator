import type { DietaryLevel, Id, NutritionFacts, Quantity } from "./types.js";

export type NutritionMetric = keyof NutritionFacts;

export type EvaluationStatus = "pass" | "fail";

export interface TargetBound {
  id?: Id;
  metric: NutritionMetric;
  min?: number;
  max?: number;
  target?: number;
  tolerance?: number;
  label?: string;
}

export interface NutritionTarget {
  id?: Id;
  displayName?: string;
  bounds: TargetBound[];
}

export type TargetBoundInput =
  | number
  | {
      min?: number;
      max?: number;
      target?: number;
      tolerance?: number;
      label?: string;
    };

export interface NutritionTargetInput {
  id?: Id;
  displayName?: string;
  calories: number | { target: number; tolerance?: number; min?: number; max?: number; label?: string };
  calorieTolerance?: number;
  macroTolerance?: number;
  protein?: TargetBoundInput;
  carbs?: TargetBoundInput;
  fat?: TargetBoundInput;
  fiber?: TargetBoundInput;
  saturatedFat?: TargetBoundInput;
}

export interface MealConstraint extends TargetBound {}

export interface FoodPreference {
  dietaryLevel?: DietaryLevel;
  allowedFoodItemIds?: Id[];
  excludedFoodItemIds?: Id[];
  preferredFoodItemIds?: Id[];
  allowedExchangeOptionIds?: Record<Id, Id[]>;
  excludedExchangeOptionIds?: Record<Id, Id[]>;
  preferredExchangeOptionIds?: Record<Id, Id[]>;
}

export interface FoodPortion {
  kind: "food";
  id?: Id;
  foodItemId: Id;
  quantity: Quantity;
  roles?: MealRole[];
  adjustable?: boolean;
  note?: string;
}

export interface ExchangeSelection {
  kind: "exchange";
  id?: Id;
  exchangeGroupId: Id;
  exchangeOptionId: Id;
  exchangeUnits?: number;
  roles?: MealRole[];
  adjustable?: boolean;
  note?: string;
}

export type DailyPlanItem = FoodPortion | ExchangeSelection;

export interface Meal {
  id: Id;
  displayName: string;
  patternId?: Id;
  constraints?: MealConstraint[];
  items: DailyPlanItem[];
}

export interface DailyPlan {
  id: Id;
  displayName: string;
  templateId?: Id;
  meals: Meal[];
  note?: string;
}

export interface FoodTemplateItem {
  kind: "food";
  id: Id;
  foodItemId: Id;
  quantity: Quantity;
  roles?: MealRole[];
  adjustable?: boolean;
  note?: string;
}

export interface ExchangeTemplateItem {
  kind: "exchange";
  id: Id;
  exchangeGroupId: Id;
  exchangeUnits?: number;
  defaultOptionId?: Id;
  allowedOptionIds?: Id[];
  roles?: MealRole[];
  adjustable?: boolean;
  note?: string;
}

export type DailyPlanTemplateItem = FoodTemplateItem | ExchangeTemplateItem;

export interface MealTemplate {
  id: Id;
  displayName: string;
  patternId?: Id;
  constraints?: MealConstraint[];
  items: DailyPlanTemplateItem[];
}

export interface DailyPlanTemplate {
  id: Id;
  displayName: string;
  meals: MealTemplate[];
  note?: string;
}

export interface NutritionTotals {
  values: Record<NutritionMetric, number>;
  unknown: Record<NutritionMetric, boolean>;
}

export interface BoundEvaluation {
  bound: TargetBound;
  status: EvaluationStatus;
  value: number;
  unknown: boolean;
  min?: number;
  max?: number;
  shortfall?: number;
  excess?: number;
}

export interface MealEvaluation {
  mealId: Id;
  totals: NutritionTotals;
  constraints: BoundEvaluation[];
  pattern?: MealPatternEvaluation;
  status: EvaluationStatus;
}

export interface PlanEvaluation {
  planId: Id;
  totals: NutritionTotals;
  targetBounds: BoundEvaluation[];
  meals: MealEvaluation[];
  status: EvaluationStatus;
}

export interface ResolvedTemplateSelection {
  templateItemId: Id;
  exchangeOptionId: Id;
}

export interface ResolveDailyPlanTemplateOptions {
  id?: Id;
  displayName?: string;
  selections?: ResolvedTemplateSelection[];
}

export interface PlanGeneratorInput {
  template: DailyPlanTemplate;
  target?: NutritionTarget;
  preferences?: FoodPreference;
  maxCandidates?: number;
  adjustQuantities?: boolean;
}

export interface GeneratedPlanCandidate {
  plan: DailyPlan;
  evaluation?: PlanEvaluation;
}

export interface PlanGenerationResult {
  candidates: GeneratedPlanCandidate[];
  rejected: string[];
}

export interface GenerateMealPlanInput extends NutritionTargetInput {
  template?: DailyPlanTemplate;
  preferences?: FoodPreference;
  dietaryLevel?: DietaryLevel;
  maxCandidates?: number;
  adjustQuantities?: boolean;
}

export interface GenerateMealPlanResult extends PlanGenerationResult {
  target: NutritionTarget;
  template: DailyPlanTemplate;
  selected?: GeneratedPlanCandidate;
}

export type MealRole = "cookingFat" | "carb" | "protein" | "vegetables" | "fruit" | "dairy" | "snack";

export interface MealPatternDefaultItem {
  id: Id;
  roles: MealRole[];
  item: DailyPlanTemplateItem;
}

export interface MealPattern {
  id: Id;
  displayName: string;
  requiredRoles: MealRole[];
  defaultItems?: MealPatternDefaultItem[];
}

export interface MealPatternRoleEvaluation {
  role: MealRole;
  present: boolean;
}

export interface MealPatternEvaluation {
  mealId: Id;
  patternId: Id;
  roles: MealPatternRoleEvaluation[];
  missingRoles: MealRole[];
  status: EvaluationStatus;
}
