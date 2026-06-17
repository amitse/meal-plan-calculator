import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { argValue, firstPositionalArg, hasToken } from "../infra/cli.js";
import { writeJsonReport } from "../infra/report-io.js";

type EvalStatus = "pass" | "fail";

const args = process.argv.slice(2);
const outputPath = argValue(args, "--output") ?? process.env.COPILOT_EVAL_OUTPUT ?? firstPositionalArg(args, {
  flagsWithValues: ["--output"],
  ignoredAssignments: ["output"],
  ignoredBareTokens: ["no-exit-code"],
}) ?? join("eval-results", "regression-architecture-report.json");
const noExitCode = hasToken(args, "--no-exit-code") || process.env.COPILOT_EVAL_NO_EXIT_CODE === "1";
const srcFiles = sourceFiles("src");
const siteFiles = sourceFiles(join("site", "src"));
const evalInfraFiles = sourceFiles(join("evals", "infra"));
const evalDomainFiles = sourceFiles("evals").filter((file) => !repoPath(file).startsWith("evals/infra/"));
const packageJson = readJson<{ scripts?: Record<string, string> }>("package.json");
const tsconfig = readJson<{ include?: string[] }>("tsconfig.json");

const checks = [
  check("core-does-not-import-site", srcFiles.every((file) => !/from\s+["'].*site\/src/.test(read(file))), "Core planner modules do not import site code.", offenders(srcFiles, /from\s+["'].*site\/src/)),
  check("react-behind-adapter", reactCoreImportOffenders().length === 0, "React UI imports core behavior only through approved adapter/service files.", reactCoreImportOffenders()),
  check("eval-infra-domain-split", evalInfraFiles.every((file) => !/from\s+["']\.\.\/(meal-core|ui-ease|ui-quality|ease-of-use|accessibility|sharing-export|failure-recovery|regression-architecture)\//.test(read(file))), "Eval infra does not import product-specific eval domains.", offenders(evalInfraFiles, /from\s+["']\.\.\/(meal-core|ui-ease|ui-quality|ease-of-use|accessibility|sharing-export|failure-recovery|regression-architecture)\//)),
  check("eval-domains-use-infra-not-reverse", evalDomainFiles.some((file) => /from\s+["']\.\.\/infra\//.test(read(file))), "Eval domains depend on shared infra helpers."),
  check("strict-typecheck-script", packageJson.scripts?.typecheck === "tsc -p tsconfig.json --noEmit", "Strict TypeScript check script is wired."),
  check("full-unit-regression-script", packageJson.scripts?.test === "vitest run", "Full Vitest regression script is wired."),
  check("library-build-script", packageJson.scripts?.build === "tsc -p tsconfig.build.json", "Library build script is wired."),
  check("evals-in-typecheck", tsconfig.include?.includes("evals/**/*.ts") === true, "Eval TypeScript files are included in repository typecheck."),
  check("strict-eval-adr-present", existsSync(join("docs", "adr", "0003-strict-product-evals.md")), "Strict eval ADR is present."),
];
const report = {
  generatedAt: new Date().toISOString(),
  status: checks.some((entry) => entry.status === "fail") ? "fail" as const : "pass" as const,
  results: [{
    scenarioId: "regression-architecture-gates",
    status: checks.some((entry) => entry.status === "fail") ? "fail" as const : "pass" as const,
    deterministicScore: scoreChecks(checks),
    checks,
  }],
  checks,
};

await writeJsonReport(outputPath, report);
console.log(`Regression/architecture eval: ${report.status.toUpperCase()} (${checks.length} checks)`);
for (const failed of checks.filter((entry) => entry.status === "fail")) console.log(`- ${failed.id}: ${failed.message}`);
console.log(`Report: ${outputPath}`);
if (report.status === "fail" && !noExitCode) process.exitCode = 1;

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function read(path: string) {
  return readFileSync(path, "utf8");
}

function readJson<T>(path: string): T {
  return JSON.parse(read(path)) as T;
}

function repoPath(path: string) {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function offenders(files: string[], pattern: RegExp) {
  return files.filter((file) => pattern.test(read(file))).map(repoPath);
}

function reactCoreImportOffenders() {
  const allowedCoreConsumers = new Set(["site/src/editable-planner.ts", "site/src/export-plan.ts"]);
  return siteFiles
    .filter((file) => /from\s+["']\.\.\/\.\.\/src\//.test(read(file)))
    .map(repoPath)
    .filter((path) => !allowedCoreConsumers.has(path));
}

function check(id: string, pass: boolean, message: string, evidence?: unknown) {
  return { id, severity: "hard" as const, status: pass ? "pass" as EvalStatus : "fail" as EvalStatus, message, evidence };
}

function scoreChecks(checksToScore: Array<{ status: EvalStatus }>) {
  return checksToScore.length === 0 ? 0 : checksToScore.filter((check) => check.status === "pass").length / checksToScore.length;
}
