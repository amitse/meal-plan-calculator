import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { argValue, firstPositionalArg, hasToken } from "../infra/cli.js";
import { writeJsonReport } from "../infra/report-io.js";
import { evaluateHardGate, hardGateApplies, uiEaseHardGates } from "./hard-gates.js";
import { uiTraceScenarios } from "./trace-scenarios.js";
import type { BrowserTraceStep, UiEaseCheckResult, UiEaseEvalReport, UiEaseScenarioResult, UiEaseSelector, UiTraceScenario } from "./types.js";

const args = process.argv.slice(2);
const baseUrl = argValue(args, "--base-url") ?? process.env.UI_EASE_BASE_URL ?? "http://127.0.0.1:6006";
const outputPath = argValue(args, "--output") ?? process.env.COPILOT_EVAL_OUTPUT ?? firstPositionalArg(args, {
  flagsWithValues: ["--output", "--base-url", "--scenarios"],
  ignoredAssignments: ["output", "base-url", "scenarios"],
  ignoredBareTokens: ["no-exit-code", "require-browser"],
}) ?? join("eval-results", "ui-ease-report.json");
const noExitCode = hasToken(args, "--no-exit-code") || process.env.COPILOT_EVAL_NO_EXIT_CODE === "1";
const requireBrowser = hasToken(args, "--require-browser") || process.env.UI_EASE_REQUIRE_BROWSER === "1";
const scenarioFilter = new Set((argValue(args, "--scenarios") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean));
const selectedScenarios = scenarioFilter.size > 0
  ? uiTraceScenarios.filter((scenario) => scenarioFilter.has(scenario.id))
  : uiTraceScenarios;

const browserAvailable = await isServerAvailable(baseUrl);
const scenarios = browserAvailable
  ? await runBrowserScenarios(selectedScenarios)
  : selectedScenarios.map((scenario) => skippedBrowserScenario(scenario, requireBrowser));

const report: UiEaseEvalReport = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  browserAvailable,
  status: overallStatus(scenarios),
  scenarios,
  results: scenarios.map((scenario) => ({
    scenarioId: scenario.scenarioId,
    status: scenario.status,
    deterministicScore: scoreChecks(scenario.checks),
    checks: scenario.checks.map((check) => ({ ...check, severity: check.severity ?? "hard" })),
  })),
  hardGates: uiEaseHardGates,
};

await writeJsonReport(outputPath, report);
printReport(report, outputPath);

if (report.status === "fail" && !noExitCode) {
  process.exitCode = 1;
}

