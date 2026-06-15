import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
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
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
  const [generationBlockers, setGenerationBlockers] = useState<string[]>([]);
  const [isPlanStale, setIsPlanStale] = useState(false);
  const [mealToolMessages, setMealToolMessages] = useState<Record<string, string>>({});
  const [planRandomizeFeedback, setPlanRandomizeFeedback] = useState<RandomizeFeedback | undefined>();
  const [mealRandomizeFeedback, setMealRandomizeFeedback] = useState<Record<string, RandomizeFeedback>>({});
  const [deletedItemUndo, setDeletedItemUndo] = useState<DeletedItemUndo | undefined>();
  const [installState, setInstallState] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | undefined>();
  const [isInstalledView, setIsInstalledView] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  const evaluation = plan ? planEvaluation(plan, form) : undefined;
  const recoveryMessages = evaluation?.status === "fail" ? failureRecoveryMessages(evaluation) : [];
  const targetStatusItems = evaluation && hasOptionalMacroTarget(evaluation.targetBounds) ? evaluation.targetBounds : [];
  const activeCustomizationChips = useMemo(() => activeCustomizationLabels(form), [form]);
  const lockedItemCount = lockedIds.size;

  useEffect(() => {
    if (plan && activeView === "plan") {
      resultRef.current?.focus();
    }
  }, [activeView, plan]);

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
    clearRandomizeFeedback();
    markPlanStale();
    setForm((current) => ({ ...current, [key]: value }));
  }

  function generate(sourceForm = form, options: GenerateOptions = {}) {
    const seed = options.seed ?? Date.now();
    const useExistingLocks = options.useExistingLocks ?? true;
    setDeletedItemUndo(undefined);
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
    setPlan(addMeal(plan));
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
    const next = randomizePlan(plan, form, lockedIds, mealId);
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

  function share() {
    const state: ShareablePlannerState = {
      form,
      plan,
      lockedItemIds: [...lockedIds],
      mealTargets,
    };
    const url = shareUrlForState(state);
    window.history.replaceState(null, "", `?s=${encodeShareState(state)}`);

    const showManualShareRecovery = () => setShareState({
      message: "Copy blocked. Copy this share link manually.",
      manualUrl: url,
    });

    if (typeof navigator.clipboard?.writeText !== "function") {
      showManualShareRecovery();
      return;
    }

    void navigator.clipboard.writeText(url)
      .then(() => setShareState({ message: "Link copied" }))
      .catch(showManualShareRecovery);
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
    if (!installPrompt) {
      setInstallState("Install from browser menu");
      return;
    }

    const prompt = installPrompt;
    setInstallPrompt(undefined);
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setInstallState(choice.outcome === "accepted" ? "" : "Install from browser menu");
  }

  return (
    <main className="app-shell">
      <header className="mobile-header">
        <h1>Meal plan</h1>
        {!isInstalledView && <button type="button" onClick={() => void installApp()}>Install</button>}
      </header>
      {installState && <p className="install-state" role="status">{installState}</p>}
      {loadedUrlState.shareLoadFailed && (
        <div className="share-load-warning" role="alert">
          <p><strong>Shared plan could not be opened.</strong> Start a new plan or ask for a fresh link.</p>
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
              <span>Calories (kcal)</span>
              <input inputMode="numeric" value={form.calories} onChange={(event) => update("calories", event.target.value)} required min="800" max="5000" step="25" type="number" />
            </label>
            <label className="field">
              <span>Protein (gm)</span>
              <input inputMode="numeric" value={form.protein} onChange={(event) => update("protein", event.target.value)} min="0" step="5" type="number" />
            </label>
          </div>

          <fieldset className={`quick-start-presets${plan ? " is-compact" : ""}`}>
            <legend>{plan ? "Replace with example" : "Try an example"}</legend>
            <div className="quick-start-row">
              {quickStartPresets.map((preset) => (
                <button key={preset.label} type="button" onClick={() => applyQuickStartPreset(preset)}>
                  {preset.label}
                </button>
              ))}
            </div>
          </fieldset>

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
                <span>{option.label}</span>
              </label>
            ))}
            <p id="diet-helper" className="helper diet-helper">{dietDescriptions[form.dietaryLevel]}</p>
          </fieldset>

          <details className="options-drawer" open={optionsOpen} onToggle={(event) => setOptionsOpen(event.currentTarget.open)}>
            <summary>
              <span>Customize</span>
              <span className="drawer-summary">{activeCustomizationChips.length > 0 ? `${activeCustomizationChips.length} active` : "Food + macros"}</span>
            </summary>

            <details className="nested-drawer">
              <summary>
                <span>Food</span>
                <span className="drawer-summary">{foodDrawerSummary(form)}</span>
              </summary>
              <PreferenceGroup label="Like grains" options={grainOptions} values={form.preferredGrains} onChange={(optionId, checked) => updatePreference("preferredGrains", optionId, checked)} />
              <PreferenceGroup label="Like protein" options={proteinOptions.filter((option) => isProteinVisible(option.id, form.dietaryLevel))} values={form.preferredProteins} onChange={(optionId, checked) => updatePreference("preferredProteins", optionId, checked)} />
              <fieldset className="avoid-list">
                <legend>Avoid</legend>
                <CheckChip label="Paneer" checked={form.avoidPaneer} onChange={(checked) => update("avoidPaneer", checked)} />
                <CheckChip label="Whey" checked={form.avoidWhey} onChange={(checked) => update("avoidWhey", checked)} />
                {form.dietaryLevel !== "vegetarian" && <CheckChip label="Eggs" checked={form.avoidEggs} onChange={(checked) => update("avoidEggs", checked)} />}
                {form.dietaryLevel === "nonVegetarian" && <CheckChip label="Chicken / fish" checked={form.avoidChickenFish} onChange={(checked) => update("avoidChickenFish", checked)} />}
              </fieldset>
            </details>

            <details className="nested-drawer">
              <summary>
                <span>Macros</span>
                <span className="drawer-summary">{macroDrawerSummary(form)}</span>
              </summary>
              <div className="macro-grid">
                <MacroInput label="Carbs" value={form.carbs} onChange={(value) => update("carbs", value)} />
                <MacroInput label="Fat" value={form.fat} onChange={(value) => update("fat", value)} />
                <MacroInput label="Fiber" value={form.fiber} onChange={(value) => update("fiber", value)} />
                <MacroInput label="Saturated fat" value={form.saturatedFat} onChange={(value) => update("saturatedFat", value)} />
              </div>
            </details>

          </details>

          {activeCustomizationChips.length > 0 && (
            <div className="customization-chips" aria-label="Active customizations">
              <span className="customization-label">Active settings</span>
              {activeCustomizationChips.map((label) => <span className="customization-note" key={label}>{label}</span>)}
            </div>
          )}
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
          <button className="primary-action" type="submit">{plan ? "Regenerate plan" : "Generate"}</button>
        </div>
      </form>
      )}

      {activeView === "plan" && plan && evaluation && (
        <section className="result-panel" aria-labelledby="result-title" aria-live="polite" tabIndex={-1} ref={resultRef}>
          <div className="section-heading result-head">
            <h2 id="result-title">{evaluation.status === "pass" ? "Meets target" : "Adjust"}</h2>
            <button type="button" onClick={() => setActiveView("targets")}>Targets</button>
            <button type="button" onClick={randomizeVisiblePlan}>Randomize</button>
            <button type="button" onClick={share}>Share</button>
          </div>
          {planRandomizeFeedback && (
            <p className={`randomize-feedback ${planRandomizeFeedback.changed ? "is-success" : "is-notice"}`} role="status">
              {planRandomizeFeedback.message}
            </p>
          )}
          {shareState && (
            <div className={`share-state${shareState.manualUrl ? " manual-share" : ""}`} role="status">
              <p>{shareState.message}</p>
              {shareState.manualUrl && (
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
              <span>Export</span>
              <span className="drawer-summary">CSV · Excel · Google Docs</span>
            </summary>
            <div className="export-actions" aria-label="Export meal plan">
              <button type="button" onClick={exportCsv}>CSV</button>
              <button type="button" onClick={exportExcel}>Excel</button>
              <button type="button" onClick={() => void copyForGoogleDocs()}>Google Docs</button>
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
            <SummaryMetric label="Calories" value={Math.round(evaluation.totals.values.calories)} suffix="kcal" />
            <SummaryMetric label="Protein" value={Math.round(evaluation.totals.values.protein)} suffix="gm" />
          </div>
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
              const mealFeedback = mealRandomizeFeedback[meal.id];
              return (
              <details className="meal-card" key={meal.id}>
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
                            {tag.present ? tag.label : `Missing ${tag.label}`}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="meal-summary">
                    <strong>{Math.round(mealTotals.values.calories)} kcal</strong>
                    <small>{Math.round(mealTotals.values.protein)}gm protein · {meal.items.length} items</small>
                    <span className="meal-affordance">Tap to edit</span>
                  </span>
                </summary>
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
                    <span>Meal tools</span>
                    <span className="drawer-summary">{status.length > 0 ? status.join(" · ") : "Targets + add items"}</span>
                  </summary>
                  <div className="meal-targets">
                    <label><span>Kcal</span><input inputMode="numeric" value={mealTargets[meal.id]?.calories ?? ""} onChange={(event) => updateMealTarget(meal.id, "calories", event.target.value)} min="0" max="5000" step="25" type="number" /></label>
                    <label><span>Protein</span><input inputMode="numeric" value={mealTargets[meal.id]?.protein ?? ""} onChange={(event) => updateMealTarget(meal.id, "protein", event.target.value)} min="0" step="5" type="number" /></label>
                    <button type="button" onClick={() => randomizeSingleMeal(meal.id)}>Randomize meal</button>
                    <button type="button" onClick={() => addMealItem(meal.id, "protein-serving")}>Add protein</button>
                    <button type="button" onClick={() => addMealItem(meal.id, "grain")}>Add grain</button>
                    <button type="button" onClick={() => addMealItem(meal.id, "fruit")}>Add fruit</button>
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
          <button className="secondary-action" type="button" onClick={addEmptyMeal}>Add meal</button>
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

function MacroInput({ label, value, onChange }: { label: string; value: MacroField; onChange: (value: MacroField) => void }) {
  return (
    <label className="field compact">
      <span>{label}</span>
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

function PreferenceGroup({ label, options, values, onChange }: { label: string; options: { id: string; label: string }[]; values: string[]; onChange: (optionId: string, checked: boolean) => void }) {
  return (
    <fieldset className="choice-group preference-group">
      <legend>{label}</legend>
      {options.map((option) => (
        <label key={option.id}>
          <input type="checkbox" checked={values.includes(option.id)} onChange={(event) => onChange(option.id, event.target.checked)} />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function CheckChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function activeCustomizationLabels(form: EditableFormState) {
  const avoids = avoidLabels(form);
  const labels = [
    foodPreferenceSummary(form),
    avoids.length > 0 ? `Avoid ${avoids.length}` : undefined,
    ...activeMacroLabels(form),
  ];

  return labels.filter((label): label is string => Boolean(label));
}

function macroLabel(label: string, field: MacroField) {
  const value = field.value.trim();
  return field.mode === "none" || value === "" ? undefined : `${label} ${field.mode} ${value}g`;
}

function foodDrawerSummary(form: EditableFormState) {
  const avoids = avoidLabels(form);
  return `${foodPreferenceSummary(form)}${avoids.length > 0 ? ` · avoid ${avoids.length}` : ""}`;
}

function macroDrawerSummary(form: EditableFormState) {
  const activeMacros = activeMacroCount(form);

  return activeMacros > 0 ? `${activeMacros} rules` : "Optional limits";
}

function foodPreferenceSummary(form: EditableFormState) {
  const proteinCount = visibleProteinPreferences(form.preferredProteins, form.dietaryLevel).length;
  return `Grains ${form.preferredGrains.length || "auto"} · Protein ${proteinCount || "auto"}`;
}

function avoidLabels(form: EditableFormState) {
  return [
    form.avoidPaneer ? "paneer" : undefined,
    form.avoidWhey ? "whey" : undefined,
    form.dietaryLevel !== "vegetarian" && form.avoidEggs ? "eggs" : undefined,
    form.dietaryLevel === "nonVegetarian" && form.avoidChickenFish ? "chicken/fish" : undefined,
  ].filter((label): label is string => Boolean(label));
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

function SummaryMetric({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}<small>{suffix}</small></strong>
    </div>
  );
}

function TargetStatusItem({ item }: { item: BoundEvaluation }) {
  const status = item.unknown ? "unknown" : item.status;

  return (
    <div className={`target-status-item is-${status}`}>
      <div>
        <strong>{metricDisplayNames[item.bound.metric]}</strong>
        <span>{targetBoundLabel(item)}</span>
      </div>
      <div>
        <span>{formatMetricValue(item.value, item.bound.metric)}{item.unknown ? " + unknown" : ""}</span>
        <strong>{statusDisplayNames[status]}</strong>
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
  const [swapSheetOpen, setSwapSheetOpen] = useState(false);
  const swapDialogRef = useRef<HTMLDialogElement>(null);
  const swapTitleId = useId();
  const swapDescriptionId = useId();
  const isExchangeItem = item.kind === "exchange";

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
          <input inputMode="numeric" value={quantity.amount} onChange={(event) => onAmount(Number(event.target.value || 0))} min="0" step={amountStep(item, quantity.unit)} type="number" />
        </label>
        <span className="unit-label" title="grams">gm</span>
        <button className="lock-toggle" type="button" aria-pressed={locked} onClick={onLock}>{locked ? "Unlock" : "Lock"}</button>
        <button className="delete-toggle" type="button" aria-label={`Delete ${label}`} onClick={onDelete}>Del</button>
        {isExchangeItem && (
          <>
            <button
              className="swap-button"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={swapSheetOpen}
              onClick={() => setSwapSheetOpen(true)}
            >
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
                  <button type="button" aria-label={`Close swap options for ${label}`} onClick={() => setSwapSheetOpen(false)}>Close</button>
                </header>
                <p id={swapDescriptionId} className="swap-sheet-description">
                  Choose an exchange-equivalent option. Your serving amount, locks, and the rest of the meal stay unchanged.
                </p>
                <div className="swap-options" aria-label={`Allowed swaps for ${label}`}>
                  {exchangeOptions.map((option) => (
                    <button
                      className="swap-option"
                      type="button"
                      key={option.id}
                      aria-pressed={option.id === item.exchangeOptionId}
                      onClick={() => chooseSwapOption(option.id)}
                    >
                      <span>{option.displayName}</span>
                      <small>
                        {exchangeOptionGramAmount(item.exchangeGroupId, option.id)}gm exchange
                        {option.id === item.exchangeOptionId ? " · Current" : ""}
                      </small>
                    </button>
                  ))}
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
