#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const queueDir = resolve(rootDir, ".copilot-issue-loop");
const pendingDir = resolve(queueDir, "issues");
const inProgressDir = resolve(queueDir, "in-progress");
const completedDir = resolve(queueDir, "completed");
const needsReviewDir = resolve(queueDir, "needs-review");
const legacyEventsPath = resolve(queueDir, "events.jsonl");
const activeCopilotProcesses = new Set();
let stopRequested = false;

const usage = `Usage:
  npm run ux:issue:generate
  npm run ux:issue:generate -- "optional focus phrase"
  npm run ux:issue:generate-loop
  npm run ux:issue:fix-next
  npm run ux:issue:fix-loop
  npm run ux:issue:run-hour
  npm run ux:issue:status
  node scripts/copilot-issue-loop.mjs <generate|generate-loop|fix-next|fix-loop|run-hour|status> [options] [-- extra-copilot-args]

Options:
  --focus <text>       Bias generated issues toward a segment or area.
  --model <name>       Pass a Copilot model name, for example gpt-5.
  --preview            Show what would happen without creating or fixing files.
  --generate-seconds <n>
                       Delay between generator-loop runs (default: 0).
  --wait-seconds <n>   Delay between fix-loop checks when no issue exists (default: 120).
  --duration-minutes <n>
                       Duration for run-hour/generate-loop/fix-loop (default: 60).
  --help               Show this help.

Pending issues live as individual markdown files in .copilot-issue-loop/issues/, which is gitignored.
`;

const command = process.argv[2];
if (!command || command === "--help" || command === "-h") {
  console.log(usage);
  process.exit(command ? 0 : 1);
}

const options = parseOptions(process.argv.slice(3));
ensureQueueDirs();
migrateLegacyEventsToIssueFiles();

if (command === "generate") {
  await generateIssueFile();
} else if (command === "generate-loop") {
  await generateIssueLoop();
} else if (command === "fix-next") {
  await fixNextIssueFile();
} else if (command === "fix-loop") {
  await fixIssueLoop();
} else if (command === "run-hour") {
  await runHour();
} else if (command === "status") {
  printStatus();
} else {
  throw new Error(`Unknown command: ${command}\n\n${usage}`);
}

async function generateIssueFile() {
  const issueId = createIssueId(new Date().toISOString());
  const issuePath = resolve(pendingDir, `${issueId}.md`);
  const prompt = `You are an autonomous UX issue generator for the Meal Plan Calculator repository.

Create exactly one new issue file at this exact path:
${relativeToRoot(issuePath)}

The issue must improve a real workflow delta, usability gap, UI clarity issue, content affordance, feedback state, mobile interaction, error/recovery path, or first-run comprehension problem. Inspect the current UI, docs, and intended workflows before choosing the issue.
${options.focus ? `Bias the issue toward this focus: ${options.focus}` : "Choose the highest-impact workflow or usability gap you can find."}

Prioritize issues where:
- the intended user workflow is clear but the current UI does not guide it well;
- the user has to infer what to do, what changed, or why a result failed;
- mobile-first interaction or content hierarchy can be improved with a small change;
- the issue can be implemented in one focused fixer pass.

Avoid:
- broad redesigns, new product areas, backend rewrites, or speculative features;
- duplicate ideas already present in the issue folder;
- purely cosmetic changes without a workflow/usability reason;
- issues that require external services or manual research.

Existing pending issues to avoid duplicating:
${summarizeIssueFiles(readIssueFiles(pendingDir))}

Write the file using this exact markdown structure:
# Short imperative title

Issue ID: ${issueId}
Issue type: workflow_delta | usability | ui_clarity | feedback_state | mobile_interaction | error_recovery | content_affordance
Target user: who benefits
Risk: low | medium | high

## Problem
What is wrong or missing.

## Current workflow
What the user currently experiences.

## Desired workflow
What should happen after the fix.

## Why it matters
Why this matters.

## Acceptance criteria
- Specific observable outcome.
- Specific observable outcome.

## Suggested files
- relative/path.ext

Rules:
- Create only the issue file under .copilot-issue-loop/issues/.
- Do not edit source, docs, tests, package files, or other repository files.
- Keep the issue small enough for one autonomous Copilot fixer pass.
- Do not print the file content after creating it; just confirm the path.`;

  if (options.preview) {
    console.log(prompt);
    return;
  }

  await runCopilot("issue file generator", prompt);

  if (!existsSync(issuePath)) {
    throw new Error(`Generator did not create expected issue file: ${relativeToRoot(issuePath)}`);
  }

  console.log(JSON.stringify(readIssueFile(issuePath), null, 2));
}

