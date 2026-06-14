# Mobile Usability Survey

Ten independent review agents evaluated the mobile planner flow after the first declutter pass.

## Aggregate result

- Average score: about **6.7 / 10**
- Consensus: copy was shorter, but the mobile flow still had too much conceptual clutter.

## Repeated blockers

1. Pre-generated result/preview appeared before the user tapped generate.
2. “More options” exposed too many controls at once.
3. Result rows were too detailed for mobile scanning.
4. Hidden radio/checkbox chips needed visible focus treatment.
5. Dietary level should influence the visible protein choices.

## Changes applied

1. Removed the pre-generated result and preview from first load.
2. Kept the first screen to calories, dietary level, and generate.
3. Split optional controls into nested Protein, Macros, Foods, and Presets disclosures.
4. Filtered protein choices by dietary level.
5. Added visible focus outlines to chip-style controls.
6. Reduced meal row detail to item name and quantity.
7. Added result focus/`aria-live` behavior after generation.

## Second survey

A second 10-agent survey after the first fix still rated the mobile UI around **6–8 / 10**.

Repeated remaining blockers:

1. Header and step chrome still delayed the actual calorie input.
2. Protein minimum was important enough to be visible, especially for high-protein users.
3. “More options” still mixed too many ideas.
4. Low-vision agents flagged small uppercase labels and hidden focus treatment.
5. Result rows were improved, but the first screen still needed fewer layers.

Second-pass changes:

1. Removed the hero section and visible step number.
2. Made the first screen start with only the app title, calories, protein, dietary level, and generate.
3. Renamed the optional drawer to **Customize**.
4. Split customization into **Food**, **Macros**, and **Presets**.
5. Increased label size/weight and restored visible focus treatment.
6. Kept result details compact and hidden until the user generates.
