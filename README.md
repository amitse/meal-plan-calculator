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
npm run ux:copilot-pipeline
```

## Copilot UX prompt pipeline

Run a three-stage `copilot -p` pipeline that creates a random target user, turns that persona into a realistic app workflow, then produces one final UX report with likes, dislikes, top 3 changes, and top 3 improvements.

```powershell
npm run ux:copilot-pipeline
npm run ux:copilot-pipeline -- "busy vegetarian office worker"
```

For advanced Copilot CLI options, call the script directly:

```powershell
node scripts\copilot-ux-pipeline.mjs --model gpt-5 --keep-stages -- --allow-all-tools
```

## Gitignored Copilot issue loop

Use these commands when you want two independent schedules: one Copilot `-p` run creates implementation issue files, and another Copilot `-p` run fixes the next pending issue file. The generator focuses on workflow deltas, usability gaps, UI clarity, feedback states, mobile interaction issues, error recovery, and content affordances. Pending issues live as individual markdown files in `.copilot-issue-loop\issues\`, which is ignored by git.

```powershell
npm run ux:issue:generate
npm run ux:issue:generate -- "mobile first-run vegetarian planning"
npm run ux:issue:generate-loop
npm run ux:issue:fix-next
npm run ux:issue:fix-loop
npm run ux:issue:run-hour
npm run ux:issue:status
```

The generator and fixer both run nested Copilot prompt-mode commands with `--allow-all-tools`. The generator is read-only except for creating issue files in `.copilot-issue-loop\issues\`. The fixer is the writer: it moves a selected issue file to `.copilot-issue-loop\in-progress\`, implements it, validates with existing checks, commits and pushes the current branch after a successful fix, writes a completion report under `.copilot-issue-loop\completed\`, and deletes the issue file after `fixed` or `not_fixing`.

To run them as separate local schedules, start two terminals:

```powershell
while ($true) { npm run ux:issue:generate -- "mobile first-run UX"; Start-Sleep -Seconds 300 }
```

```powershell
npm run ux:issue:fix-loop
```

The fixer loop waits 60 seconds when no issue file exists. The fixer uses a gitignored lock so two fixer schedules do not work on different issues at the same time.

To run both loops together for one bounded window, use:

```powershell
npm run ux:issue:run-hour -- "mobile first-run UX"
```

`run-hour` starts one generator loop and one fixer loop in the same process. Each loop runs many Copilot prompt-mode sessions sequentially: when one generator session finishes, the next generator session starts; when one fixer session finishes, the next fixer session starts. There are at most two active Copilot sessions at any time: one generator and one fixer. By default the generator runs back-to-back, the fixer waits 120 seconds only when no pending issue file exists, and the single 60-minute limit applies to the entire script. When that limit is reached, the script stops both loops and terminates any active Copilot sessions.

## Project notes

- `docs\user-stories.md` documents supported workflows and API coverage.
- `docs\mobile-design-system.md` and `design\tokens.json` define the mobile-first design foundation.
- Generated plans are diagnostic and explicit: impossible macro, taste, or dietary combinations return rejection reasons instead of fake successful plans.
