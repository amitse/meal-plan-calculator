import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  calculateDailyPlanItemNutrition,
  calculateMealTotals,
  evaluateMealPattern,
  getExchangeOption,
  getFoodItem,
  type DailyPlan,
  type DailyPlanItem,
  type BoundEvaluation,
  type DietaryLevel,
  type MealRole,
  type NutritionMetric,
} from "../../src/index.js";
import {
  addItemToMeal,
  addMeal,
  buildNutritionInput,
  decodeShareState,
  encodeShareState,
  exchangeOptionGramAmount,
  exchangeOptionsForItem,
  failureRecoveryMessages,
  generateEditablePlan,
  generateEditablePlanResult,
  grainOptions,
  initialFormState,
  mealTargetStatus,
  normalizeEditableFormState,
  parseServingAmountInput,
  planItemDisplayQuantity,
  planEvaluation,
  proteinOptions,
  randomizePlan,
  removePlanItem,
  shareUrlForState,
  swapExchangeOption,
  updateItemAmount,
  type EditableFormState,
  type MacroField,
  type MealMacroTarget,
  type ShareablePlannerState,
} from "./editable-planner.js";
import { planExportCsv, planExportExcelHtml, planExportHtmlTable, planExportTsv } from "./export-plan.js";
import "./styles.css";

type BoundField = "none" | "min" | "max" | "target";
type PlannerView = "targets" | "plan";
type ShareState = {
  message: string;
  manualUrl?: string;
  shareKey?: string;
  stale?: boolean;
};
type RandomizeFeedback = {
  message: string;
  changed: boolean;
};
type LoadedUrlState = {
  state?: ShareablePlannerState;
  shareLoadFailed: boolean;
};
type GenerateOptions = {
  seed?: number;
  useExistingLocks?: boolean;
};
type DeletedItemUndo = {
  item: DailyPlanItem;
  itemIndex: number;
  label: string;
  mealId: string;
  wasLocked: boolean;
};
type AddedMealFeedback = {
  key: number;
  mealId: string;
  message: string;
};
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
type IconName =
  | "add"
  | "alert"
  | "bowl"
  | "calories"
  | "carb"
  | "check"
  | "close"
  | "copy"
  | "dairy"
  | "delete"
  | "download"
  | "egg"
  | "export"
  | "fat"
  | "fiber"
  | "fish"
  | "food"
  | "fruit"
  | "install"
  | "leaf"
  | "lock"
  | "macros"
  | "plate"
  | "protein"
  | "randomize"
  | "share"
  | "swap"
  | "targets"
  | "tools"
  | "unlock";

const dietOptions: { level: DietaryLevel; label: string }[] = [
  { level: "vegetarian", label: "Vegetarian" },
  { level: "eggetarian", label: "Eggetarian" },
  { level: "nonVegetarian", label: "Non-veg" },
];

const dietDescriptions: Record<DietaryLevel, string> = {
  vegetarian: "Allows plant, dairy, and whey proteins; excludes eggs, chicken, and fish.",
  eggetarian: "Allows vegetarian proteins and eggs; excludes chicken and fish.",
  nonVegetarian: "Allows vegetarian proteins, eggs, chicken, and fish.",
};

type QuickStartPreset = {
  label: string;
  form: EditableFormState;
};

const quickStartPresets: QuickStartPreset[] = [
  {
    label: "Light veg",
    form: {
      ...initialFormState,
      calories: "1600",
      protein: "60",
      dietaryLevel: "vegetarian",
      preferredProteins: ["paneer-50g", "tofu-100g", "whey-30g"],
      avoidEggs: true,
      avoidChickenFish: true,
    },
  },
  {
    label: "Eggs",
    form: {
      ...initialFormState,
      calories: "1800",
      protein: "80",
      dietaryLevel: "eggetarian",
      preferredProteins: ["two-whole-eggs"],
      avoidEggs: false,
      avoidChickenFish: true,
    },
  },
  {
    label: "Chicken",
    form: {
      ...initialFormState,
      calories: "2200",
      protein: "100",
      dietaryLevel: "nonVegetarian",
      preferredProteins: ["chicken-fish-100g"],
      avoidEggs: false,
      avoidChickenFish: false,
    },
  },
  {
    label: "Rice + whey",
    form: {
      ...initialFormState,
      calories: "1900",
      protein: "80",
      dietaryLevel: "vegetarian",
      preferredGrains: ["cooked-rice"],
      preferredProteins: ["whey-30g"],
      avoidEggs: true,
      avoidChickenFish: true,
    },
  },
];
const staleShareMessage = "Plan changed - share again for an updated link.";

