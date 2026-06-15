import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Barbell } from "@phosphor-icons/react/Barbell";
import { BowlSteam } from "@phosphor-icons/react/BowlSteam";
import { Bread } from "@phosphor-icons/react/Bread";
import { Carrot } from "@phosphor-icons/react/Carrot";
import { ChartBar } from "@phosphor-icons/react/ChartBar";
import { Check } from "@phosphor-icons/react/Check";
import { Cheese } from "@phosphor-icons/react/Cheese";
import { CookingPot } from "@phosphor-icons/react/CookingPot";
import { Copy } from "@phosphor-icons/react/Copy";
import { DeviceMobile } from "@phosphor-icons/react/DeviceMobile";
import { DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { Drop } from "@phosphor-icons/react/Drop";
import { Egg } from "@phosphor-icons/react/Egg";
import { FileArrowDown } from "@phosphor-icons/react/FileArrowDown";
import { Fire } from "@phosphor-icons/react/Fire";
import { Fish } from "@phosphor-icons/react/Fish";
import { ForkKnife } from "@phosphor-icons/react/ForkKnife";
import { Grains } from "@phosphor-icons/react/Grains";
import { Leaf } from "@phosphor-icons/react/Leaf";
import { Lock } from "@phosphor-icons/react/Lock";
import { LockOpen } from "@phosphor-icons/react/LockOpen";
import { Orange } from "@phosphor-icons/react/Orange";
import { Plant } from "@phosphor-icons/react/Plant";
import { Plus } from "@phosphor-icons/react/Plus";
import { ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { Shuffle } from "@phosphor-icons/react/Shuffle";
import { SlidersHorizontal } from "@phosphor-icons/react/SlidersHorizontal";
import { Swap } from "@phosphor-icons/react/Swap";
import { Target } from "@phosphor-icons/react/Target";
import { Trash } from "@phosphor-icons/react/Trash";
import { Warning } from "@phosphor-icons/react/Warning";
import { X } from "@phosphor-icons/react/X";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react/lib";
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
type RandomizeUndo = {
  mealId?: string;
  plan: DailyPlan;
  wasPlanStale: boolean;
};
type MealToolMessage = {
  message: string;
  tone: "notice" | "success";
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
const calorieTargetMin = 800;
const calorieTargetMax = 5000;
const calorieValidationMessage = `Enter a calorie target from ${calorieTargetMin}-${calorieTargetMax} kcal.`;

function isValidCalorieTarget(value: string) {
  const calories = Number(value);
  return value.trim() !== "" && Number.isFinite(calories) && calories >= calorieTargetMin && calories <= calorieTargetMax;
}

type IconName =
  | "add"
  | "alert"
  | "bread"
  | "bowl"
  | "calories"
  | "carb"
  | "check"
  | "cheese"
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
  | "plantProtein"
  | "protein"
  | "randomize"
  | "share"
  | "swap"
  | "targets"
  | "tools"
  | "unlock"
  | "vegetable";

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
const staleShareBlockedMessage = "Regenerate before sharing updated targets.";
const generationProgressMessage = "Generating plan...";

function waitForGenerationProgressFrame() {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timeoutId = window.setTimeout(finish, 80);

    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        window.clearTimeout(timeoutId);
        finish();
      }, 0);
    });
  });
}

