export type EvalFamilyId =
  | "meal-core"
  | "ui-quality-screenshots"
  | "ease-of-use-task-traces"
  | "accessibility-hard-gates"
  | "sharing-export"
  | "failure-recovery"
  | "regression-architecture-gates";

export type EvalImplementationStatus = "implemented" | "planned";

export type EvalArtifactKind =
  | "json-report"
  | "screenshot"
  | "playwright-trace"
  | "storybook-story"
  | "unit-test"
  | "source"
  | "export-file"
  | "accessibility-report"
  | "command-output";

export type EvalJudgeUsage = "none" | "optional" | "planned";

export interface EvalOwnerCommand {
  command: string;
  description: string;
}

export interface EvalArtifact {
  id: string;
  kind: EvalArtifactKind;
  description: string;
  status: EvalImplementationStatus;
  path?: string;
}

export interface EvalHardGate {
  id: string;
  description: string;
  status: EvalImplementationStatus;
  source?: string;
}

export interface EvalJudgeDimension {
  id: string;
  label: string;
  description: string;
  status: EvalImplementationStatus;
  threshold?: string;
}

export interface EvalJudgePlan {
  usage: EvalJudgeUsage;
  description: string;
  dimensions: readonly EvalJudgeDimension[];
}

export interface EvalScenarioPlan {
  id: string;
  title: string;
  description: string;
  status: EvalImplementationStatus;
  artifacts: readonly string[];
  hardGates: readonly string[];
  judgeDimensions?: readonly string[];
}

interface EvalSuiteFamilyBase {
  id: EvalFamilyId;
  title: string;
  description: string;
  status: EvalImplementationStatus;
  artifacts: readonly EvalArtifact[];
  hardGates: readonly EvalHardGate[];
  judge: EvalJudgePlan;
  scenarios: readonly EvalScenarioPlan[];
  relatedCommands?: readonly EvalOwnerCommand[];
}

export type EvalSuiteFamily =
  | (EvalSuiteFamilyBase & {
      status: "implemented";
      ownerCommand: EvalOwnerCommand;
    })
  | (EvalSuiteFamilyBase & {
      status: "planned";
      ownerCommand?: never;
    });
