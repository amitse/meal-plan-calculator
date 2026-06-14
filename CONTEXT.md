# Nutrition Planning Calculator

This context captures the domain language for a personal nutrition planning calculator.

## Language

**DailyPlan**:
A resolved daily eating plan with concrete meal choices.
_Avoid_: Plan

**DailyPlanTemplate**:
A reusable daily eating template that may contain exchange placeholders for a person's calorie target, protein target, and other requirements.
_Avoid_: Plan template

**NutritionTarget**:
A set of calorie, protein, fiber, and saturated-fat bounds that a **DailyPlan** is evaluated against.
_Avoid_: Requirement, goal

**TargetBound**:
A metric-specific bound expressed as a target, tolerance, minimum, or maximum.
_Avoid_: Exact target

**ReferenceFormula**:
An optional formula or multiplier used to suggest a **NutritionTarget**.
_Avoid_: Required profile input

**MasterData**:
The canonical food, exchange, nutrition, display-cost, protein-quality, and reference-formula facts used by the calculator.
_Avoid_: Seed data, sample data

**Id**:
A stable identifier used to reference a domain object independently of its display name or aliases.
_Avoid_: Display name

**FoodItem**:
A reusable catalog entry with nutrition values for a reference serving.
_Avoid_: Food row

**Quantity**:
A measured amount paired with its unit.
_Avoid_: Qty

**NutritionFacts**:
The supplied calories and nutrient values associated with a food quantity.
_Avoid_: Macro formula

**UnknownValue**:
A missing nutrition or display value that must not be treated as zero.
_Avoid_: Blank, zero

**FoodPortion**:
A measured amount of a **FoodItem** used in a **Meal**.
_Avoid_: Item, row

**Meal**:
A named, ordered section of a **DailyPlanTemplate** or **DailyPlan** containing food choices and optional slot-level constraints.
_Avoid_: Meal slot

**MealConstraint**:
An optional per-meal bound such as a protein minimum or calorie range.
_Avoid_: Meal target

**MealPattern**:
A reusable plate or preparation rule describing which food roles a meal should contain.
_Avoid_: Unwritten rule

**MealRole**:
The purpose a food choice serves inside a **Meal**, such as cooking fat, carb, protein, or vegetables.
_Avoid_: Food category

**ExchangeGroup**:
A named set of interchangeable food choices that can satisfy the same role in a **DailyPlanTemplate**.
_Avoid_: Replacement list

**ExchangeOption**:
One concrete choice within an **ExchangeGroup** with its own quantity and equivalence meaning.
_Avoid_: Alternative, substitute

**ExchangeSelection**:
The chosen **ExchangeOption** and number of **ExchangeUnits** used for an **ExchangeGroup** in a **DailyPlan**.
_Avoid_: Replacement choice

**ExchangeUnit**:
The group-specific basis that defines what one interchangeable serving means within an **ExchangeGroup**.
_Avoid_: Equivalent quantity

**ExchangeReference**:
The reference **NutritionFacts** used for one **ExchangeUnit** when an **ExchangeOption** does not provide its own facts.
_Avoid_: Generic food facts

**FoodForm**:
The raw, cooked, or prepared state in which a food quantity is measured for an exchange.
_Avoid_: Cooking conversion

**FoodCost**:
Display-only INR cost information associated with a **FoodItem**.
_Avoid_: Cost target, optimization cost

**FoodPreference**:
A planning input that states allowed, excluded, or preferred foods and exchange choices.
_Avoid_: Diet profile

**DietaryLevel**:
An Indian meal-planning classification of vegetarian, eggetarian, or non-vegetarian eligibility.
_Avoid_: Vegan, non-vegan

**ProteinQuality**:
A display and filtering tag indicating whether a **FoodItem** protein source is complete or incomplete.
_Avoid_: Protein adjustment

**PlanEvaluation**:
A diagnostic result showing how a **DailyPlan** compares with a **NutritionTarget**.
_Avoid_: Score, optimizer result

**EvaluationStatus**:
The pass/fail status of a known subtotal against a target bound.
_Avoid_: Certainty

## Relationships

