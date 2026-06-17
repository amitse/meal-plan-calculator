import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const allSuites = [
  "meal-core",
  "ui-quality",
  "ui-ease",
  "ease-of-use",
  "accessibility",
  "sharing-export",
  "failure-recovery",
  "regression-architecture",
];

const args = process.argv.slice(2);
const maxIterations = positiveInteger(argValue("max-iterations") ?? process.env.COPILOT_EVAL_RANDOM_LOOP_MAX_ITERATIONS, 10);
const workDir = argValue("work-dir") ?? process.env.COPILOT_EVAL_RANDOM_LOOP_DIR ?? join("eval-results", "random-improve-loop");
const outputPath = argValue("output") ?? process.env.COPILOT_EVAL_RANDOM_LOOP_OUTPUT ?? join(workDir, "report.json");
const suites = parseSuites(argValue("suites") ?? process.env.COPILOT_EVAL_RANDOM_LOOP_SUITES);
const seed = argValue("seed") ?? process.env.COPILOT_EVAL_RANDOM_LOOP_SEED;
const random = seed ? seededRandom(seed) : Math.random;
const noJudge = hasToken("no-judge");
const dryRun = hasToken("dry-run");
const autoApply = hasToken("auto-apply");
const noPromoteProgress = hasToken("no-promote-progress");
const passes = argValue("passes") ?? process.env.COPILOT_EVAL_HILL_CLIMB_PASSES;
const applyCommand = argValue("apply-command") ?? process.env.COPILOT_EVAL_APPLY_COMMAND;

mkdirSync(workDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  stopReason: "max-iterations",
  maxIterations,
  selectedSuites: suites,
  seed: seed ?? null,
  judgeEnabled: !noJudge,
  dryRun,
  autoApply,
  iterations: [],
};

for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
  const suite = pick(suites, random);
  const iterationDir = join(workDir, `iteration-${iteration}-${suite}`);
  const suiteReportPath = join(iterationDir, "report.json");
  const suiteArgs = [
    suite,
    "improve-loop",
    "max-iterations=1",
    `work-dir=${iterationDir}`,
    `output=${suiteReportPath}`,
    ...(passes ? [`passes=${passes}`] : []),
    ...(noJudge ? ["no-judge"] : []),
    ...(dryRun ? ["dry-run"] : []),
    ...(autoApply ? ["auto-apply"] : []),
    ...(noPromoteProgress ? ["no-promote-progress"] : []),
    ...(applyCommand ? [`apply-command=${applyCommand}`] : []),
  ];

  console.log(`Random eval improve loop iteration ${iteration}/${maxIterations}: ${suite}`);
  const beforeSnapshot = captureChangeSnapshot();
  const result = runEval(suiteArgs);
  const afterSnapshot = captureChangeSnapshot();
  const suiteReport = readJsonIfPresent(suiteReportPath);
  const iterationReport = {
    iteration,
    suite,
    suiteReportPath,
    exitCode: result.status ?? 1,
    stopReason: suiteReport?.stopReason,
    recommendation: suiteReport?.iterations?.at(-1)?.recommendation,
    baselineHardFailures: suiteReport?.iterations?.at(-1)?.baselineHardFailures,
    candidateHardFailures: suiteReport?.iterations?.at(-1)?.candidateHardFailures,
    fixedHardFailures: suiteReport?.iterations?.at(-1)?.fixedHardFailures,
    newHardFailures: suiteReport?.iterations?.at(-1)?.newHardFailures,
    sourceChanges: diffChangeSnapshots(beforeSnapshot, afterSnapshot),
  };
  report.iterations.push(iterationReport);
  writeReport(report);

  if (result.status !== 0) {
    report.stopReason = "suite-loop-failed";
    writeReport(report);
    process.exitCode = result.status ?? 1;
    break;
  }

  if (suiteReport?.stopReason === "waiting-for-apply") {
    report.stopReason = "waiting-for-apply";
    writeReport(report);
    console.log(`Random eval improve loop: waiting for apply from ${suite}`);
    break;
  }

  if (suiteReport?.stopReason === "apply-failed") {
    report.stopReason = "apply-failed";
    writeReport(report);
    process.exitCode = 1;
    break;
  }
}

writeReport(report);
printReport(report);

function runEval(evalArgs) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", "eval", "--", ...evalArgs], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) throw result.error;
  return result;
}

function captureChangeSnapshot() {
  return {
    capturedAt: new Date().toISOString(),
    gitStatus: gitStatusShort(),
    sourceFiles: sourceFileMtimes(process.cwd()),
  };
}

