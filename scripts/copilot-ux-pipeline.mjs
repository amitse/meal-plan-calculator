#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const usage = `Usage:
  npm run ux:copilot-pipeline
  npm run ux:copilot-pipeline -- "optional focus phrase"
  node scripts/copilot-ux-pipeline.mjs [options] [-- extra-copilot-args]

Options:
  --focus <text>       Bias the random persona toward a segment or scenario.
  --model <name>       Pass a Copilot model name, for example gpt-5.
  --keep-stages        Save intermediate stage outputs under .copilot-pipeline/.
  --help               Show this help.

Examples:
  npm run ux:copilot-pipeline
  npm run ux:copilot-pipeline -- "busy vegetarian office worker"
  node scripts/copilot-ux-pipeline.mjs --focus "busy vegetarian office worker"
  node scripts/copilot-ux-pipeline.mjs --model gpt-5 -- --allow-all-tools
`;

const options = {
  focus: "",
  model: "",
  keepStages: false,
  extraCopilotArgs: []
};

const cliArgs = process.argv.slice(2);
for (let index = 0; index < cliArgs.length; index += 1) {
  const arg = cliArgs[index];

  if (arg === "--") {
    options.extraCopilotArgs = cliArgs.slice(index + 1);
    break;
  }

  if (arg === "--help" || arg === "-h") {
    console.log(usage);
    process.exit(0);
  }

  if (arg === "--focus") {
    options.focus = readRequiredValue(cliArgs, index, arg);
    index += 1;
    continue;
  }

  if (arg === "--model") {
    options.model = readRequiredValue(cliArgs, index, arg);
    index += 1;
    continue;
  }

  if (arg === "--keep-stages") {
    options.keepStages = true;
    continue;
  }

  if (!arg.startsWith("--")) {
    options.focus = options.focus ? `${options.focus} ${arg}` : arg;
    continue;
  }

  throw new Error(`Unknown option: ${arg}\n\n${usage}`);
}

const appContext = buildAppContext();

const personaPrompt = `You are generating UX research inputs for the Meal Plan Calculator website.

Create one random, realistic target-audience user for this app.
${options.focus ? `Bias the random choice toward this focus: ${options.focus}` : "Choose a plausible target-audience segment yourself."}

Use this app context:
${appContext}

Return only a compact markdown persona with:
- name
- age range and context
- dietary pattern
- meal-planning goal
- constraints and frustrations
- technical comfort
- why they would try this website`;

const persona = await runCopilotStage("1/3 persona", personaPrompt);
saveStage("01-persona.md", persona);

const workflowPrompt = `You are a UX researcher deciding what task a generated target user would attempt in the Meal Plan Calculator website.

Persona:
${persona}

Use this app context:
${appContext}

Decide the most realistic workflow this person would use in the app.
Return only concise markdown with:
- entry trigger
- exact goal
- step-by-step workflow
- information they enter
- decisions they expect the app to make
- success criteria`;

const workflow = await runCopilotStage("2/3 workflow", workflowPrompt);
saveStage("02-workflow.md", workflow);

const finalPrompt = `You are a senior UX researcher and product manager reviewing the Meal Plan Calculator website concept.

Use the persona, workflow, and app context below. Produce one final actionable report.

Persona:
${persona}

Workflow:
${workflow}

App context:
${appContext}

Return only the final report in markdown with these sections:
1. Persona snapshot
2. Likely workflow
3. What they would like
4. What they would dislike or find confusing
5. Top 3 things to change now
6. Top 3 things to improve next

Make the recommendations specific to this website and prioritize changes that would improve first-run user experience.`;

const finalReport = await runCopilotStage("3/3 UX report", finalPrompt);
saveStage("03-final-report.md", finalReport);

console.log(finalReport.trim());

function readRequiredValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value.`);
  }

  return value;
}

function buildAppContext() {
  const parts = [
    readContextFile("README.md", 4_000),
    readContextFile("docs/user-stories.md", 8_000),
    readContextFile("docs/mobile-design-system.md", 4_000)
  ].filter(Boolean);

  return parts.join("\n\n---\n\n");
}

function readContextFile(relativePath, maxCharacters) {
  const filePath = resolve(rootDir, relativePath);
  if (!existsSync(filePath)) {
    return "";
  }

  const content = readFileSync(filePath, "utf8").trim();
  const clipped =
    content.length > maxCharacters
      ? `${content.slice(0, maxCharacters)}\n\n[truncated for prompt size]`
      : content;

  return `File: ${relativePath}\n\n${clipped}`;
}

function runCopilotStage(label, prompt) {
  return new Promise((resolvePromise, reject) => {
    console.error(`Running Copilot stage ${label}...`);

    const copilotArgs = ["--no-color", "--stream", "off"];
    if (options.model) {
      copilotArgs.push("--model", options.model);
    }

    copilotArgs.push(...options.extraCopilotArgs, "-p", prompt);

    const child = spawn("copilot", copilotArgs, {
      cwd: rootDir,
      env: { ...process.env, NO_COLOR: "1" },
      windowsHide: true
    });

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
      if (code !== 0) {
        reject(
          new Error(
            `Copilot stage ${label} failed with exit code ${code}.\n\n${stderr || stdout}`
          )
        );
        return;
      }

      const output = stdout.trim();
      if (!output) {
        reject(new Error(`Copilot stage ${label} returned no output.`));
        return;
      }

      resolvePromise(output);
    });
  });
}

function saveStage(fileName, content) {
  if (!options.keepStages) {
    return;
  }

  const outputDir = resolve(rootDir, ".copilot-pipeline");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, fileName), `${content.trim()}\n`, "utf8");
}
