# Mobile UI Workflows

These workflows translate the existing library stories into mobile-first UI behavior.

## Workflow A: Generate from calories only

1. User opens the app.
2. User enters calories.
3. User keeps macros collapsed.
4. User selects dietary level.
5. User taps **Generate meal plan**.
6. App calls `generateMealPlan({ calories, dietaryLevel })`.
7. App shows selected plan if present.
8. If no selected plan exists, app shows rejected reasons and recovery actions.

## Workflow B: Generate from calories plus macros

1. User enters calories.
2. User expands optional macros.
3. User enters protein minimum.
4. User optionally enters carb/fat/fiber/saturated-fat bounds.
5. App shows each bound as a chip before generation.
6. App calls `generateMealPlan(...)`.
7. App shows target pass/fail per macro in the result summary.

## Workflow C: Customize taste before generation

1. User selects “Prefer rice” or “Prefer roti.”
2. User selects preferred protein choices such as paneer, whey, tofu, eggs, or chicken/fish.
3. User excludes foods they do not want.
4. App calls `generateMealPlan({ preferences })`.
5. Preferred options appear first when they satisfy constraints.
6. If preferences conflict with dietary level, app shows rejection reasons.

## Workflow D: Vegetarian / eggetarian / non-vegetarian

1. User picks one dietary level.
2. UI shows a one-line explanation.
3. Vegetarian generation excludes eggs, meat, and fish.
4. Eggetarian generation includes eggs but excludes meat and fish.
5. Non-vegetarian generation includes all.
6. The result should not display hidden invalid options in swap sheets.

## Workflow E: Review generated plan

1. User sees a top nutrition summary.
2. User sees status: pass, fail, or unknown values present.
3. User expands meals one at a time.
4. Each cooked meal shows plate roles:
   - cooking fat
   - carb
   - protein
   - vegetables
5. Snack does not require oil/ghee.

## Workflow F: Swap one meal choice

1. User taps a food or exchange row.
2. App opens a bottom sheet.
3. Sheet lists allowed options from that exchange group.
4. Preferred options appear first.
5. Invalid dietary options are not shown.
6. User picks one option.
7. App recalculates totals and evaluation.

## Workflow G: Recover from failure

1. App receives no `selected` plan.
2. App displays `rejected` reasons exactly enough to act on.
3. App maps common failures to actions:
   - no protein option left -> remove exclusion or change dietary level
   - calories impossible -> widen calorie tolerance
   - fat too strict -> relax fat max
   - protein too high -> add preferred high-protein option or loosen target
4. User updates inputs and regenerates.

## Workflow H: Loading, empty, and error states

### Loading

- Preserve the form and show inline progress text: “Building plate roles,” “Checking dietary filters,” “Balancing calories.”

### Empty

- If no target is entered, show the calories field and short helper copy.

### Error

- If API throws due to an invalid ID or unit mismatch, show a developer-grade error in development and a user-safe explanation in production.

## Mobile navigation model

- Primary path is vertical step flow.
- Avoid a desktop-like top nav on mobile.
- Bottom action bar persists on input and result screens.
- Secondary actions sit as text links above the bottom bar.

