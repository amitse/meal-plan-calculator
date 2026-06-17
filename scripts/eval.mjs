import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const suites = new Set([
  "random",
  "meal-core",
  "ui-quality",
  "ui-ease",
  "ease-of-use",
  "accessibility",
  "sharing-export",
  "failure-recovery",
  "regression-architecture",
]);

const actions = new Set([
  "run",
  "judge",
  "judge-only",
  "loop",
  "hill-climb",
  "improve",
  "improve-loop",
  "apply-plan",
]);

const [suiteToken, maybeActionToken, ...tailArgs] = process.argv.slice(2);
if (!suiteToken || suiteToken === "--help" || suiteToken === "help") {
  printUsage();
  process.exit(0);
}

const parsed = parseCommand(suiteToken, maybeActionToken, tailArgs);

if (!parsed) {
  printUsage();
  process.exit(1);
}

const target = targetFor(parsed.suite, parsed.action);
runTarget(target, parsed.args);

function parseCommand(suiteToken, maybeActionToken, tailArgs) {
  let suite = suiteToken;
  let action = "run";
  let args = maybeActionToken === undefined ? [] : [maybeActionToken, ...tailArgs];

  if (suiteToken.includes(":")) {
    const [suitePart, actionPart] = suiteToken.split(":");
    suite = suitePart;
    action = actionPart || "run";
  } else if (actions.has(maybeActionToken)) {
    action = maybeActionToken;
    args = tailArgs;
  }

  if (!suites.has(suite) || !actions.has(action)) return undefined;
  if (suite === "random" && action === "run") action = "improve-loop";
  if (suite === "random" && action !== "improve-loop") return undefined;
  if (action === "apply-plan" && suite !== "meal-core") return undefined;

  return { suite, action, args };
}

function targetFor(suite, action) {
  if (suite === "random" && action === "improve-loop") {
    return { runner: "node", file: join("scripts", "eval-random-improve.mjs"), prefixArgs: [] };
  }

  if (suite === "meal-core") {
    if (action === "run") return { runner: "tsx", file: join("evals", "meal-core", "run.ts"), prefixArgs: [] };
    if (action === "judge") return { runner: "tsx", file: join("evals", "meal-core", "loop.ts"), prefixArgs: ["--judge"] };
    if (action === "judge-only") return { runner: "tsx", file: join("evals", "meal-core", "run.ts"), prefixArgs: ["--judge"] };
    if (action === "loop") return { runner: "tsx", file: join("evals", "meal-core", "loop.ts"), prefixArgs: [] };
    if (action === "hill-climb") return { runner: "tsx", file: join("evals", "meal-core", "hill-climb.ts"), prefixArgs: [] };
    if (action === "improve") return { runner: "tsx", file: join("evals", "meal-core", "improve.ts"), prefixArgs: [] };
    if (action === "improve-loop") return { runner: "tsx", file: join("evals", "meal-core", "improve-loop.ts"), prefixArgs: ["--judge"] };
    if (action === "apply-plan") return { runner: "tsx", file: join("evals", "meal-core", "apply-plan.ts"), prefixArgs: [] };
  }

  if (action === "run") return { runner: "tsx", file: join("evals", suite, "run.ts"), prefixArgs: [] };
  if (action === "judge") return { runner: "tsx", file: join("evals", "non-meal", "loop.ts"), prefixArgs: [suite, "--judge"] };
  if (action === "loop") return { runner: "tsx", file: join("evals", "non-meal", "loop.ts"), prefixArgs: [suite] };
  if (action === "hill-climb") return { runner: "tsx", file: join("evals", "non-meal", "hill-climb.ts"), prefixArgs: [suite] };
  if (action === "improve") return { runner: "tsx", file: join("evals", "non-meal", "improve.ts"), prefixArgs: [suite] };
  if (action === "improve-loop") return { runner: "tsx", file: join("evals", "non-meal", "improve-loop.ts"), prefixArgs: [suite, "--judge"] };

  throw new Error(`Unsupported ${suite} ${action}`);
}

function runTarget(target, args) {
  const command = target.runner === "node" ? process.execPath : tsxCommand();
  const result = spawnSync(command, [target.file, ...target.prefixArgs, ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function tsxCommand() {
  const bin = process.platform === "win32"
    ? join("node_modules", ".bin", "tsx.cmd")
    : join("node_modules", ".bin", "tsx");
  return existsSync(bin) ? bin : "tsx";
}

function printUsage() {
  console.log([
    "Usage: npm run eval -- <suite> [action] [...args]",
    "",
    "Suites:",
    `  ${[...suites].join(", ")}`,
    "",
    "Actions:",
    "  run (default), judge, judge-only, loop, hill-climb, improve, improve-loop, apply-plan",
    "",
    "Examples:",
    "  npm run eval -- meal-core",
    "  npm run eval -- meal-core judge",
    "  npm run eval -- random improve-loop max-iterations=10 auto-apply",
    "  npm run eval -- ui-quality improve-loop max-iterations=3",
    "  npm run eval -- accessibility hill-climb eval-results\\accessibility-baseline.json eval-results\\accessibility-candidate.json",
  ].join("\n"));
}
