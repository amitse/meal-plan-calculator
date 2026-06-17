import { join } from "node:path";
import type { CopilotClient } from "@github/copilot-sdk";
import { argValue, hasToken, positionalArgs } from "./cli.js";
import { isJudgeEnabled, resolveCopilotEvalModel, sendCopilotEvalPrompt, withCopilotEvalClient } from "./copilot.js";
import { readJsonReport, writeJsonReport } from "./report-io.js";

export type InfraEvalStatus = "pass" | "fail" | "skip";
export type HillClimbRecommendation = "accept" | "keep-climbing" | "reject";

type Side = "A" | "B";
type PairwiseWinner = Side | "tie";
type VersionLabel = "baseline" | "candidate";

export interface ComparableEvalCheck {
  id: string;
  severity: string;
  status: InfraEvalStatus;
}

export interface ComparableScenarioResult {
  scenarioId: string;
  status: InfraEvalStatus;
  deterministicScore: number;
  checks: ComparableEvalCheck[];
}

export interface ComparableEvalReport {
  status: InfraEvalStatus;
  results: ComparableScenarioResult[];
}

export interface HillClimbAdapter<TReport extends ComparableEvalReport> {
  evalName: string;
  productName: string;
  defaultBaselinePath: string;
  defaultCandidatePath: string;
  defaultOutputPath: string;
  rubricDimensions: string[];
  compactReportForJudge: (report: TReport) => unknown;
  decisiveFailureDescription?: string;
  hardFailureIds?: (result: TReport["results"][number] | undefined) => string[];
  keepClimbingMessage?: string;
  printLabel?: string;
}

export interface HillClimbConfig {
  baselinePath: string;
  candidatePath: string;
  outputPath: string;
  judgeEnabled: boolean;
  passes: number;
  acceptThreshold: number;
  model?: string;
  noExitCode: boolean;
}

export interface DeterministicScenarioDelta {
  scenarioId: string;
  baselineStatus: InfraEvalStatus | "missing";
  candidateStatus: InfraEvalStatus | "missing";
  baselineScore: number | undefined;
  candidateScore: number | undefined;
  fixedHardFailures: string[];
  newHardFailures: string[];
  remainingHardFailures: string[];
}

export interface DeterministicComparison {
  baselineHardFailures: number;
  candidateHardFailures: number;
  fixedHardFailures: number;
  newHardFailures: number;
  candidateIsStrictPass: boolean;
  candidateIsWorse: boolean;
  scenarioDeltas: DeterministicScenarioDelta[];
}

export interface PairwiseJudgeResponse {
  observations: string[];
  scenarioComparisons: Array<{
    scenarioId: string;
    evidence: string;
    winner: PairwiseWinner;
  }>;
  scoreA: number;
  scoreB: number;
  winner: PairwiseWinner;
  confidence: number;
  biasChecks: string[];
}

export interface PairwiseJudgePass {
  passIndex: number;
  optionA: VersionLabel;
  optionB: VersionLabel;
  mappedWinner: VersionLabel | "tie" | "parse-failed";
  rawWinner?: PairwiseWinner;
  scoreA?: number;
  scoreB?: number;
  confidence?: number;
  observations?: string[];
  scenarioComparisons?: PairwiseJudgeResponse["scenarioComparisons"];
  biasChecks?: string[];
  rawResponse: string;
}

export interface PairwiseJudgeSummary {
  status: InfraEvalStatus;
  enabled: boolean;
  model: string;
  passesRequested: number;
  validPasses: number;
  candidateWins: number;
  baselineWins: number;
  ties: number;
  parseFailures: number;
  candidateWinRate: number;
  acceptThreshold: number;
  positionBalance: {
    candidateAsA: number;
    candidateAsB: number;
  };
  passes: PairwiseJudgePass[];
}

export interface HillClimbReport {
  generatedAt: string;
  baselinePath: string;
  candidatePath: string;
  recommendation: HillClimbRecommendation;
  rationale: string[];
  deterministic: DeterministicComparison;
  judge: PairwiseJudgeSummary;
}