- A **DailyPlanTemplate** is tailored to one person's requirements.
- A **DailyPlan** is created from a **DailyPlanTemplate** by choosing concrete **ExchangeOptions** and allowed quantities.
- A **DailyPlan** is evaluated against a **NutritionTarget**.
- A **NutritionTarget** contains one or more **TargetBounds**.
- A **ReferenceFormula** may suggest a **NutritionTarget**.
- A **PlanEvaluation** reports the result of evaluating one **DailyPlan** against one **NutritionTarget**.
- A **PlanEvaluation** uses known subtotals for **EvaluationStatus** even when **UnknownValue** is present.
- **MasterData** contains the canonical **FoodItems**, **ExchangeGroups**, **NutritionFacts**, **FoodCost**, **ProteinQuality**, and **ReferenceFormula** values.
- **FoodItems**, **ExchangeGroups**, **ExchangeOptions**, and **ReferenceFormulas** are referenced by **Id**.
- A **DailyPlanTemplate** contains one or more ordered **Meals**.
- A **DailyPlan** contains one or more ordered **Meals**.
- A **Meal** contains zero or more **FoodPortions**.
- A **Meal** may have zero or more **MealConstraints**.
- A **Meal** may follow a **MealPattern**.
- A **MealPattern** requires one or more **MealRoles**.
- A **MealRole** can be satisfied by a **FoodPortion** or an **ExchangeSelection**.
- A **Meal** in a **DailyPlanTemplate** may use an **ExchangeGroup** where one **ExchangeOption** is chosen.
- An **ExchangeGroup** contains one or more **ExchangeOptions**.
- An **ExchangeGroup** is measured in one **ExchangeUnit**.
- An **ExchangeGroup** may have an **ExchangeReference**.
- An **ExchangeOption** states how much food satisfies one or more **ExchangeUnits**.
- An **ExchangeOption** may specify the **FoodForm** for its quantity.
- An **ExchangeOption** may override the **ExchangeReference** with option-specific **NutritionFacts**.
- An **ExchangeSelection** resolves one **ExchangeGroup** to one **ExchangeOption** for a **DailyPlan**.
- A **FoodPortion** uses exactly one **FoodItem**.
- A **FoodPortion** has exactly one **Quantity**.
- A **Quantity** follows the practical discreteness of its unit.
- A **FoodPortion** derives its nutrition from its **FoodItem** and measured amount.
- A **FoodItem** has a reference-serving **Quantity**.
- A **FoodItem** has **NutritionFacts** for its reference-serving **Quantity**.
- **NutritionFacts** may contain **UnknownValue** for missing values.
- A **FoodItem** may have **FoodCost** for display.
- A **FoodItem** may have **ProteinQuality**.
- **FoodCost** is not part of a **NutritionTarget**.
- A **FoodPreference** guides which **FoodItems** or **ExchangeOptions** can be used in generated **DailyPlans**.
- A **FoodPreference** may specify a **DietaryLevel**.
- A vegetarian **DietaryLevel** allows plant and dairy foods but excludes eggs, meat, and fish.
- An eggetarian **DietaryLevel** allows vegetarian foods and eggs but excludes meat and fish.
- A non-vegetarian **DietaryLevel** allows vegetarian, eggetarian, and non-vegetarian foods.

## Example dialogue

