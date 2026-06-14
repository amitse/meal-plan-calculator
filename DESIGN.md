# Design direction

Meal Plan Calculator should feel like a compact, warm, utilitarian planning tool. Keep the previous mobile-first aesthetic: dark charcoal canvas, warm off-white text, thin dividers, serif display type, and dense-but-readable controls.

## Core principle

The app is a calculator, not a marketing page. Prioritize fast input, clear results, and practical meal editing over brand copy or decorative layout.

## Non-goals

- Do not add a large hero section.
- Do not add onboarding paragraphs, first-run cards, or explanatory panels above the primary inputs.
- Do not push the calorie and protein fields below the first viewport on mobile.
- Do not introduce bright accents, gradients, glassmorphism, heavy shadows, or stock imagery.
- Do not rewrite the interface around a desktop dashboard or marketing landing page pattern.

## Visual system

- **Canvas:** dark warm charcoal, close to `#141414`.
- **Surface:** mostly transparent panels with thin warm borders; use filled surfaces only for inputs, warnings, presets, and chips.
- **Ink:** warm off-white, close to `#F0EFEB`.
- **Muted text:** warm gray, close to `#ACA394`.
- **Accent:** scarce warm amber only for warnings, lock notices, and recovery emphasis.
- **Borders:** thin warm brown-gray dividers. Prefer `border-top` and `border-bottom` over boxed cards.
- **Shadows:** avoid them. If needed, use very soft low-opacity shadows only.

## Typography

- Keep the existing serif/sans pairing:
  - Display: `Cormorant Garamond`
  - UI/body: `DM Sans`
- Headlines should be short and compact. The current `Plan` header is acceptable.
- Labels can use small uppercase tracking, but avoid over-labeling every section.
- Numbers should be easy to scan; use tabular numeric behavior where useful.

## Layout rules

- Mobile is the source of truth.
- Keep the first viewport focused on:
  1. title
  2. calories
  3. protein
  4. diet selector
  5. Generate action
- Customization belongs in collapsed `details` sections.
- Generated meal rows should appear before meal tools.
- Keep meal tools collapsed by default so food remains the focus.
- Avoid adding new persistent panels unless they replace existing UI.

## Copy rules

- Use short action labels: `Generate`, `Customize`, `Meal tools`, `Randomize`, `Share`.
- Avoid marketing language and broad claims.
- Helper copy must fit on one short line where possible.
- Error and recovery text can be specific, but should appear only after a failing result.

## Interaction rules

- Touch targets should remain at least 44px high.
- Buttons need subtle pressed feedback via `transform`, not layout changes.
- Focus rings must remain visible.
- Accordions should be native `details`/`summary` unless there is a strong reason to custom-build them.
- Avoid scroll-jacking or large entry animations. Quiet fade/translate is enough.

## Future redesign checklist

Before changing UI structure, verify:

1. Calories and protein remain visible without scrolling on a typical phone.
2. No new explanatory copy appears above the primary fields.
3. The Generate action remains reachable and visually dominant.
4. Meal items are not pushed below filters, targets, or toolbars.
5. The design still reads as a compact calculator, not a landing page.