export async function runHillClimbCli<TReport extends ComparableEvalReport>(
  adapter: HillClimbAdapter<TReport>,
  args = process.argv.slice(2),
  env = process.env,
) {
  const config = parseHillClimbConfig(adapter, args, env);
  const baseline = await readJsonReport<TReport>(config.baselinePath);
  const candidate = await readJsonReport<TReport>(config.candidatePath);
  const deterministic = compareDeterministicReports(adapter, baseline, candidate);
  const judge = await runPairwiseJudgeIfEnabled(adapter, config, baseline, candidate, deterministic);
  const recommendation = recommend(adapter, deterministic, judge);

  const report: HillClimbReport = {
    generatedAt: new Date().toISOString(),
    baselinePath: config.baselinePath,
    candidatePath: config.candidatePath,
    recommendation: recommendation.value,
    rationale: recommendation.rationale,
    deterministic,
    judge,
  };

  await writeJsonReport(config.outputPath, report);
  printHillClimbReport(adapter, report, config.outputPath);

  if (report.recommendation === "reject" && !config.noExitCode) {
    process.exitCode = 1;
  }

  return report;
}

export function parseHillClimbConfig<TReport extends ComparableEvalReport>(
  adapter: HillClimbAdapter<TReport>,
  args: string[],
  env: NodeJS.ProcessEnv,
): HillClimbConfig {
  const requestedPasses = Number.parseInt(argValue(args, "--passes") ?? env.COPILOT_EVAL_HILL_CLIMB_PASSES ?? "4", 10);
  const passes = Number.isFinite(requestedPasses) ? Math.max(2, requestedPasses) : 4;
  const acceptThreshold = Number.parseFloat(argValue(args, "--accept-threshold") ?? env.COPILOT_EVAL_HILL_CLIMB_ACCEPT_THRESHOLD ?? "0.6");
  const positional = positionalArgs(args, {
    flagsWithValues: ["--baseline", "--candidate", "--output", "--passes", "--accept-threshold", "--model"],
    ignoredBareTokens: ["judge", "no-judge", "no-exit-code"],
    ignoredAssignments: ["baseline", "candidate", "output", "passes", "accept-threshold", "model"],
  });

  return {
    baselinePath: argValue(args, "--baseline") ?? env.COPILOT_EVAL_BASELINE ?? positional[0] ?? adapter.defaultBaselinePath,
    candidatePath: argValue(args, "--candidate") ?? env.COPILOT_EVAL_CANDIDATE ?? positional[1] ?? adapter.defaultCandidatePath,
    outputPath: argValue(args, "--output") ?? env.COPILOT_EVAL_HILL_CLIMB_OUTPUT ?? adapter.defaultOutputPath,
    judgeEnabled: isJudgeEnabled(args, env),
    passes,
    acceptThreshold: Number.isFinite(acceptThreshold) ? acceptThreshold : 0.6,
    model: resolveCopilotEvalModel(argValue(args, "--model") ?? env.COPILOT_EVAL_JUDGE_MODEL),
    noExitCode: hasToken(args, "--no-exit-code") || env.COPILOT_EVAL_NO_EXIT_CODE === "1",
  };
}

export function compareDeterministicReports<TReport extends ComparableEvalReport>(
  adapter: HillClimbAdapter<TReport>,
  baseline: TReport,
  candidate: TReport,
): DeterministicComparison {
  const baselineById = new Map(baseline.results.map((result) => [result.scenarioId, result]));
  const candidateById = new Map(candidate.results.map((result) => [result.scenarioId, result]));
  const scenarioIds = [...new Set([...baselineById.keys(), ...candidateById.keys()])].sort();
  const scenarioDeltas = scenarioIds.map((scenarioId) => {
    const baselineResult = baselineById.get(scenarioId);
    const candidateResult = candidateById.get(scenarioId);
    const baselineFailures = new Set(hardFailureIds(adapter, baselineResult));
    const candidateFailures = new Set(hardFailureIds(adapter, candidateResult));

    return {
      scenarioId,
      baselineStatus: baselineResult?.status ?? "missing",
      candidateStatus: candidateResult?.status ?? "missing",
      baselineScore: baselineResult?.deterministicScore,
      candidateScore: candidateResult?.deterministicScore,
      fixedHardFailures: [...baselineFailures].filter((id) => !candidateFailures.has(id)).sort(),
      newHardFailures: [...candidateFailures].filter((id) => !baselineFailures.has(id)).sort(),
      remainingHardFailures: [...candidateFailures].filter((id) => baselineFailures.has(id)).sort(),
    } satisfies DeterministicScenarioDelta;
  });

  const baselineHardFailures = baseline.results.reduce((sum, result) => sum + hardFailureIds(adapter, result).length, 0);
  const candidateHardFailures = candidate.results.reduce((sum, result) => sum + hardFailureIds(adapter, result).length, 0);
  const fixedHardFailures = scenarioDeltas.reduce((sum, delta) => sum + delta.fixedHardFailures.length, 0);
  const newHardFailures = scenarioDeltas.reduce((sum, delta) => sum + delta.newHardFailures.length, 0);

  return {
    baselineHardFailures,
    candidateHardFailures,
    fixedHardFailures,
    newHardFailures,
    candidateIsStrictPass: candidate.status === "pass" && candidateHardFailures === 0,
    candidateIsWorse: candidateHardFailures > baselineHardFailures || newHardFailures > 0,
    scenarioDeltas,
  };
}