function diffChangeSnapshots(before, after) {
  const changedFiles = [];
  for (const [path, afterMtimeMs] of Object.entries(after.sourceFiles)) {
    const beforeMtimeMs = before.sourceFiles[path];
    if (beforeMtimeMs === undefined) {
      changedFiles.push({ path, change: "created", beforeMtimeMs: null, afterMtimeMs });
    } else if (afterMtimeMs !== beforeMtimeMs) {
      changedFiles.push({ path, change: "modified", beforeMtimeMs, afterMtimeMs });
    }
  }

  for (const path of Object.keys(before.sourceFiles)) {
    if (after.sourceFiles[path] === undefined) {
      changedFiles.push({ path, change: "deleted", beforeMtimeMs: before.sourceFiles[path], afterMtimeMs: null });
    }
  }

  const beforeStatus = new Set(before.gitStatus);
  const afterStatus = new Set(after.gitStatus);

  return {
    beforeCapturedAt: before.capturedAt,
    afterCapturedAt: after.capturedAt,
    changedFiles: changedFiles.sort((a, b) => a.path.localeCompare(b.path)),
    beforeGitStatus: before.gitStatus,
    afterGitStatus: after.gitStatus,
    newGitStatusEntries: after.gitStatus.filter((entry) => !beforeStatus.has(entry)),
    clearedGitStatusEntries: before.gitStatus.filter((entry) => !afterStatus.has(entry)),
  };
}

function gitStatusShort() {
  const result = spawnSync("git", ["--no-pager", "status", "--short"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) return [];

  return result.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean).sort();
}

function sourceFileMtimes(root, current = root) {
  const mtimes = {};
  walkSourceFiles(root, current, mtimes);
  return mtimes;
}

function walkSourceFiles(root, current, mtimes) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const fullPath = join(current, entry.name);
    const relativePath = toRepoPath(relative(root, fullPath));
    if (shouldIgnoreMtimePath(relativePath, entry.isDirectory())) continue;

    if (entry.isDirectory()) {
      walkSourceFiles(root, fullPath, mtimes);
    } else if (entry.isFile()) {
      mtimes[relativePath] = statSync(fullPath).mtimeMs;
    }
  }
}

function shouldIgnoreMtimePath(path, isDirectory) {
  const firstSegment = path.split("/")[0] ?? "";
  if (firstSegment.startsWith(".")) return true;
  if (isDirectory && new Set([
    "coverage",
    "dist",
    "eval-results",
    "node_modules",
    "storybook-static",
  ]).has(firstSegment)) {
    return true;
  }

  return false;
}

function toRepoPath(path) {
  return path.replaceAll("\\", "/");
}

function parseSuites(value) {
  if (!value) return allSuites;
  const selected = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (selected.length === 0) return allSuites;
  const unknown = selected.filter((item) => !allSuites.includes(item));
  if (unknown.length > 0) {
    throw new Error(`Unknown random eval suite(s): ${unknown.join(", ")}. Expected one of: ${allSuites.join(", ")}`);
  }

  return selected;
}

function pick(values, randomFn) {
  return values[Math.floor(randomFn() * values.length)] ?? values[0];
}

function argValue(name) {
  const dashed = `--${name}`;
  const dashedIndex = args.indexOf(dashed);
  if (dashedIndex >= 0) return args[dashedIndex + 1];
  const dashedEquals = args.find((arg) => arg.startsWith(`${dashed}=`));
  if (dashedEquals) return dashedEquals.slice(dashed.length + 1);
  const bareEquals = args.find((arg) => arg.startsWith(`${name}=`));
  return bareEquals ? bareEquals.slice(name.length + 1) : undefined;
}

function hasToken(name) {
  return args.includes(name) || args.includes(`--${name}`);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function seededRandom(value) {
  let state = 0;
  for (const char of value) {
    state = (Math.imul(31, state) + char.charCodeAt(0)) >>> 0;
  }
  if (state === 0) state = 0x9e3779b9;

  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function readJsonIfPresent(path) {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeReport(value) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`);
}

function printReport(value) {
  console.log(`Random eval improve loop: ${value.stopReason}`);
  for (const iteration of value.iterations) {
    console.log(
      `- iteration ${iteration.iteration}: ${iteration.suite}, ${iteration.stopReason ?? "no-report"}, ${iteration.recommendation ?? "no-recommendation"}`,
    );
  }
  console.log(`Report: ${outputPath}`);
}
