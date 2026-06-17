# Evals

This directory contains strict product evals for Meal Plan Calculator.

## Layering

Eval infrastructure is intentionally separate from product eval domains:

- `evals\infra\` owns reusable mechanics: CLI argument parsing, JSON report IO, Copilot SDK session execution, and bias-resistant hill-climb comparison.
- `evals\meal-core\` owns product specifics: scenarios, deterministic meal gates, product report shapes, and meal-specific judge compaction/rubrics.

New eval suites should depend on `evals\infra\` for mechanics and keep their own domain rules in a sibling folder.

## Catalog and plan

`evals\catalog\` is the source of truth for eval families, owners, artifacts, hard gates, judge usage, and scenario status. It lists both implemented suites and planned coverage so product work can see the current strict bar and the next eval gaps without reading runner code.

## Meal core

Run deterministic meal-generation, realism, and variety gates:

```powershell
npm run eval -- meal-core
```

Run the full strict loop: capture/evaluate a candidate with the Copilot SDK judge, then hill-climb against the saved baseline:

```powershell
npm run eval -- meal-core judge
```

The first run creates `eval-results\meal-core-baseline.json` if it does not exist. Later runs compare the current app output as `eval-results\meal-core-candidate.json` against that baseline and write `eval-results\meal-core-hill-climb-report.json`.

Run only the judged report, without hill-climb:

```powershell
npm run eval -- meal-core judge-only
```

The judge uses `@github/copilot-sdk` and `CopilotClient.sendAndWait()` as the programmatic equivalent of `copilot -p`. It is skipped by default in `npm run eval -- meal-core` so local validation does not require Copilot credentials or consume quota.

Reports are written to:

```text
eval-results\meal-core-report.json
```

`eval-results\` is ignored by Git because reports are run artifacts.

## UI/ease

Run normalized UI quality coverage over Storybook stories, visual specs, snapshot baselines, and optional Copilot screenshot judging:

```powershell
npm run eval -- ui-quality
npm run eval -- ui-quality judge
```

Run task-trace and UI hard gates for Storybook-backed product workflows:

```powershell
npm run eval -- ui-ease
```

Useful options:

```powershell
npm run eval -- ui-ease base-url=http://127.0.0.1:6006 scenarios=first-run-generate output=eval-results\ui-ease-report.json
npm run eval -- ui-ease require-browser
npm run eval -- ui-ease eval-results\ui-ease-candidate.json no-exit-code
```

If Storybook is not running, browser-backed checks are skipped unless `--require-browser` is set.

Ask Copilot for a sanitized UI/ease improvement plan:

```powershell
npm run eval -- ui-ease improve eval-results\ui-ease-report.json
```

Dry-run the improve payload without invoking Copilot:

```powershell
npm run eval -- ui-ease improve eval-results\ui-ease-report.json dry-run
```

Run UI/ease through the same baseline/candidate hill-climb loop used by meal-core:

```powershell
npm run eval -- ui-ease loop
npm run eval -- ui-ease judge
npm run eval -- ui-ease improve-loop max-iterations=3
```

UI/ease reports and artifacts are written under:

```text
eval-results\ui-ease-report.json
eval-results\ui-ease-artifacts\
eval-results\ui-ease-improvement-plan.json
```

## Non-meal-core eval suites

Run the remaining deterministic product eval suites:

```powershell
npm run eval -- ease-of-use
npm run eval -- accessibility
npm run eval -- sharing-export
npm run eval -- failure-recovery
npm run eval -- regression-architecture
```

These write normalized reports under `eval-results\` and are intended to stay code-only/offline unless a command explicitly opts into a Copilot judge.

Each non-meal suite also has the full strict loop surface:

```powershell
npm run eval -- <suite> loop
npm run eval -- <suite> judge
npm run eval -- <suite> hill-climb eval-results\<suite>-baseline.json eval-results\<suite>-candidate.json
npm run eval -- <suite> improve eval-results\<suite>-report.json
npm run eval -- <suite> improve-loop max-iterations=3
```

Supported `<suite>` names are `ui-quality`, `ui-ease`, `ease-of-use`, `accessibility`, `sharing-export`, `failure-recovery`, and `regression-architecture`. `:judge` captures a candidate, compares it against a saved baseline with deterministic hard gates first, then runs the bias-balanced Copilot pairwise judge only when requested; hard-gate regressions still reject before judging.

## Copilot-guided improvement loop

The improvement loop asks Copilot for a patch plan from sanitized symptoms only:

```powershell
npm run eval -- meal-core improve eval-results\meal-core-report.json
```

Validate the sanitized payload and anti-gaming metadata without invoking Copilot:

```powershell
npm run eval -- meal-core improve eval-results\meal-core-report.json dry-run
```

It writes:

```text
eval-results\meal-core-improvement-plan.json
```

Anti-gaming controls:

- Copilot receives a sanitized symptom digest, not raw eval reports.
- Copilot does not receive eval source code, deterministic check implementations, or hidden rubric logic.
- The SDK session runs from an isolated empty working directory under `eval-results\`.
- The session uses no repository/file/shell tools (`toolAccess=none`).
- Config discovery, file hooks, host git context, skills, session store, and embedding retrieval are disabled.
- The command produces a fix plan only; it never applies code.

Loop:

```text
baseline eval report
  -> Copilot improve plan from sanitized symptoms
  -> one small human/agent code change
  -> candidate eval report
  -> hill-climb compare
  -> accept / reject / keep climbing
  -> promote accepted candidate to the next baseline, then repeat
