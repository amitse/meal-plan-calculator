import type { Page } from "@playwright/test";
import type { HardGateDefinition, UiEaseCheckResult, UiTraceScenario } from "./types.js";

export const uiEaseHardGates: HardGateDefinition[] = [
  {
    id: "first-viewport-primary-inputs-visible",
    label: "First viewport primary inputs visible",
    description: "Calories, protein, diet, Generate, and Start manually are visible before scrolling on first run.",
    phase: "initial",
    scenarioIds: ["first-run-generate", "manual-add-foods", "theme-switch"],
  },
  {
    id: "touch-targets-44px",
    label: "44px touch targets",
    description: "Visible interactive controls meet the minimum 44 by 44 CSS pixel touch target.",
    phase: "final",
    scenarioIds: "all",
  },
  {
    id: "visible-focus-states",
    label: "Visible focus states",
    description: "Keyboard-focusable controls expose a visible outline, shadow, or border treatment on focus.",
    phase: "final",
    scenarioIds: "all",
  },
  {
    id: "wcag-aa-contrast",
    label: "WCAG AA contrast",
    description: "Visible text samples meet WCAG AA contrast against their effective background.",
    phase: "final",
    scenarioIds: "all",
  },
  {
    id: "no-horizontal-overflow",
    label: "No horizontal overflow",
    description: "The app shell and document do not exceed the viewport width on mobile.",
    phase: "final",
    scenarioIds: "all",
  },
  {
    id: "bottom-actions-not-covering-content",
    label: "Bottom actions not covering content",
    description: "Sticky bottom actions do not overlap non-action interactive content when scrolled to the end.",
    phase: "final",
    scenarioIds: "all",
  },
  {
    id: "dialogs-labelled",
    label: "Dialogs labelled",
    description: "Every dialog has an accessible label via aria-label or aria-labelledby.",
    phase: "final",
    scenarioIds: "all",
  },
  {
    id: "forms-accessible-names",
    label: "Forms accessible names",
    description: "Visible form controls and buttons expose an accessible name.",
    phase: "final",
    scenarioIds: "all",
  },
];

export function hardGateApplies(gate: HardGateDefinition, scenario: UiTraceScenario, phase: HardGateDefinition["phase"]) {
  return gate.phase === phase && (gate.scenarioIds === "all" || gate.scenarioIds.includes(scenario.id));
}

export async function evaluateHardGate(gate: HardGateDefinition, page: Page): Promise<UiEaseCheckResult> {
  if (gate.id === "first-viewport-primary-inputs-visible") return firstViewportPrimaryInputsVisible(gate, page);
  if (gate.id === "touch-targets-44px") return touchTargets44px(gate, page);
  if (gate.id === "visible-focus-states") return visibleFocusStates(gate, page);
  if (gate.id === "wcag-aa-contrast") return wcagAaContrast(gate, page);
  if (gate.id === "no-horizontal-overflow") return noHorizontalOverflow(gate, page);
  if (gate.id === "bottom-actions-not-covering-content") return bottomActionsNotCoveringContent(gate, page);
  if (gate.id === "dialogs-labelled") return dialogsLabelled(gate, page);
  if (gate.id === "forms-accessible-names") return formsAccessibleNames(gate, page);

  return result(gate, "fail", `No evaluator registered for ${gate.id}.`);
}

function result(gate: HardGateDefinition, status: UiEaseCheckResult["status"], message: string, evidence?: unknown): UiEaseCheckResult {
  return {
    id: gate.id,
    label: gate.label,
    status,
    message,
    evidence,
  };
}

async function firstViewportPrimaryInputsVisible(gate: HardGateDefinition, page: Page) {
  const checks = await page.evaluate(() => {
    const viewportHeight = window.innerHeight;
    const required = [
      { id: "calories", selector: "input[aria-label='Calories']" },
      { id: "protein", selector: "input[aria-label='Protein']" },
      { id: "diet", selector: "input[name='dietary-level']" },
      { id: "generate", selector: "button.primary-action" },
      { id: "manual-start", selector: ".manual-start-action" },
    ];

    return required.map((entry) => {
      const element = document.querySelector<HTMLElement>(entry.selector);
      const rect = element?.getBoundingClientRect();
      const style = element ? window.getComputedStyle(element) : undefined;
      return {
        id: entry.id,
        selector: entry.selector,
        visible: Boolean(element && rect && rect.width > 0 && rect.height > 0 && style?.visibility !== "hidden" && style?.display !== "none"),
        inFirstViewport: Boolean(rect && rect.top >= 0 && rect.bottom <= viewportHeight),
        rect: rect ? { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : undefined,
      };
    });
  });
  const failures = checks.filter((check) => !check.visible || !check.inFirstViewport);
  return result(gate, failures.length === 0 ? "pass" : "fail", failures.length === 0 ? "Primary controls are visible in the first viewport." : "Primary controls are missing or require scrolling.", { checks });
}

async function touchTargets44px(gate: HardGateDefinition, page: Page) {
  const evidence = await page.evaluate(() => {
    function accessibleName(element: HTMLElement) {
      const labelledBy = element.getAttribute("aria-labelledby");
      const ariaLabel = element.getAttribute("aria-label");
      const label = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
        ? element.labels?.[0]?.textContent
        : undefined;
      return (ariaLabel || labelledBy?.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ") || label || element.textContent || element.title || "").trim();
    }

    const selector = "button, input:not([type='hidden']), select, textarea, summary, a[href]";
    const nodes = [...document.querySelectorAll<HTMLElement>(selector)];
    const failures = nodes.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const visible = rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      if (!visible || element.closest("[aria-hidden='true']")) return [];
      if (rect.width >= 44 && rect.height >= 44) return [];
      return [{
        tag: element.tagName.toLowerCase(),
        name: accessibleName(element),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }];
    });
    return { checked: nodes.length, failures: failures.slice(0, 20), failureCount: failures.length };
  });
  return result(gate, evidence.failureCount === 0 ? "pass" : "fail", evidence.failureCount === 0 ? "All visible controls meet 44px touch target sizing." : `${evidence.failureCount} visible controls are smaller than 44px.`, evidence);
}

