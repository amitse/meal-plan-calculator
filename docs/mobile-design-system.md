# Mobile-first Design System

This is the UI foundation for the future static site/app layer. It intentionally stops before implementation details for GitHub Pages.

## Taste direction

- **Taste pack route**: `warm-modern`
- **Support**: light borrowing from `soft` for approachable form controls and micro-interactions
- **Reference brand**: Pehle Health (`https://pehlehealth.com/`)
- **Product type**: mobile-first nutrition plan generator for Indian eating patterns
- **Audience**: one person planning meals around calories, optional macros, dietary level, taste preferences, and practical plate rules
- **Energy**: calm, confident, useful; not gamified, not clinical, not dashboard-heavy
- **Density**: medium-low on mobile; each screen should have one dominant decision

## Extracted design tokens

Canonical machine-readable tokens live in `design/tokens.json`.

The source site uses:

- dark-first background `#141414`
- alternate charcoal `#1c1c1c`
- warm off-white ink `#F0EFEB`
- light theme background `#F7F6F2`
- light alternate surface `#EFEDE8`
- accessible thin editorial borders `#4A433A` / `#C9C3B8`
- serif display: `Cormorant Garamond`
- sans UI: `DM Sans`
- uppercase micro-labels with wide tracking
- simple fade-up reveals and restrained hover states

## Mobile-first principles

1. **One decision per screen**: calories, macros, dietary level, tastes, generated result, and swaps should be separate steps or clearly separated sections.
2. **Bottom action over desktop nav**: primary action belongs in a sticky bottom action bar on phones.
3. **No compressed dashboard**: use summary strips and expandable meals instead of dense tables.
4. **Touch targets first**: controls should be at least 44px high; primary buttons 48–52px.
5. **Meal cards are functional, not decorative**: use cards only for generated meals, swap choices, and warning states.
6. **Pattern clarity**: cooked meals must visibly show plate roles: cooking fat, carb, protein, vegetables.
7. **Trust over spectacle**: use warm typography, exact numbers, and practical copy instead of flashy food graphics.
8. **Preference recovery**: if a plan fails, show which requirement blocked it and offer one clear relaxation path.

## UI token usage

### Color roles

| Role | Dark | Light | Use |
| --- | --- | --- | --- |
| Background | `#141414` | `#F7F6F2` | App/page base |
| Surface | `#1c1c1c` | `#EFEDE8` | Panels, result sections |
| Ink | `#F0EFEB` | `#141414` | Headings and primary text |
| Body | `#C8C2B7` | `#2A2A2A` | Body copy; AA/AAA contrast on base backgrounds |
| Muted | `#ACA394` | `#5E574E` | Hints, labels, secondary metadata; still AA-safe |
| Border | `#4A433A` | `#C9C3B8` | Dividers and low chrome with visible contrast |

### Typography roles

| Role | Font | Treatment |
| --- | --- | --- |
| Display | Cormorant Garamond | 300 weight, tight line-height, intentional line breaks |
| Section title | Cormorant Garamond | 34–54px equivalent, mobile clamp |
| Body | DM Sans | 300–400, 1.65–1.85 line-height |
| Label | DM Sans | uppercase, 0.16–0.22em tracking |
| Numbers | Cormorant Garamond | tabular feel, large but not shouty |

## Core mobile components

### 1. App frame

- Top: compact title row with current step and optional theme toggle.
- Bottom: sticky action bar with one primary CTA and one secondary text action.
- Desktop later can add a left rail or top navigation, but mobile should remain the source of truth.

### 2. Target input

- Calories is required and visually dominant.
- Optional macros live in an expandable section: protein, carbs, fat, fiber, saturated fat.
- Protein input defaults to target-band semantics: a number means approximately +/- 5g.
- Carbs and fat may be ranges or target bands.
- Inline helper text should explain whether a number means minimum, maximum, or target.

### 3. Dietary level selector

- Three segmented options: Vegetarian, Eggetarian, Non-vegetarian.
- Microcopy must clarify: vegetarian allows dairy, excludes eggs/meat/fish.
- Eggetarian allows eggs, excludes meat/fish.

### 4. Taste preference chips

- Prefer: roti, rice, oats, paneer, whey, tofu, eggs, chicken/fish.
- Avoid: paneer, whey, eggs, chicken/fish, peanut butter.
- Chips must be reversible and clearly grouped by exchange group.
- If a preference cannot be honored, show it as “not used” rather than silently hiding the conflict.

### 5. Generated plan summary

- Top summary: calories, protein, carbs, fat.
- Secondary: fiber, saturated fat, unknown flags.
- Status copy should be specific: “Meets target” / “Protein short by 8g” / “No vegetarian protein option left after exclusions.”

### 6. Meal accordion

- Breakfast, lunch, snack, dinner.
- Each cooked meal shows role tags: cooking fat, carb, protein, vegetables.
- Each row shows quantity, selected option, and calories/protein.
- Swap action opens a bottom sheet.

### 7. Swap bottom sheet

- Shows exchange options in one role group.
- Respect dietary level and exclusions.
- Preferred options appear first.
- Each option shows quantity and known calories/protein; unknown values are explicit.

### 8. Failure/recovery state

- Never show a fake plan when `selected` is absent.
- Show rejected reasons from the API.
- Offer recovery actions:
  - loosen macro bound
  - remove exclusion
  - switch dietary level
  - choose another preferred protein

## Screen sequence for the static site/app

1. **Start**: “Build a realistic Indian meal plan.”
2. **Targets**: calories first, optional macro expansion.
3. **Food rules**: dietary level and taste preferences.
4. **Generate**: loading/progress state with “building plate roles.”
5. **Result**: daily summary and meal accordions.
6. **Customize**: swap sheet and regenerate.
7. **Failure**: explicit blockers and recovery actions.

## Interaction and motion

- Use fade-content / quiet reveal patterns from React Bits.
- Use count-up only for final nutrition totals.
- Use light press compression on primary buttons.
- Use accordion height transitions for meal details.
- Respect `prefers-reduced-motion`.
- Avoid custom cursor on mobile.
- Avoid heavy GSAP or WebGL for the app shell.

## Static site implication

The future GitHub Pages site should not start as a marketing landing page. It should start as a mobile-first tool with a small warm-modern intro, then the target-input workflow. The marketing/proof sections can come later, below the tool or on a separate page.
