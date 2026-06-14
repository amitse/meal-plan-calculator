# Meal Plan Calculator User Stories

This document captures the required workflows for the current library-first meal plan calculator and validates whether the TypeScript API can support each story.

## Actors

- **Planner**: The person creating or adjusting a meal plan.
- **Eater**: The person whose dietary level, targets, and preferences shape the plan.
- **Developer**: The person building a future CLI or static website on top of the library.

## Workflow 1: Browse the food and exchange master data

**Story**: As a Planner, I want to browse the food catalog, nutrition facts, display-only cost data, protein quality, dietary level, exchange groups, exchange options, and reference formulas so that I can understand what the calculator knows before building a plan.

**Steps**:

1. Load `masterData`.
2. List or fetch `FoodItem` records by stable `Id`.
3. List or fetch `ExchangeGroup` and nested `ExchangeOption` records.
4. List `ReferenceFormula` records for optional target-suggestion context.

**API coverage**: Supported by `masterData`, `listFoodItems`, `getFoodItem`, `listExchangeGroups`, `getExchangeGroup`, `listExchangeOptions`, `getExchangeOption`, `listReferenceFormulas`, and `getReferenceFormula`.

## Workflow 2: Build a daily plan template

**Story**: As a Planner, I want to define a `DailyPlanTemplate` made of ordered meals and food/exchange placeholders so that a reusable plan shape can be resolved into concrete meals later.

**Steps**:

1. Create ordered `MealTemplate` entries.
2. Add fixed `FoodTemplateItem` portions where the food is known.
3. Add `ExchangeTemplateItem` placeholders where a choice should be made later.
4. Tag items with `MealRole` where they satisfy plate roles such as carb, protein, vegetables, or cooking fat.

**API coverage**: Supported by exported types `DailyPlanTemplate`, `MealTemplate`, `FoodTemplateItem`, `ExchangeTemplateItem`, and `MealRole`.

## Workflow 3: Apply meal preparation and plate rules

**Story**: As a Planner, I want a cooked meal to include required plate roles like cooking fat, carb, protein, and vegetables so that unwritten preparation rules are not forgotten.

**Steps**:

1. Mark a meal with a `MealPattern` such as `cooked-plate`.
2. Run default completion.
3. Add missing defaults such as oil/ghee, vegetables, grain, and protein only when that pattern requires them.
4. Evaluate whether required roles are present.

**API coverage**: Supported by `defaultMealPatterns`, `completeMealPatternDefaults`, and `evaluateMealPattern`.

## Workflow 4: Resolve exchange choices manually

**Story**: As a Planner, I want to choose exact exchange options such as roti instead of any grain, watermelon instead of fruit, or paneer instead of a generic protein serving so that a template becomes a concrete `DailyPlan`.

**Steps**:

1. Start with a `DailyPlanTemplate`.
2. Provide selected option IDs for exchange placeholders.
3. Resolve the template into a `DailyPlan`.
4. Preserve the selected exchange group, option, roles, and exchange units.

**API coverage**: Supported by `resolveDailyPlanTemplate` and `ExchangeSelection`.

## Workflow 5: Generate a meal plan from calories and optional macros

**Story**: As a Planner, I want to provide a calorie target and optional macro constraints so that the library can generate a usable daily meal plan without requiring me to manually build low-level target bounds.

**Steps**:

1. Provide calories as the required input.
2. Optionally provide protein, carbs, fat, fiber, and saturated-fat constraints.
3. Optionally provide dietary level and other food preferences.
4. Use the default daily template or provide a custom `DailyPlanTemplate`.
5. Generate candidates by applying meal-pattern defaults and choosing allowed exchange options.
6. Adjust quantities toward the calorie target and supported macro constraints while respecting practical unit discreteness.
7. Return the generated candidates, the constructed `NutritionTarget`, and the selected passing candidate when one exists.

**API coverage**: Supported by `createNutritionTarget`, `generateMealPlan`, `defaultDailyPlanTemplate`, `generateDailyPlans`, and `adjustDailyPlanToTarget`.

## Workflow 6: Respect Indian dietary levels

**Story**: As an Eater, I want vegetarian, eggetarian, and non-vegetarian rules to be distinct so that vegetarian plans can include dairy but not eggs, meat, or fish; eggetarian plans can include eggs; and non-vegetarian plans can include all options.

**Steps**:

1. Tag master data with `DietaryLevel`.
2. Provide `FoodPreference.dietaryLevel`.
3. Filter exchange options and direct template foods.
4. Reject plans that cannot satisfy the selected dietary level.

**API coverage**: Supported by `DietaryLevel`, `FoodPreference`, `generateDailyPlans`, and MasterData dietary classifications.

## Workflow 7: Calculate nutrition totals

**Story**: As a Planner, I want meal and daily nutrition totals calculated from known food portions and selected exchanges so that I can see protein, carbs, fat, calories, fiber, and saturated fat.

