# Three-layer planner architecture

The nutrition planning calculator uses three layers with one-way dependencies:

1. **Core domain and planner (`src/`, `data/`, `schemas/`)** owns schema-defined **MasterData**, nutrition calculations, evaluations, **DailyPlanTemplates**, and **PlanGenerator** behavior. It is UI-free: no React, DOM, browser storage, routing, or app workflow state.
2. **Application adapter and services (`site/src/editable-planner.ts`, `site/src/export-plan.ts`)** translate product workflows into core planner calls. This layer owns editable-plan form state, share-state encoding/decoding, diet/preference transformations, locked-item handling, swap/edit/add/remove operations, display quantities, export/share formatting, and recovery messages.
3. **React UI and stories (`site/src/main.tsx`, `site/src/App.stories.tsx`)** render controls, dialogs, feedback, and browser integrations. UI code talks to the planner through the application adapter/service layer instead of importing `src/` directly.

Import direction is enforced by `tests/architecture.test.ts`: core modules must not import site code, and React/story files must not skip the adapter by importing `../../src/*`. **PlanGenerator** still generates candidate **DailyPlans** by resolving **DailyPlanTemplates** and adjusting quantities against constraints such as calories and minimum protein; it does not invent arbitrary meals from scratch, and quantity adjustment respects unit discreteness.
