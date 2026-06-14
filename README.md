# Meal Plan Calculator

Schema-defined nutrition planning data and a UI-free TypeScript library for generating Indian meal plans from calories, optional macro constraints, dietary level, and taste preferences.

## What is included

- **MasterData layer**: foods, nutrition facts, exchange groups, dietary levels, display-only cost data, protein quality, and reference formulas.
- **Planning layer**: daily plan templates, meal patterns, plate-role defaults, exchange resolution, nutrition totals, target evaluation, and meal-plan generation.
- **Design foundation**: Pehle Health-inspired warm-modern mobile-first tokens and workflow documentation.

## Main API

```ts
import { generateMealPlan } from "meal-plan-calculator";

const result = generateMealPlan({
  calories: 2000,
  protein: 75,
  carbs: { min: 100, max: 400 },
  fat: { max: 120 },
  dietaryLevel: "vegetarian",
  preferences: {
    preferredExchangeOptionIds: {
      grain: ["cooked-rice"],
      "protein-serving": ["whey-30g"]
    }
  }
});
```

## Scripts

```powershell
npm run typecheck
npm test
npm run build
```

## Project notes

- `docs\user-stories.md` documents supported workflows and API coverage.
- `docs\mobile-design-system.md` and `design\tokens.json` define the mobile-first design foundation.
- Generated plans are diagnostic and explicit: impossible macro, taste, or dietary combinations return rejection reasons instead of fake successful plans.