function App() {
  const loadedUrlState = useMemo(loadStateFromUrl, []);
  const urlState = loadedUrlState.state;
  const [form, setForm] = useState<EditableFormState>(normalizeEditableFormState(urlState?.form));
  const [plan, setPlan] = useState<DailyPlan | undefined>(urlState?.plan);
  const [activeView, setActiveView] = useState<PlannerView>(urlState?.plan ? "plan" : "targets");
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set(urlState?.lockedItemIds ?? []));
  const [mealTargets, setMealTargets] = useState<Record<string, MealMacroTarget>>(urlState?.mealTargets ?? {});
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [shareState, setShareState] = useState<ShareState | undefined>();
  const [shareLoadFailed, setShareLoadFailed] = useState(loadedUrlState.shareLoadFailed);
  const [generationBlockers, setGenerationBlockers] = useState<string[]>([]);
  const [isPlanStale, setIsPlanStale] = useState(false);
  const [mealToolMessages, setMealToolMessages] = useState<Record<string, string>>({});
  const [planRandomizeFeedback, setPlanRandomizeFeedback] = useState<RandomizeFeedback | undefined>();
  const [mealRandomizeFeedback, setMealRandomizeFeedback] = useState<Record<string, RandomizeFeedback>>({});
  const [deletedItemUndo, setDeletedItemUndo] = useState<DeletedItemUndo | undefined>();
  const [addedMealFeedback, setAddedMealFeedback] = useState<AddedMealFeedback | undefined>();
  const [addMealBlocker, setAddMealBlocker] = useState("");
  const [expandedMealIds, setExpandedMealIds] = useState<Set<string>>(new Set());
  const [installState, setInstallState] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | undefined>();
  const [isInstalledView, setIsInstalledView] = useState(() => isStandaloneApp());
  const resultRef = useRef<HTMLElement>(null);
  const mealCardRefs = useRef<Map<string, HTMLDetailsElement>>(new Map());
  const addedMealFeedbackKey = useRef(0);
  const revealedAddedMealKey = useRef<number | undefined>(undefined);

  const evaluation = plan ? planEvaluation(plan, form) : undefined;
  const recoveryMessages = evaluation?.status === "fail" ? failureRecoveryMessages(evaluation) : [];
  const targetStatusItems = evaluation && hasOptionalMacroTarget(evaluation.targetBounds) ? evaluation.targetBounds : [];
  const proteinTarget = Number(form.protein || 0);
  const likedProteinAvoidConflicts = useMemo(() => foodRuleConflictLabels(form), [form]);
  const lockedItemCount = lockedIds.size;
  const currentShareableState = useMemo<ShareablePlannerState>(() => ({
    form,
    plan,
    lockedItemIds: [...lockedIds],
    mealTargets,
  }), [form, plan, lockedIds, mealTargets]);
  const currentShareKey = useMemo(() => encodeShareState(currentShareableState), [currentShareableState]);

  useEffect(() => {
    if (plan && activeView === "plan") {
      resultRef.current?.focus();
    }
  }, [activeView, plan]);

  useEffect(() => {
    if (!addedMealFeedback || activeView !== "plan" || revealedAddedMealKey.current === addedMealFeedback.key) {
      return;
    }

    const mealCard = mealCardRefs.current.get(addedMealFeedback.mealId);
    if (!mealCard) {
      return;
    }

    revealedAddedMealKey.current = addedMealFeedback.key;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mealCard.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    const summary = mealCard.querySelector("summary");

    if (summary instanceof HTMLElement) {
      summary.focus({ preventScroll: true });
    } else {
      mealCard.focus({ preventScroll: true });
    }
  }, [activeView, addedMealFeedback, plan]);

  useEffect(() => {
    if (!shareState?.shareKey || shareState.stale || shareState.shareKey === currentShareKey) {
      return;
    }

    setShareState({
      message: staleShareMessage,
      shareKey: shareState.shareKey,
      stale: true,
    });
  }, [currentShareKey, shareState]);

  useEffect(() => {
    const isLocalDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (isLocalDev || !("serviceWorker" in navigator) || !window.location.pathname.startsWith("/meal-plan-calculator/")) {
      return;
    }

    void navigator.serviceWorker.register("/meal-plan-calculator/sw.js", { scope: "/meal-plan-calculator/" });
  }, []);

  useEffect(() => {
    setIsInstalledView(isStandaloneApp());

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallState("");
    }

    function handleAppInstalled() {
      setInstallPrompt(undefined);
      setInstallState("");
      setIsInstalledView(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  function update<K extends keyof EditableFormState>(key: K, value: EditableFormState[K]) {
    setGenerationBlockers([]);
    setMealToolMessages({});
    setAddMealBlocker("");
    clearRandomizeFeedback();
    markPlanStale();
    setForm((current) => ({ ...current, [key]: value }));
  }

  function stepTarget(key: "calories" | "protein", delta: number, min = 0, max = Number.POSITIVE_INFINITY) {
    const current = Number(form[key] || 0);
    const next = Math.min(max, Math.max(min, current + delta));
    update(key, String(next));
  }

  function generate(sourceForm = form, options: GenerateOptions = {}) {
    const seed = options.seed ?? Date.now();
    const useExistingLocks = options.useExistingLocks ?? true;
    setDeletedItemUndo(undefined);
    setAddedMealFeedback(undefined);
    setAddMealBlocker("");
    setGenerationBlockers([]);
    setMealToolMessages({});
    clearRandomizeFeedback();
    const result = generateEditablePlanResult(sourceForm, useExistingLocks ? plan : undefined, useExistingLocks ? lockedIds : new Set<string>(), seed);

    if (result.plan) {
      setIsPlanStale(false);
      setPlan(result.plan);
      setActiveView("plan");
      return true;
    } else {
      setGenerationBlockers(result.blockers);
      return false;
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    generate();
  }

  function applyQuickStartPreset(preset: QuickStartPreset) {
    const replacesPlan = Boolean(plan);
    setForm(preset.form);
    setLockedIds(new Set());
    setMealTargets({});
    setMealToolMessages({});
    setAddMealBlocker("");
    setShareState(undefined);

    if (generate(preset.form, { useExistingLocks: false }) && replacesPlan) {
      setShareState({ message: `${preset.label} example replaced the previous plan.` });
    }
  }

  function markPlanStale() {
    if (plan) {
      setIsPlanStale(true);
    }
  }

  function randomizeVisiblePlan() {
    if (!plan) return;
    setDeletedItemUndo(undefined);
    setAddedMealFeedback(undefined);
    setAddMealBlocker("");
    setMealRandomizeFeedback({});
    const next = randomizePlan(plan, form, lockedIds);
    const changed = JSON.stringify(next) !== JSON.stringify(plan);
    setPlan(next);
    setPlanRandomizeFeedback({
      changed,
      message: changed
        ? "Plan randomized."
        : "No different plan found with the current locks and food rules. Unlock items or relax rules, then try again.",
    });
    setIsPlanStale(false);
  }

  function updateDietaryLevel(level: DietaryLevel) {
    setGenerationBlockers([]);
    setMealToolMessages({});
    setAddMealBlocker("");
    clearRandomizeFeedback();
    markPlanStale();
    setForm((current) => ({
      ...current,
      dietaryLevel: level,
      preferredProteins: visibleProteinPreferences(current.preferredProteins, level),
      avoidEggs: level === "vegetarian",
      avoidChickenFish: level !== "nonVegetarian",
    }));
  }

  function updatePreference(key: "preferredGrains" | "preferredProteins", optionId: string, checked: boolean) {
    setGenerationBlockers([]);
    setMealToolMessages({});
    setAddMealBlocker("");
    clearRandomizeFeedback();
    markPlanStale();
    setForm((current) => {
      const next = checked
        ? [...new Set([...current[key], optionId])]
        : current[key].filter((id) => id !== optionId);
      return { ...current, [key]: next };
    });
  }

  function toggleLock(itemId: string) {
    setDeletedItemUndo(undefined);
    clearRandomizeFeedback();
    setLockedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function deleteItem(itemId: string) {
    if (!plan) return;
    const meal = plan.meals.find((candidate) => candidate.items.some((item) => item.id === itemId));
    const itemIndex = meal?.items.findIndex((item) => item.id === itemId) ?? -1;
    const item = meal?.items[itemIndex];

    if (!meal || !item) return;

    clearRandomizeFeedback();
    setDeletedItemUndo({
      item,
      itemIndex,
      label: planItemLabel(item),
      mealId: meal.id,
      wasLocked: lockedIds.has(itemId),
    });
    setPlan(removePlanItem(plan, itemId));
    setLockedIds((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
  }

  function undoDeletedItem() {
    if (!deletedItemUndo) return;

    clearRandomizeFeedback();
    setPlan((current) => current ? restoreDeletedItem(current, deletedItemUndo) : current);
    setLockedIds((current) => {
      const next = new Set(current);
      const itemId = deletedItemUndo.item.id;

      if (itemId) {
        if (deletedItemUndo.wasLocked) {
          next.add(itemId);
        } else {
          next.delete(itemId);
        }
      }

      return next;
    });
    setDeletedItemUndo(undefined);
  }

  function addMealItem(mealId: string, groupId: "grain" | "protein-serving" | "fruit") {
    if (!plan) return;

    clearRandomizeFeedback();
    const next = addItemToMeal(plan, mealId, groupId, groupId === "protein-serving" ? form : undefined);
    if (next === plan && groupId === "protein-serving") {
      setMealToolMessages((current) => ({
        ...current,
        [mealId]: "No protein matches your active diet and avoid rules. Change food rules, then add protein.",
      }));
      return;
    }

    setMealToolMessages((current) => {
      if (!current[mealId]) return current;
      const { [mealId]: _removed, ...rest } = current;
      return rest;
    });
    setDeletedItemUndo(undefined);
    setPlan(next);
  }

  function addEmptyMeal() {
    if (!plan) return;
    setDeletedItemUndo(undefined);
    clearRandomizeFeedback();
    const next = addMeal(plan, form);
    if (next === plan) {
      setAddedMealFeedback(undefined);
      setAddMealBlocker("No protein matches your active diet and avoid rules. Relax food rules before adding a meal.");
      return;
    }

    const addedMeal = next.meals.at(-1);
    setAddMealBlocker("");
    setPlan(next);

    if (addedMeal) {
      const key = addedMealFeedbackKey.current + 1;
      addedMealFeedbackKey.current = key;
      setAddedMealFeedback({
        key,
        mealId: addedMeal.id,
        message: `${addedMeal.displayName} added. Review its foods and tools below.`,
      });
      setExpandedMealIds(new Set([addedMeal.id]));
    }
  }

  function updatePlanItemServing(itemId: string, amount: number) {
    if (!plan) return;
    setDeletedItemUndo(undefined);
    clearRandomizeFeedback();
    setPlan(updateItemAmount(plan, itemId, amount));
  }

  function swapPlanItem(itemId: string, optionId: string) {
    if (!plan) return;
    setDeletedItemUndo(undefined);
    clearRandomizeFeedback();
    setPlan(swapExchangeOption(plan, itemId, optionId));
  }

  function randomizeSingleMeal(mealId: string) {
    if (!plan) return;
    const meal = plan.meals.find((candidate) => candidate.id === mealId);
    if (!meal) return;

    setDeletedItemUndo(undefined);
    setPlanRandomizeFeedback(undefined);
    const next = randomizePlan(plan, form, lockedIds, mealId, Date.now(), mealTargets[mealId]);
    const nextMeal = next.meals.find((candidate) => candidate.id === mealId);
    const changed = JSON.stringify(nextMeal) !== JSON.stringify(meal);
    setPlan(next);
    setMealRandomizeFeedback({
      [mealId]: {
        changed,
        message: changed
          ? `${meal.displayName} randomized.`
          : "No different meal found with the current locks and food rules. Unlock items or relax rules, then try again.",
      },
    });
  }

  function clearLocks() {
    setDeletedItemUndo(undefined);
    clearRandomizeFeedback();
    setLockedIds(new Set());
  }

  function updateMealTarget(mealId: string, key: keyof MealMacroTarget, value: string) {
    clearRandomizeFeedback();
    setMealTargets((current) => ({ ...current, [mealId]: { ...current[mealId], [key]: value } }));
  }

  function clearRandomizeFeedback() {
    setPlanRandomizeFeedback(undefined);
    setMealRandomizeFeedback({});
  }

  function toggleMealExpanded(mealId: string, open: boolean) {
    setExpandedMealIds((current) => {
      if (current.has(mealId) === open) {
        return current;
      }

      if (open) {
        return new Set([mealId]);
      }

      const next = new Set(current);
      next.delete(mealId);
      return next;
    });
  }

  function share() {
    const state = currentShareableState;
    const shareKey = currentShareKey;
    const url = shareUrlForState(state);
    window.history.replaceState(null, "", `?s=${shareKey}`);

    const showManualShareRecovery = () => setShareState({
      message: "Copy blocked. Copy this share link manually.",
      manualUrl: url,
      shareKey,
    });

    if (typeof navigator.clipboard?.writeText !== "function") {
      showManualShareRecovery();
      return;
    }

    void navigator.clipboard.writeText(url)
      .then(() => setShareState({ message: "Link copied", shareKey }))
      .catch(showManualShareRecovery);
  }

  function startCleanPlanFromBrokenShare() {
    const url = new URL(window.location.href);
    url.searchParams.delete("s");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    setForm(normalizeEditableFormState(undefined));
    setPlan(undefined);
    setActiveView("targets");
    setLockedIds(new Set());
    setMealTargets({});
    setOptionsOpen(false);
    setShareState(undefined);
    setGenerationBlockers([]);
    setIsPlanStale(false);
    setMealToolMessages({});
    clearRandomizeFeedback();
    setDeletedItemUndo(undefined);
    setAddedMealFeedback(undefined);
    setAddMealBlocker("");
    setExpandedMealIds(new Set());
    setShareLoadFailed(false);
  }

  function exportCsv() {
    if (!plan) return;
    downloadTextFile(exportFilename("csv"), "text/csv;charset=utf-8", planExportCsv(plan));
    setShareState({ message: "CSV downloaded" });
  }

  function exportExcel() {
    if (!plan) return;
    downloadTextFile(exportFilename("xls"), "application/vnd.ms-excel;charset=utf-8", planExportExcelHtml(plan));
    setShareState({ message: "Excel file downloaded" });
  }

  async function copyForGoogleDocs() {
    if (!plan) return;
    const plainText = planExportTsv(plan);
    const html = planExportHtmlTable(plan);

    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plainText], { type: "text/plain" }),
          }),
        ]);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plainText);
      } else {
        setShareState({ message: "Copy blocked; use CSV or Excel" });
        return;
      }

      setShareState({ message: "Copied for Google Docs" });
    } catch {
      setShareState({ message: "Copy blocked; use CSV or Excel" });
    }
  }

  async function installApp() {
    if (isStandaloneApp()) {
      setInstallPrompt(undefined);
      setInstallState("");
      setIsInstalledView(true);
      return;
    }

    if (!installPrompt) {
      setInstallState(installFallbackMessage());
      return;
    }

    const prompt = installPrompt;
    setInstallPrompt(undefined);
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setInstallState(choice.outcome === "accepted" ? "" : installFallbackMessage());
  }

  return (
    <main className="app-shell">
      <header className="mobile-header">
        <h1>Meal plan</h1>
        {!isInstalledView && (
          <button className="with-icon" type="button" onClick={() => void installApp()}>
            <Icon name="install" />
            {isIosBrowser() ? "Add app" : "Install"}
          </button>
        )}
      </header>
      {!isInstalledView && installState && <p className="install-state" role="status">{installState}</p>}
      {shareLoadFailed && (
        <div className="share-load-warning" role="alert">
          <p><strong>Shared plan could not be opened.</strong> Start a new plan or ask for a fresh link.</p>
          <button type="button" onClick={startCleanPlanFromBrokenShare}>Start new plan</button>
        </div>
      )}

      {activeView === "targets" && (
      <form className="planner" onSubmit={submit}>
        <section className="input-panel primary-panel" aria-labelledby="targets-title">
          <h2 id="targets-title" className="sr-only">Plan</h2>

          {plan && (
            <div className="current-plan-return" role="status">
              <p>Current plan stays unchanged unless you regenerate.</p>
              <button type="button" onClick={() => setActiveView("plan")}>Back to current plan</button>
            </div>
          )}

          <div className="quick-fields">
            <label className="field calorie-field">
              <span className="label-with-icon"><Icon name="calories" />Calories (kcal)</span>
              <div className="target-stepper">
                <button type="button" aria-label="Decrease calories by 50" onClick={() => stepTarget("calories", -50, 800, 5000)}>−</button>
                <input aria-describedby="calories-helper" inputMode="numeric" value={form.calories} onChange={(event) => update("calories", event.target.value)} required min="800" max="5000" step="50" type="number" />
                <button type="button" aria-label="Increase calories by 50" onClick={() => stepTarget("calories", 50, 800, 5000)}>+</button>
              </div>
              <small id="calories-helper" className="field-hint">Target band: plans can pass within about 50 kcal.</small>
            </label>
            <label className="field">
              <span className="label-with-icon"><Icon name="protein" />Protein (gm)</span>
              <div className="target-stepper">
                <button type="button" aria-label="Decrease protein by 5 grams" onClick={() => stepTarget("protein", -5)}>−</button>
                <input aria-describedby="protein-helper" inputMode="numeric" value={form.protein} onChange={(event) => update("protein", event.target.value)} min="0" step="5" type="number" />
                <button type="button" aria-label="Increase protein by 5 grams" onClick={() => stepTarget("protein", 5)}>+</button>
              </div>
              <small id="protein-helper" className="field-hint">Target band: plans can pass within about 5gm.</small>
            </label>
          </div>

          <fieldset className="segmented diet-segments" aria-describedby="diet-helper">
            <legend>Diet</legend>
            {dietOptions.map((option) => (
              <label key={option.level}>
                <input
                  type="radio"
                  name="dietary-level"
                  checked={form.dietaryLevel === option.level}
                  onChange={() => updateDietaryLevel(option.level)}
                />
                <span><Icon name={dietIcon(option.level)} />{option.label}</span>
              </label>
            ))}
            <p id="diet-helper" className="helper diet-helper">{dietDescriptions[form.dietaryLevel]}</p>
          </fieldset>

          <details className="options-drawer" open={optionsOpen} onToggle={(event) => setOptionsOpen(event.currentTarget.open)}>
            <summary>
              <span className="summary-label"><Icon name="tools" />Customize</span>
              <span className="drawer-summary">{customizeDrawerSummary(form)}</span>
            </summary>

            <details className="nested-drawer">
              <summary>
                <span className="summary-label"><Icon name="food" />Food</span>
                <span className="drawer-summary">{foodDrawerSummary(form)}</span>
              </summary>
              <PreferenceGroup iconFor={grainOptionIcon} label="Choose carbs" options={grainOptions} values={form.preferredGrains} onChange={(optionId, checked) => updatePreference("preferredGrains", optionId, checked)} />
              <PreferenceGroup iconFor={proteinOptionIcon} label="Choose proteins" options={proteinOptions.filter((option) => isProteinVisible(option.id, form.dietaryLevel))} values={form.preferredProteins} onChange={(optionId, checked) => updatePreference("preferredProteins", optionId, checked)} />
              <fieldset className="avoid-list">
                <legend>Leave out</legend>
                <CheckChip icon="dairy" label="Paneer" checked={form.avoidPaneer} onChange={(checked) => update("avoidPaneer", checked)} />
                <CheckChip icon="protein" label="Whey" checked={form.avoidWhey} onChange={(checked) => update("avoidWhey", checked)} />
                {form.dietaryLevel !== "vegetarian" && <CheckChip icon="egg" label="Eggs" checked={form.avoidEggs} onChange={(checked) => update("avoidEggs", checked)} />}
                {form.dietaryLevel === "nonVegetarian" && <CheckChip icon="fish" label="Chicken / fish" checked={form.avoidChickenFish} onChange={(checked) => update("avoidChickenFish", checked)} />}
              </fieldset>
              {likedProteinAvoidConflicts.length > 0 && (
                <p className="food-rule-conflict" role="note">
                  <strong>Leave out takes priority:</strong> {formatFoodRuleConflictList(likedProteinAvoidConflicts)} {likedProteinAvoidConflicts.length === 1 ? "is" : "are"} also selected above, so {likedProteinAvoidConflicts.length === 1 ? "it" : "they"} will stay out of the plan.
                </p>
              )}
            </details>

            <details className="nested-drawer">
              <summary>
                <span className="summary-label"><Icon name="macros" />Macros</span>
                <span className="drawer-summary">{macroDrawerSummary(form)}</span>
              </summary>
              <div className="macro-grid">
                <MacroInput icon="carb" label="Carbs" value={form.carbs} onChange={(value) => update("carbs", value)} />
                <MacroInput icon="fat" label="Fat" value={form.fat} onChange={(value) => update("fat", value)} />
                <MacroInput icon="fiber" label="Fiber" value={form.fiber} onChange={(value) => update("fiber", value)} />
                <MacroInput icon="fat" label="Saturated fat" value={form.saturatedFat} onChange={(value) => update("saturatedFat", value)} />
              </div>
            </details>

          </details>

          <details className={`quick-start-presets example-drawer${plan ? " is-compact" : ""}`}>
            <summary>
              <span className="summary-label"><Icon name="plate" />{plan ? "Replace with example" : "Try an example"}</span>
              <span className="drawer-summary">Use sample targets</span>
            </summary>
            <div className="quick-start-row">
              {quickStartPresets.map((preset) => (
                <button key={preset.label} type="button" onClick={() => applyQuickStartPreset(preset)}>
                  <span className="quick-start-label"><Icon name="bowl" />{preset.label}</span>
                  <span className="quick-start-preview">{quickStartPresetPreview(preset.form)}</span>
                </button>
              ))}
            </div>
          </details>

          {generationBlockers.length > 0 && (
            <div className="generation-feedback" role="alert" aria-label="Generation blockers">
              <p><strong>Plan blocked.</strong> Adjust these before regenerating:</p>
              <ul>
                {generationBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            </div>
          )}
        </section>

        <div className="bottom-action">
          {isPlanStale && plan && <p className="stale-plan-notice" role="status">Inputs changed - regenerate to apply these choices.</p>}
          <button className="primary-action with-icon" type="submit"><Icon name="plate" />{plan ? "Regenerate plan" : "Generate"}</button>
        </div>
      </form>
      )}

      {activeView === "plan" && plan && evaluation && (
        <section className="result-panel" aria-labelledby="result-title" aria-live="polite" tabIndex={-1} ref={resultRef}>
          <div className="section-heading result-head">
            <div className="result-title-group">
              <h2 id="result-title">Daily plan</h2>
              <span className={`result-status is-${evaluation.status}`}>{evaluation.status === "pass" ? "Within targets" : "Needs adjustment"}</span>
            </div>
            <button className="with-icon" type="button" onClick={() => setActiveView("targets")}><Icon name="targets" />Targets</button>
            <button className="with-icon" type="button" onClick={randomizeVisiblePlan}><Icon name="randomize" />Randomize</button>
            <button className="with-icon" type="button" onClick={share}><Icon name="share" />Share</button>
          </div>
          {planRandomizeFeedback && (
            <p className={`randomize-feedback ${planRandomizeFeedback.changed ? "is-success" : "is-notice"}`} role="status">
              {planRandomizeFeedback.message}
            </p>
          )}
          {shareState && (
            <div className={`share-state${shareState.manualUrl && !shareState.stale ? " manual-share" : ""}${shareState.stale ? " stale-share" : ""}`} role="status">
              <p>{shareState.message}</p>
              {shareState.manualUrl && !shareState.stale && (
                <label className="manual-share-link">
                  <span>Share link</span>
                  <input readOnly value={shareState.manualUrl} onFocus={(event) => event.currentTarget.select()} />
                </label>
              )}
            </div>
          )}
          {isPlanStale && <p className="stale-plan-notice" role="status">Inputs changed - regenerate to apply these choices.</p>}
          <details className="export-drawer">
            <summary>
              <span className="summary-label"><Icon name="export" />Export</span>
              <span className="drawer-summary">CSV · Excel · Google Docs</span>
            </summary>
            <div className="export-actions" aria-label="Export meal plan">
              <button className="with-icon" type="button" onClick={exportCsv}><Icon name="download" />CSV</button>
              <button className="with-icon" type="button" onClick={exportExcel}><Icon name="export" />Excel</button>
              <button className="with-icon" type="button" onClick={() => void copyForGoogleDocs()}><Icon name="copy" />Google Docs</button>
            </div>
          </details>
          {lockedItemCount > 0 && (
            <div className="locked-notice" role="status">
              <p>
                <strong>{lockedItemCount} {lockedItemCount === 1 ? "item" : "items"} locked.</strong>{" "}
                Generate and Randomize keep locked items fixed.
              </p>
              <button type="button" onClick={clearLocks}>Clear locks</button>
            </div>
          )}
          <div className="summary-grid">
            <SummaryMetric icon="calories" label="Calories" value={Math.round(evaluation.totals.values.calories)} suffix="kcal" />
            <SummaryMetric icon="protein" label="Protein" value={Math.round(evaluation.totals.values.protein)} suffix="gm" />
          </div>
          {proteinTarget > 0 && (
            <p className="target-context">Protein target {Math.round(proteinTarget)}gm uses an about ±5gm pass band.</p>
          )}
          {targetStatusItems.length > 0 && (
            <div className="target-status" aria-label="Daily target status">
              {targetStatusItems.map((item) => (
                <TargetStatusItem item={item} key={`${item.bound.metric}-${targetBoundLabel(item)}`} />
              ))}
            </div>
          )}
          {recoveryMessages.length > 0 && (
            <div className="failure" role="alert" aria-label="Target recovery actions">
              <p>Some targets need adjustment:</p>
              <ul>
                {recoveryMessages.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </div>
          )}
          {deletedItemUndo && (
            <div className="undo-delete-state" role="status">
              <p><strong>{deletedItemUndo.label}</strong> removed</p>
              <button type="button" onClick={undoDeletedItem}>Undo</button>
            </div>
          )}
          <p className="meal-list-helper">Tap any meal to view foods, edit servings, swap options, or lock items.</p>
          <div className="meal-list">
            {plan.meals.map((meal) => {
              const mealTotals = calculateMealTotals(meal);
              const status = mealTargetStatus(plan, meal.id, mealTargets[meal.id] ?? {});
              const roleTags = mealRoleTags(meal);
              const lockedItemsInMeal = meal.items.filter((item) => item.id && lockedIds.has(item.id)).length;
              const mealFeedback = mealRandomizeFeedback[meal.id];
              const addedFeedback = addedMealFeedback?.mealId === meal.id ? addedMealFeedback : undefined;
              return (
              <details
                className={`meal-card${addedFeedback ? " is-newly-added" : ""}`}
                key={meal.id}
                open={expandedMealIds.has(meal.id)}
                ref={(node) => {
                  if (node) {
                    mealCardRefs.current.set(meal.id, node);
                  } else {
                    mealCardRefs.current.delete(meal.id);
                  }
                }}
                onToggle={(event) => toggleMealExpanded(meal.id, event.currentTarget.open)}
              >
                <summary>
                  <span className="meal-heading">
                    <span className="meal-title">{meal.displayName}</span>
                    {roleTags.length > 0 && (
                      <span className="meal-role-tags" aria-label={`${meal.displayName} plate roles`}>
                        {roleTags.map((tag) => (
                          <span
                            className={`role-tag ${tag.present ? "is-present" : "is-missing"}`}
                            key={tag.role}
                            aria-label={`${tag.label} ${tag.present ? "present" : "missing"}`}
                          >
                            <Icon name={mealRoleIcon(tag.role)} />
                            {tag.present ? tag.label : `Missing ${tag.label}`}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="meal-summary">
                    <strong>{Math.round(mealTotals.values.calories)} kcal</strong>
                    <small>
                      {Math.round(mealTotals.values.protein)}gm protein · {meal.items.length} items
                      {lockedItemsInMeal > 0 && (
                        <span className="meal-lock-count">{lockedItemsInMeal} locked</span>
                      )}
                    </small>
                    <span className="meal-affordance">Tap to edit</span>
                  </span>
                </summary>
                {addedFeedback && (
                  <p className="meal-added-confirmation" role="status">
                    {addedFeedback.message}
                  </p>
                )}
                <div className="meal-items">
                  {meal.items.map((item, index) => (
                    <PlanItemRow
                      form={form}
                      item={item}
                      key={item.id ?? `${meal.id}-${index}`}
                      locked={Boolean(item.id && lockedIds.has(item.id))}
                      mealId={meal.id}
                      onAmount={(amount) => item.id && updatePlanItemServing(item.id, amount)}
                      onDelete={() => item.id && deleteItem(item.id)}
                      onLock={() => item.id && toggleLock(item.id)}
                      onSwap={(optionId) => item.id && swapPlanItem(item.id, optionId)}
                    />
                  ))}
                </div>
                <details className="meal-tools">
                  <summary>
                    <span className="summary-label"><Icon name="tools" />Meal tools</span>
                    <span className="drawer-summary">{status.length > 0 ? status.join(" · ") : "Targets + add items"}</span>
                  </summary>
                  <div className="meal-targets">
                    <label><span>Kcal</span><input inputMode="numeric" value={mealTargets[meal.id]?.calories ?? ""} onChange={(event) => updateMealTarget(meal.id, "calories", event.target.value)} min="0" max="5000" step="25" type="number" /></label>
                    <label><span>Protein</span><input inputMode="numeric" value={mealTargets[meal.id]?.protein ?? ""} onChange={(event) => updateMealTarget(meal.id, "protein", event.target.value)} min="0" step="5" type="number" /></label>
                    <button className="with-icon" type="button" onClick={() => randomizeSingleMeal(meal.id)}><Icon name="randomize" />Randomize meal</button>
                    <button className="with-icon" type="button" onClick={() => addMealItem(meal.id, "protein-serving")}><Icon name="protein" />Add protein</button>
                    <button className="with-icon" type="button" onClick={() => addMealItem(meal.id, "grain")}><Icon name="carb" />Add grain</button>
                    <button className="with-icon" type="button" onClick={() => addMealItem(meal.id, "fruit")}><Icon name="fruit" />Add fruit</button>
                  </div>
                  <div className="meal-status">
                    {mealFeedback && (
                      <span className={`randomize-feedback-inline ${mealFeedback.changed ? "is-success" : "is-notice"}`}>
                        {mealFeedback.message}
                      </span>
                    )}
                    {[mealToolMessages[meal.id], status.join(" · ")].filter(Boolean).map((message) => (
                      <span key={message}>{message}</span>
                    ))}
                  </div>
                </details>
              </details>
            );
            })}
          </div>
          {addMealBlocker && <p className="randomize-feedback is-notice" role="alert">{addMealBlocker}</p>}
          <button className="secondary-action with-icon" type="button" onClick={addEmptyMeal}><Icon name="add" />Add meal</button>
          <nav className="bottom-action result-action-bar" aria-label="Plan actions">
            <button className="plan-action-button with-icon" type="button" onClick={() => setActiveView("targets")}><Icon name="targets" />Targets</button>
            <button className="plan-action-button with-icon" type="button" onClick={randomizeVisiblePlan}><Icon name="randomize" />Randomize</button>
            <button className="primary-action with-icon" type="button" onClick={share}><Icon name="share" />Share</button>
          </nav>
        </section>
      )}
    </main>
  );
}

function planItemLabel(item: DailyPlanItem) {
  return item.kind === "food"
    ? getFoodItem(item.foodItemId).displayName
    : getExchangeOption(item.exchangeGroupId, item.exchangeOptionId).displayName;
}

function restoreDeletedItem(plan: DailyPlan, deletedItem: DeletedItemUndo): DailyPlan {
  return {
    ...plan,
    meals: plan.meals.map((meal) => {
      if (meal.id !== deletedItem.mealId) {
        return meal;
      }

      if (deletedItem.item.id && meal.items.some((item) => item.id === deletedItem.item.id)) {
        return meal;
      }

      const items = [...meal.items];
      items.splice(Math.min(deletedItem.itemIndex, items.length), 0, deletedItem.item);
      return { ...meal, items };
    }),
  };
}

function MacroInput({ icon, label, value, onChange }: { icon: IconName; label: string; value: MacroField; onChange: (value: MacroField) => void }) {
  return (
    <label className="field compact">
      <span><Icon name={icon} />{label}</span>
      <div className="inline-inputs">
        <select aria-label={`${label} bound type`} value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value as BoundField })}>
          <option value="none">Off</option>
          <option value="min">Min</option>
          <option value="max">Max</option>
          <option value="target">Target</option>
        </select>
        <input aria-label={`${label} value`} inputMode="numeric" value={value.value} onChange={(event) => onChange({ ...value, value: event.target.value })} type="number" disabled={value.mode === "none"} />
      </div>
    </label>
  );
}

function PreferenceGroup({ iconFor, label, options, values, onChange }: { iconFor: (optionId: string) => IconName; label: string; options: { id: string; label: string }[]; values: string[]; onChange: (optionId: string, checked: boolean) => void }) {
  return (
    <fieldset className="choice-group preference-group">
      <legend>{label}</legend>
      {options.map((option) => (
        <label key={option.id}>
          <input type="checkbox" checked={values.includes(option.id)} onChange={(event) => onChange(option.id, event.target.checked)} />
          <span><Icon name={iconFor(option.id)} />{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function CheckChip({ icon, label, checked, onChange }: { icon: IconName; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span><Icon name={icon} />{label}</span>
    </label>
  );
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="line-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      {iconShape(name)}
    </svg>
  );
}

function iconShape(name: IconName) {
  switch (name) {
    case "add":
      return <path d="M12 5v14M5 12h14" />;
    case "alert":
      return (
        <>
          <path d="M12 4 3.7 18.2h16.6L12 4Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </>
      );
    case "bowl":
      return (
        <>
          <path d="M5 11h14c-.4 4.2-3 7-7 7s-6.6-2.8-7-7Z" />
          <path d="M7 11c.9-2 2.6-3 5-3s4.1 1 5 3" />
          <path d="M9 18h6" />
        </>
      );
    case "calories":
      return (
        <>
          <path d="M12 20c3 0 5-2 5-4.8 0-2.5-1.5-4.2-3.4-5.8-.9-.8-1.5-1.9-1.3-3.4-3 1.8-5.3 4.6-5.3 8.9C7 17.9 9 20 12 20Z" />
          <path d="M12 17c1.2 0 2-.8 2-2 0-1-.6-1.8-1.5-2.5-.5.8-1.4 1.4-1.9 2.3-.6 1.2.1 2.2 1.4 2.2Z" />
        </>
      );
    case "carb":
      return (
        <>
          <circle cx="12" cy="12" r="6.2" />
          <path d="M7.8 10.2c2.2-1.2 5.6-1.3 8.4 0" />
          <path d="M8.1 14.2c2.5 1.1 5.3 1 7.8 0" />
        </>
      );
    case "check":
      return <path d="m5 12.5 4.2 4.2L19 7" />;
    case "close":
      return (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </>
      );
    case "copy":
      return (
        <>
          <rect x="8" y="8" width="10" height="11" rx="1.5" />
          <path d="M6 15H5.5A1.5 1.5 0 0 1 4 13.5v-8A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V6" />
        </>
      );
    case "dairy":
      return (
        <>
          <path d="M8 8h8l-1 11H9L8 8Z" />
          <path d="M9 8V5.5C9 4.7 9.7 4 10.5 4h3c.8 0 1.5.7 1.5 1.5V8" />
          <path d="M9 12h6" />
        </>
      );
    case "delete":
      return (
        <>
          <path d="M5 7h14" />
          <path d="M9 7V5h6v2" />
          <path d="m8 10 .6 9h6.8l.6-9" />
        </>
      );
    case "download":
      return (
        <>
          <path d="M12 4v10" />
          <path d="m8 10 4 4 4-4" />
          <path d="M5 19h14" />
        </>
      );
    case "egg":
      return <path d="M12 20c3.1 0 5-2.2 5-5.4C17 10.5 14.8 4 12 4s-5 6.5-5 10.6C7 17.8 8.9 20 12 20Z" />;
    case "export":
      return (
        <>
          <path d="M6 4h8l4 4v12H6V4Z" />
          <path d="M14 4v5h5" />
          <path d="M9 14h6" />
          <path d="M9 17h4" />
        </>
      );
    case "fat":
      return <path d="M12 20c2.8 0 5-2 5-4.8 0-3.8-5-10.2-5-10.2S7 11.4 7 15.2C7 18 9.2 20 12 20Z" />;
    case "fiber":
      return (
        <>
          <path d="M5 19c7-1.2 11-5.2 14-14" />
          <path d="M8 16c-1.4-3-.8-5.3 1.8-7" />
          <path d="M11 13c-1.5-2.8-.9-5 1.8-6.8" />
          <path d="M14 10c.8 2.4 2.2 3.8 4.2 4.2" />
        </>
      );
    case "fish":
      return (
        <>
          <path d="M4 12s3-4 8-4 8 4 8 4-3 4-8 4-8-4-8-4Z" />
          <path d="m20 12-3-3v6l3-3Z" />
          <path d="M9 12h.01" />
        </>
      );
    case "food":
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M4 20h16" />
        </>
      );
    case "fruit":
      return (
        <>
          <path d="M12 8c3.2 0 5 2.2 5 5.2C17 17 14.8 20 12 20s-5-3-5-6.8C7 10.2 8.8 8 12 8Z" />
          <path d="M12 8c.2-2.2 1.3-3.5 3.5-4" />
          <path d="M12.4 7.5C10.2 6.8 8.8 5.8 8 4" />
        </>
      );
    case "install":
      return (
        <>
          <path d="M7 20h10" />
          <path d="M8 4h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
          <path d="M12 7v6" />
          <path d="m9.5 10.5 2.5 2.5 2.5-2.5" />
        </>
      );
    case "leaf":
      return (
        <>
          <path d="M5 13c5-7 10-7 14-7 0 5-3 11-9 11-2.3 0-4-1.4-5-4Z" />
          <path d="M5 18c3-4.5 6.5-7 11-9" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="6" y="10" width="12" height="9" rx="1.5" />
          <path d="M9 10V7a3 3 0 0 1 6 0v3" />
        </>
      );
    case "macros":
      return (
        <>
          <path d="M5 18V9" />
          <path d="M12 18V5" />
          <path d="M19 18v-6" />
          <path d="M4 19h16" />
        </>
      );
    case "plate":
      return (
        <>
          <circle cx="12" cy="12" r="7.2" />
          <path d="M7.8 12.2h8.4" />
          <path d="M10 8.4h4" />
          <path d="M9.2 15.2c1.8.7 3.8.7 5.6 0" />
        </>
      );
    case "protein":
      return (
        <>
          <path d="M6.5 11h11c-.4 4-2.4 6.5-5.5 6.5S6.9 15 6.5 11Z" />
          <path d="M8 11c.7-1.7 2-2.6 4-2.6s3.3.9 4 2.6" />
          <circle cx="10" cy="13.2" r=".6" />
          <circle cx="12" cy="14.5" r=".6" />
          <circle cx="14" cy="13.2" r=".6" />
        </>
      );
    case "randomize":
      return (
        <>
          <path d="M4 7h3c3.5 0 4.5 10 8 10h5" />
          <path d="M17 14l3 3-3 3" />
          <path d="M4 17h3c1.2 0 2.1-1.1 3-2.6" />
          <path d="M14 7h6" />
          <path d="M17 4l3 3-3 3" />
        </>
      );
    case "share":
      return (
        <>
          <circle cx="6" cy="12" r="2" />
          <circle cx="17" cy="6" r="2" />
          <circle cx="17" cy="18" r="2" />
          <path d="m8 11 7-4" />
          <path d="m8 13 7 4" />
        </>
      );
    case "swap":
      return (
        <>
          <path d="M7 7h10" />
          <path d="m14 4 3 3-3 3" />
          <path d="M17 17H7" />
          <path d="m10 14-3 3 3 3" />
        </>
      );
    case "targets":
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 5v3" />
          <path d="M12 16v3" />
          <path d="M5 12h3" />
          <path d="M16 12h3" />
        </>
      );
    case "tools":
      return (
        <>
          <path d="M7 5v14" />
          <path d="M17 5v14" />
          <path d="M4 9h6" />
          <path d="M14 15h6" />
          <circle cx="7" cy="9" r="2" />
          <circle cx="17" cy="15" r="2" />
        </>
      );
    case "unlock":
      return (
        <>
          <rect x="6" y="10" width="12" height="9" rx="1.5" />
          <path d="M9 10V7a3 3 0 0 1 5.6-1.5" />
        </>
      );
  }
}

function macroLabel(label: string, field: MacroField) {
  const value = field.value.trim();
  return field.mode === "none" || value === "" ? undefined : `${label} ${field.mode} ${value}gm`;
}

function customizeDrawerSummary(form: EditableFormState) {
  const activeFoodLabels = activeFoodCustomizationLabels(form);
  const activeMacros = activeMacroCount(form);
  const labels = [
    ...activeFoodLabels,
    activeMacros > 0 ? `${activeMacros} macro limit${activeMacros === 1 ? "" : "s"}` : undefined,
  ].filter((label): label is string => Boolean(label));

  return labels.length > 0 ? labels.join(" · ") : "Foods + macro limits";
}

function foodDrawerSummary(form: EditableFormState) {
  const labels = activeFoodCustomizationLabels(form);
  return labels.length > 0 ? labels.join(" · ") : "All foods allowed";
}

function macroDrawerSummary(form: EditableFormState) {
  const activeMacros = activeMacroCount(form);

  return activeMacros > 0 ? `${activeMacros} macro limit${activeMacros === 1 ? "" : "s"}` : "No macro limits";
}

function quickStartPresetPreview(form: EditableFormState) {
  return [
    `${form.calories} kcal`,
    `${form.protein}gm protein`,
    dietLabel(form.dietaryLevel),
    quickStartFoodCue(form),
  ].filter((label): label is string => Boolean(label)).join(" · ");
}

function dietLabel(level: DietaryLevel) {
  return dietOptions.find((option) => option.level === level)?.label ?? level;
}

function quickStartFoodCue(form: EditableFormState) {
  const grainIds = grainOptions.map((option) => option.id);
  const selectedGrainIds = selectedOptionIds(form.preferredGrains, grainIds);
  const visibleProteinOptions = proteinOptions.filter((option) => isProteinVisible(option.id, form.dietaryLevel));
  const selectedProteinIds = selectedOptionIds(form.preferredProteins, visibleProteinOptions.map((option) => option.id));
  const cues = [
    isAutomaticOptionSet(selectedGrainIds, grainIds) ? undefined : selectedOptionLabels(selectedGrainIds, grainOptions),
    selectedOptionLabels(selectedProteinIds, visibleProteinOptions),
  ].filter((label): label is string => Boolean(label));

  return cues.length > 0 ? cues.join(" + ") : undefined;
}

function activeFoodCustomizationLabels(form: EditableFormState) {
  return [
    narrowedGrainPreferenceLabel(form),
    narrowedProteinPreferenceLabel(form),
    ...avoidLabels(form).map((label) => `No ${label}`),
  ].filter((label): label is string => Boolean(label));
}

function narrowedGrainPreferenceLabel(form: EditableFormState) {
  const allGrainIds = grainOptions.map((option) => option.id);
  const selectedGrainIds = selectedOptionIds(form.preferredGrains, allGrainIds);

  return isAutomaticOptionSet(selectedGrainIds, allGrainIds) ? undefined : `Carbs: ${selectedOptionSummary(selectedGrainIds, grainOptions)}`;
}

function narrowedProteinPreferenceLabel(form: EditableFormState) {
  const visibleProteinOptions = proteinOptions.filter((option) => isProteinVisible(option.id, form.dietaryLevel));
  const visibleProteinIds = visibleProteinOptions.map((option) => option.id);
  const selectedProteinIds = selectedOptionIds(form.preferredProteins, visibleProteinIds);

  return isAutomaticOptionSet(selectedProteinIds, visibleProteinIds) ? undefined : `Protein: ${selectedOptionSummary(selectedProteinIds, visibleProteinOptions)}`;
}

function selectedOptionSummary(selectedIds: string[], options: { id: string; label: string }[]) {
  const selectedLabels = selectedOptionLabelList(selectedIds, options);

  return selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels.length} choices`;
}

function selectedOptionLabels(selectedIds: string[], options: { id: string; label: string }[]) {
  const selectedLabels = selectedOptionLabelList(selectedIds, options);

  if (selectedLabels.length === 0) return undefined;
  if (selectedLabels.length === 1) return selectedLabels[0];
  if (selectedLabels.length === 2) return selectedLabels.join(" + ");
  return selectedLabels.join(", ");
}

function selectedOptionLabelList(selectedIds: string[], options: { id: string; label: string }[]) {
  const selected = new Set(selectedIds);

  return options
    .filter((option) => selected.has(option.id))
    .map((option) => option.label);
}

function selectedOptionIds(values: string[], allowedValues: string[]) {
  const allowed = new Set(allowedValues);
  return [...new Set(values.filter((value) => allowed.has(value)))];
}

function isAutomaticOptionSet(selectedValues: string[], allValues: string[]) {
  return selectedValues.length === 0 || (selectedValues.length === allValues.length && allValues.every((value) => selectedValues.includes(value)));
}

function avoidLabels(form: EditableFormState) {
  return [
    form.avoidPaneer ? "paneer" : undefined,
    form.avoidWhey ? "whey" : undefined,
    form.dietaryLevel !== "vegetarian" && form.avoidEggs ? "eggs" : undefined,
    form.dietaryLevel === "nonVegetarian" && form.avoidChickenFish ? "chicken/fish" : undefined,
  ].filter((label): label is string => Boolean(label));
}

function foodRuleConflictLabels(form: EditableFormState) {
  return [
    hasLikedAvoidedProtein(form, "paneer-50g", form.avoidPaneer) ? "Paneer" : undefined,
    hasLikedAvoidedProtein(form, "whey-30g", form.avoidWhey) ? "Whey" : undefined,
    hasLikedAvoidedProtein(form, "two-whole-eggs", form.dietaryLevel !== "vegetarian" && form.avoidEggs) ? "Eggs" : undefined,
    hasLikedAvoidedProtein(form, "chicken-fish-100g", form.dietaryLevel === "nonVegetarian" && form.avoidChickenFish) ? "Chicken / fish" : undefined,
  ].filter((label): label is string => Boolean(label));
}

function hasLikedAvoidedProtein(form: EditableFormState, optionId: string, avoided: boolean) {
  return avoided && form.preferredProteins.includes(optionId) && isProteinVisible(optionId, form.dietaryLevel);
}

function formatFoodRuleConflictList(labels: string[]) {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return labels.join(" and ");
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function activeMacroCount(form: EditableFormState) {
  return activeMacroLabels(form).length;
}

function activeMacroLabels(form: EditableFormState) {
  return [
    macroLabel("Carbs", form.carbs),
    macroLabel("Fat", form.fat),
    macroLabel("Fiber", form.fiber),
    macroLabel("Saturated fat", form.saturatedFat),
  ].filter((label): label is string => Boolean(label));
}

function visibleProteinPreferences(preferredProteins: string[], dietaryLevel: DietaryLevel) {
  const visible = preferredProteins.filter((optionId) => isProteinVisible(optionId, dietaryLevel));
  if (visible.length > 0) {
    return visible;
  }

  if (dietaryLevel === "vegetarian") return ["paneer-50g"];
  if (dietaryLevel === "eggetarian") return ["two-whole-eggs"];
  return ["chicken-fish-100g"];
}

function dietIcon(level: DietaryLevel): IconName {
  if (level === "vegetarian") return "leaf";
  if (level === "eggetarian") return "egg";
  return "fish";
}

function grainOptionIcon(optionId: string): IconName {
  if (optionId.includes("rice") || optionId.includes("poha") || optionId.includes("oats")) return "bowl";
  return "carb";
}

function proteinOptionIcon(optionId: string): IconName {
  if (optionId.includes("egg")) return "egg";
  if (optionId.includes("chicken") || optionId.includes("fish")) return "fish";
  if (optionId.includes("paneer")) return "dairy";
  return "protein";
}

function mealRoleIcon(role: MealRole): IconName {
  const icons: Record<MealRole, IconName> = {
    cookingFat: "fat",
    carb: "carb",
    protein: "protein",
    vegetables: "leaf",
    fruit: "fruit",
    dairy: "dairy",
    snack: "bowl",
  };

  return icons[role];
}

function metricIcon(metric: NutritionMetric): IconName {
  const icons: Record<NutritionMetric, IconName> = {
    calories: "calories",
    protein: "protein",
    carbs: "carb",
    fat: "fat",
    fiber: "fiber",
    saturatedFat: "fat",
  };

  return icons[metric];
}

function statusIcon(status: BoundEvaluation["status"] | "unknown"): IconName {
  if (status === "pass") return "check";
  return "alert";
}

function exportFilename(extension: "csv" | "xls") {
  const date = new Date().toISOString().slice(0, 10);
  return `meal-plan-${date}.${extension}`;
}

function downloadTextFile(filename: string, type: string, contents: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function amountStep(item: DailyPlanItem, unit: string) {
  if (item.kind === "exchange") {
    return "5";
  }

  if (item.kind === "food" && item.foodItemId === "veggies-excl-potato" && unit === "g") {
    return "50";
  }

  return "1";
}

function SummaryMetric({ icon, label, value, suffix }: { icon: IconName; label: string; value: number; suffix: string }) {
  return (
    <div className="metric">
      <span><Icon name={icon} />{label}</span>
      <strong>{value}<small>{suffix}</small></strong>
    </div>
  );
}

function TargetStatusItem({ item }: { item: BoundEvaluation }) {
  const status = item.unknown ? "unknown" : item.status;

  return (
    <div className={`target-status-item is-${status}`}>
      <div>
        <strong><Icon name={metricIcon(item.bound.metric)} />{metricDisplayNames[item.bound.metric]}</strong>
        <span>{targetBoundLabel(item)}</span>
      </div>
      <div>
        <span>{formatMetricValue(item.value, item.bound.metric)}{item.unknown ? " + unknown" : ""}</span>
        <strong><Icon name={statusIcon(status)} />{statusDisplayNames[status]}</strong>
      </div>
    </div>
  );
}

function hasOptionalMacroTarget(items: BoundEvaluation[]) {
  return items.some((item) => optionalMacroMetrics.has(item.bound.metric));
}

function targetBoundLabel(item: BoundEvaluation) {
  if (item.bound.target !== undefined) {
    const tolerance = item.bound.tolerance && item.bound.tolerance > 0
      ? ` ± ${formatMetricValue(item.bound.tolerance, item.bound.metric)}`
      : "";
    return `Target ${formatMetricValue(item.bound.target, item.bound.metric)}${tolerance}`;
  }

  if (item.bound.min !== undefined && item.bound.max !== undefined) {
    return `${formatMetricValue(item.bound.min, item.bound.metric)}-${formatMetricValue(item.bound.max, item.bound.metric)}`;
  }

  if (item.bound.min !== undefined) {
    return `Min ${formatMetricValue(item.bound.min, item.bound.metric)}`;
  }

  if (item.bound.max !== undefined) {
    return `Max ${formatMetricValue(item.bound.max, item.bound.metric)}`;
  }

  return "Active target";
}

function formatMetricValue(value: number, metric: NutritionMetric) {
  return `${Math.round(value)} ${metric === "calories" ? "kcal" : "gm"}`;
}

type RoleTag = {
  role: MealRole;
  label: string;
  present: boolean;
};

const mealRoleDisplayNames: Record<MealRole, string> = {
  cookingFat: "Cooking fat",
  carb: "Carb",
  protein: "Protein",
  vegetables: "Vegetables",
  fruit: "Fruit",
  dairy: "Dairy",
  snack: "Snack",
};

const mealRoleOrder: readonly MealRole[] = ["cookingFat", "carb", "protein", "vegetables", "fruit", "dairy", "snack"];

function mealRoleTags(meal: DailyPlan["meals"][number]): RoleTag[] {
  const pattern = evaluateMealPattern(meal);
  const presentRoles = orderedMealRoles(meal.items.flatMap((item) => item.roles ?? []));

  if (!pattern) {
    return presentRoles.map((role) => ({ role, label: mealRoleDisplayNames[role], present: true }));
  }

  const expectedRoles = new Set(pattern.roles.map((item) => item.role));
  const expectedTags = pattern.roles.map((item) => ({
    role: item.role,
    label: mealRoleDisplayNames[item.role],
    present: item.present,
  }));
  const extraTags = presentRoles
    .filter((role) => !expectedRoles.has(role))
    .map((role) => ({ role, label: mealRoleDisplayNames[role], present: true }));

  return [...expectedTags, ...extraTags];
}

function orderedMealRoles(roles: MealRole[]): MealRole[] {
  const present = new Set(roles);
  return mealRoleOrder.filter((role) => present.has(role));
}

const metricDisplayNames: Record<NutritionMetric, string> = {
  calories: "Calories",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
  fiber: "Fiber",
  saturatedFat: "Saturated fat",
};

const optionalMacroMetrics = new Set<NutritionMetric>(["carbs", "fat", "fiber", "saturatedFat"]);

const statusDisplayNames: Record<BoundEvaluation["status"] | "unknown", string> = {
  pass: "Pass",
  fail: "Fail",
  unknown: "Unknown",
};

function swapOptionPreviewNutrition(item: Extract<DailyPlanItem, { kind: "exchange" }>, optionId: string) {
  const servingAmount = planItemDisplayQuantity(item).amount;
  const optionServingAmount = exchangeOptionGramAmount(item.exchangeGroupId, optionId);

  return calculateDailyPlanItemNutrition({
    ...item,
    exchangeOptionId: optionId,
    exchangeUnits: optionServingAmount > 0 ? servingAmount / optionServingAmount : 0,
  });
}

function PlanItemRow({
  form,
  item,
  locked,
  mealId,
  onAmount,
  onDelete,
  onLock,
  onSwap,
}: {
  form: EditableFormState;
  item: DailyPlanItem;
  locked: boolean;
  mealId: string;
  onAmount: (amount: number) => void;
  onDelete: () => void;
  onLock: () => void;
  onSwap: (optionId: string) => void;
}) {
  const label = planItemLabel(item);
  const quantity = planItemDisplayQuantity(item);
  const nutrition = calculateDailyPlanItemNutrition(item);
  const exchangeOptions = exchangeOptionsForItem(item, form, mealId);
  const [servingDraft, setServingDraft] = useState(String(quantity.amount));
  const [servingValidationMessage, setServingValidationMessage] = useState("");
  const [swapSheetOpen, setSwapSheetOpen] = useState(false);
  const swapDialogRef = useRef<HTMLDialogElement>(null);
  const servingErrorId = useId();
  const swapTitleId = useId();
  const swapDescriptionId = useId();
  const isExchangeItem = item.kind === "exchange";

  useEffect(() => {
    setServingDraft(String(quantity.amount));
    setServingValidationMessage("");
  }, [quantity.amount]);

  useEffect(() => {
    const dialog = swapDialogRef.current;
    if (!dialog || !isExchangeItem) return;

    if (swapSheetOpen && !dialog.open) {
      dialog.showModal();
    } else if (!swapSheetOpen && dialog.open) {
      dialog.close();
    }
  }, [isExchangeItem, swapSheetOpen]);

  function chooseSwapOption(optionId: string) {
    onSwap(optionId);
    setSwapSheetOpen(false);
  }

  function updateServingDraft(value: string) {
    const parsed = parseServingAmountInput(value);

    setServingDraft(value);

    if (parsed.status === "empty") {
      setServingValidationMessage("Enter a serving amount before totals update.");
      return;
    }

    if (parsed.status === "invalid") {
      setServingValidationMessage("Use a valid serving amount before totals update.");
      return;
    }

    setServingValidationMessage("");
    onAmount(parsed.amount);
  }

  return (
    <div className="plan-row">
      <div className="item-summary">
        <strong>{label}</strong>
        <small className="item-metrics">
          <span>{Math.round(nutrition.calories ?? 0)} kcal</span>
          <span>{Math.round(nutrition.protein ?? 0)}gm protein</span>
        </small>
      </div>
      <div className={`item-actions ${item.kind === "exchange" ? "has-swap" : "no-swap"}`}>
        <label className="amount-control">
          <span className="sr-only">Amount in grams</span>
          <input
            aria-describedby={servingValidationMessage ? servingErrorId : undefined}
            aria-invalid={servingValidationMessage ? "true" : undefined}
            inputMode="numeric"
            value={servingDraft}
            onChange={(event) => updateServingDraft(event.target.value)}
            min="0"
            step={amountStep(item, quantity.unit)}
            type="number"
          />
        </label>
        <span className="unit-label" title="grams">gm</span>
        <button className="lock-toggle with-icon" type="button" aria-pressed={locked} onClick={onLock}><Icon name={locked ? "unlock" : "lock"} />{locked ? "Unlock" : "Lock"}</button>
        <button className="delete-toggle with-icon" type="button" aria-label={`Delete ${label}`} onClick={onDelete}><Icon name="delete" />Del</button>
        {servingValidationMessage && (
          <span
            className="randomize-feedback-inline is-notice"
            id={servingErrorId}
            role="alert"
            style={{ gridColumn: "1 / -1" }}
          >
            {servingValidationMessage}
          </span>
        )}
        {isExchangeItem && (
          <>
            <button
              className="swap-button with-icon"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={swapSheetOpen}
              onClick={() => setSwapSheetOpen(true)}
            >
              <Icon name="swap" />
              Swap
            </button>
            <dialog
              className="swap-sheet"
              ref={swapDialogRef}
              aria-labelledby={swapTitleId}
              aria-describedby={swapDescriptionId}
              onCancel={() => setSwapSheetOpen(false)}
              onClose={() => setSwapSheetOpen(false)}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setSwapSheetOpen(false);
                }
              }}
            >
              <div className="swap-sheet-panel">
                <header className="swap-sheet-header">
                  <div>
                    <p>Swap item</p>
                    <h3 id={swapTitleId}>{label}</h3>
                  </div>
                  <button className="with-icon" type="button" aria-label={`Close swap options for ${label}`} onClick={() => setSwapSheetOpen(false)}><Icon name="close" />Close</button>
                </header>
                <p id={swapDescriptionId} className="swap-sheet-description">
                  Choose an exchange-equivalent option. Your serving amount, locks, and the rest of the meal stay unchanged.
                </p>
                <div className="swap-options" aria-label={`Allowed swaps for ${label}`}>
                  {exchangeOptions.map((option) => {
                    const previewNutrition = swapOptionPreviewNutrition(item, option.id);
                    const isCurrentOption = option.id === item.exchangeOptionId;

                    return (
                      <button
                        className="swap-option"
                        type="button"
                        key={option.id}
                        aria-pressed={isCurrentOption}
                        onClick={() => chooseSwapOption(option.id)}
                      >
                        <span className="swap-option-name">{option.displayName}</span>
                        <small className="swap-option-meta">
                          <span>{exchangeOptionGramAmount(item.exchangeGroupId, option.id)}gm exchange</span>
                          <span>{Math.round(previewNutrition.calories ?? 0)} kcal</span>
                          <span>{Math.round(previewNutrition.protein ?? 0)}gm protein</span>
                          {isCurrentOption && <span className="swap-option-current">Current</span>}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </div>
            </dialog>
          </>
        )}
      </div>
    </div>
  );
}

function loadStateFromUrl(): LoadedUrlState {
  if (typeof window === "undefined") return { shareLoadFailed: false };
  const searchParams = new URLSearchParams(window.location.search);
  if (!searchParams.has("s")) return { shareLoadFailed: false };

  const state = decodeShareState(searchParams.get("s") ?? "");
  return { state, shareLoadFailed: !state };
}

function isProteinVisible(optionId: string, dietaryLevel: DietaryLevel) {
  if (dietaryLevel === "vegetarian") return optionId !== "two-whole-eggs" && optionId !== "chicken-fish-100g";
  if (dietaryLevel === "eggetarian") return optionId !== "chicken-fish-100g";
  return true;
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIosBrowser() {
  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

function installFallbackMessage() {
  return isIosBrowser()
    ? "On iPhone or iPad: tap Share, then Add to Home Screen."
    : "Use the browser menu to install this app.";
}

type MealPlanWindow = Window & { mealPlanRoot?: Root };

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

const mealPlanWindow = window as MealPlanWindow;
const root = mealPlanWindow.mealPlanRoot ?? createRoot(rootElement);
mealPlanWindow.mealPlanRoot = root;

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
