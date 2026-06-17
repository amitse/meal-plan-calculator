# Strict product eval harness

Meal Plan Calculator evals use the same three-layer boundary as the product architecture:

1. **Core deterministic facts** stay in `src/`, `data/`, and `schemas/`.
2. **Product workflow evals** call the adapter layer in `site/src/editable-planner.ts` instead of React UI or core internals.
3. **UI/ease evals** can use Storybook and Playwright artifacts, but React remains behind the adapter boundary.

The eval system also has its own independent infra/domain split:

1. **Eval infra** stays in `evals/infra/` and owns reusable mechanics: CLI parsing, report IO, Copilot SDK session execution, and pairwise hill-climb orchestration.
2. **Eval domains** live in sibling folders such as `evals/meal-core/` and own product-specific scenarios, deterministic checks, prompt compaction, and rubrics.
3. Domain evals may call product adapter APIs, but infra must not import product code, React code, or meal-specific types.

The first eval slice is `evals/meal-core`. It is intentionally stricter than normal unit tests:

- hard-fail diet, avoid-rule, target, meal-pattern, serving-unit, and impossible-plan invariants;
- require very strict generation variety across seeds;
- prefer practical Indian meal plans over merely numeric macro satisfaction;
- write auditable JSON reports to `eval-results/`;
- optionally use `@github/copilot-sdk` as a Copilot-powered LLM judge.

The LLM judge is not a replacement for deterministic gates. It only runs after hard checks for a scenario pass, receives structured plan JSON plus human-readable summaries and seed comparison tables, and must score at least `9/10` when enabled.

Copilot-guided improvement is allowed, but the fix-planning session must be blind to eval internals. It receives only a domain-sanitized symptom digest and runs in an isolated SDK session with no repository tools, no file/shell access, no config discovery, no host git context, no skills, no session store, and no embedding retrieval. The session may propose a patch plan, but it must not inspect or infer hidden eval code, and it must not apply changes directly.

By default, evals run offline without Copilot credentials:

```powershell
npm run eval -- meal-core
```

To enable the Copilot judge:

```powershell
npm run eval -- meal-core judge
```

or:

```powershell
$env:COPILOT_EVAL_ENABLE_LLM = "1"
npm run eval -- meal-core
```

The strict deterministic suite currently doubles as the hill-climbing target. If it fails, the report should be treated as product feedback, not as a reason to lower the bar.

Hill climbing compares a saved baseline report with a saved candidate report:

```powershell
npm run eval -- meal-core hill-climb eval-results\meal-core-baseline.json eval-results\meal-core-candidate.json judge passes=4
```

The comparison protocol is deliberately conservative:

- deterministic hard-gate regressions reject the candidate before any LLM judgment;
- reports are blinded as Option A and Option B so the judge does not know baseline vs candidate;
- repeated judge passes swap A/B positions to reduce left/right and first-option bias;
- prompts require observations and per-scenario evidence before scores or winners;
- report summaries use the same compact shape for both sides to reduce verbosity and length bias;
- ties, parse failures, and weak majorities default to rejection or continued hill climbing rather than acceptance.