async function visibleFocusStates(gate: HardGateDefinition, page: Page) {
  await page.evaluate(() => document.body.focus());
  const seen = new Set<string>();
  const failures: Array<{ tag: string; name: string; outline: string; boxShadow: string; borderColor: string }> = [];
  let checked = 0;

  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      if (!element || element === document.body) return undefined;

      const labelledBy = element.getAttribute("aria-labelledby");
      const ariaLabel = element.getAttribute("aria-label");
      const label = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
        ? element.labels?.[0]?.textContent
        : undefined;
      const name = (ariaLabel || labelledBy?.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ") || label || element.textContent || element.title || "").trim();
      const candidates = [
        element,
        element.parentElement,
        element.nextElementSibling instanceof HTMLElement ? element.nextElementSibling : undefined,
        element.closest<HTMLElement>(".number-stepper"),
      ].filter((candidate): candidate is HTMLElement => Boolean(candidate));

      const styles = candidates.map((candidate) => {
        const style = window.getComputedStyle(candidate);
        const outlineWidth = Number.parseFloat(style.outlineWidth || "0");
        const borderWidths = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map((value) => Number.parseFloat(value || "0"));
        return {
          outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
          boxShadow: style.boxShadow,
          borderColor: style.borderColor,
          hasIndicator: (style.outlineStyle !== "none" && outlineWidth >= 2) || style.boxShadow !== "none" || borderWidths.some((width) => width >= 2),
        };
      });

      const primaryStyle = styles[0];
      return {
        key: `${element.tagName}:${name}:${element.getAttribute("aria-label") ?? ""}`,
        tag: element.tagName.toLowerCase(),
        name,
        outline: primaryStyle?.outline ?? "",
        boxShadow: primaryStyle?.boxShadow ?? "",
        borderColor: primaryStyle?.borderColor ?? "",
        hasIndicator: styles.some((style) => style.hasIndicator),
      };
    });

    if (!focused || seen.has(focused.key)) continue;
    seen.add(focused.key);
    checked += 1;
    if (!focused.hasIndicator) {
      failures.push({
        tag: focused.tag,
        name: focused.name,
        outline: focused.outline,
        boxShadow: focused.boxShadow,
        borderColor: focused.borderColor,
      });
    }
  }

  const evidence = { checked, failures: failures.slice(0, 20), failureCount: failures.length };
  return result(gate, evidence.failureCount === 0 ? "pass" : "fail", evidence.failureCount === 0 ? "Visible controls expose focus indicators." : `${evidence.failureCount} controls lack a detectable focus indicator.`, evidence);
}