function hardFailureIds<TReport extends ComparableEvalReport>(
  adapter: HillClimbAdapter<TReport>,
  result: TReport["results"][number] | undefined,
) {
  if (adapter.hardFailureIds) return adapter.hardFailureIds(result);

  return result?.checks
    .filter((check) => check.severity === "hard" && check.status === "fail")
    .map((check) => check.id) ?? ["missing-scenario"];
}

async function runPairwiseJudgeIfEnabled<TReport extends ComparableEvalReport>(
  adapter: HillClimbAdapter<TReport>,
  config: HillClimbConfig,
  baseline: TReport,
  candidate: TReport,
  deterministic: DeterministicComparison,
): Promise<PairwiseJudgeSummary> {
  if (!config.judgeEnabled) {
    return skippedJudge(config, "Pairwise Copilot judge skipped. Re-run with judge or COPILOT_EVAL_ENABLE_LLM=1.");
  }

  if (deterministic.candidateIsWorse) {
    return skippedJudge(config, "Pairwise Copilot judge skipped because deterministic hard gates regressed.");
  }

  return withCopilotEvalClient({
    baseDirectory: join(process.cwd(), "eval-results", `.copilot-sdk-${adapter.evalName}-hill-climb`),
    run: async (client) => {
      const passes: PairwiseJudgePass[] = [];
      for (let passIndex = 0; passIndex < config.passes; passIndex += 1) {
        const candidateOnA = passIndex % 2 === 1;
        const optionA: VersionLabel = candidateOnA ? "candidate" : "baseline";
        const optionB: VersionLabel = candidateOnA ? "baseline" : "candidate";
        passes.push(await runJudgePass({
          adapter,
          client,
          model: config.model ?? "auto",
          passIndex,
          optionA,
          optionB,
          optionAReport: optionA === "candidate" ? candidate : baseline,
          optionBReport: optionB === "candidate" ? candidate : baseline,
        }));
      }

      return summarizeJudgePasses(config, passes);
    },
  });
}

function skippedJudge(config: HillClimbConfig, summary: string): PairwiseJudgeSummary {
  return {
    status: "skip",
    enabled: config.judgeEnabled,
    model: config.model ?? "auto",
    passesRequested: config.passes,
    validPasses: 0,
    candidateWins: 0,
    baselineWins: 0,
    ties: 0,
    parseFailures: 0,
    candidateWinRate: 0,
    acceptThreshold: config.acceptThreshold,
    positionBalance: { candidateAsA: 0, candidateAsB: 0 },
    passes: [{
      passIndex: 0,
      optionA: "baseline",
      optionB: "candidate",
      mappedWinner: "tie",
      rawResponse: summary,
    }],
  };
}

async function runJudgePass<TReport extends ComparableEvalReport>({
  adapter,
  client,
  model,
  passIndex,
  optionA,
  optionB,
  optionAReport,
  optionBReport,
}: {
  adapter: HillClimbAdapter<TReport>;
  client: CopilotClient;
  model?: string;
  passIndex: number;
  optionA: VersionLabel;
  optionB: VersionLabel;
  optionAReport: TReport;
  optionBReport: TReport;
}): Promise<PairwiseJudgePass> {
  const rawResponse = await sendCopilotEvalPrompt({
    client,
    model,
    systemMessage: "You are an independent, strict, bias-aware product eval judge. Return only valid JSON.",
    prompt: buildPairwisePrompt(adapter, passIndex, optionAReport, optionBReport),
  });
  const parsed = parsePairwiseJudgeResponse(rawResponse);
  const mappedWinner = parsed ? mapWinner(parsed.winner, optionA, optionB) : "parse-failed";

  return {
    passIndex,
    optionA,
    optionB,
    mappedWinner,
    rawWinner: parsed?.winner,
    scoreA: parsed?.scoreA,
    scoreB: parsed?.scoreB,
    confidence: parsed?.confidence,
    observations: parsed?.observations,
    scenarioComparisons: parsed?.scenarioComparisons,
    biasChecks: parsed?.biasChecks,
    rawResponse,
  };
}