**Steps**:

1. Calculate a fixed `FoodPortion`.
2. Calculate an `ExchangeSelection` using an override, specific food facts, or exchange reference facts.
3. Sum meal totals.
4. Sum daily totals.
5. Preserve unknown values as `unknown` flags while summing known subtotals.

**API coverage**: Supported by `calculateFoodPortionNutrition`, `calculateExchangeSelectionNutrition`, `calculateMealTotals`, `calculateDailyPlanTotals`, `scaleNutritionFacts`, `sumNutritionFacts`, and `addNutritionFacts`.

## Workflow 8: Evaluate a plan against targets and meal constraints

**Story**: As a Planner, I want a diagnostic result that shows whether a plan meets daily targets and meal-level constraints without silently changing the plan.

**Steps**:

1. Define `NutritionTarget` using `TargetBound` values.
2. Define optional `MealConstraint` values.
3. Evaluate known subtotals against bounds.
4. Report pass/fail status, shortfalls, excesses, and unknown flags.
5. Include meal-pattern role evaluation in each meal result.

**API coverage**: Supported by `evaluateDailyPlan`, `evaluateMealConstraints`, `evaluateTargetBound`, and `PlanEvaluation`.

## Workflow 9: Show cost and protein-quality data as FYI

**Story**: As a Planner, I want to see cost and protein-quality information without letting it change target evaluation or plan ranking so that it stays informational.

**Steps**:

1. Load `FoodCost` and `ProteinQuality` from `FoodItem`.
2. Display it in a future UI or CLI.
3. Do not include cost in `NutritionTarget`.
4. Do not adjust protein totals based on complete/incomplete quality.

**API coverage**: Supported by MasterData fields `cost` and `proteinQuality`; no optimizer/ranking API uses cost.

## Workflow 10: Handle impossible or incomplete inputs

**Story**: As a Developer, I want invalid IDs, impossible dietary preferences, missing exchange options, and incompatible units to fail explicitly so that the app does not produce misleading plans.

**Steps**:

1. Fetch unknown IDs through `get*` APIs.
2. Generate with preferences that remove all possible choices.
3. Use incompatible units for direct food portions.
4. Surface explicit errors or rejected reasons.

**API coverage**: Supported by throwing `get*` APIs, unit compatibility checks, `PlanGenerationResult.rejected`, and MasterData integrity checks.

## Workflow 11: Use reference formulas without requiring a person profile

**Story**: As a Planner, I want optional protein/activity formulas available as reference data while still allowing manually entered targets so that the calculator remains target-first.

**Steps**:

1. Load reference formulas.
2. Display or use formula values in a future target helper.
3. Manually provide `NutritionTarget` to the planning API.

**API coverage**: Partially supported. The library exposes `ReferenceFormula` data and accepts manual `NutritionTarget`; it does not yet calculate a `NutritionTarget` from body metrics because the current domain decision is target-first.

## Workflow 12: Customize generated plans by taste

**Story**: As an Eater, I want to prefer or exclude foods and exchange options so that a generated plan matches my taste while still satisfying calorie, macro, dietary, and meal-pattern requirements.

**Steps**:

1. Provide preferred exchange options such as cooked rice, roti, whey, paneer, eggs, or chicken/fish.
2. Provide excluded foods such as paneer or whey when they should not appear.
3. Generate a plan from calorie and optional macro inputs.
4. Select a passing candidate that honors preferences when possible.
5. Return explicit rejection when taste filters make the plan impossible.

**API coverage**: Supported by `FoodPreference.preferredExchangeOptionIds`, `FoodPreference.preferredFoodItemIds`, `FoodPreference.excludedFoodItemIds`, `FoodPreference.allowedExchangeOptionIds`, and `generateMealPlan`.

## Coverage summary

| Area | Current API status |
| --- | --- |
| MasterData browsing | Supported |
| Calorie + optional macro meal-plan generation | Supported |
| Exchange browsing and selection | Supported |
| Template modeling | Supported |
| Meal-pattern defaults and validation | Supported |
| Vegetarian / eggetarian / non-vegetarian filtering | Supported |
| Manual template resolution | Supported |
| Candidate plan generation from templates | Supported |
| Nutrition totals | Supported |
| Target and meal evaluation | Supported |
| Unknown-value preservation | Supported |
| Cost as FYI | Supported |
| Reference formulas as FYI | Supported |
| Taste preference customization | Supported |
| Editable mobile meal plans | Supported |
| Locking ingredients while regenerating | Supported |
| Swapping exchange-equivalent items | Supported |
| Adding meals and items | Supported |
| Meal-specific macro targets | Supported |
| Shareable URL encoded plans | Supported |
| Target calculation from body metrics | Future scope |
| Weekly plan scheduling | Future scope |
| Shopping/prep list generation | Future scope |
| Static website UI | Future scope |