async function runBrowserScenarios(scenariosToRun: UiTraceScenario[]): Promise<UiEaseScenarioResult[]> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();

  try {
    const results: UiEaseScenarioResult[] = [];
    for (const scenario of scenariosToRun) {
      const context = await browser.newContext({
        baseURL: baseUrl,
        colorScheme: "dark",
        locale: "en-US",
        viewport: { width: scenario.viewport.width, height: scenario.viewport.height },
      });
      const page = await context.newPage();
      await page.addInitScript("window.__name = (value) => value;");
      await page.evaluate("window.__name = (value) => value;");
      const checks: UiEaseCheckResult[] = [];
      const artifactPaths: string[] = [];
      let initialGatesRun = false;

      try {
        for (const step of scenario.steps) {
          const check = await runStep(page, scenario, step, artifactPaths);
          checks.push(check);
          if (check.status === "fail") break;

          if (!initialGatesRun && step.action === "wait-story-ready") {
            initialGatesRun = true;
            checks.push(...await runHardGates(page, scenario, "initial"));
            if (checks.some((candidate) => candidate.status === "fail")) break;
          }
        }

        if (!checks.some((candidate) => candidate.status === "fail")) {
          checks.push(...await runHardGates(page, scenario, "final"));
        }
      } catch (error) {
        checks.push({
          id: `${scenario.id}:runner-error`,
          label: "Runner error",
          status: "fail",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await context.close();
      }

      results.push({
        scenarioId: scenario.id,
        label: scenario.label,
        status: checks.some((check) => check.status === "fail") ? "fail" : "pass",
        checks,
        artifactPaths,
      });
    }

    return results;
  } finally {
    await browser.close();
  }
}

async function runHardGates(page: import("@playwright/test").Page, scenario: UiTraceScenario, phase: "initial" | "final") {
  const checks: UiEaseCheckResult[] = [];
  for (const gate of uiEaseHardGates.filter((candidate) => hardGateApplies(candidate, scenario, phase))) {
    checks.push(await evaluateHardGate(gate, page));
  }
  return checks;
}

async function runStep(page: import("@playwright/test").Page, scenario: UiTraceScenario, step: BrowserTraceStep, artifactPaths: string[]): Promise<UiEaseCheckResult> {
  const started = Date.now();
  try {
    if (step.action === "goto-story") {
      const storyId = step.storyId ?? scenario.storyId;
      await page.goto(`/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: "domcontentloaded", timeout: step.timeoutMs ?? 30_000 });
    } else if (step.action === "wait-story-ready") {
      await page.waitForSelector("main.app-shell", { timeout: step.timeoutMs ?? 10_000 });
      await page.waitForSelector('body[data-story-ready="true"]', { timeout: step.timeoutMs ?? 10_000 });
      await page.evaluate(() => document.fonts?.ready);
    } else if (step.action === "click") {
      await locatorFor(page, step.selector).click({ timeout: step.timeoutMs ?? 10_000 });
    } else if (step.action === "fill") {
      await locatorFor(page, step.selector).fill(step.value ?? "", { timeout: step.timeoutMs ?? 10_000 });
    } else if (step.action === "select") {
      await locatorFor(page, step.selector).selectOption(step.value ?? "", { timeout: step.timeoutMs ?? 10_000 });
    } else if (step.action === "press") {
      await locatorFor(page, step.selector).press(step.value ?? "Enter", { timeout: step.timeoutMs ?? 10_000 });
    } else if (step.action === "expect-visible" || step.action === "wait-for-visible") {
      await locatorFor(page, step.selector).waitFor({ state: "visible", timeout: step.timeoutMs ?? 10_000 });
    } else if (step.action === "reload") {
      await page.reload({ waitUntil: "domcontentloaded", timeout: step.timeoutMs ?? 30_000 });
      await page.waitForSelector("main.app-shell", { timeout: step.timeoutMs ?? 10_000 });
    } else if (step.action === "screenshot") {
      const artifactId = step.artifactId ?? step.id;
      const artifactPath = join("eval-results", "ui-ease-artifacts", `${scenario.id}-${artifactId}.png`);
      await mkdir(join("eval-results", "ui-ease-artifacts"), { recursive: true });
      await page.screenshot({ path: artifactPath, fullPage: true, animations: "disabled" });
      artifactPaths.push(artifactPath);
    }

    return {
      id: `${scenario.id}:${step.id}`,
      label: step.label,
      status: "pass",
      message: `${step.action} completed in ${Date.now() - started}ms.`,
    };
  } catch (error) {
    return {
      id: `${scenario.id}:${step.id}`,
      label: step.label,
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
      evidence: { action: step.action, selector: step.selector, value: step.value },
    };
  }
}

function locatorFor(page: import("@playwright/test").Page, selector: UiEaseSelector | undefined) {
  if (!selector) {
    throw new Error("Trace step requires a selector.");
  }

  if (selector.kind === "css") return page.locator(selector.value).first();
  if (selector.kind === "label") return page.getByLabel(nameMatcher(selector.name, selector.exact)).first();
  if (selector.kind === "placeholder") return page.getByPlaceholder(nameMatcher(selector.name, selector.exact)).first();
  if (selector.kind === "text") return page.getByText(nameMatcher(selector.value, selector.exact)).first();
  return page.getByRole(selector.role as Parameters<typeof page.getByRole>[0], {
    name: selector.name ? nameMatcher(selector.name, selector.exact) : undefined,
    exact: selector.exact,
  }).first();
}

function nameMatcher(name: string, exact?: boolean) {
  return exact ? name : new RegExp(escapeRegExp(name), "i");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function skippedBrowserScenario(scenario: UiTraceScenario, failWhenUnavailable: boolean): UiEaseScenarioResult {
  const status = failWhenUnavailable ? "fail" : "skip";
  const checks: UiEaseCheckResult[] = [
    {
      id: `${scenario.id}:declared`,
      label: "Trace scenario declared",
      status: "pass",
      message: `${scenario.steps.length} trace steps and ${scenario.artifactExpectations.length} artifact expectations are declared.`,
      evidence: { taskTrace: scenario.taskTrace, storyId: scenario.storyId, tags: scenario.tags },
    },
    ...scenario.artifactExpectations.map((artifact) => ({
      id: `${scenario.id}:artifact:${artifact.id}`,
      label: artifact.description,
      status,
      message: failWhenUnavailable
        ? `Live browser at ${baseUrl} is required to capture ${artifact.kind} artifact ${artifact.id}.`
        : `Skipped ${artifact.kind} artifact ${artifact.id}; no live Storybook server was available at ${baseUrl}.`,
      evidence: artifact,
    } satisfies UiEaseCheckResult)),
    ...uiEaseHardGates.map((gate) => ({
      id: `${scenario.id}:gate:${gate.id}`,
      label: gate.label,
      status,
      message: failWhenUnavailable
        ? `Live browser at ${baseUrl} is required to evaluate hard gate ${gate.id}.`
        : `Skipped hard gate ${gate.id}; no live Storybook server was available at ${baseUrl}.`,
      evidence: gate,
    } satisfies UiEaseCheckResult)),
  ];

  return {
    scenarioId: scenario.id,
    label: scenario.label,
    status,
    checks,
    artifactPaths: [],
  };
}

function overallStatus(results: UiEaseScenarioResult[]) {
  if (results.some((scenario) => scenario.status === "fail")) return "fail";
  if (results.every((scenario) => scenario.status === "skip")) return "skip";
  return "pass";
}

function scoreChecks(checks: UiEaseCheckResult[]) {
  const decisiveChecks = checks.filter((check) => check.status !== "skip");
  return decisiveChecks.length === 0 ? 0 : decisiveChecks.filter((check) => check.status === "pass").length / decisiveChecks.length;
}

async function isServerAvailable(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok || response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function printReport(report: UiEaseEvalReport, path: string) {
  console.log(`UI-ease eval: ${report.status.toUpperCase()} (${report.scenarios.length} scenarios, browser ${report.browserAvailable ? "available" : "skipped"})`);
  for (const scenario of report.scenarios) {
    const failed = scenario.checks.filter((check) => check.status === "fail");
    const skipped = scenario.checks.filter((check) => check.status === "skip");
    console.log(`- ${scenario.status.toUpperCase()} ${scenario.scenarioId}: ${scenario.checks.length} checks, ${failed.length} failed, ${skipped.length} skipped`);
    for (const check of failed.slice(0, 5)) {
      console.log(`  - ${check.id}: ${check.message}`);
    }
  }
  console.log(`Report: ${path}`);
}