function App() {
  const loadedUrlState = useMemo(loadStateFromUrl, []);
  const generationProgressId = useId();
  const urlState = loadedUrlState.state;
  const [form, setForm] = useState<EditableFormState>(normalizeEditableFormState(urlState?.form));
  const [plan, setPlan] = useState<DailyPlan | undefined>(urlState?.plan);
  const [activeView, setActiveView] = useState<PlannerView>(urlState?.plan ? "plan" : "targets");
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set(urlState?.lockedItemIds ?? []));
  const [mealTargets, setMealTargets] = useState<Record<string, MealMacroTarget>>(urlState?.mealTargets ?? {});
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [shareState, setShareState] = useState<ShareState | undefined>();
  const [showGoogleDocsManualCopy, setShowGoogleDocsManualCopy] = useState(false);
  const [shareLoadFailed, setShareLoadFailed] = useState(loadedUrlState.shareLoadFailed);
  const [generationBlockers, setGenerationBlockers] = useState<string[]>([]);
  const [isPlanStale, setIsPlanStale] = useState(false);
  const [mealToolMessages, setMealToolMessages] = useState<Record<string, MealToolMessage>>({});
  const [planRandomizeFeedback, setPlanRandomizeFeedback] = useState<RandomizeFeedback | undefined>();
  const [mealRandomizeFeedback, setMealRandomizeFeedback] = useState<Record<string, RandomizeFeedback>>({});
  const [randomizeUndo, setRandomizeUndo] = useState<RandomizeUndo | undefined>();
  const [deletedItemUndo, setDeletedItemUndo] = useState<DeletedItemUndo | undefined>();
  const [addedMealFeedback, setAddedMealFeedback] = useState<AddedMealFeedback | undefined>();
  const [addMealBlocker, setAddMealBlocker] = useState("");
  const [expandedMealIds, setExpandedMealIds] = useState<Set<string>>(new Set());
  const [installState, setInstallState] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | undefined>();
  const [isInstalledView, setIsInstalledView] = useState(() => isStandaloneApp());
  const [isGenerating, setIsGenerating] = useState(false);
  const [calorieInputError, setCalorieInputError] = useState("");
  const resultRef = useRef<HTMLElement>(null);
  const generationFeedbackRef = useRef<HTMLDivElement>(null);
  const calorieInputRef = useRef<HTMLInputElement>(null);
  const generationInFlight = useRef(false);
  const mealCardRefs = useRef<Map<string, HTMLDetailsElement>>(new Map());
  const addedMealFeedbackKey = useRef(0);
  const revealedAddedMealKey = useRef<number | undefined>(undefined);

  const evaluation = plan ? planEvaluation(plan, form) : undefined;
  const recoveryMessages = evaluation?.status === "fail" ? failureRecoveryMessages(evaluation) : [];
  const targetStatusItems = evaluation && hasOptionalMacroTarget(evaluation.targetBounds) ? evaluation.targetBounds : [];
  const proteinTarget = Number(form.protein || 0);
  const activeMacroRuleLabels = activeMacroLabels(form);
  const activeMacroRuleCount = activeMacroRuleLabels.length;
  const likedProteinAvoidConflicts = useMemo(() => foodRuleConflictLabels(form), [form]);
  const lockedItemCount = lockedIds.size;
  const currentShareableState = useMemo<ShareablePlannerState>(() => ({
    form,
    plan,
    lockedItemIds: [...lockedIds],
    mealTargets,
  }), [form, plan, lockedIds, mealTargets]);
  const currentShareKey = useMemo(() => encodeShareState(currentShareableState), [currentShareableState]);
  const googleDocsManualCopyText = showGoogleDocsManualCopy && plan ? planExportTsv(plan) : "";
  const generationActionLabel = isGenerating ? "Generating..." : plan ? "Regenerate plan" : "Generate";

  useEffect(() => {
    if (plan && activeView === "plan") {
      resultRef.current?.focus();
    }
  }, [activeView, plan]);

  useEffect(() => {
    if (generationBlockers.length === 0) {
      return;
    }

    const feedbackPanel = generationFeedbackRef.current;
    if (!feedbackPanel) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    feedbackPanel.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    feedbackPanel.focus({ preventScroll: true });
  }, [generationBlockers]);

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
    if (key === "calories" && typeof value === "string" && isValidCalorieTarget(value)) {
      setCalorieInputError("");
    }
    setMealToolMessages({});
    setAddMealBlocker("");
    clearRandomizeFeedback();
    markPlanStale();
    setForm((current) => ({ ...current, [key]: value }));
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

  async function generateWithProgress(sourceForm = form, options: GenerateOptions = {}) {
    if (generationInFlight.current) {
      return false;
    }

    generationInFlight.current = true;
    setIsGenerating(true);

    try {
      await waitForGenerationProgressFrame();
      return generate(sourceForm, options);
    } finally {
      generationInFlight.current = false;
      setIsGenerating(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidCalorieTarget(form.calories)) {
      setCalorieInputError(calorieValidationMessage);
      calorieInputRef.current?.focus();
      return;
    }

    setCalorieInputError("");
    void generateWithProgress();
  }

  function showCalorieInputError(event: React.InvalidEvent<HTMLInputElement>) {
    event.preventDefault();
    setCalorieInputError(calorieValidationMessage);
    event.currentTarget.focus();
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
    setRandomizeUndo(changed ? { plan, wasPlanStale: isPlanStale } : undefined);
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
    clearMealToolMessageForItem(itemId);
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
    clearMealToolMessage(meal.id);
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
        [mealId]: {
          message: "No protein matches your active diet and avoid rules. Change food rules, then add protein.",
          tone: "notice",
        },
      }));
      return;
    }

    const nextMeal = next.meals.find((candidate) => candidate.id === mealId);
    const addedItem = nextMeal?.items.at(-1);
    const addedLabel = addedItem ? planItemLabel(addedItem) : mealItemGroupLabel(groupId);
    const mealLabel = nextMeal?.displayName ?? "meal";

    setMealToolMessages((current) => ({
      ...current,
      [mealId]: {
        message: `${addedLabel} added to ${mealLabel}.`,
        tone: "success",
      },
    }));
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
    clearMealToolMessageForItem(itemId);
    setPlan(updateItemAmount(plan, itemId, amount));
  }

  function swapPlanItem(itemId: string, optionId: string) {
    if (!plan) return;
    setDeletedItemUndo(undefined);
    clearRandomizeFeedback();
    clearMealToolMessageForItem(itemId);
    setPlan(swapExchangeOption(plan, itemId, optionId));
  }

  function randomizeSingleMeal(mealId: string) {
    if (!plan) return;
    const meal = plan.meals.find((candidate) => candidate.id === mealId);
    if (!meal) return;

    setDeletedItemUndo(undefined);
    setPlanRandomizeFeedback(undefined);
    clearMealToolMessage(mealId);
    const next = randomizePlan(plan, form, lockedIds, mealId, Date.now(), mealTargets[mealId]);
    const nextMeal = next.meals.find((candidate) => candidate.id === mealId);
    const changed = JSON.stringify(nextMeal) !== JSON.stringify(meal);
    setPlan(next);
    setRandomizeUndo(changed ? { mealId, plan, wasPlanStale: isPlanStale } : undefined);
    setMealRandomizeFeedback({
      [mealId]: {
        changed,
        message: changed
          ? `${meal.displayName} randomized.`
          : "No different meal found with the current locks and food rules. Unlock items or relax rules, then try again.",
      },
    });
  }

  function undoRandomize() {
    if (!randomizeUndo) return;

    setPlan(randomizeUndo.plan);
    setIsPlanStale(randomizeUndo.wasPlanStale);
    clearRandomizeFeedback();
  }

  function clearLocks() {
    setDeletedItemUndo(undefined);
    clearRandomizeFeedback();
    setLockedIds(new Set());
  }

  function updateMealTarget(mealId: string, key: keyof MealMacroTarget, value: string) {
    clearRandomizeFeedback();
    clearMealToolMessage(mealId);
    setMealTargets((current) => ({ ...current, [mealId]: { ...current[mealId], [key]: value } }));
  }

  function clearRandomizeFeedback() {
    setPlanRandomizeFeedback(undefined);
    setMealRandomizeFeedback({});
    setRandomizeUndo(undefined);
  }

  function clearMealToolMessage(mealId: string) {
    setMealToolMessages((current) => {
      if (!current[mealId]) return current;
      const { [mealId]: _removed, ...rest } = current;
      return rest;
    });
  }

  function clearMealToolMessageForItem(itemId: string) {
    const meal = plan?.meals.find((candidate) => candidate.items.some((item) => item.id === itemId));
    if (meal) {
      clearMealToolMessage(meal.id);
    }
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
    if (isPlanStale) {
      setShareState({ message: staleShareBlockedMessage, stale: true });
      return;
    }

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
    setShowGoogleDocsManualCopy(false);
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
    const showManualGoogleDocsCopy = () => {
      setShowGoogleDocsManualCopy(true);
      setShareState(undefined);
    };

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
        showManualGoogleDocsCopy();
        return;
      }

      setShowGoogleDocsManualCopy(false);
      setShareState({ message: "Copied for Google Docs" });
    } catch {
      showManualGoogleDocsCopy();
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
              <NumberStepper
                ariaDescribedBy={`calories-helper${calorieInputError ? " calories-error" : ""}`}
                ariaErrorMessage={calorieInputError ? "calories-error" : undefined}
                ariaInvalid={Boolean(calorieInputError)}
                ariaLabel="Calories"
                decrementLabel="Decrease calories by 50"
                incrementLabel="Increase calories by 50"
                inputRef={calorieInputRef}
                max={calorieTargetMax}
                min={calorieTargetMin}
                onChange={(value) => update("calories", value)}
                onInvalid={showCalorieInputError}
                required
                step={50}
                value={form.calories}
              />
              <small id="calories-helper" className="field-hint">Target band: plans can pass within about 50 kcal.</small>
              {calorieInputError && (
                <small id="calories-error" className="field-error" role="alert">{calorieInputError}</small>
              )}
            </label>
            <label className="field">
              <span className="label-with-icon"><Icon name="protein" />Protein (gm)</span>
              <NumberStepper
                ariaDescribedBy="protein-helper"
                ariaLabel="Protein"
                decrementLabel="Decrease protein by 5 grams"
                incrementLabel="Increase protein by 5 grams"
                onChange={(value) => update("protein", value)}
                step={5}
                value={form.protein}
              />
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
              <PreferenceGroup
                automaticHelper="All carb choices are selected, so the planner chooses automatically from this group. Uncheck chips to narrow likes; use Leave out to avoid foods that must be excluded."
                iconFor={grainOptionIcon}
                label="Choose carbs"
                options={grainOptions}
                values={form.preferredGrains}
                onChange={(optionId, checked) => updatePreference("preferredGrains", optionId, checked)}
              />
              <PreferenceGroup
                automaticHelper="All visible proteins are selected, so the planner chooses automatically from this group. Uncheck chips to narrow likes; use Leave out to avoid foods that must be excluded."
                iconFor={proteinOptionIcon}
                label="Choose proteins"
                options={proteinOptions.filter((option) => isProteinVisible(option.id, form.dietaryLevel))}
                values={form.preferredProteins}
                onChange={(optionId, checked) => updatePreference("preferredProteins", optionId, checked)}
              />
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

          {activeMacroRuleLabels.length > 0 && (
            <div className="active-macro-rules" aria-label="Active macro rules">
              <span>Macro rules</span>
              <ul>
                {activeMacroRuleLabels.map((label) => <li key={label}>{label}</li>)}
              </ul>
            </div>
          )}

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
            <div
              className="generation-feedback"
              ref={generationFeedbackRef}
              role="alert"
              aria-label="Generation blockers"
              tabIndex={-1}
            >
              <p><strong>Plan blocked.</strong> Adjust these before regenerating:</p>
              <ul>
                {generationBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            </div>
          )}
        </section>

        <div className="bottom-action">
          {isPlanStale && plan && <p className="stale-plan-notice" role="status">Inputs changed - regenerate to apply these choices.</p>}
          {isGenerating && (
            <p className="generation-progress" id={generationProgressId} role="status" aria-live="polite">
              {generationProgressMessage}
            </p>
          )}
          <button
            className="primary-action with-icon"
            type="submit"
            disabled={isGenerating}
            aria-busy={isGenerating}
            aria-describedby={isGenerating ? generationProgressId : undefined}
          >
            <Icon name="plate" />
            {generationActionLabel}
          </button>
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
          </div>
          {planRandomizeFeedback && (
            <div className={`randomize-feedback ${planRandomizeFeedback.changed ? "is-success" : "is-notice"}${randomizeUndo && !randomizeUndo.mealId ? " has-action" : ""}`} role="status">
              <span>{planRandomizeFeedback.message}</span>
              {randomizeUndo && !randomizeUndo.mealId && (
                <button type="button" onClick={undoRandomize}>Undo</button>
              )}
            </div>
          )}
          {shareState && !shareState.stale && (
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
              <span className="summary-label"><Icon name="export" />Export</span>
              <span className="drawer-summary">CSV · Excel · Google Docs</span>
            </summary>
            <div className="export-actions" aria-label="Export meal plan">
              <button className="with-icon" type="button" onClick={exportCsv}><Icon name="download" />CSV</button>
              <button className="with-icon" type="button" onClick={exportExcel}><Icon name="export" />Excel</button>
              <button className="with-icon" type="button" onClick={() => void copyForGoogleDocs()}><Icon name="copy" />Google Docs</button>
            </div>
            {googleDocsManualCopyText && (
              <div className="google-docs-recovery">
                <p role="status">
                  <strong>Copy blocked.</strong> Select this table text, copy it, then paste it into Google Docs.
                </p>
                <label className="google-docs-copy-field">
                  <span>Google Docs table text</span>
                  <textarea
                    readOnly
                    rows={8}
                    value={googleDocsManualCopyText}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
              </div>
            )}
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
          <dl className="target-context" aria-label="Active targets for this result">
            <div>
              <dt>Calorie target</dt>
              <dd>{Math.round(Number(form.calories || 0))} kcal</dd>
            </div>
            <div>
              <dt>Protein target</dt>
              <dd>{Math.round(proteinTarget)} gm</dd>
            </div>
            <div>
              <dt>Diet</dt>
              <dd>{dietLabel(form.dietaryLevel)}</dd>
            </div>
            {activeMacroRuleCount > 0 && (
              <div>
                <dt>Macro rules</dt>
                <dd>{activeMacroRuleCount} applied{targetStatusItems.length > 0 ? "; status below" : ""}</dd>
              </div>
            )}
          </dl>
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
          <p className="meal-list-helper">Tap any meal to view foods, edit servings, swap options, or lock items.</p>
          <div className="meal-list">
            {plan.meals.map((meal) => {
              const mealTotals = calculateMealTotals(meal);
              const status = mealTargetStatus(plan, meal.id, mealTargets[meal.id] ?? {});
              const roleTags = mealRoleTags(meal);
              const lockedItemsInMeal = meal.items.filter((item) => item.id && lockedIds.has(item.id)).length;
              const mealFeedback = mealRandomizeFeedback[meal.id];
              const mealToolMessage = mealToolMessages[meal.id];
              const addedFeedback = addedMealFeedback?.mealId === meal.id ? addedMealFeedback : undefined;
              const mealUndo = deletedItemUndo?.mealId === meal.id ? deletedItemUndo : undefined;
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
                  {meal.items.length > 0 ? (
                    meal.items.map((item, index) => (
                      <PlanItemRow
                        form={form}
                        item={item}
                        key={item.id ?? `${meal.id}-${index}`}
                        locked={Boolean(item.id && lockedIds.has(item.id))}
                        mealId={meal.id}
                        mealName={meal.displayName}
                        onAmount={(amount) => item.id && updatePlanItemServing(item.id, amount)}
                        onDelete={() => item.id && deleteItem(item.id)}
                        onLock={() => item.id && toggleLock(item.id)}
                        onSwap={(optionId) => item.id && swapPlanItem(item.id, optionId)}
                      />
                    ))
                  ) : (
                    <div className="meal-empty-state" role="note">
                      <strong>No foods in this meal.</strong>
                      <span>
                        {mealUndo
                          ? `Use Undo to restore ${mealUndo.label}, or open Meal tools to add protein, grain, or fruit.`
                          : "Open Meal tools to add protein, grain, or fruit."}
                      </span>
                    </div>
                  )}
                </div>
                <details className="meal-tools">
                  <summary>
                    <span className="summary-label"><Icon name="tools" />Meal tools</span>
                    <span className="drawer-summary">{status.length > 0 ? status.join(" · ") : "Targets + add items"}</span>
                  </summary>
                  <div className="meal-targets">
                    <p className="meal-target-helper">Per-meal targets for this meal only. The current meal is compared below when a target is active.</p>
                    <label>
                      <span>Meal kcal target</span>
                      <NumberStepper
                        ariaLabel={`${meal.displayName} calorie target`}
                        decrementLabel={`Decrease ${meal.displayName} calorie target by 25`}
                        incrementLabel={`Increase ${meal.displayName} calorie target by 25`}
                        max={5000}
                        onChange={(value) => updateMealTarget(meal.id, "calories", value)}
                        size="compact"
                        step={25}
                        value={mealTargets[meal.id]?.calories ?? ""}
                      />
                    </label>
                    <label>
                      <span>Meal protein target</span>
                      <NumberStepper
                        ariaLabel={`${meal.displayName} protein target`}
                        decrementLabel={`Decrease ${meal.displayName} protein target by 5 grams`}
                        incrementLabel={`Increase ${meal.displayName} protein target by 5 grams`}
                        onChange={(value) => updateMealTarget(meal.id, "protein", value)}
                        size="compact"
                        step={5}
                        value={mealTargets[meal.id]?.protein ?? ""}
                      />
                    </label>
                    <button className="with-icon" type="button" onClick={() => randomizeSingleMeal(meal.id)}><Icon name="randomize" />Randomize meal</button>
                    <button className="with-icon" type="button" onClick={() => addMealItem(meal.id, "protein-serving")}><Icon name="protein" />Add protein</button>
                    <button className="with-icon" type="button" onClick={() => addMealItem(meal.id, "grain")}><Icon name="carb" />Add grain</button>
                    <button className="with-icon" type="button" onClick={() => addMealItem(meal.id, "fruit")}><Icon name="fruit" />Add fruit</button>
                  </div>
                  <div className="meal-status" role="status">
                    {mealFeedback && (
                      <span className={`randomize-feedback-inline ${mealFeedback.changed ? "is-success" : "is-notice"}${randomizeUndo?.mealId === meal.id ? " has-action" : ""}`}>
                        <span>{mealFeedback.message}</span>
                        {randomizeUndo?.mealId === meal.id && (
                          <button type="button" onClick={undoRandomize}>Undo</button>
                        )}
                      </span>
                    )}
                    {mealToolMessage && (
                      <span className={`randomize-feedback-inline is-${mealToolMessage.tone}`}>
                        {mealToolMessage.message}
                      </span>
                    )}
                    {status.length > 0 && <span>Current meal: {status.join(" · ")}. This target will be used when you tap Randomize meal.</span>}
                  </div>
                </details>
              </details>
            );
            })}
          </div>
          {addMealBlocker && <p className="randomize-feedback is-notice" role="alert">{addMealBlocker}</p>}
          <button className="secondary-action with-icon" type="button" onClick={addEmptyMeal}><Icon name="add" />Add meal</button>
          {deletedItemUndo && (
            <div className="undo-delete-state" role="status">
              <p><strong>{deletedItemUndo.label}</strong> removed</p>
              <button type="button" onClick={undoDeletedItem}>Undo</button>
            </div>
          )}
          <nav className="bottom-action result-action-bar" aria-label="Plan actions">
            {shareState?.stale && <p className="share-action-status" role="status">{shareState.message}</p>}
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

function mealItemGroupLabel(groupId: "grain" | "protein-serving" | "fruit") {
  if (groupId === "protein-serving") return "Protein";
  if (groupId === "grain") return "Grain";
  return "Fruit";
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

function NumberStepper({
  ariaDescribedBy,
  ariaErrorMessage,
  ariaInvalid,
  ariaLabel,
  className = "",
  decrementLabel,
  disabled = false,
  inputRef,
  incrementLabel,
  max,
  min = 0,
  onChange,
  onInvalid,
  required = false,
  size = "default",
  step,
  value,
}: {
  ariaDescribedBy?: string;
  ariaErrorMessage?: string;
  ariaInvalid?: boolean;
  ariaLabel: string;
  className?: string;
  decrementLabel?: string;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  incrementLabel?: string;
  max?: number;
  min?: number;
  onChange: (value: string) => void;
  onInvalid?: React.FormEventHandler<HTMLInputElement>;
  required?: boolean;
  size?: "default" | "compact";
  step: number;
  value: string;
}) {
  const minValue = min;
  const maxValue = max ?? Number.POSITIVE_INFINITY;

  function stepValue(delta: number) {
    const parsed = Number.parseFloat(value);
    const current = Number.isFinite(parsed) ? parsed : 0;
    const next = Math.min(maxValue, Math.max(minValue, current + delta));
    onChange(formatNumberInputValue(next, step));
  }

  return (
    <div className={`number-stepper${size === "compact" ? " is-compact" : ""}${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        aria-label={decrementLabel ?? `Decrease ${ariaLabel} by ${step}`}
        disabled={disabled}
        onClick={() => stepValue(-step)}
      >
        −
      </button>
      <input
        ref={inputRef}
        aria-describedby={ariaDescribedBy}
        aria-errormessage={ariaErrorMessage}
        aria-invalid={ariaInvalid ? "true" : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        inputMode="numeric"
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        onInvalid={onInvalid}
        required={required}
        step={step}
        type="number"
        value={value}
      />
      <button
        type="button"
        aria-label={incrementLabel ?? `Increase ${ariaLabel} by ${step}`}
        disabled={disabled}
        onClick={() => stepValue(step)}
      >
        +
      </button>
    </div>
  );
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
        <NumberStepper
          ariaLabel={`${label} value`}
          disabled={value.mode === "none"}
          onChange={(nextValue) => onChange({ ...value, value: nextValue })}
          size="compact"
          step={1}
          value={value.value}
        />
      </div>
    </label>
  );
}

function PreferenceGroup({ automaticHelper, iconFor, label, options, values, onChange }: { automaticHelper?: string; iconFor: (optionId: string) => IconName; label: string; options: { id: string; label: string }[]; values: string[]; onChange: (optionId: string, checked: boolean) => void }) {
  const optionIds = options.map((option) => option.id);
  const selectedIds = selectedOptionIds(values, optionIds);
  const showAutomaticHelper = Boolean(automaticHelper) && selectedIds.length === optionIds.length && optionIds.length > 0;

  return (
    <fieldset className="choice-group preference-group">
      <legend>{label}</legend>
      {showAutomaticHelper && <p className="preference-auto-helper">{automaticHelper}</p>}
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
  const PhosphorGlyph = iconMap[name];

  return (
    <PhosphorGlyph className="line-icon" aria-hidden="true" focusable="false" weight="bold" />
  );
}

const iconMap = {
  add: Plus,
  alert: Warning,
  bread: Bread,
  bowl: BowlSteam,
  calories: Fire,
  carb: Grains,
  check: Check,
  cheese: Cheese,
  close: X,
  copy: Copy,
  dairy: Cheese,
  delete: Trash,
  download: DownloadSimple,
  egg: Egg,
  export: FileArrowDown,
  fat: Drop,
  fiber: Leaf,
  fish: Fish,
  food: ForkKnife,
  fruit: Orange,
  install: DeviceMobile,
  leaf: Leaf,
  lock: Lock,
  macros: ChartBar,
  plate: CookingPot,
  plantProtein: Plant,
  protein: Barbell,
  randomize: Shuffle,
  share: ShareNetwork,
  swap: Swap,
  targets: Target,
  tools: SlidersHorizontal,
  unlock: LockOpen,
  vegetable: Carrot,
} satisfies Record<IconName, PhosphorIcon>;

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
  if (optionId.includes("bread") || optionId.includes("roti") || optionId.includes("dosa")) return "bread";
  return "carb";
}

function proteinOptionIcon(optionId: string): IconName {
  if (optionId.includes("egg")) return "egg";
  if (optionId.includes("chicken") || optionId.includes("fish")) return "fish";
  if (optionId.includes("paneer")) return "cheese";
  if (optionId.includes("tofu") || optionId.includes("soy") || optionId.includes("dal")) return "plantProtein";
  return "protein";
}

function mealRoleIcon(role: MealRole): IconName {
  const icons: Record<MealRole, IconName> = {
    cookingFat: "fat",
    carb: "carb",
    protein: "protein",
    vegetables: "vegetable",
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

function formatNumberInputValue(value: number, step: number) {
  const precision = decimalPlaces(step);
  const formatted = precision > 0 ? value.toFixed(precision) : String(Math.round(value));
  return formatted.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function decimalPlaces(value: number) {
  const text = String(value);
  if (!text.includes(".")) return 0;
  return text.split(".")[1]?.length ?? 0;
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
  mealName,
  onAmount,
  onDelete,
  onLock,
  onSwap,
}: {
  form: EditableFormState;
  item: DailyPlanItem;
  locked: boolean;
  mealId: string;
  mealName: string;
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
  const servingStep = Number(amountStep(item, quantity.unit));
  const servingAmountLabel = `${label} amount in grams for ${mealName}`;

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
        <div className="amount-line">
          <NumberStepper
            ariaDescribedBy={servingValidationMessage ? servingErrorId : undefined}
            ariaInvalid={Boolean(servingValidationMessage)}
            ariaLabel={servingAmountLabel}
            className="amount-control"
            decrementLabel={`Decrease ${servingAmountLabel} by ${servingStep} ${quantity.unit}`}
            incrementLabel={`Increase ${servingAmountLabel} by ${servingStep} ${quantity.unit}`}
            onChange={updateServingDraft}
            size="compact"
            step={servingStep}
            value={servingDraft}
          />
          <span className="unit-label" title="grams">gm</span>
        </div>
        <div className="item-button-row">
          <button className="lock-toggle icon-button" type="button" aria-label={`${locked ? "Unlock" : "Lock"} ${label}`} aria-pressed={locked} onClick={onLock}>
            <Icon name={locked ? "unlock" : "lock"} />
            <span className="control-label">{locked ? "Unlock" : "Lock"}</span>
          </button>
          <button className="delete-toggle icon-button" type="button" aria-label={`Delete ${label}`} onClick={onDelete}>
            <Icon name="delete" />
            <span className="control-label">Delete</span>
          </button>
        </div>
        {servingValidationMessage && (
          <span
            className="randomize-feedback-inline is-notice"
            id={servingErrorId}
            role="alert"
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
    : "Open the browser menu, then choose Install app or Add to Home Screen.";
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