> **Dev:** "Should a 1700 calorie **DailyPlanTemplate** work for everyone?"
> **Domain expert:** "No — a **DailyPlanTemplate** also depends on the person's protein target and other requirements."
>
> **Dev:** "Do we need body weight and activity level before creating a **DailyPlanTemplate**?"
> **Domain expert:** "No — those can inform a **NutritionTarget**, but the calculator can work directly from the **NutritionTarget**."
>
> **Dev:** "Should protein multipliers be mandatory?"
> **Domain expert:** "No — they are **ReferenceFormulas** that can suggest a **NutritionTarget**."
>
> **Dev:** "Is 'egg whole, 3' a food catalog entry?"
> **Domain expert:** "No — egg whole is the **FoodItem** and 3 eggs is the **FoodPortion** used in the **DailyPlan**."
>
> **Dev:** "Must every **DailyPlanTemplate** have exactly breakfast, lunch, snack, and dinner?"
> **Domain expert:** "No — those are defaults, but a **DailyPlanTemplate** can use any ordered **Meal** list."
>
> **Dev:** "Is breakfast protein minimum part of the daily **NutritionTarget**?"
> **Domain expert:** "No — that is a **MealConstraint** on the breakfast **Meal**."
>
> **Dev:** "How do we represent that lunch needs oil, grain, protein, and vegetables?"
> **Domain expert:** "Use a **MealPattern** with required **MealRoles**, and apply defaults only for patterns that require them."
>
> **Dev:** "Is 'any grain' just another **FoodItem**?"
> **Domain expert:** "No — it is an **ExchangeGroup** where rice, roti, oats, dosa, or bread can be chosen as the **ExchangeOption**."
>
> **Dev:** "If a **DailyPlan** uses roti for the grain choice, do we lose that it came from 'any grain'?"
> **Domain expert:** "No — the **ExchangeSelection** records the chosen **ExchangeOption** for the original **ExchangeGroup**."
>
> **Dev:** "Does one fruit choice equal another because all macros match?"
> **Domain expert:** "No — each fruit choice satisfies the fruit **ExchangeUnit**, such as one banana-equivalent."
>
> **Dev:** "If apple has no nutrition row, can an apple fruit selection still be calculated?"
> **Domain expert:** "Yes — it uses the fruit **ExchangeReference** unless the apple **ExchangeOption** provides its own **NutritionFacts**."
>
> **Dev:** "Should a cheaper **DailyPlan** rank higher?"
> **Domain expert:** "No — **FoodCost** is shown as FYI data only."
>
> **Dev:** "Should chicken be removed from **MasterData** for a vegetarian user?"
> **Domain expert:** "No — **FoodPreference** excludes it during planning."
>
> **Dev:** "Is vegetarian the same as vegan?"
> **Domain expert:** "No — vegetarian allows dairy but excludes eggs, meat, and fish; eggs belong to eggetarian planning."
>
> **Dev:** "Does incomplete protein count less toward the protein total?"
> **Domain expert:** "No — **ProteinQuality** is a display and filtering tag, not a calculation modifier."
>
> **Dev:** "Can we reference a food by display name?"
> **Domain expert:** "No — use its stable **Id**; display names and aliases are labels."
>
> **Dev:** "Can the calculator store egg quantity as just '3'?"
> **Domain expert:** "No — it stores a **Quantity**, such as 3 count."
>
> **Dev:** "Can the generator suggest 0.37 eggs?"
> **Domain expert:** "No — **Quantity** respects the practical discreteness of its unit."
>
> **Dev:** "Should the calculator calculate cooked dal weight from raw dal?"
> **Domain expert:** "No — raw and cooked quantities are explicit **ExchangeOptions** with their own **FoodForm**."
>
> **Dev:** "Should calories be recalculated from protein, carbs, and fat?"
> **Domain expert:** "No — calories are part of the supplied **NutritionFacts** and are summed directly."
>
> **Dev:** "If saturated fat is blank, is it zero?"
> **Domain expert:** "No — it is an **UnknownValue** and should not be silently counted as zero."
>
> **Dev:** "If protein is too low, should the calculator edit the **DailyPlan**?"
> **Domain expert:** "No — the **PlanEvaluation** reports the shortfall without changing the **DailyPlan**."
>
> **Dev:** "Does 1700 calories mean exactly 1700?"
> **Domain expert:** "No — calories are a **TargetBound**, such as 1700 with a 50 calorie tolerance."
>
> **Dev:** "If some saturated fat values are unknown, does the target become indeterminate?"
> **Domain expert:** "No — **EvaluationStatus** uses the known subtotal, while preserving that **UnknownValue** exists."

## Flagged ambiguities

- "plan" was used broadly; resolved: use **DailyPlanTemplate** for the reusable template and **DailyPlan** for the resolved concrete day.
- "person profile" was considered for body and activity inputs; resolved: the core calculator can work directly from a **NutritionTarget** without requiring a profile.
- Carbs, total fat, and cost appear in the source data; resolved: they are calculated or display outputs, not **NutritionTarget** constraints.
- Pasted calorie plans were considered as templates or fixtures; resolved: they are reference notes, not canonical **MasterData**.
- "vegetarian" was distinguished from vegan/non-vegan; resolved: use **DietaryLevel** with vegetarian, eggetarian, and non-vegetarian levels.