async function fixNextIssueFile() {
  try {
    return await withRunLock(async () => {
      const issue = readIssueFiles(pendingDir)[0];

      if (!issue) {
        console.log("No pending issue files.");
        return false;
      }

      const inProgressPath = resolve(inProgressDir, issue.fileName);
      renameSync(issue.path, inProgressPath);

      if (options.preview) {
        renameSync(inProgressPath, issue.path);
        console.log(JSON.stringify({ selected: issue }, null, 2));
        return true;
      }

      const completionPath = resolve(
        completedDir,
        `${issue.id}-${new Date().toISOString().replace(/[:.]/g, "")}.md`
      );

      const prompt = `You are an autonomous fixer subagent for the Meal Plan Calculator repository.

Implement exactly the issue in this gitignored file and no unrelated improvements:
${relativeToRoot(inProgressPath)}

After implementation, run the relevant existing checks. Then create a completion report at:
${relativeToRoot(completionPath)}

Use this exact completion report structure:
# ${issue.title}

Issue file: ${relativeToRoot(inProgressPath)}
Status: fixed | not_fixing | failed | needs_review

## Summary
What happened.

## Files changed
- relative/path.ext

## Checks
- command - result

## Notes
Short note.

## Publish
- commit: commit sha or none
- push: pushed branch or none

Rules:
- Do not edit any other file under .copilot-issue-loop except the completion report.
- If the issue is unsafe, duplicate, too broad, already satisfied, or not worth doing, make no source changes and use Status: not_fixing.
- Before changing files, inspect the worktree. Do not overwrite unrelated user changes. If unrelated changes make the fix unsafe, use Status: needs_review.
- If you make code or docs changes, run the relevant existing checks before publishing.
- If checks pass and the issue is fixed, commit only the files changed for this issue and push the current branch.
- Use a concise commit message and include this trailer:
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
- If validation or publishing fails, use Status: failed or needs_review and leave the issue file for review.
- Preserve existing behavior unless the issue explicitly requires a behavior change.
- Make surgical, repository-convention-friendly changes.
- Do not delete the issue file yourself; this wrapper deletes or moves it after reading the completion report.`;

      let completion;
      try {
        await runCopilot(`fixer ${issue.id}`, prompt);
        completion = readCompletionReport(completionPath);
      } catch (error) {
        completion = {
          status: "failed",
          summary: error instanceof Error ? error.message : String(error)
        };
        writeFileSync(
          completionPath,
          formatCompletionReport(issue, completion),
          "utf8"
        );
      }

      if (completion.status === "fixed" || completion.status === "not_fixing") {
        rmSync(inProgressPath, { force: true });
      } else {
        renameSync(inProgressPath, resolve(needsReviewDir, issue.fileName));
      }

      console.log(
        JSON.stringify(
          {
            id: issue.id,
            title: issue.title,
            status: completion.status,
            completion: relativeToRoot(completionPath)
          },
          null,
          2
        )
      );
      return true;
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Lock is already held:")) {
      console.log("Another fixer is already running.");
      return true;
    }

    throw error;
  }
}

async function generateIssueLoop(deadlineMs = createDeadline()) {
  while (Date.now() < deadlineMs) {
    await generateIssueFile();

    if (options.preview) {
      return;
    }

    if (options.generateSeconds > 0) {
      await sleepUntilDeadline(options.generateSeconds * 1_000, deadlineMs);
    }
  }
}

async function fixIssueLoop(deadlineMs = createDeadline()) {
  while (Date.now() < deadlineMs) {
    const didWork = await fixNextIssueFile();

    if (options.preview) {
      return;
    }

    if (!didWork) {
      console.log(`Waiting ${options.waitSeconds} seconds for a pending issue file...`);
      await sleepUntilDeadline(options.waitSeconds * 1_000, deadlineMs);
    }
  }
}

async function runHour() {
  const deadlineMs = createDeadline();
  console.log(
    `Running generator and fixer loops for ${options.durationMinutes} minutes.`
  );

  const stopTimer = options.preview
    ? undefined
    : setTimeout(() => {
        stopRequested = true;
        console.log("Script time limit reached; stopping active Copilot sessions.");
        stopActiveCopilotProcesses();
      }, Math.max(0, deadlineMs - Date.now()));

  const results = await Promise.allSettled([
    generateIssueLoop(deadlineMs),
    fixIssueLoop(deadlineMs)
  ]);

  if (stopTimer) {
    clearTimeout(stopTimer);
  }

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0 && !stopRequested) {
    throw new Error(
      failures
        .map((failure) => failure.reason?.message ?? String(failure.reason))
        .join("\n")
    );
  }

  console.log("Issue loop window complete.");
}

