import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { argValue, firstPositionalArg, hasToken } from "../infra/cli.js";
import { writeJsonReport } from "../infra/report-io.js";

interface ImprovementPlanFile {
  generatedAt: string;
  outputPath: string;
  evalName: string;
  antiGaming: {
    evalSourceVisibleToCopilot: false;
    rawReportVisibleToCopilot: false;
    repositoryToolsAvailableToCopilot: false;
    workingDirectory: string;
    notes: string[];
  };
  rawCopilotResponse: string;
  parsedCopilotResponse?: unknown;
}

interface ApplyPlanReport {
  generatedAt: string;
  planPath: string;
  sandboxPath: string;
  dryRun: boolean;
  copiedBackFiles: string[];
  copilotExitCode?: number;
  antiGaming: {
    evalDirectoryCopiedToSandbox: false;
    evalResultsCopiedToSandbox: false;
    rawEvalReportProvidedToCopilot: false;
    copiedOnlyAllowlistedProductPaths: true;
    scrubbedCopilotEnvironment: true;
  };
}

const args = process.argv.slice(2);
const requestedPlanPath = argValue(args, "--plan")
  ?? process.env.COPILOT_EVAL_IMPROVEMENT_PLAN
  ?? firstPositionalArg(args, {
    flagsWithValues: ["--plan", "--sandbox", "--output"],
    ignoredAssignments: ["plan", "sandbox", "output"],
    ignoredBareTokens: ["dry-run"],
  });

if (!requestedPlanPath) {
  console.error("Missing improvement plan. Pass plan=<path> or set COPILOT_EVAL_IMPROVEMENT_PLAN.");
  process.exit(1);
}
const planPath = requestedPlanPath;

const sandboxPath = argValue(args, "--sandbox")
  ?? process.env.COPILOT_EVAL_APPLY_SANDBOX
  ?? join("eval-results", ".meal-core-apply-sandbox");
const outputPath = argValue(args, "--output")
  ?? process.env.COPILOT_EVAL_APPLY_REPORT
  ?? join("eval-results", "meal-core-apply-plan-report.json");
const dryRun = hasToken(args, "--dry-run") || process.env.COPILOT_EVAL_APPLY_DRY_RUN === "1";

const plan = JSON.parse(readFileSync(planPath, "utf8")) as ImprovementPlanFile;

rmSync(sandboxPath, { recursive: true, force: true });
mkdirSync(sandboxPath, { recursive: true });
copyAllowedTree(process.cwd(), sandboxPath);

const prompt = buildApplyPrompt(plan);
const copilotExitCode = dryRun ? 0 : runCopilotApply(prompt, sandboxPath);
if (copilotExitCode !== 0) {
  await writeReport([], copilotExitCode);
  process.exit(copilotExitCode);
}

const copiedBackFiles = dryRun ? [] : copyChangedFilesBack(sandboxPath, process.cwd());
await writeReport(copiedBackFiles, copilotExitCode);

if (dryRun) {
  console.log(`meal-core apply plan: dry run prepared sandbox ${sandboxPath}`);
} else {
  console.log(`meal-core apply plan: copied back ${copiedBackFiles.length} changed file(s) from sandbox`);
}
console.log(`Report: ${outputPath}`);

function buildApplyPrompt(planFile: ImprovementPlanFile) {
  const planPayload = planFile.parsedCopilotResponse ?? planFile.rawCopilotResponse;
  return [
    "Apply exactly one small Meal Plan Calculator product-code improvement from this sanitized plan.",
    "",
    "Critical anti-gaming constraints:",
    "- You are running in a sandbox copy that intentionally excludes evals/ and eval-results/.",
    "- Do not ask for eval source, raw eval reports, hidden rubrics, or extra evaluation details.",
    "- Do not weaken product behavior, tests, validation, serving realism, diet semantics, or target correctness.",
    "- Prefer product-code fixes over changing tests, package scripts, or documentation.",
    "- Make the smallest coherent code change that improves real user meal-plan quality.",
    "- Do not commit changes.",
    "",
    "After editing, stop. The outer loop will run eval, judge, and hill-climb again.",
    "",
    "Sanitized improvement plan:",
    JSON.stringify(planPayload, null, 2),
  ].join("\n");
}

function runCopilotApply(prompt: string, cwd: string) {
  const command = resolveCopilotCommand();
  const result = spawnSync(command, [
    "-p",
    prompt,
    "--allow-all-tools",
    "--disable-builtin-mcps",
    "--no-custom-instructions",
    "--stream",
    "off",
    "--log-level",
    "none",
  ], {
    cwd,
    stdio: "inherit",
    shell: false,
    env: scrubbedCopilotEnv(),
  });

  if (result.error) {
    throw result.error;
  }

  function scrubbedCopilotEnv() {
    const allowed = new Set([
      "PATH",
      "PATHEXT",
      "SYSTEMROOT",
      "WINDIR",
      "COMSPEC",
      "TEMP",
      "TMP",
      "USERPROFILE",
      "HOME",
      "APPDATA",
      "LOCALAPPDATA",
      "CI",
    ]);
    const env: NodeJS.ProcessEnv = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue;
      if (key.startsWith("COPILOT_EVAL_")) continue;
      if (allowed.has(key.toUpperCase())) {
        env[key] = value;
      }
    }

    return env;
  }

  return result.status ?? 1;
}

