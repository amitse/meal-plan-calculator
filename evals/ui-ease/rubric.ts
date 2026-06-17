export const uiEaseJudgeThreshold = 9;

export const uiEaseRubricDimensions = [
  {
    id: "compact-calculator-not-marketing",
    label: "Compact calculator, not marketing",
    prompt: "The screen should feel like a focused meal-plan calculator/workbench, not a landing page, sales funnel, or decorative brochure.",
  },
  {
    id: "visual-hierarchy",
    label: "Visual hierarchy",
    prompt: "Primary inputs, generated plan, validation/recovery messages, and next actions must be instantly scannable with clear emphasis and grouping.",
  },
  {
    id: "copy-brevity",
    label: "Copy brevity",
    prompt: "Copy should be short, task-oriented, and specific; reject verbose hero language, vague encouragement, or explanatory filler.",
  },
  {
    id: "recovery-clarity",
    label: "Recovery clarity",
    prompt: "When a plan cannot be generated or needs correction, the UI must clearly say what changed, what failed, and the next action a user can take.",
  },
  {
    id: "workflow-obviousness",
    label: "Workflow obviousness",
    prompt: "A new user should understand the path from targets to generated meals to edits/regeneration without hunting for controls.",
  },
  {
    id: "mobile-density-without-clutter",
    label: "Mobile density without clutter",
    prompt: "Small viewports should preserve calculator density and useful above-the-fold content without cramped controls, hidden essentials, or noisy stacking.",
  },
  {
    id: "theme-consistency",
    label: "Theme consistency",
    prompt: "Color, spacing, component treatments, elevation, typography, and state styling should feel like one coherent product surface.",
  },
  {
    id: "premium-but-utilitarian-craft",
    label: "Premium-but-utilitarian craft",
    prompt: "The UI should feel polished and intentional while staying fast, practical, data-forward, and low-friction.",
  },
] as const;

export const uiEaseEvidenceRubric = {
  screenshots: [
    "Judge only visible UI evidence from provided screenshots, viewport metadata, OCR/visible text, and screenshot observations.",
    "Compare desktop and mobile evidence when present; do not assume responsive quality from a single viewport.",
    "Treat missing, stale, cropped, unreadable, or obviously non-representative screenshots as evidence gaps that lower the score.",
    "Do not reward hidden implementation details, offscreen content, or visually decorative features that do not improve calculator use.",
  ],
  traces: [
    "Use traces to judge whether the user workflow is obvious, recoverable, and low-friction from initial inputs through plan generation and edits.",
    "Treat console errors, blocked interactions, ambiguous control labels, repeated retries, or recovery dead ends as severe ease-of-use failures.",
    "Prefer direct evidence from observed steps over inferred intent; if the trace does not prove a workflow works, mark the gap explicitly.",
  ],
} as const;

export const uiEaseHardGatePrinciples = [
  "Deterministic UI hard gates are the first authority and cannot be overridden by the LLM judge.",
  "If hard gates fail, the judge must be skipped or fail closed before aesthetic scoring.",
  "LLM judging is only for subjective UI/ease quality after required screenshots, traces, accessibility, and interaction gates are acceptable.",
] as const;

export const uiEaseJudgeAntiGamingBoundaries = [
  "Score real user experience, not likely eval predicates.",
  "Do not ask for repository files, eval source code, deterministic check implementations, or hidden rubrics.",
  "Do not reward UI that merely hides problems from screenshots or traces while making the calculator less useful.",
  "Penalize marketing-like polish, decorative density, or copy inflation that makes the calculator harder to use.",
] as const;

export function buildUiEaseRubricText() {
  return [
    `Pass threshold: ${uiEaseJudgeThreshold}/10. Anything below a strict premium-but-utilitarian calculator bar fails.`,
    "",
    "Rubric dimensions:",
    ...uiEaseRubricDimensions.map((dimension, index) => `${index + 1}. ${dimension.label}: ${dimension.prompt}`),
    "",
    "Screenshot evidence rules:",
    ...uiEaseEvidenceRubric.screenshots.map((rule) => `- ${rule}`),
    "",
    "Trace evidence rules:",
    ...uiEaseEvidenceRubric.traces.map((rule) => `- ${rule}`),
    "",
    "Hard-gate principles:",
    ...uiEaseHardGatePrinciples.map((principle) => `- ${principle}`),
    "",
    "Anti-gaming boundaries:",
    ...uiEaseJudgeAntiGamingBoundaries.map((boundary) => `- ${boundary}`),
  ].join("\n");
}