function buildPairwisePrompt<TReport extends ComparableEvalReport>(
  adapter: HillClimbAdapter<TReport>,
  passIndex: number,
  optionAReport: TReport,
  optionBReport: TReport,
) {
  const rubric = rotatedRubric(adapter.rubricDimensions, passIndex);
  const hardFailureDescription = adapter.decisiveFailureDescription ?? "hard product failures";

  return [
    `Compare two anonymous ${adapter.productName} ${adapter.evalName} eval reports.`,
    "",
    "Bias-control protocol:",
    "- The reports are blinded as Option A and Option B. Do not infer which one is older, newer, baseline, or candidate.",
    "- Do not prefer the left/first option. The orchestration swaps A/B positions across passes; judge only the evidence in this pass.",
    "- Do not prefer longer output. Summaries are compacted to equal structure; verbosity is not quality.",
    `- Do not average away ${hardFailureDescription}.`,
    "- First write evidence-based observations and per-scenario comparisons, then assign numeric scores and a winner.",
    "- Treat ties and uncertainty conservatively. Pick a winner only when evidence is clear.",
    "",
    "Rubric order for this pass:",
    ...rubric.map((item, index) => `${index + 1}. ${item}`),
    "",
    "Return only JSON in this exact shape:",
    JSON.stringify({
      observations: ["evidence before any score; mention decisive hard gates and product realism"],
      scenarioComparisons: [{ scenarioId: "string", evidence: "why A/B/tie wins this scenario", winner: "A|B|tie" }],
      scoreA: 0,
      scoreB: 0,
      winner: "A|B|tie",
      confidence: 0,
      biasChecks: ["confirm left/right, verbosity, anchoring, and hard-gate biases were considered"],
    }),
    "",
    "Option A:",
    JSON.stringify(adapter.compactReportForJudge(optionAReport), null, 2),
    "",
    "Option B:",
    JSON.stringify(adapter.compactReportForJudge(optionBReport), null, 2),
  ].join("\n");
}

function rotatedRubric(dimensions: string[], passIndex: number) {
  if (dimensions.length === 0) return [];
  return [...dimensions.slice(passIndex % dimensions.length), ...dimensions.slice(0, passIndex % dimensions.length)];
}