function resolveCopilotCommand() {
  if (process.platform !== "win32") return "copilot";

  const whereResult = spawnSync("where.exe", ["copilot"], {
    encoding: "utf8",
    shell: false,
  });
  const candidates = whereResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return candidates.find((candidate) => candidate.toLowerCase().endsWith(".exe")) ?? "copilot.exe";
}

function copyAllowedTree(sourceRoot: string, targetRoot: string, currentSource = sourceRoot) {
  for (const entry of readdirSync(currentSource, { withFileTypes: true })) {
    const source = join(currentSource, entry.name);
    const relativePath = relative(sourceRoot, source);
    if (!isAllowedSandboxPath(relativePath) || shouldSkipRelativePath(relativePath)) continue;

    const target = join(targetRoot, relativePath);
    if (entry.isDirectory()) {
      mkdirSync(target, { recursive: true });
      copyAllowedTree(sourceRoot, targetRoot, source);
    } else if (entry.isFile()) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
}

function copyChangedFilesBack(sourceRoot: string, targetRoot: string) {
  const changedFiles: string[] = [];
  copyChangedFilesBackRecursive(sourceRoot, targetRoot, sourceRoot, changedFiles);
  return changedFiles;
}

function copyChangedFilesBackRecursive(sourceDirectory: string, targetRoot: string, sourceRoot: string, changedFiles: string[]) {
  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    const source = join(sourceDirectory, entry.name);
    const relativePath = relative(sourceRoot, source);
    if (!isAllowedSandboxPath(relativePath) || shouldSkipRelativePath(relativePath)) continue;

    const target = join(targetRoot, relativePath);
    if (entry.isDirectory()) {
      copyChangedFilesBackRecursive(source, targetRoot, sourceRoot, changedFiles);
      continue;
    }

    if (!entry.isFile()) continue;
    if (existsSync(target) && statSync(target).isFile() && readFileSync(source).equals(readFileSync(target))) {
      continue;
    }

    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    changedFiles.push(relativePath);
  }
}

function shouldSkipRelativePath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  const firstSegment = normalized.split("/")[0] ?? "";
  const fileName = normalized.split("/").at(-1) ?? "";
  if (firstSegment.startsWith(".")) return true;
  if (isSensitiveFileName(fileName)) return true;
  if (normalized === "docs/adr/0003-strict-product-evals.md") return true;

  return new Set([
    "dist",
    "coverage",
    "evals",
    "eval-results",
    "node_modules",
    "storybook-static",
  ]).has(firstSegment);
}

function isAllowedSandboxPath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  const firstSegment = normalized.split("/")[0] ?? "";
  const rootFiles = new Set([
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.build.json",
    "vite.config.ts",
    "vitest.config.ts",
  ]);

  if (rootFiles.has(normalized)) return true;
  if (normalized.startsWith("src/")) return true;
  if (normalized === "site" || normalized === "site/src" || normalized === "site/public") return true;
  if (normalized.startsWith("site/src/")) return true;
  if (normalized.startsWith("site/public/")) return true;
  if (normalized.startsWith("data/")) return true;
  if (normalized.startsWith("schemas/")) return true;
  if (normalized.startsWith("tests/")) return true;

  return ["src", "data", "schemas", "tests"].includes(firstSegment) && normalized === firstSegment;
}

function isSensitiveFileName(fileName: string) {
  const lowerName = fileName.toLowerCase();
  return lowerName === ".env"
    || lowerName.startsWith(".env.")
    || lowerName === ".npmrc"
    || lowerName === ".yarnrc"
    || lowerName === ".pypirc"
    || lowerName === ".netrc"
    || lowerName.endsWith(".pem")
    || lowerName.endsWith(".key")
    || lowerName.endsWith(".pfx")
    || lowerName.endsWith(".p12");
}

async function writeReport(copiedBackFiles: string[], copilotExitCode: number) {
  const report: ApplyPlanReport = {
    generatedAt: new Date().toISOString(),
    planPath,
    sandboxPath,
    dryRun,
    copiedBackFiles,
    copilotExitCode,
    antiGaming: {
      evalDirectoryCopiedToSandbox: false,
      evalResultsCopiedToSandbox: false,
      rawEvalReportProvidedToCopilot: false,
      copiedOnlyAllowlistedProductPaths: true,
      scrubbedCopilotEnvironment: true,
    },
  };
  await writeJsonReport(outputPath, report);
}
