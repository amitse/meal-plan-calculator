import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { argValue, firstPositionalArg, hasToken } from "./cli.js";
import { resolveCopilotEvalModel, sendCopilotEvalPrompt, withCopilotEvalClient } from "./copilot.js";
import { readJsonReport, writeJsonReport } from "./report-io.js";

export interface ImproveLoopAdapter<TReport> {
  evalName: string;
  productName: string;
  defaultReportPath: string;
  defaultOutputPath: string;
  sanitizeReportForImprovement: (report: TReport) => unknown;
  productContext: string[];
  suggestedFixScope: string[];
}

interface ImproveLoopConfig {
  reportPath: string;
  outputPath: string;
  model?: string;
  dryRun: boolean;
}

interface ImproveLoopReport {
  generatedAt: string;
  reportPath: string;
  outputPath: string;
  evalName: string;
  antiGaming: {
    evalSourceVisibleToCopilot: false;
    rawReportVisibleToCopilot: false;
    repositoryToolsAvailableToCopilot: false;
    workingDirectory: string;
    notes: string[];
  };
  promptPayload: unknown;
  rawCopilotResponse: string;
  parsedCopilotResponse?: unknown;
}

export async function runImproveLoopCli<TReport>(
  adapter: ImproveLoopAdapter<TReport>,
  args = process.argv.slice(2),
  env = process.env,
) {
  const config = parseImproveLoopConfig(adapter, args, env);
  const report = await readJsonReport<TReport>(config.reportPath);
  const sanitizedReport = adapter.sanitizeReportForImprovement(report);
  const sandboxRoot = join(process.cwd(), "eval-results", `.copilot-sdk-${adapter.evalName}-improve-sandbox`);
  const sandboxCwd = join(sandboxRoot, "workspace");
  const sandboxConfig = join(sandboxRoot, "config");
  await mkdir(sandboxCwd, { recursive: true });
  await mkdir(sandboxConfig, { recursive: true });

  const payload = {
    productName: adapter.productName,
    evalName: adapter.evalName,
    productContext: adapter.productContext,
    suggestedFixScope: adapter.suggestedFixScope,
    sanitizedEvalSymptoms: sanitizedReport,
  };

  const rawCopilotResponse = config.dryRun
    ? "DRY_RUN: Copilot was not invoked. The prompt payload in this report is the exact sanitized data Copilot would receive."
    : await withCopilotEvalClient({
      baseDirectory: join(sandboxRoot, "client-state"),
      workingDirectory: sandboxCwd,
      run: (client) => sendCopilotEvalPrompt({
        client,
        model: config.model,
        workingDirectory: sandboxCwd,
        configDirectory: sandboxConfig,
        toolAccess: "none",
        privacyMode: true,
        systemMessage: [
          "You are a product-quality failure analyst.",
          "You must propose codebase improvement plans from sanitized eval symptoms only.",
          "You cannot inspect repository files, eval source code, raw reports, git history, or hidden rubrics.",
          "Do not ask to view eval implementation. Do not optimize for named eval checks. Optimize for real product behavior.",
          "Return only valid JSON.",
        ].join(" "),
        prompt: buildImprovePrompt(payload),
      }),
    });

  const parsedCopilotResponse = parseJsonObject(rawCopilotResponse);
  const improvementReport: ImproveLoopReport = {
    generatedAt: new Date().toISOString(),
    reportPath: config.reportPath,
    outputPath: config.outputPath,
    evalName: adapter.evalName,
    antiGaming: {
      evalSourceVisibleToCopilot: false,
      rawReportVisibleToCopilot: false,
      repositoryToolsAvailableToCopilot: false,
      workingDirectory: sandboxCwd,
      notes: [
        "Copilot receives only a domain-sanitized symptom digest, not eval source files.",
        "The SDK session uses an isolated empty working directory and toolAccess=none.",
        "Config discovery, skills, host git operations, session store, file hooks, and embedding retrieval are disabled.",
        "The loop produces a fix plan; it does not apply code changes.",
      ],
    },
    promptPayload: payload,
    rawCopilotResponse,
    parsedCopilotResponse,
  };

  await writeJsonReport(config.outputPath, improvementReport);
  printImproveLoopReport(improvementReport);

  return improvementReport;
}

function parseImproveLoopConfig<TReport>(
  adapter: ImproveLoopAdapter<TReport>,
  args: string[],
  env: NodeJS.ProcessEnv,
): ImproveLoopConfig {
  return {
    reportPath: argValue(args, "--report") ?? env.COPILOT_EVAL_REPORT ?? firstPositionalArg(args, {
      flagsWithValues: ["--report", "--output", "--model"],
      ignoredAssignments: ["report", "output", "model"],
      ignoredBareTokens: ["dry-run"],
    }) ?? adapter.defaultReportPath,
    outputPath: argValue(args, "--output") ?? env.COPILOT_EVAL_IMPROVE_OUTPUT ?? adapter.defaultOutputPath,
    model: resolveCopilotEvalModel(argValue(args, "--model") ?? env.COPILOT_EVAL_IMPROVE_MODEL ?? env.COPILOT_EVAL_JUDGE_MODEL),
    dryRun: hasToken(args, "--dry-run") || env.COPILOT_EVAL_IMPROVE_DRY_RUN === "1",
  };
}

function buildImprovePrompt(payload: unknown) {
  return [
    "Given this sanitized eval failure digest, propose the next safest codebase improvement.",
    "",
    "Rules:",
    "- Do not infer or request hidden eval code.",
    "- Do not propose changes that merely satisfy a likely test predicate while worsening product quality.",
    "- Prefer one small product fix at a time.",
    "- Include why the fix improves real user behavior, not just eval score.",
    "- Include regression risks and exact validation commands.",
    "",
    "Return only JSON in this exact shape:",
    JSON.stringify({
      summary: "one sentence",
      rootCauses: ["ranked root cause hypotheses from symptoms only"],
      proposedFixes: [{
        title: "small safe change",
        whyThisImprovesProduct: "behavioral reason",
        likelyFilesToInspect: ["file path or area; human/agent will inspect separately"],
        implementationSketch: ["step"],
        risks: ["risk"],
        validation: ["command or eval"],
      }],
      preferredNextFix: "title of the one fix to try first",
      stopConditions: ["when to reject this direction"],
    }),
    "",
    "Sanitized payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function parseJsonObject(raw: string) {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return undefined;

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
}

function printImproveLoopReport(report: ImproveLoopReport) {
  console.log(`${report.evalName} improve loop: wrote ${report.outputPath}`);
  console.log("- Copilot saw sanitized symptoms only, not eval source or raw report.");
  console.log("- Copilot had no repository/file/shell tools in this session.");
  if (report.rawCopilotResponse.startsWith("DRY_RUN:")) {
    console.log("- Dry run: Copilot was not invoked.");
  }
  if (!report.rawCopilotResponse.startsWith("DRY_RUN:") && !report.parsedCopilotResponse) {
    console.log("- Warning: Copilot response was not parseable JSON; raw response is in the report.");
  }
}