function parsePairwiseJudgeResponse(raw: string): PairwiseJudgeResponse | undefined {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return undefined;

  try {
    const parsed = JSON.parse(json) as Partial<PairwiseJudgeResponse>;
    if (!isWinner(parsed.winner) || typeof parsed.scoreA !== "number" || typeof parsed.scoreB !== "number") {
      return undefined;
    }

    return {
      observations: Array.isArray(parsed.observations) ? parsed.observations.filter((item): item is string => typeof item === "string") : [],
      scenarioComparisons: Array.isArray(parsed.scenarioComparisons)
        ? parsed.scenarioComparisons.filter(isScenarioComparison)
        : [],
      scoreA: parsed.scoreA,
      scoreB: parsed.scoreB,
      winner: parsed.winner,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      biasChecks: Array.isArray(parsed.biasChecks) ? parsed.biasChecks.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return undefined;
  }
}

function isScenarioComparison(value: unknown): value is PairwiseJudgeResponse["scenarioComparisons"][number] {
  if (!value || typeof value !== "object") return false;
  const comparison = value as Partial<PairwiseJudgeResponse["scenarioComparisons"][number]>;
  return typeof comparison.scenarioId === "string" && typeof comparison.evidence === "string" && isWinner(comparison.winner);
}

function isWinner(value: unknown): value is PairwiseWinner {
  return value === "A" || value === "B" || value === "tie";
}

function mapWinner(winner: PairwiseWinner, optionA: VersionLabel, optionB: VersionLabel): VersionLabel | "tie" {
  if (winner === "tie") return "tie";
  return winner === "A" ? optionA : optionB;
}

function summarizeJudgePasses(config: HillClimbConfig, passes: PairwiseJudgePass[]): PairwiseJudgeSummary {
  const validPasses = passes.filter((pass) => pass.mappedWinner !== "parse-failed");
  const candidateWins = validPasses.filter((pass) => pass.mappedWinner === "candidate").length;
  const baselineWins = validPasses.filter((pass) => pass.mappedWinner === "baseline").length;
  const ties = validPasses.filter((pass) => pass.mappedWinner === "tie").length;
  const candidateWinRate = validPasses.length === 0 ? 0 : candidateWins / validPasses.length;
  const status = validPasses.length > 0 && candidateWins > baselineWins && candidateWinRate >= config.acceptThreshold ? "pass" : "fail";

  return {
    status,
    enabled: true,
    model: config.model ?? "auto",
    passesRequested: config.passes,
    validPasses: validPasses.length,
    candidateWins,
    baselineWins,
    ties,
    parseFailures: passes.length - validPasses.length,
    candidateWinRate,
    acceptThreshold: config.acceptThreshold,
    positionBalance: {
      candidateAsA: passes.filter((pass) => pass.optionA === "candidate").length,
      candidateAsB: passes.filter((pass) => pass.optionB === "candidate").length,
    },
    passes,
  };
}

function recommend<TReport extends ComparableEvalReport>(
  adapter: HillClimbAdapter<TReport>,
  deterministic: DeterministicComparison,
  judge: PairwiseJudgeSummary,
): { value: HillClimbRecommendation; rationale: string[] } {
  const rationale: string[] = [];

  if (deterministic.candidateIsWorse) {
    rationale.push("Reject: candidate has new deterministic hard failures or more hard failures than baseline.");
    return { value: "reject", rationale };
  }

  if (judge.enabled && judge.status === "fail") {
    rationale.push("Reject: repeated bias-balanced Copilot judge did not prefer the candidate strongly enough.");
    return { value: "reject", rationale };
  }

  if (!deterministic.candidateIsStrictPass) {
    rationale.push(adapter.keepClimbingMessage ?? "Keep climbing: candidate does not regress hard gates, but strict eval still has hard failures.");
    if (deterministic.fixedHardFailures > 0) {
      rationale.push(`Candidate fixed ${deterministic.fixedHardFailures} hard failure(s) and introduced ${deterministic.newHardFailures}.`);
    }
    return { value: "keep-climbing", rationale };
  }

  if (judge.enabled && judge.status !== "pass") {
    rationale.push("Keep climbing: deterministic gates pass, but LLM judge was skipped or inconclusive.");
    return { value: "keep-climbing", rationale };
  }

  rationale.push("Accept: candidate passes strict deterministic gates with no hard regressions.");
  if (judge.enabled) {
    rationale.push(`Copilot pairwise judge preferred candidate in ${judge.candidateWins}/${judge.validPasses} valid pass(es).`);
  }
  return { value: "accept", rationale };
}

function printHillClimbReport<TReport extends ComparableEvalReport>(
  adapter: HillClimbAdapter<TReport>,
  report: HillClimbReport,
  path: string,
) {
  const label = adapter.printLabel ?? adapter.evalName;
  console.log(`${label} hill climb: ${report.recommendation.toUpperCase()}`);
  console.log(`- hard failures: baseline ${report.deterministic.baselineHardFailures}, candidate ${report.deterministic.candidateHardFailures}`);
  console.log(`- fixed hard failures: ${report.deterministic.fixedHardFailures}; new hard failures: ${report.deterministic.newHardFailures}`);
  if (report.judge.status === "skip") {
    console.log("- judge: skipped");
  } else {
    console.log(`- judge: ${report.judge.status}, candidate ${report.judge.candidateWins}/${report.judge.validPasses}, baseline ${report.judge.baselineWins}/${report.judge.validPasses}, ties ${report.judge.ties}`);
    console.log(`- position balance: candidate as A ${report.judge.positionBalance.candidateAsA}, as B ${report.judge.positionBalance.candidateAsB}`);
  }
  for (const reason of report.rationale) {
    console.log(`- ${reason}`);
  }
  console.log(`Report: ${path}`);
}