```

Run the repeatable improvement orchestrator:

```powershell
npm run eval -- meal-core improve-loop
```

This command runs the judged eval loop, reads the hill-climb report, writes a sanitized improvement plan, and stops at `waiting-for-apply` unless an apply command is configured. This preserves the anti-gaming boundary: the planner sees sanitized symptoms only, and code-changing work is a separate step.

To let the repo-local applicator apply one sandboxed product-code change and continue:

```powershell
npm run eval -- meal-core improve-loop auto-apply max-iterations=3
```

Equivalent explicit form:

```powershell
npm run eval -- meal-core improve-loop apply-command="npm run eval -- meal-core apply-plan" max-iterations=3
```

`npm run eval -- meal-core apply-plan` invokes the local Copilot CLI in a sandbox copy that excludes `evals\` and `eval-results\`, then copies changed product files back. A custom apply command receives:

```text
COPILOT_EVAL_ITERATION
COPILOT_EVAL_IMPROVEMENT_PLAN
COPILOT_EVAL_CANDIDATE_REPORT
COPILOT_EVAL_HILL_CLIMB_REPORT
```

By default, accepted candidates and non-regressing candidates that fix hard failures are promoted to `eval-results\meal-core-baseline.json` before the next iteration. Use `--no-promote-progress` to disable progress promotion.

Run a fleet improvement loop that randomly picks one eval suite per outer iteration:

```powershell
npm run eval -- random improve-loop max-iterations=10
npm run eval -- random improve-loop suites=meal-core,ui-quality,accessibility max-iterations=10 auto-apply
```

The random loop writes `eval-results\random-improve-loop\report.json`. It runs one strict suite improve-loop per outer iteration, preserving the same hard-gate-first hill-climb and optional Copilot judge behavior. Use `seed=<value>` for reproducible suite selection, `no-judge` for offline deterministic smoke runs, and `suites=<comma-separated-list>` to limit the pool. Each iteration records `sourceChanges`: pre/post `git status --short` plus file mtime changes outside ignored artifact directories such as `eval-results\` and `node_modules\`.

## Hill climbing

Capture a baseline report before a product change:

```powershell
npm run eval -- meal-core eval-results\meal-core-baseline.json no-exit-code
```

After making a candidate change, capture a candidate report:

```powershell
npm run eval -- meal-core eval-results\meal-core-candidate.json no-exit-code
```

Compare them deterministically:

```powershell
npm run eval -- meal-core hill-climb eval-results\meal-core-baseline.json eval-results\meal-core-candidate.json
```

Run the same comparison with bias-balanced Copilot judging:

```powershell
npm run eval -- meal-core hill-climb eval-results\meal-core-baseline.json eval-results\meal-core-candidate.json judge passes=4
```

The hill-climb script is conservative:

- deterministic hard gates dominate and cannot be overridden by an LLM;
- candidate reports with new hard failures are rejected before judging;
- anonymous A/B labels avoid baseline/candidate anchoring;
- repeated passes swap A/B order to reduce left/right and first-position bias;
- prompts require evidence and scenario comparisons before numeric scores;
- compact equal-shaped summaries reduce verbosity and length bias;
- ties, parse failures, and weak judge majorities do not accept a candidate.

Hill-climb reports are written to:

```text
eval-results\meal-core-hill-climb-report.json
```

## Current strict bar

- Hard invariants fail immediately.
- LLM-judged rubrics require at least `9/10`.
- Meal-core scenarios cover default vegetarian, high-protein vegetarian, eggetarian, non-vegetarian, avoid-rule, grain-preference, impossible-bounds, manual-plan, locked-regenerate, and meal-target randomize workflows.
- Variety is very strict: diverse day structures across seeds, low repetition, culturally plausible, and target-passing.