async function wcagAaContrast(gate: HardGateDefinition, page: Page) {
  const evidence = await page.evaluate(() => {
    type Rgb = { r: number; g: number; b: number; a: number };

    function parseCssColor(value: string): Rgb | undefined {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return undefined;
      const parts = match[1]?.split(",").map((part) => Number.parseFloat(part.trim()));
      if (!parts || parts.length < 3 || parts.some((part) => Number.isNaN(part))) return undefined;
      return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
    }

    function effectiveBackground(element: HTMLElement): Rgb | undefined {
      let current: HTMLElement | null = element;
      while (current) {
        const color = parseCssColor(window.getComputedStyle(current).backgroundColor);
        if (color && color.a > 0) return color;
        current = current.parentElement;
      }
      return parseCssColor(window.getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
    }

    function relativeLuminance(color: Rgb) {
      const channels = [color.r, color.g, color.b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
    }

    function contrastRatio(a: number, b: number) {
      const light = Math.max(a, b);
      const dark = Math.min(a, b);
      return (light + 0.05) / (dark + 0.05);
    }

    const textElements = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const text = (element.innerText || element.textContent || "").trim();
        if (!text) return false;
        if ([...element.children].some((child) => (child.textContent || "").trim() === text)) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .slice(0, 120);

    const failures = textElements.flatMap((element) => {
      const style = window.getComputedStyle(element);
      const foreground = parseCssColor(style.color);
      const background = effectiveBackground(element);
      if (!foreground || !background) return [];
      const ratio = contrastRatio(relativeLuminance(foreground), relativeLuminance(background));
      const fontSize = Number.parseFloat(style.fontSize || "16");
      const fontWeight = Number.parseInt(style.fontWeight || "400", 10);
      const largeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const minimum = largeText ? 3 : 4.5;
      if (ratio >= minimum) return [];
      return [{
        text: (element.innerText || element.textContent || "").trim().slice(0, 80),
        ratio: Number(ratio.toFixed(2)),
        minimum,
        color: style.color,
        background: `rgb(${background.r}, ${background.g}, ${background.b})`,
      }];
    });

    return { checked: textElements.length, failures: failures.slice(0, 20), failureCount: failures.length };
  });
  return result(gate, evidence.failureCount === 0 ? "pass" : "fail", evidence.failureCount === 0 ? "Visible sampled text meets WCAG AA contrast." : `${evidence.failureCount} sampled text nodes are below WCAG AA contrast.`, evidence);
}

async function noHorizontalOverflow(gate: HardGateDefinition, page: Page) {
  const evidence = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    appShellScrollWidth: document.querySelector<HTMLElement>(".app-shell")?.scrollWidth,
  }));
  const maxWidth = Math.max(evidence.documentScrollWidth, evidence.bodyScrollWidth, evidence.appShellScrollWidth ?? 0);
  const pass = maxWidth <= evidence.clientWidth + 1;
  return result(gate, pass ? "pass" : "fail", pass ? "No horizontal overflow detected." : "Document or app shell is wider than the viewport.", evidence);
}

async function bottomActionsNotCoveringContent(gate: HardGateDefinition, page: Page) {
  const evidence = await page.evaluate(() => {
    function accessibleName(element: HTMLElement) {
      const labelledBy = element.getAttribute("aria-labelledby");
      const ariaLabel = element.getAttribute("aria-label");
      const label = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
        ? element.labels?.[0]?.textContent
        : undefined;
      return (ariaLabel || labelledBy?.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ") || label || element.textContent || element.title || "").trim();
    }

    window.scrollTo(0, document.documentElement.scrollHeight);
    const actions = [...document.querySelectorAll<HTMLElement>(".bottom-action")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
    const overlaps: Array<{ actionClass: string; coveredTag: string; coveredName: string }> = [];

    for (const action of actions) {
      const actionRect = action.getBoundingClientRect();
      const focusables = [...document.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]")]
        .filter((candidate) => !action.contains(candidate));
      for (const candidate of focusables) {
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        const visible = rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        if (!visible) continue;
        const intersects = rect.left < actionRect.right && rect.right > actionRect.left && rect.top < actionRect.bottom && rect.bottom > actionRect.top;
        if (intersects) {
          overlaps.push({
            actionClass: action.className,
            coveredTag: candidate.tagName.toLowerCase(),
            coveredName: accessibleName(candidate),
          });
        }
      }
    }

    return { actionCount: actions.length, overlaps: overlaps.slice(0, 20), overlapCount: overlaps.length };
  });
  return result(gate, evidence.overlapCount === 0 ? "pass" : "fail", evidence.overlapCount === 0 ? "Bottom actions do not overlap non-action controls." : `${evidence.overlapCount} non-action controls overlap bottom actions.`, evidence);
}

async function dialogsLabelled(gate: HardGateDefinition, page: Page) {
  const evidence = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>("dialog")];
    const failures = dialogs.flatMap((dialog) => {
      const ariaLabel = dialog.getAttribute("aria-label")?.trim();
      const labelledBy = dialog.getAttribute("aria-labelledby");
      const labelText = labelledBy
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      return ariaLabel || labelText ? [] : [{ className: dialog.className, open: dialog.open }];
    });
    return { checked: dialogs.length, failures, failureCount: failures.length };
  });
  return result(gate, evidence.failureCount === 0 ? "pass" : "fail", evidence.failureCount === 0 ? "All dialogs are labelled." : `${evidence.failureCount} dialogs are missing accessible labels.`, evidence);
}

async function formsAccessibleNames(gate: HardGateDefinition, page: Page) {
  const evidence = await page.evaluate(() => {
    function accessibleName(element: HTMLElement) {
      const labelledBy = element.getAttribute("aria-labelledby");
      const ariaLabel = element.getAttribute("aria-label");
      const label = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
        ? element.labels?.[0]?.textContent
        : undefined;
      return (ariaLabel || labelledBy?.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ") || label || element.textContent || element.title || "").trim();
    }

    const controls = [...document.querySelectorAll<HTMLElement>("button, input:not([type='hidden']), select, textarea")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
    const failures = controls.flatMap((element) => {
      const name = accessibleName(element);
      return name ? [] : [{ tag: element.tagName.toLowerCase(), type: element.getAttribute("type"), className: element.className }];
    });
    return { checked: controls.length, failures: failures.slice(0, 20), failureCount: failures.length };
  });
  return result(gate, evidence.failureCount === 0 ? "pass" : "fail", evidence.failureCount === 0 ? "Visible form controls have accessible names." : `${evidence.failureCount} visible controls are unnamed.`, evidence);
}