function printStatus() {
  const pending = readIssueFiles(pendingDir);
  const inProgress = readIssueFiles(inProgressDir);
  const needsReview = readIssueFiles(needsReviewDir);
  const completed = readMarkdownFiles(completedDir);

  console.log(
    JSON.stringify(
      {
        folders: {
          pending: relativeToRoot(pendingDir),
          inProgress: relativeToRoot(inProgressDir),
          needsReview: relativeToRoot(needsReviewDir),
          completed: relativeToRoot(completedDir)
        },
        counts: {
          pending: pending.length,
          inProgress: inProgress.length,
          needsReview: needsReview.length,
          completed: completed.length
        },
        pending: pending.map((issue) => ({
          id: issue.id,
          title: issue.title,
          file: relativeToRoot(issue.path)
        })),
        needsReview: needsReview.map((issue) => ({
          id: issue.id,
          title: issue.title,
          file: relativeToRoot(issue.path)
        }))
      },
      null,
      2
    )
  );
}

function parseOptions(args) {
  const parsed = {
    focus: "",
    model: "",
    preview: false,
    generateSeconds: 0,
    waitSeconds: 120,
    durationMinutes: 60,
    extraCopilotArgs: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      parsed.extraCopilotArgs = args.slice(index + 1);
      break;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    }

    if (arg === "--focus") {
      parsed.focus = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--model") {
      parsed.model = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--wait-seconds") {
      const value = Number.parseInt(readRequiredValue(args, index, arg), 10);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--wait-seconds must be a non-negative integer.");
      }

      parsed.waitSeconds = value;
      index += 1;
      continue;
    }

    if (arg === "--generate-seconds") {
      const value = Number.parseInt(readRequiredValue(args, index, arg), 10);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--generate-seconds must be a non-negative integer.");
      }

      parsed.generateSeconds = value;
      index += 1;
      continue;
    }

    if (arg === "--duration-minutes") {
      const value = Number.parseInt(readRequiredValue(args, index, arg), 10);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error("--duration-minutes must be a positive integer.");
      }

      parsed.durationMinutes = value;
      index += 1;
      continue;
    }

    if (arg === "--preview" || arg === "--dry-run") {
      parsed.preview = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      parsed.focus = parsed.focus ? `${parsed.focus} ${arg}` : arg;
      continue;
    }

    throw new Error(`Unknown option: ${arg}\n\n${usage}`);
  }

  return parsed;
}

function createDeadline() {
  return Date.now() + options.durationMinutes * 60 * 1_000;
}

async function sleepUntilDeadline(milliseconds, deadlineMs) {
  const remainingMs = deadlineMs - Date.now();
  if (remainingMs <= 0) {
    return;
  }

  await sleep(Math.min(milliseconds, remainingMs));
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

function readRequiredValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value.`);
  }

  return value;
}

function ensureQueueDirs() {
  for (const directory of [
    queueDir,
    pendingDir,
    inProgressDir,
    completedDir,
    needsReviewDir
  ]) {
    mkdirSync(directory, { recursive: true });
  }
}

function migrateLegacyEventsToIssueFiles() {
  if (!existsSync(legacyEventsPath)) {
    return;
  }

  const migratedPath = resolve(queueDir, "legacy-events.jsonl");
  if (existsSync(migratedPath)) {
    return;
  }

  const issueMap = new Map();
  const lines = readFileSync(legacyEventsPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim());

  for (const line of lines) {
    const event = JSON.parse(line);
    if (event.event === "created") {
      issueMap.set(event.issue.id, { ...event.issue, status: "pending" });
      continue;
    }

    const issue = issueMap.get(event.id);
    if (issue && event.event === "completed") {
      issue.status = normalizeStatus(event.result?.status);
    }
  }

  for (const issue of issueMap.values()) {
    if (issue.status !== "pending") {
      continue;
    }

    const issuePath = resolve(pendingDir, `${issue.id}.md`);
    if (!existsSync(issuePath)) {
      writeFileSync(issuePath, formatIssueMarkdown(issue), "utf8");
    }
  }

  renameSync(legacyEventsPath, migratedPath);
}

function readIssueFiles(directory) {
  return readMarkdownFiles(directory)
    .map(readIssueFile)
    .sort((left, right) => left.createdMs - right.createdMs);
}

function readMarkdownFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter((fileName) => fileName.toLowerCase().endsWith(".md"))
    .map((fileName) => resolve(directory, fileName))
    .sort();
}

function readIssueFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const fileName = filePath.split(/[\\/]/).at(-1);
  const stat = statSync(filePath);

  return {
    id: parseField(content, "Issue ID") || fileName.replace(/\.md$/i, ""),
    title: parseTitle(content),
    issueType: parseField(content, "Issue type") || "unknown",
    targetUser: parseField(content, "Target user") || "",
    risk: parseField(content, "Risk") || "",
    fileName,
    path: filePath,
    createdMs: stat.birthtimeMs || stat.mtimeMs
  };
}

function readCompletionReport(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Fixer did not create completion report: ${relativeToRoot(filePath)}`);
  }

  const content = readFileSync(filePath, "utf8");
  return {
    status: normalizeStatus(parseField(content, "Status")),
    summary: extractSection(content, "Summary")
  };
}

function parseTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Untitled issue";
}

function parseField(content, fieldName) {
  const pattern = new RegExp(`^${escapeRegExp(fieldName)}:\\s*(.+)$`, "mi");
  const match = content.match(pattern);
  return match ? match[1].trim() : "";
}

function extractSection(content, sectionName) {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(sectionName)}\\s*$`, "im");
  const match = content.match(pattern);
  if (!match || match.index === undefined) {
    return "";
  }

  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const nextSection = rest.search(/^##\s+/m);
  return (nextSection === -1 ? rest : rest.slice(0, nextSection)).trim();
}

function summarizeIssueFiles(issues) {
  if (issues.length === 0) {
    return "No existing pending issue files.";
  }

  return issues
    .slice(-20)
    .map(
      (issue) =>
        `- ${issue.id} (${issue.issueType}): ${issue.title} [${relativeToRoot(
          issue.path
        )}]`
    )
    .join("\n");
}

function formatIssueMarkdown(issue) {
  return `# ${issue.title}

Issue ID: ${issue.id}
Issue type: ${issue.issueType ?? "usability"}
Target user: ${issue.targetUser ?? ""}
Risk: ${issue.risk ?? "low"}

## Problem
${issue.problem ?? ""}

## Current workflow
${issue.currentWorkflow ?? ""}

## Desired workflow
${issue.desiredWorkflow ?? ""}

## Why it matters
${issue.whyItMatters ?? ""}

## Acceptance criteria
${(issue.acceptanceCriteria ?? []).map((item) => `- ${item}`).join("\n")}

## Suggested files
${(issue.suggestedFiles ?? []).map((item) => `- ${item}`).join("\n")}
`;
}

function formatCompletionReport(issue, completion) {
  return `# ${issue.title}

Issue file: ${relativeToRoot(issue.path)}
Status: ${normalizeStatus(completion.status)}

## Summary
${completion.summary ?? ""}

## Files changed

## Checks

## Notes
Generated by wrapper after fixer failure.
`;
}

async function withRunLock(callback) {
  const lockPath = resolve(queueDir, "fixer.lock");
  const release = acquireLock(lockPath);
  try {
    return await callback();
  } finally {
    release();
  }
}

function acquireLock(lockPath) {
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Lock is already held: ${relativeToRoot(lockPath)}`);
    }

    throw error;
  }

  writeFileSync(resolve(lockPath, "owner.txt"), `${process.pid}\n`, "utf8");
  return () => rmSync(lockPath, { recursive: true, force: true });
}

function runCopilot(label, prompt) {
  return new Promise((resolvePromise, reject) => {
    if (stopRequested) {
      reject(new Error(`Copilot ${label} was not started because the script time limit was reached.`));
      return;
    }

    console.error(`Running Copilot ${label}...`);

    const copilotArgs = [
      "--no-color",
      "--stream",
      "off",
      "--allow-all-tools"
    ];

    if (options.model) {
      copilotArgs.push("--model", options.model);
    }

    copilotArgs.push(...options.extraCopilotArgs, "-p", prompt);

    const child = spawn("copilot", copilotArgs, {
      cwd: rootDir,
      env: { ...process.env, NO_COLOR: "1", COPILOT_ALLOW_ALL: "1" },
      windowsHide: true
    });
    activeCopilotProcesses.add(child);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      activeCopilotProcesses.delete(child);
      if (stopRequested) {
        reject(new Error(`Copilot ${label} stopped because the script time limit was reached.`));
        return;
      }

      if (code !== 0) {
        reject(
          new Error(
            `Copilot ${label} failed with exit code ${code}.\n\n${stderr || stdout}`
          )
        );
        return;
      }

      resolvePromise(stdout.trim());
    });
  });
}

function stopActiveCopilotProcesses() {
  for (const child of activeCopilotProcesses) {
    if (!child.killed) {
      child.kill();
    }
  }
}

function normalizeStatus(status) {
  const allowed = new Set(["fixed", "not_fixing", "failed", "needs_review"]);
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  return allowed.has(normalized) ? normalized : "needs_review";
}

function createIssueId(timestamp) {
  const compact = timestamp.replace(/\D/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `ux-${compact}-${suffix}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relativeToRoot(filePath) {
  return relative(rootDir, filePath) || ".";
}
