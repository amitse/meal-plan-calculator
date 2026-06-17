export type UiEaseStatus = "pass" | "fail" | "skip";

export interface UiEaseViewport {
  width: number;
  height: number;
  name: string;
}

export type UiEaseSelector =
  | { kind: "css"; value: string }
  | { kind: "label"; name: string; exact?: boolean }
  | { kind: "placeholder"; name: string; exact?: boolean }
  | { kind: "role"; role: string; name?: string; exact?: boolean }
  | { kind: "text"; value: string; exact?: boolean };

export type BrowserTraceAction =
  | "click"
  | "expect-visible"
  | "fill"
  | "goto-story"
  | "press"
  | "reload"
  | "screenshot"
  | "select"
  | "wait-for-visible"
  | "wait-story-ready";

export interface BrowserTraceStep {
  id: string;
  action: BrowserTraceAction;
  label: string;
  selector?: UiEaseSelector;
  storyId?: string;
  value?: string;
  timeoutMs?: number;
  artifactId?: string;
}

export interface ArtifactExpectation {
  id: string;
  kind: "screenshot" | "trace";
  required: boolean;
  description: string;
}

export interface UiTraceScenario {
  id: string;
  label: string;
  taskTrace:
    | "first-run-generate"
    | "manual-add-foods"
    | "adjust-regenerate"
    | "blocked-plan-recovery"
    | "swap-edit-serving"
    | "share-url-roundtrip"
    | "lock-regenerate"
    | "randomize-meal-target"
    | "export-sheet-actions"
    | "theme-switch";
  storyId: string;
  description: string;
  viewport: UiEaseViewport;
  tags: string[];
  steps: BrowserTraceStep[];
  artifactExpectations: ArtifactExpectation[];
}

export interface HardGateDefinition {
  id: string;
  label: string;
  description: string;
  phase: "initial" | "final";
  scenarioIds: "all" | string[];
}

export interface UiEaseCheckResult {
  id: string;
  label: string;
  status: UiEaseStatus;
  severity?: "hard" | "judge";
  message: string;
  evidence?: unknown;
}

export interface UiEaseScenarioResult {
  scenarioId: string;
  label: string;
  status: UiEaseStatus;
  checks: UiEaseCheckResult[];
  artifactPaths: string[];
}

export interface UiEaseEvalReport {
  generatedAt: string;
  baseUrl: string;
  browserAvailable: boolean;
  status: UiEaseStatus;
  scenarios: UiEaseScenarioResult[];
  results: Array<{
    scenarioId: string;
    status: UiEaseStatus;
    deterministicScore: number;
    checks: Array<UiEaseCheckResult & { severity: "hard" | "judge" }>;
  }>;
  hardGates: HardGateDefinition[];
}
