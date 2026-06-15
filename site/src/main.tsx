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
import { FileImage } from "@phosphor-icons/react/FileImage";
import { FileArrowDown } from "@phosphor-icons/react/FileArrowDown";
import { Fire } from "@phosphor-icons/react/Fire";
import { Fish } from "@phosphor-icons/react/Fish";
import { ForkKnife } from "@phosphor-icons/react/ForkKnife";
import { Grains } from "@phosphor-icons/react/Grains";
import { Leaf } from "@phosphor-icons/react/Leaf";
import { Lock } from "@phosphor-icons/react/Lock";
import { LockOpen } from "@phosphor-icons/react/LockOpen";
import { Monitor } from "@phosphor-icons/react/Monitor";
import { MoonStars } from "@phosphor-icons/react/MoonStars";
import { Orange } from "@phosphor-icons/react/Orange";
import { Plant } from "@phosphor-icons/react/Plant";
import { Plus } from "@phosphor-icons/react/Plus";
import { ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { Shuffle } from "@phosphor-icons/react/Shuffle";
import { SlidersHorizontal } from "@phosphor-icons/react/SlidersHorizontal";
import { Sun } from "@phosphor-icons/react/Sun";
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
  type PlanEvaluation,
} from "../../src/index.js";
import {
  addItemToMeal,
  addMeal,
  buildNutritionInput,
  decodeShareState,
  encodeShareState,
  exchangeOptionDisplayAmountLabel,
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
  planItemDisplayAmountLabel,
  planItemDisplayLabel,
  planItemDisplayQuantity,
  planItemDisplayUnitLabel,
  planEvaluation,
  proteinOptions,
  randomizePlan,
  removePlanItem,
  shareUrlForState,
  swapExchangeOption,
  updateItemAmount,
  unusedFoodPreferenceLabels,
  type EditableFormState,
  type MacroField,
  type MealMacroTarget,
  type ShareablePlannerState,
} from "./editable-planner.js";
import { planExportCsv, planExportExcelHtml, planShareText, type PlanExportOptions } from "./export-plan.js";
import "./styles.css";

type BoundField = "none" | "min" | "max" | "target";
type PlannerView = "targets" | "plan";
type ShareState = {
  message: string;
  manualUrl?: string;
  shareKey?: string;
  stale?: boolean;
};
type ExportSheetStatus = {
  message: string;
  tone: "success" | "notice";
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
type SwapConfirmation = {
  itemId: string;
  mealId: string;
  message: string;
};
type ServingEditConfirmation = {
  itemId: string;
  mealId: string;
  message: string;
  previousAmount?: number;
  tone: "notice" | "success";
};
type LockConfirmation = {
  itemId: string;
  mealId: string;
  message: string;
  tone: "notice" | "success";
};
type LockedItemSummary = {
  itemId: string;
  label: string;
  mealName: string;
};
type LoadedUrlState = {
  state?: ShareablePlannerState;
  shareLoadFailed: boolean;
};
type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = Exclude<ThemePreference, "system">;
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
type GoogleTranslateElementConstructor = {
  new (options: Record<string, unknown>, elementId: string): unknown;
  InlineLayout?: { SIMPLE?: string };
};

declare global {
  interface Window {
    google?: {
      translate?: {
        TranslateElement?: GoogleTranslateElementConstructor;
      };
    };
    googleTranslateElementInit?: () => void;
  }
}

const calorieTargetMin = 800;
const calorieTargetMax = 5000;
const calorieValidationMessage = `Enter a calorie target from ${calorieTargetMin}-${calorieTargetMax} kcal.`;

function isValidCalorieTarget(value: string) {
  const calories = Number(value);
  return value.trim() !== "" && Number.isFinite(calories) && calories >= calorieTargetMin && calories <= calorieTargetMax;
}

function hasActiveMealTarget(target: MealMacroTarget) {
  return Number(target.calories || 0) > 0 || Number(target.protein || 0) > 0;
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
  | "image"
  | "install"
  | "leaf"
  | "lock"
  | "macros"
  | "moon"
  | "plate"
  | "plantProtein"
  | "protein"
  | "randomize"
  | "share"
  | "sun"
  | "system"
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
const staleExportBlockedMessage = "Regenerate before exporting updated targets.";
const generationProgressMessage = "Generating plan...";
const googleTranslateElementId = "google_translate_element";
const googleTranslateScriptId = "google-translate-script";
const googleTranslateCookieName = "googtrans";
const themeStorageKey = "meal-plan-theme";
const themeColorMetaSelector = 'meta[name="theme-color"]';
const themeColorByMode: Record<ResolvedTheme, string> = {
  dark: "#141414",
  light: "#F7F6F2",
};
const themeOptions: { preference: ThemePreference; label: string }[] = [
  { preference: "system", label: "Auto" },
  { preference: "light", label: "Light" },
  { preference: "dark", label: "Dark" },
];
const translationLanguages = [
  { code: "", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "mr", label: "Marathi" },
  { code: "pa", label: "Punjabi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ur", label: "Urdu" },
] as const;
const googleTranslateLanguageCodes = translationLanguages
  .map((language) => language.code)
  .filter(Boolean)
  .join(",");

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

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";

  try {
    const storedPreference = window.localStorage.getItem(themeStorageKey);
    return isThemePreference(storedPreference) ? storedPreference : "system";
  } catch (error) {
    console.warn("Could not read theme preference.", error);
    return "system";
  }
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveTheme(preference: ThemePreference, systemTheme: ResolvedTheme): ResolvedTheme {
  return preference === "system" ? systemTheme : preference;
}

function writeThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(themeStorageKey, preference);
  } catch (error) {
    console.warn("Could not save theme preference.", error);
  }
}

function applyTheme(preference: ThemePreference, resolvedTheme: ResolvedTheme) {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = preference;

  const themeColorMeta = document.querySelector<HTMLMetaElement>(themeColorMetaSelector);
  if (themeColorMeta) {
    themeColorMeta.content = themeColorByMode[resolvedTheme];
  }
}

function themePreferenceFromValue(value: string): ThemePreference {
  if (isThemePreference(value)) return value;
  console.warn(`Unsupported theme preference "${value}". Falling back to system.`);
  return "system";
}

function themePreferenceLabel(preference: ThemePreference | ResolvedTheme) {
  if (preference === "system") return "Auto";
  return preference === "light" ? "Light" : "Dark";
}

function App() {
  const loadedUrlState = useMemo(loadStateFromUrl, []);
  const generationProgressId = useId();
  const quickStartConfirmTitleId = useId();
  const quickStartConfirmDescriptionId = useId();
  const exportSheetTitleId = useId();
  const exportSheetDescriptionId = useId();
  const exportStaleNoticeId = useId();
  const resultStaleNoticeId = useId();
  const urlState = loadedUrlState.state;
  const [form, setForm] = useState<EditableFormState>(normalizeEditableFormState(urlState?.form));
  const [plan, setPlan] = useState<DailyPlan | undefined>(urlState?.plan);
  const [activeView, setActiveView] = useState<PlannerView>(urlState?.plan ? "plan" : "targets");
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set(urlState?.lockedItemIds ?? []));
  const [mealTargets, setMealTargets] = useState<Record<string, MealMacroTarget>>(urlState?.mealTargets ?? {});
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [shareState, setShareState] = useState<ShareState | undefined>();
  const [showSharedPlanOrientation, setShowSharedPlanOrientation] = useState(Boolean(urlState?.plan));
  const [manualShareText, setManualShareText] = useState("");
  const [exportSheetStatus, setExportSheetStatus] = useState<ExportSheetStatus | undefined>();
  const [shareLoadFailed, setShareLoadFailed] = useState(loadedUrlState.shareLoadFailed);
  const [generationBlockers, setGenerationBlockers] = useState<string[]>([]);
  const [isPlanStale, setIsPlanStale] = useState(false);
  const [mealToolMessages, setMealToolMessages] = useState<Record<string, MealToolMessage>>({});
  const [swapConfirmation, setSwapConfirmation] = useState<SwapConfirmation | undefined>();
  const [servingEditConfirmation, setServingEditConfirmation] = useState<ServingEditConfirmation | undefined>();
  const [lockConfirmation, setLockConfirmation] = useState<LockConfirmation | undefined>();
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
  const [dietRuleNotice, setDietRuleNotice] = useState("");
  const [pendingQuickStartPreset, setPendingQuickStartPreset] = useState<QuickStartPreset | undefined>();
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(readSystemTheme);
  const resultRef = useRef<HTMLElement>(null);
  const exportSheetRef = useRef<HTMLDialogElement>(null);
  const generationFeedbackRef = useRef<HTMLDivElement>(null);
  const quickFieldsRef = useRef<HTMLDivElement>(null);
  const calorieInputRef = useRef<HTMLInputElement>(null);
  const optionsDrawerRef = useRef<HTMLDetailsElement>(null);
  const foodDrawerRef = useRef<HTMLDetailsElement>(null);
  const macroDrawerRef = useRef<HTMLDetailsElement>(null);
  const quickStartConfirmDialogRef = useRef<HTMLDialogElement>(null);
  const generationInFlight = useRef(false);
  const mealCardRefs = useRef<Map<string, HTMLDetailsElement>>(new Map());
  const addedMealFeedbackKey = useRef(0);
  const revealedAddedMealKey = useRef<number | undefined>(undefined);

  const evaluation = plan ? planEvaluation(plan, form) : undefined;
  const recoveryMessages = evaluation?.status === "fail" ? failureRecoveryMessages(evaluation) : [];
  const targetStatusItems = evaluation && hasOptionalMacroTarget(evaluation.targetBounds) ? evaluation.targetBounds : [];
  const unusedFoodPreferences = useMemo(() => (plan ? unusedFoodPreferenceLabels(plan, form) : []), [form, plan]);
  const proteinTarget = Number(form.protein || 0);
  const proteinTargetSummary = proteinTarget > 0 ? `${Math.round(proteinTarget)} gm` : "Not set";
  const activeMacroRuleLabels = activeMacroLabels(form);
  const activeMacroRuleCount = activeMacroRuleLabels.length;
  const incompleteMacroRuleLabels = incompleteMacroLabels(form);
  const incompleteMacroRuleCount = incompleteMacroRuleLabels.length;
  const likedProteinAvoidConflicts = useMemo(() => foodRuleConflictLabels(form), [form]);
  const lockedItemSummaries = useMemo<LockedItemSummary[]>(() => {
    if (!plan) return [];

    return plan.meals.flatMap((meal) => meal.items.flatMap((item) => {
      if (!item.id || !lockedIds.has(item.id)) return [];

      return [{
        itemId: item.id,
        label: planItemLabel(item),
        mealName: meal.displayName,
      }];
    }));
  }, [lockedIds, plan]);
  const lockedItemCount = lockedItemSummaries.length;
  const currentShareableState = useMemo<ShareablePlannerState>(() => ({
    form,
    plan,
    lockedItemIds: [...lockedIds],
    mealTargets,
  }), [form, plan, lockedIds, mealTargets]);
  const currentShareKey = useMemo(() => encodeShareState(currentShareableState), [currentShareableState]);
  const generationActionLabel = isGenerating ? "Generating..." : plan ? "Regenerate plan" : "Generate";
  const canUndoPlanRandomize = Boolean(randomizeUndo && !randomizeUndo.mealId);
  const hasActiveMealTargets = useMemo(() => Object.values(mealTargets).some(hasActiveMealTarget), [mealTargets]);
  const randomizePlanActionLabel = hasActiveMealTargets ? "Randomize plan" : "Randomize";
  const shareActionFeedback = shareState && (shareState.stale || shareState.shareKey || shareState.manualUrl) ? shareState : undefined;
  const topShareState = shareState && !shareActionFeedback ? shareState : undefined;
  const hasResultActionStatus = Boolean(activeView === "plan" && (isPlanStale || planRandomizeFeedback || shareActionFeedback));
  const exportActionDescriptionId = isPlanStale ? exportStaleNoticeId : undefined;
  const resolvedTheme = resolveTheme(themePreference, systemTheme);

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
    if (typeof window.matchMedia !== "function") return;

    const systemThemeQuery = window.matchMedia("(prefers-color-scheme: light)");
    const syncSystemTheme = () => setSystemTheme(systemThemeQuery.matches ? "light" : "dark");

    syncSystemTheme();
    systemThemeQuery.addEventListener("change", syncSystemTheme);
    return () => systemThemeQuery.removeEventListener("change", syncSystemTheme);
  }, []);

  useEffect(() => {
    applyTheme(themePreference, resolvedTheme);
    writeThemePreference(themePreference);
  }, [resolvedTheme, themePreference]);

  useEffect(() => {
    const dialog = quickStartConfirmDialogRef.current;
    if (!dialog || !pendingQuickStartPreset || dialog.open) {
      return;
    }

    dialog.showModal();
  }, [pendingQuickStartPreset]);

  useEffect(() => {
    const dialog = exportSheetRef.current;
    if (!dialog) {
      return;
    }

    if (exportSheetOpen && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!exportSheetOpen && dialog.open) {
      dialog.close();
    }
  }, [exportSheetOpen]);

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
    setSwapConfirmation(undefined);
    setServingEditConfirmation(undefined);
    setLockConfirmation(undefined);
    setAddMealBlocker("");
    clearRandomizeFeedback();
    if (isFoodCustomizationField(key)) {
      setDietRuleNotice("");
    }
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
    setSwapConfirmation(undefined);
    setServingEditConfirmation(undefined);
    setLockConfirmation(undefined);
    clearRandomizeFeedback();
    const incompleteMacroBlockers = incompleteMacroRuleBlockers(sourceForm);
    if (incompleteMacroBlockers.length > 0) {
      setOptionsOpen(true);
      setGenerationBlockers(incompleteMacroBlockers);
      return false;
    }

    const result = generateEditablePlanResult(sourceForm, useExistingLocks ? plan : undefined, useExistingLocks ? lockedIds : new Set<string>(), seed);

    if (result.plan) {
      setIsPlanStale(false);
      setPlan(result.plan);
      setExpandedMealIds(new Set(result.plan.meals[0] ? [result.plan.meals[0].id] : []));
      setActiveView("plan");
      setDietRuleNotice("");
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

  function regenerateStalePlan() {
    regenerateStalePlanFromChangedInputs();
  }

  function regenerateStalePlanFromExportSheet() {
    regenerateStalePlanFromChangedInputs();
  }

  function regenerateStalePlanFromChangedInputs() {
    if (!isValidCalorieTarget(form.calories)) {
      setExportSheetOpen(false);
      setCalorieInputError(calorieValidationMessage);
      openTargetsView();
      window.requestAnimationFrame(() => calorieInputRef.current?.focus());
      return;
    }

    setCalorieInputError("");
    void generateWithProgress();
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

  function selectQuickStartPreset(preset: QuickStartPreset) {
    if (plan) {
      setPendingQuickStartPreset(preset);
      return;
    }

    applyQuickStartPreset(preset);
  }

  function applyQuickStartPreset(preset: QuickStartPreset) {
    const replacesPlan = Boolean(plan);
    setPendingQuickStartPreset(undefined);
    setForm(preset.form);
    setLockedIds(new Set());
    setMealTargets({});
    setMealToolMessages({});
    setSwapConfirmation(undefined);
    setServingEditConfirmation(undefined);
    setLockConfirmation(undefined);
    setAddMealBlocker("");
    setShareState(undefined);

    if (generate(preset.form, { useExistingLocks: false }) && replacesPlan) {
      setShareState({ message: `${preset.label} example replaced the previous plan.` });
    }
  }

  function cancelQuickStartReplacement() {
    setPendingQuickStartPreset(undefined);
  }

  function markPlanStale() {
    if (plan) {
      setIsPlanStale(true);
      setManualShareText("");
    }
  }

  function openTargetsView() {
    setShowSharedPlanOrientation(false);
    setActiveView("targets");
  }

  function scrollToRecoveryElement(element: HTMLElement | null, focusElement = element) {
    if (!element) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    focusElement?.focus({ preventScroll: true });
  }

  function reviewTargetInputs() {
    openTargetsView();
    window.requestAnimationFrame(() => scrollToRecoveryElement(quickFieldsRef.current, calorieInputRef.current));
  }

  function openCustomizeRecovery(section: "food" | "macros") {
    openTargetsView();
    setOptionsOpen(true);

    window.requestAnimationFrame(() => {
      const drawer = section === "food" ? foodDrawerRef.current : macroDrawerRef.current;
      if (!drawer) return;

      drawer.open = true;
      const summary = drawer.querySelector("summary");
      scrollToRecoveryElement(drawer, summary instanceof HTMLElement ? summary : drawer);
    });
  }

  function randomizeVisiblePlan() {
    if (!plan) return;
    setDeletedItemUndo(undefined);
    setAddedMealFeedback(undefined);
    setAddMealBlocker("");
    setMealRandomizeFeedback({});
    setSwapConfirmation(undefined);
    setServingEditConfirmation(undefined);
    setLockConfirmation(undefined);
    const next = randomizePlan(plan, form, lockedIds);
    const changed = JSON.stringify(next) !== JSON.stringify(plan);
    setPlan(next);
    setRandomizeUndo(changed ? { plan, wasPlanStale: isPlanStale } : undefined);
    setPlanRandomizeFeedback({
      changed,
      message: changed
        ? hasActiveMealTargets
          ? "Whole plan randomized. Use Randomize meal in Meal tools for meal targets."
          : "Plan randomized."
        : hasActiveMealTargets
          ? "No different whole-plan randomization found. Use Randomize meal in Meal tools for meal targets."
          : "No different plan found with the current locks and food rules. Unlock items or relax rules, then try again.",
    });
    setIsPlanStale(false);
  }

  function updateDietaryLevel(level: DietaryLevel) {
    setGenerationBlockers([]);
    setMealToolMessages({});
    setSwapConfirmation(undefined);
    setLockConfirmation(undefined);
    setAddMealBlocker("");
    clearRandomizeFeedback();
    markPlanStale();
    const nextForm = applyDietaryLevel(form, level);
    setDietRuleNotice(dietRuleChangeNotice(form, nextForm));
    setForm(nextForm);
  }

  function updatePreference(key: "preferredGrains" | "preferredProteins", optionId: string, checked: boolean) {
    setGenerationBlockers([]);
    setMealToolMessages({});
    setSwapConfirmation(undefined);
    setLockConfirmation(undefined);
    setAddMealBlocker("");
    clearRandomizeFeedback();
    setDietRuleNotice("");
    markPlanStale();
    setForm((current) => {
      const next = checked
        ? [...new Set([...current[key], optionId])]
        : current[key].filter((id) => id !== optionId);
      return { ...current, [key]: next };
    });
  }

  function toggleLock(itemId: string) {
    const meal = plan?.meals.find((candidate) => candidate.items.some((item) => item.id === itemId));
    const item = meal?.items.find((candidate) => candidate.id === itemId);
    const wasLocked = lockedIds.has(itemId);
    const itemLabel = item ? planItemLabel(item) : undefined;

    setDeletedItemUndo(undefined);
    clearRandomizeFeedback();
    clearMealToolMessageForItem(itemId);
    setSwapConfirmation(undefined);
    setServingEditConfirmation(undefined);
    setLockConfirmation(meal && itemLabel
      ? {
          itemId,
          mealId: meal.id,
          message: wasLocked
            ? itemLabel + " unlocked."
            : itemLabel + " locked. Generate and Randomize will keep it fixed.",
          tone: wasLocked ? "notice" : "success",
        }
      : undefined);
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
    setSwapConfirmation(undefined);
    setServingEditConfirmation(undefined);
    setLockConfirmation(undefined);
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
    setSwapConfirmation(undefined);
    setServingEditConfirmation(undefined);
    setLockConfirmation(undefined);
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
    setSwapConfirmation(undefined);
    setServingEditConfirmation(undefined);
    setLockConfirmation(undefined);
    const next = addItemToMeal(plan, mealId, groupId, groupId === "protein-serving" || groupId === "grain" ? form : undefined);
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
    setSwapConfirmation(undefined);
    setServingEditConfirmation(undefined);
    setLockConfirmation(undefined);
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
    const currentMeal = plan.meals.find((meal) => meal.items.some((item) => item.id === itemId));
    const currentItem = currentMeal?.items.find((item) => item.id === itemId);
    const previousAmount = currentItem ? planItemDisplayQuantity(currentItem).amount : undefined;

    setDeletedItemUndo(undefined);
    clearRandomizeFeedback();
    clearMealToolMessageForItem(itemId);
    setSwapConfirmation(undefined);
    setLockConfirmation(undefined);
    const next = updateItemAmount(plan, itemId, amount);
    const updatedMeal = next.meals.find((meal) => meal.items.some((item) => item.id === itemId));
    const updatedItem = updatedMeal?.items.find((item) => item.id === itemId);
    const nextEvaluation = planEvaluation(next, form);

    setPlan(next);

    if (updatedMeal && updatedItem) {
      setServingEditConfirmation({
        itemId,
        mealId: updatedMeal.id,
        message: servingEditConfirmationMessage(planItemDisplayAmountLabel(updatedItem), nextEvaluation.status),
        previousAmount,
        tone: nextEvaluation.status === "fail" ? "notice" : "success",
      });
    }
  }

  function undoServingEdit() {
    if (!plan || !servingEditConfirmation || servingEditConfirmation.previousAmount === undefined) return;

    const { itemId, previousAmount } = servingEditConfirmation;
    const next = updateItemAmount(plan, itemId, previousAmount);
    const restoredMeal = next.meals.find((meal) => meal.items.some((item) => item.id === itemId));
    const restoredItem = restoredMeal?.items.find((item) => item.id === itemId);
    const nextEvaluation = planEvaluation(next, form);

    setDeletedItemUndo(undefined);
    clearRandomizeFeedback();
    clearMealToolMessageForItem(itemId);
    setSwapConfirmation(undefined);
    setLockConfirmation(undefined);
    setPlan(next);

    if (restoredMeal && restoredItem) {
      setServingEditConfirmation({
        itemId,
        mealId: restoredMeal.id,
        message: servingRestoredConfirmationMessage(planItemDisplayAmountLabel(restoredItem), nextEvaluation.status),
        tone: nextEvaluation.status === "fail" ? "notice" : "success",
      });
    } else {
      setServingEditConfirmation(undefined);
    }
  }

  function swapPlanItem(itemId: string, optionId: string) {
    if (!plan) return;
    const meal = plan.meals.find((candidate) => candidate.items.some((item) => item.id === itemId));
    const item = meal?.items.find((candidate) => candidate.id === itemId);
    if (item?.kind === "exchange" && item.exchangeOptionId === optionId) return;
    const optionName = item?.kind === "exchange"
      ? getExchangeOption(item.exchangeGroupId, optionId).displayName
      : undefined;

    setDeletedItemUndo(undefined);
    clearRandomizeFeedback();
    clearMealToolMessageForItem(itemId);
    setSwapConfirmation(undefined);
    setServingEditConfirmation(undefined);
    setLockConfirmation(undefined);
    setPlan(swapExchangeOption(plan, itemId, optionId));
    if (meal && optionName) {
      setSwapConfirmation({
        itemId,
        mealId: meal.id,
        message: `Swapped to ${optionName}; totals updated.`,
      });
    }
  }

  function randomizeSingleMeal(mealId: string) {
    if (!plan) return;
    const meal = plan.meals.find((candidate) => candidate.id === mealId);
    if (!meal) return;

    setDeletedItemUndo(undefined);
    setPlanRandomizeFeedback(undefined);
    clearMealToolMessage(mealId);
    setSwapConfirmation(undefined);
    setServingEditConfirmation(undefined);
    setLockConfirmation(undefined);
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
    setSwapConfirmation(undefined);
    setServingEditConfirmation(undefined);
    setLockConfirmation(undefined);
    clearRandomizeFeedback();
  }

  function clearLocks() {
    setDeletedItemUndo(undefined);
    clearRandomizeFeedback();
    setSwapConfirmation(undefined);
    setLockConfirmation(undefined);
    setLockedIds(new Set());
  }

  function clearLocksFromGenerationBlocker() {
    clearLocks();
    setGenerationBlockers([]);
  }

  function updateMealTarget(mealId: string, key: keyof MealMacroTarget, value: string) {
    clearRandomizeFeedback();
    clearMealToolMessage(mealId);
    setSwapConfirmation(undefined);
    clearServingEditConfirmationForMeal(mealId);
    setLockConfirmation(undefined);
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

  function clearServingEditConfirmationForItem(itemId: string) {
    setServingEditConfirmation((current) => current?.itemId === itemId ? undefined : current);
  }

  function clearServingEditConfirmationForMeal(mealId: string) {
    setServingEditConfirmation((current) => current?.mealId === mealId ? undefined : current);
  }

  function openSwapSheetForItem(itemId: string) {
    setSwapConfirmation((current) => current && current.itemId !== itemId ? undefined : current);
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
      setExportSheetOpen(false);
      setShareState({ message: staleShareBlockedMessage, stale: true });
      return;
    }

    const state = currentShareableState;
    const shareKey = currentShareKey;
    const url = shareUrlForState(state);
    window.history.replaceState(null, "", `?s=${shareKey}`);
    setExportSheetOpen(false);
    setShowSharedPlanOrientation(false);

    const showManualShareRecovery = () => setShareState({
      message: "Copy blocked. Copy this share link manually.",
      manualUrl: url,
      shareKey,
    });

    if (typeof navigator.share === "function") {
      void navigator.share({ title: "Meal plan", text: "Open this meal plan", url })
        .then(() => setShareState({ message: "Share link opened", shareKey }))
        .catch((error) => {
          if (isAbortError(error)) {
            setShareState({ message: "Share canceled", shareKey });
            return;
          }

          copyShareLinkToClipboard(url, shareKey, showManualShareRecovery);
        });
      return;
    }

    copyShareLinkToClipboard(url, shareKey, showManualShareRecovery);
  }

  function copyShareLinkToClipboard(url: string, shareKey: string, showManualShareRecovery: () => void) {
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
    setShowSharedPlanOrientation(false);
    setManualShareText("");
    setExportSheetStatus(undefined);
    setGenerationBlockers([]);
    setIsPlanStale(false);
    setMealToolMessages({});
    setSwapConfirmation(undefined);
    setLockConfirmation(undefined);
    clearRandomizeFeedback();
    setDeletedItemUndo(undefined);
    setAddedMealFeedback(undefined);
    setAddMealBlocker("");
    setExpandedMealIds(new Set());
    setShareLoadFailed(false);
  }

  function exportCsv() {
    if (!plan) return;
    if (isPlanStale) {
      blockStaleExportAction();
      return;
    }

    downloadTextFile(exportFilename("csv"), "text/csv;charset=utf-8", planExportCsv(plan, exportOptions()));
    const message = "CSV downloaded";
    setShareState({ message });
    setExportSheetStatus({ message, tone: "success" });
  }

  function exportSpreadsheet() {
    if (!plan) return;
    if (isPlanStale) {
      blockStaleExportAction();
      return;
    }

    downloadTextFile(exportFilename("xls"), "application/vnd.ms-excel;charset=utf-8", planExportExcelHtml(plan, exportOptions()));
    setManualShareText("");
    const message = "Spreadsheet downloaded. Open it in Excel or import it into Google Sheets.";
    setShareState({ message });
    setExportSheetStatus({ message, tone: "success" });
  }

  function openShareSheet() {
    setExportSheetStatus(undefined);
    setExportSheetOpen(true);
  }

  async function sharePlanText() {
    if (!plan) return;
    if (isPlanStale) {
      blockStaleExportAction();
      return;
    }

    const text = planShareText(plan, exportOptions());
    setManualShareText("");

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Meal plan", text });
        const message = "Text share opened";
        setShareState({ message });
        setExportSheetStatus({ message, tone: "success" });
        return;
      }
    } catch (error) {
      if (isAbortError(error)) {
        const message = "Text share canceled";
        setShareState({ message });
        setExportSheetStatus({ message, tone: "notice" });
        return;
      }
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        const message = "Text copied. Paste it into WhatsApp, Messages, or notes.";
        setShareState({ message });
        setExportSheetStatus({ message, tone: "success" });
        return;
      }
    } catch {
      // Manual recovery is shown below when clipboard access is unavailable or blocked.
    }
    setManualShareText(text);
    setShareState(undefined);
    setShareState(undefined);
    setExportSheetStatus({ message: "Share blocked. Copy the text below.", tone: "notice" });
  }

  function exportOptions(): PlanExportOptions {
    if (!evaluation) {
      return {};
    }

    return {
      targetSummary: {
        calories: Number(form.calories || 0),
        protein: proteinTarget > 0 ? proteinTarget : undefined,
        diet: dietLabel(form.dietaryLevel),
        macroRules: activeMacroRuleLabels,
        targetStatus: targetResultLabel(evaluation.status),
      },
    };
  }

  async function sharePlanImage() {
    if (!plan) return;
    if (isPlanStale) {
      blockStaleExportAction();
      return;
    }

    setManualShareText("");

    try {
      const file = await createPlanShareImageFile(plan);
      if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: "Meal plan", text: "Meal plan image", files: [file] });
          const message = "Image share opened";
          setShareState({ message });
          setExportSheetStatus({ message, tone: "success" });
          return;
        } catch (error) {
          if (isAbortError(error)) {
            const message = "Image share canceled";
            setShareState({ message });
            setExportSheetStatus({ message, tone: "notice" });
            return;
          }
        }
      }

      downloadBlob(file.name, file);
      const message = "Image downloaded. Attach it in WhatsApp or Messages.";
      setShareState({ message });
      setExportSheetStatus({ message, tone: "success" });
    } catch {
      const message = "Image export failed. Use Share text instead.";
      setShareState({ message });
      setExportSheetStatus({ message, tone: "notice" });
    }
  }

  function blockStaleExportAction() {
    setManualShareText("");
    setShareState({ message: staleExportBlockedMessage, stale: true });
    setExportSheetStatus({ message: staleExportBlockedMessage, tone: "notice" });
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
    <main className={`app-shell${hasResultActionStatus ? " has-bottom-status" : ""}${shareActionFeedback?.manualUrl ? " has-share-recovery" : ""}`}>
      <header className="mobile-header">
        <h1>Meal plan</h1>
        <div className="header-actions">
          <TranslationControl />
          <ThemeSwitcher preference={themePreference} resolvedTheme={resolvedTheme} onChange={setThemePreference} />
          {!isInstalledView && (
            <button className="with-icon" type="button" onClick={() => void installApp()}>
              <Icon name="install" />
              {isIosBrowser() ? "Add app" : "Install"}
            </button>
          )}
        </div>
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

          {!plan && (
            <p className="first-plan-helper">
              Calories are required. Protein and Customize are optional for the first Generate.
            </p>
          )}

          <div className="quick-fields" ref={quickFieldsRef}>
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
              <small id="protein-helper" className="field-hint">Optional: leave blank to generate from calories only. When set, plans can pass within about 5gm.</small>
            </label>
          </div>

          <fieldset className="segmented diet-segments" aria-describedby={dietRuleNotice ? "diet-helper diet-rule-notice" : "diet-helper"}>
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
            {dietRuleNotice && <p id="diet-rule-notice" className="diet-rule-notice" role="status">{dietRuleNotice}</p>}
          </fieldset>

          <details className={`quick-start-presets example-drawer${plan ? " is-compact" : ""}`}>
            <summary>
              <span className="summary-label"><Icon name="plate" />{plan ? "Replace with example" : "Try sample targets"}</span>
              <span className="drawer-summary">Fill safe targets and generate</span>
            </summary>
            <div className="quick-start-row">
              {quickStartPresets.map((preset) => (
                <button key={preset.label} type="button" onClick={() => selectQuickStartPreset(preset)}>
                  <span className="quick-start-label"><Icon name="bowl" />{preset.label}</span>
                  <span className="quick-start-preview">{quickStartPresetPreview(preset.form)}</span>
                </button>
              ))}
            </div>
          </details>

          <details className="options-drawer" ref={optionsDrawerRef} open={optionsOpen} onToggle={(event) => setOptionsOpen(event.currentTarget.open)}>
            <summary>
              <span className="summary-label"><Icon name="tools" />Customize</span>
              <span className="drawer-summary">{customizeDrawerSummary(form)}</span>
            </summary>

            <details className="nested-drawer" ref={foodDrawerRef}>
              <summary>
                <span className="summary-label"><Icon name="food" />Food</span>
                <span className="drawer-summary">{foodDrawerSummary(form)}</span>
              </summary>
              <PreferenceGroup
                automaticHelper="All carb choices are selected, so the planner chooses automatically from this group. Uncheck chips to narrow likes; use Leave out to avoid foods that must be excluded."
                emptyHelper="No specific choices selected - the planner will choose automatically."
                iconFor={grainOptionIcon}
                label="Choose carbs"
                options={grainOptions}
                values={form.preferredGrains}
                onChange={(optionId, checked) => updatePreference("preferredGrains", optionId, checked)}
              />
              <PreferenceGroup
                automaticHelper="All visible proteins are selected, so the planner chooses automatically from this group. Uncheck chips to narrow likes; use Leave out to avoid foods that must be excluded."
                emptyHelper="No specific choices selected - the planner will choose automatically."
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

            <details className="nested-drawer" ref={macroDrawerRef}>
              <summary>
                <span className="summary-label"><Icon name="macros" />Macros</span>
                <span className="drawer-summary">{macroDrawerSummary(form)}</span>
              </summary>
              {incompleteMacroRuleCount > 0 && (
                <p className="macro-drawer-warning" role="alert">
                  <strong>{formatFoodRuleConflictList(incompleteMacroRuleLabels)}</strong> {incompleteMacroRuleCount === 1 ? "needs" : "need"} grams or Off before Generate.
                </p>
              )}
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

          {pendingQuickStartPreset && (
            <dialog
              className="preset-confirm-dialog"
              ref={quickStartConfirmDialogRef}
              aria-labelledby={quickStartConfirmTitleId}
              aria-describedby={quickStartConfirmDescriptionId}
              onCancel={cancelQuickStartReplacement}
              onClose={cancelQuickStartReplacement}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  cancelQuickStartReplacement();
                }
              }}
            >
              <div className="preset-confirm-panel">
                <header className="preset-confirm-header">
                  <p>Replace example</p>
                  <h3 id={quickStartConfirmTitleId}>Replace with {pendingQuickStartPreset.label}?</h3>
                </header>
                <p id={quickStartConfirmDescriptionId} className="preset-confirm-description">
                  This will replace your current plan and clear plan-specific edits, including locked items and meal targets.
                </p>
                <div className="preset-confirm-actions">
                  <button type="button" onClick={cancelQuickStartReplacement}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => applyQuickStartPreset(pendingQuickStartPreset)}>
                    Replace plan
                  </button>
                </div>
              </div>
            </dialog>
          )}

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
              <div className="generation-recovery-actions" aria-label="Recovery shortcuts">
                <span>Jump to fixes:</span>
                <button className="with-icon" type="button" onClick={reviewTargetInputs}>
                  <Icon name="targets" />Targets
                </button>
                <button className="with-icon" type="button" onClick={() => openCustomizeRecovery("food")}>
                  <Icon name="food" />Food rules
                </button>
                <button className="with-icon" type="button" onClick={() => openCustomizeRecovery("macros")}>
                  <Icon name="macros" />Macro rules
                </button>
              </div>
              {lockedItemCount > 0 && (
                <div className="generation-lock-recovery">
                  <p>
                    <strong>{lockedItemCount} locked {lockedItemCount === 1 ? "food is" : "foods are"} still fixed.</strong>{" "}
                    Clear all locks here, or return to the plan to unlock specific foods.
                  </p>
                  <div className="generation-lock-actions">
                    <button type="button" onClick={clearLocksFromGenerationBlocker}>Clear all locks</button>
                    {plan && <button type="button" onClick={() => setActiveView("plan")}>Back to plan</button>}
                  </div>
                </div>
              )}
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
              <span className={`result-status is-${evaluation.status}`}>{targetResultLabel(evaluation.status)}</span>
            </div>
          </div>
          {planRandomizeFeedback && (
            <div className={`randomize-feedback ${planRandomizeFeedback.changed ? "is-success" : "is-notice"}${canUndoPlanRandomize ? " has-action" : ""}`} role="status">
              <span>{planRandomizeFeedback.message}</span>
              {canUndoPlanRandomize && (
                <button type="button" onClick={undoRandomize}>Undo</button>
              )}
            </div>
          )}
          {topShareState && (
            <div className="share-state" role="status">
              <p>{topShareState.message}</p>
            </div>
          )}
          {showSharedPlanOrientation && (
            <div className="shared-plan-orientation" role="status">
              <p><strong>Shared plan opened.</strong> Edits stay here until you Share a new link.</p>
            </div>
          )}
          {isPlanStale && (
            <div className="stale-plan-notice has-action" role="status">
              <span>The visible meals and totals still use previous inputs. Regenerate to apply your latest choices.</span>
              <button className="with-icon" type="button" onClick={regenerateStalePlan} disabled={isGenerating} aria-busy={isGenerating}>
                <Icon name="plate" />
                {isGenerating ? "Generating..." : "Regenerate now"}
              </button>
            </div>
          )}
          {lockedItemCount > 0 && (
            <div className="locked-notice" role="status" aria-live="polite">
              <div className="locked-copy">
                <p><strong>{lockedItemCount === 1 ? "Locked food" : "Locked foods"}:</strong></p>
                <ul className="locked-food-list" aria-label="Locked foods">
                  {lockedItemSummaries.map((item) => (
                    <li key={item.itemId}>
                      <span className="locked-food-name">{item.label}</span>
                      <span className="locked-food-meal">in {item.mealName}</span>
                    </li>
                  ))}
                </ul>
                <p className="locked-guidance">Generate and Randomize keep {lockedItemCount === 1 ? "this food" : "these foods"} fixed.</p>
              </div>
              <button type="button" onClick={clearLocks}>Clear locks</button>
            </div>
          )}
          <div className="summary-grid">
            <SummaryMetric
              icon="calories"
              label="Calories"
              value={Math.round(evaluation.totals.values.calories)}
              suffix="kcal"
              targetDelta={dailyTargetDelta(evaluation, "calories")}
            />
            <SummaryMetric
              icon="protein"
              label="Protein"
              value={Math.round(evaluation.totals.values.protein)}
              suffix="gm"
              targetDelta={dailyTargetDelta(evaluation, "protein")}
            />
            <SummaryMetric icon="carb" label="Carbs" value={Math.round(evaluation.totals.values.carbs)} suffix="gm" />
            <SummaryMetric icon="fat" label="Fat" value={Math.round(evaluation.totals.values.fat)} suffix="gm" />
          </div>
          <dl className="target-context" aria-label="Active targets for this result">
            <div>
              <dt>Calorie target</dt>
              <dd><span className="notranslate" translate="no">{Math.round(Number(form.calories || 0))} kcal</span></dd>
            </div>
            <div>
              <dt>Protein target</dt>
              <dd><span className="notranslate" translate="no">{proteinTargetSummary}</span></dd>
            </div>
            <div>
              <dt>Diet</dt>
              <dd>{dietLabel(form.dietaryLevel)}</dd>
            </div>
            {activeMacroRuleCount > 0 && (
              <div>
                <dt>Macro rules</dt>
                <dd><span className="notranslate" translate="no">{activeMacroRuleCount}</span> applied{targetStatusItems.length > 0 ? "; status below" : ""}</dd>
              </div>
            )}
          </dl>
          {unusedFoodPreferences.length > 0 && (
            <p className="unused-preferences-note" role="note">
              <strong>Not used in this plan:</strong>{" "}
              <span className="notranslate" translate="no">{formatFoodRuleConflictList(unusedFoodPreferences)}</span>.
              {" "}The plan still respected active diet and Leave out rules.
            </p>
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
                    <strong className="notranslate" translate="no">{Math.round(mealTotals.values.calories)} kcal</strong>
                    <small>
                      <span className="notranslate" translate="no">{Math.round(mealTotals.values.protein)}gm</span> protein · <span className="notranslate" translate="no">{meal.items.length}</span> items
                      {lockedItemsInMeal > 0 && (
                        <span className="meal-lock-count"><span className="notranslate" translate="no">{lockedItemsInMeal}</span> locked</span>
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
                {mealUndo && (
                  <div className="meal-delete-undo" role="status" aria-live="polite">
                    <p><strong>{mealUndo.label}</strong> removed from {meal.displayName}.</p>
                    <button
                      type="button"
                      onClick={undoDeletedItem}
                      aria-label={`Undo removing ${mealUndo.label} from ${meal.displayName}`}
                    >
                      Undo
                    </button>
                  </div>
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
                        onSwapOpen={() => item.id && openSwapSheetForItem(item.id)}
                        onSwap={(optionId) => item.id && swapPlanItem(item.id, optionId)}
                        onServingUndo={undoServingEdit}
                        lockConfirmation={item.id && lockConfirmation?.itemId === item.id ? lockConfirmation : undefined}
                        servingConfirmation={item.id && servingEditConfirmation?.itemId === item.id ? servingEditConfirmation : undefined}
                        swapConfirmation={item.id && swapConfirmation?.itemId === item.id ? swapConfirmation.message : undefined}
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
                <dl className="meal-live-total" aria-label={`${meal.displayName} meal total`}>
                  <div>
                    <dt>Meal total</dt>
                    <dd>
                      <span className="notranslate" translate="no">{Math.round(mealTotals.values.calories)} kcal</span>
                      {" · "}
                      <span className="notranslate" translate="no">{Math.round(mealTotals.values.protein)}gm protein</span>
                    </dd>
                  </div>
                  <div className={`meal-live-status${status.length > 0 ? "" : " is-muted"}`}>
                    <dt>Target status</dt>
                    <dd>{status.length > 0 ? status.join(" · ") : "No meal target set"}</dd>
                  </div>
                </dl>
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
                    <button className="with-icon" type="button" aria-label={`Randomize ${meal.displayName}`} onClick={() => randomizeSingleMeal(meal.id)}><Icon name="randomize" />Randomize meal</button>
                    <button className="with-icon" type="button" aria-label={`Add protein to ${meal.displayName}`} onClick={() => addMealItem(meal.id, "protein-serving")}><Icon name="protein" />Add protein</button>
                    <button className="with-icon" type="button" aria-label={`Add grain to ${meal.displayName}`} onClick={() => addMealItem(meal.id, "grain")}><Icon name="carb" />Add grain</button>
                    <button className="with-icon" type="button" aria-label={`Add fruit to ${meal.displayName}`} onClick={() => addMealItem(meal.id, "fruit")}><Icon name="fruit" />Add fruit</button>
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
          <nav className={`bottom-action result-action-bar${isPlanStale ? " is-stale" : ""}`} aria-label="Plan actions">
            {isPlanStale ? (
              <>
                <p id={resultStaleNoticeId} className="stale-result-action-copy" role="status" aria-live="polite">
                  Current meals and totals are from your previous inputs until regeneration succeeds.
                </p>
                <button className="plan-action-button with-icon" type="button" onClick={openTargetsView}><Icon name="targets" />Targets</button>
                <button
                  className="primary-action stale-result-primary with-icon"
                  type="button"
                  onClick={regenerateStalePlan}
                  disabled={isGenerating}
                  aria-busy={isGenerating}
                  aria-describedby={resultStaleNoticeId}
                >
                  <Icon name="plate" />
                  {isGenerating ? "Generating..." : "Regenerate now"}
                </button>
              </>
            ) : (
              <>
                {shareActionFeedback && (
                  <div
                    className={`share-action-status${shareActionFeedback.manualUrl ? " manual-share" : ""}${shareActionFeedback.stale ? " is-stale" : ""}`}
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <p>{shareActionFeedback.message}</p>
                    {shareActionFeedback.manualUrl && (
                      <label className="manual-share-link">
                        <span>Share link</span>
                        <input readOnly value={shareActionFeedback.manualUrl} onFocus={(event) => event.currentTarget.select()} />
                      </label>
                    )}
                  </div>
                )}
                {planRandomizeFeedback && (
                  <div
                    className={`randomize-action-status ${planRandomizeFeedback.changed ? "is-success" : "is-notice"}${canUndoPlanRandomize ? " has-action" : ""}`}
                    role="status"
                    aria-atomic="true"
                  >
                    <span>{planRandomizeFeedback.message}</span>
                    {canUndoPlanRandomize && (
                      <button type="button" onClick={undoRandomize}>Undo</button>
                    )}
                  </div>
                )}
                <button className="plan-action-button with-icon" type="button" onClick={openTargetsView}><Icon name="targets" />Targets</button>
                <button className="plan-action-button with-icon" type="button" aria-label={hasActiveMealTargets ? "Randomize whole plan; meal targets use Randomize meal" : "Randomize plan"} onClick={randomizeVisiblePlan}><Icon name="randomize" />{randomizePlanActionLabel}</button>
                <button className="primary-action with-icon" type="button" onClick={openShareSheet} aria-haspopup="dialog" aria-expanded={exportSheetOpen}><Icon name="share" />Share</button>
              </>
            )}
          </nav>
          <dialog
            className="swap-sheet export-sheet"
            ref={exportSheetRef}
            aria-labelledby={exportSheetTitleId}
            aria-describedby={exportSheetDescriptionId}
            onCancel={() => setExportSheetOpen(false)}
            onClose={() => setExportSheetOpen(false)}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setExportSheetOpen(false);
              }
            }}
          >
            <div className="swap-sheet-panel export-sheet-panel">
              <header className="swap-sheet-header">
                <div>
                  <p>Share plan</p>
                  <h3 id={exportSheetTitleId}>Send it anywhere</h3>
                </div>
                <button className="with-icon" type="button" aria-label="Close share options" onClick={() => setExportSheetOpen(false)}><Icon name="close" />Close</button>
              </header>
              <p id={exportSheetDescriptionId} className="swap-sheet-description">
                Share a live link to this plan, send text or image to WhatsApp, or download one spreadsheet file for Excel and Google Sheets.
              </p>
              <div className="export-options" aria-label="Share and export meal plan">
                {isPlanStale && (
                  <div id={exportStaleNoticeId} className="export-stale-notice" role="status" aria-live="polite">
                    <p><strong>Exports paused.</strong> Regenerate first so shared files match the current targets and food rules.</p>
                    <button className="with-icon" type="button" onClick={regenerateStalePlanFromExportSheet} disabled={isGenerating} aria-busy={isGenerating}>
                      <Icon name="plate" />
                      {isGenerating ? "Generating..." : "Regenerate now"}
                    </button>
                  </div>
                )}
                <div className="export-actions">
                  <button className="with-icon" type="button" onClick={share} disabled={isPlanStale} aria-describedby={exportActionDescriptionId}><Icon name="share" />Share link</button>
                  <button className="with-icon" type="button" onClick={() => void sharePlanText()} disabled={isPlanStale} aria-describedby={exportActionDescriptionId}><Icon name="share" />Share text</button>
                  <button className="with-icon" type="button" onClick={() => void sharePlanImage()} disabled={isPlanStale} aria-describedby={exportActionDescriptionId}><Icon name="image" />Share image</button>
                  <button className="with-icon" type="button" onClick={exportSpreadsheet} disabled={isPlanStale} aria-describedby={exportActionDescriptionId}><Icon name="export" />Spreadsheet</button>
                  <button className="with-icon" type="button" onClick={exportCsv} disabled={isPlanStale} aria-describedby={exportActionDescriptionId}><Icon name="download" />CSV</button>
                </div>
                {exportSheetStatus && (
                  <div className={`export-action-status is-${exportSheetStatus.tone}`} role="status" aria-live="polite" aria-atomic="true">
                    <p>{exportSheetStatus.message}</p>
                  </div>
                )}
                <p className="export-helper">Spreadsheet downloads as one file. Import it into Google Sheets or open it in Excel.</p>
                {!isPlanStale && manualShareText && (
                  <div className="manual-share-recovery">
                    <p role="status">
                      <strong>Share blocked.</strong> Select this text, copy it, then paste it into WhatsApp or Messages.
                    </p>
                    <label className="manual-share-copy-field">
                      <span>Share text</span>
                      <textarea
                        readOnly
                        rows={8}
                        value={manualShareText}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </dialog>
        </section>
      )}
    </main>
  );
}

function planItemLabel(item: DailyPlanItem) {
  return planItemDisplayLabel(item);
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

function ThemeSwitcher({
  onChange,
  preference,
  resolvedTheme,
}: {
  onChange: (preference: ThemePreference) => void;
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
}) {
  const themeSelectId = useId();
  const activeLabel = preference === "system"
    ? `Auto (${themePreferenceLabel(resolvedTheme)})`
    : themePreferenceLabel(preference);

  return (
    <div className={`theme-control is-${resolvedTheme} notranslate`} translate="no">
      <label className="sr-only" htmlFor={themeSelectId}>Appearance</label>
      <Icon name={preference === "system" ? "system" : resolvedTheme === "light" ? "sun" : "moon"} />
      <select
        id={themeSelectId}
        aria-label={`Appearance: ${activeLabel}`}
        value={preference}
        onChange={(event) => onChange(themePreferenceFromValue(event.target.value))}
      >
        {themeOptions.map((option) => (
          <option key={option.preference} value={option.preference}>{option.label}</option>
        ))}
      </select>
      <span className="sr-only" role="status">Theme is {activeLabel}</span>
    </div>
  );
}

function TranslationControl() {
  const [language, setLanguage] = useState(readGoogleTranslateLanguage);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;

    const init = () => {
      const TranslateElement = window.google?.translate?.TranslateElement;
      if (!TranslateElement) {
        if (!cancelled) {
          setStatus("unavailable");
        }
        return;
      }

      const widget = document.getElementById(googleTranslateElementId);
      if (widget && widget.childElementCount === 0) {
        new TranslateElement({
          autoDisplay: false,
          includedLanguages: googleTranslateLanguageCodes,
          layout: TranslateElement.InlineLayout?.SIMPLE,
          pageLanguage: "en",
        }, googleTranslateElementId);
      }

      window.setTimeout(() => {
        if (!cancelled) {
          setStatus("ready");
          syncGoogleTranslateLanguage(language);
        }
      }, 0);
    };

    window.googleTranslateElementInit = init;

    if (window.google?.translate?.TranslateElement) {
      init();
    } else if (!document.getElementById(googleTranslateScriptId)) {
      const script = document.createElement("script");
      script.id = googleTranslateScriptId;
      script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;
      script.onerror = () => {
        if (!cancelled) {
          setStatus("unavailable");
        }
      };
      document.head.append(script);
    }

    return () => {
      cancelled = true;
      if (window.googleTranslateElementInit === init) {
        delete window.googleTranslateElementInit;
      }
    };
  }, [language]);

  function changeLanguage(nextLanguage: string) {
    setLanguage(nextLanguage);
    writeGoogleTranslateCookie(nextLanguage);
    if (status === "unavailable") {
      openGoogleTranslateFallback(nextLanguage);
      return;
    }

    setStatus("loading");
    syncGoogleTranslateLanguage(nextLanguage, 0, () => setStatus("ready"), () => {
      setStatus("unavailable");
      openGoogleTranslateFallback(nextLanguage);
    });
  }

  return (
    <div className="translation-control notranslate" translate="no">
      <label className="sr-only" htmlFor="language-select">Translate page</label>
      <select
        id="language-select"
        aria-label="Translate page"
        value={language}
        onChange={(event) => changeLanguage(event.target.value)}
      >
        {translationLanguages.map((option) => (
          <option key={option.code || "en"} value={option.code}>{option.label}</option>
        ))}
      </select>
      <span className="sr-only" role="status">
        {status === "ready" ? "Translation ready" : status === "loading" ? "Translation loading" : "Translation unavailable"}
      </span>
      <div id={googleTranslateElementId} aria-hidden="true" />
    </div>
  );
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
    <div className={`number-stepper notranslate${size === "compact" ? " is-compact" : ""}${className ? ` ${className}` : ""}`} translate="no">
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
  const warningId = useId();
  const isIncomplete = isIncompleteMacroField(value);

  return (
    <label className={`field compact${isIncomplete ? " is-incomplete" : ""}`}>
      <span><Icon name={icon} />{label}</span>
      <div className="inline-inputs">
        <select aria-label={`${label} bound type`} value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value as BoundField })}>
          <option value="none">Off</option>
          <option value="min">Min</option>
          <option value="max">Max</option>
          <option value="target">Target</option>
        </select>
        <NumberStepper
          ariaDescribedBy={isIncomplete ? warningId : undefined}
          ariaErrorMessage={isIncomplete ? warningId : undefined}
          ariaInvalid={isIncomplete}
          ariaLabel={`${label} value`}
          disabled={value.mode === "none"}
          onChange={(nextValue) => onChange({ ...value, value: nextValue })}
          size="compact"
          step={1}
          value={value.value}
        />
      </div>
      {isIncomplete && (
        <small id={warningId} className="field-error macro-field-warning" role="alert">
          Enter grams or switch {label} Off.
        </small>
      )}
    </label>
  );
}

function PreferenceGroup({ automaticHelper, emptyHelper, iconFor, label, options, values, onChange }: { automaticHelper?: string; emptyHelper?: string; iconFor: (optionId: string) => IconName; label: string; options: { id: string; label: string }[]; values: string[]; onChange: (optionId: string, checked: boolean) => void }) {
  const optionIds = options.map((option) => option.id);
  const selectedIds = selectedOptionIds(values, optionIds);
  const showAutomaticHelper = Boolean(automaticHelper) && selectedIds.length === optionIds.length && optionIds.length > 0;
  const showEmptyHelper = Boolean(emptyHelper) && selectedIds.length === 0 && optionIds.length > 0;

  return (
    <fieldset className="choice-group preference-group">
      <legend>{label}</legend>
      {showAutomaticHelper && <p className="preference-auto-helper">{automaticHelper}</p>}
      {showEmptyHelper && <p className="preference-auto-helper">{emptyHelper}</p>}
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
  image: FileImage,
  install: DeviceMobile,
  leaf: Leaf,
  lock: Lock,
  macros: ChartBar,
  moon: MoonStars,
  plate: CookingPot,
  plantProtein: Plant,
  protein: Barbell,
  randomize: Shuffle,
  share: ShareNetwork,
  sun: Sun,
  system: Monitor,
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
  const incompleteMacros = incompleteMacroCount(form);
  const labels = [
    ...activeFoodLabels,
    incompleteMacros > 0 ? `${incompleteMacros} incomplete macro rule${incompleteMacros === 1 ? "" : "s"}` : undefined,
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
  const incompleteMacros = incompleteMacroCount(form);
  const labels = [
    incompleteMacros > 0 ? `${incompleteMacros} incomplete` : undefined,
    activeMacros > 0 ? `${activeMacros} active` : undefined,
  ].filter((label): label is string => Boolean(label));

  if (labels.length > 0) {
    return incompleteMacros > 0 && activeMacros === 0
      ? `${incompleteMacros} incomplete macro rule${incompleteMacros === 1 ? "" : "s"}`
      : labels.join(" · ");
  }

  return "No macro limits";
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

function targetResultLabel(status: "pass" | "fail") {
  return status === "pass" ? "Within targets" : "Needs adjustment";
}

function servingEditConfirmationMessage(amount: string, status: "pass" | "fail") {
  return status === "pass"
    ? `Serving updated to ${amount}; meal and daily totals recalculated.`
    : `Serving updated to ${amount}; totals recalculated. Daily targets need attention.`;
}

function servingRestoredConfirmationMessage(amount: string, status: "pass" | "fail") {
  return status === "pass"
    ? `Serving restored to ${amount}; meal and daily totals recalculated.`
    : `Serving restored to ${amount}; totals recalculated. Daily targets need attention.`;
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
    emptyGrainPreferenceLabel(form),
    narrowedGrainPreferenceLabel(form),
    emptyProteinPreferenceLabel(form),
    narrowedProteinPreferenceLabel(form),
    ...avoidLabels(form).map((label) => `No ${label}`),
  ].filter((label): label is string => Boolean(label));
}

function emptyGrainPreferenceLabel(form: EditableFormState) {
  const allGrainIds = grainOptions.map((option) => option.id);
  const selectedGrainIds = selectedOptionIds(form.preferredGrains, allGrainIds);

  return selectedGrainIds.length === 0 ? "Carbs: automatic" : undefined;
}

function narrowedGrainPreferenceLabel(form: EditableFormState) {
  const allGrainIds = grainOptions.map((option) => option.id);
  const selectedGrainIds = selectedOptionIds(form.preferredGrains, allGrainIds);

  return isAutomaticOptionSet(selectedGrainIds, allGrainIds) ? undefined : `Carbs: ${selectedOptionSummary(selectedGrainIds, grainOptions)}`;
}

function emptyProteinPreferenceLabel(form: EditableFormState) {
  const visibleProteinOptions = proteinOptions.filter((option) => isProteinVisible(option.id, form.dietaryLevel));
  const visibleProteinIds = visibleProteinOptions.map((option) => option.id);
  const selectedProteinIds = selectedOptionIds(form.preferredProteins, visibleProteinIds);

  return selectedProteinIds.length === 0 && visibleProteinIds.length > 0 ? "Protein: automatic" : undefined;
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

function applyDietaryLevel(form: EditableFormState, dietaryLevel: DietaryLevel): EditableFormState {
  return {
    ...form,
    dietaryLevel,
    preferredProteins: visibleProteinPreferences(form.preferredProteins, dietaryLevel),
    avoidEggs: dietaryLevel === "vegetarian",
    avoidChickenFish: dietaryLevel !== "nonVegetarian",
  };
}

function dietRuleChangeNotice(previous: EditableFormState, next: EditableFormState) {
  const changes = [
    proteinPreferenceChangeNotice(previous, next),
    avoidRuleChangeNotice("eggs", previous.avoidEggs, next.avoidEggs),
    avoidRuleChangeNotice("chicken/fish", previous.avoidChickenFish, next.avoidChickenFish),
  ].filter((change): change is string => Boolean(change));

  return changes.length > 0 ? `Diet updated for ${dietLabel(next.dietaryLevel)}: ${changes.join("; ")}.` : "";
}

function proteinPreferenceChangeNotice(previous: EditableFormState, next: EditableFormState) {
  if (areSameStringValues(previous.preferredProteins, next.preferredProteins)) {
    return undefined;
  }

  const removedProteinLikes = previous.preferredProteins.filter((optionId) => !next.preferredProteins.includes(optionId));
  const hiddenRemovedLikes = removedProteinLikes.filter((optionId) => !isProteinVisible(optionId, next.dietaryLevel));
  if (hiddenRemovedLikes.length > 0) {
    return `${formatFoodRuleConflictList(foodRuleProteinLabels(hiddenRemovedLikes))} removed from protein likes`;
  }

  return `protein likes set to ${formatFoodRuleConflictList(foodRuleProteinLabels(next.preferredProteins))}`;
}

function avoidRuleChangeNotice(label: string, previous: boolean, next: boolean) {
  if (previous === next) {
    return undefined;
  }

  return `${label} ${next ? "set to Leave out" : "allowed"}`;
}

function foodRuleProteinLabels(optionIds: string[]) {
  return optionIds.map((optionId) => {
    if (optionId === "two-whole-eggs") return "eggs";
    if (optionId === "chicken-fish-100g") return "chicken/fish";
    return proteinOptions.find((option) => option.id === optionId)?.label.toLocaleLowerCase() ?? optionId;
  });
}

function areSameStringValues(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isFoodCustomizationField(key: keyof EditableFormState) {
  return key === "preferredGrains"
    || key === "preferredProteins"
    || key === "avoidPaneer"
    || key === "avoidWhey"
    || key === "avoidEggs"
    || key === "avoidChickenFish";
}

function activeMacroCount(form: EditableFormState) {
  return activeMacroLabels(form).length;
}

function activeMacroLabels(form: EditableFormState) {
  return macroFieldEntries(form)
    .map(({ label, field }) => macroLabel(label, field))
    .filter((label): label is string => Boolean(label));
}

function incompleteMacroCount(form: EditableFormState) {
  return incompleteMacroLabels(form).length;
}

function incompleteMacroLabels(form: EditableFormState) {
  return macroFieldEntries(form)
    .filter(({ field }) => isIncompleteMacroField(field))
    .map(({ label }) => label);
}

function incompleteMacroRuleBlockers(form: EditableFormState) {
  return macroFieldEntries(form)
    .filter(({ field }) => isIncompleteMacroField(field))
    .map(({ label, field }) => `${label} ${field.mode} needs grams. Enter a value or switch it Off.`);
}

function isIncompleteMacroField(field: MacroField) {
  return field.mode !== "none" && field.value.trim() === "";
}

function macroFieldEntries(form: EditableFormState) {
  return [
    { label: "Carbs", field: form.carbs },
    { label: "Fat", field: form.fat },
    { label: "Fiber", field: form.fiber },
    { label: "Saturated fat", field: form.saturatedFat },
  ];
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

function exportFilename(extension: "csv" | "xls" | "png") {
  const date = new Date().toISOString().slice(0, 10);
  return `meal-plan-${date}.${extension}`;
}

function downloadTextFile(filename: string, type: string, contents: string) {
  const blob = new Blob([contents], { type });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function cssTokenValue(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

async function createPlanShareImageFile(plan: DailyPlan) {
  const lines = planShareText(plan).split("\n");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is unavailable.");
  }

  const width = 1080;
  const padding = 64;
  const lineHeight = 38;
  const mealGap = 14;
  const height = Math.max(760, padding * 2 + 128 + (lines.length * lineHeight) + (plan.meals.length * mealGap));
  canvas.width = width;
  canvas.height = height;

  const imageBg = cssTokenValue("--bg", "#141414");
  const imageSurface = cssTokenValue("--surface", "#1c1c1c");
  const imageBorder = cssTokenValue("--alpha-warning-48", "rgba(225, 189, 99, 0.48)");
  const imageInk = cssTokenValue("--ink", "#f0efeb");
  const imageAccent = cssTokenValue("--warning", "#e1bd63");
  const imageBody = cssTokenValue("--body", "#c8c2b7");
  const imageSans = cssTokenValue("--sans", "DM Sans, system-ui, sans-serif");

  context.fillStyle = imageBg;
  context.fillRect(0, 0, width, height);
  context.fillStyle = imageSurface;
  context.fillRect(32, 32, width - 64, height - 64);
  context.strokeStyle = imageBorder;
  context.lineWidth = 3;
  context.strokeRect(32, 32, width - 64, height - 64);

  context.fillStyle = imageInk;
  context.font = `700 56px ${imageSans}`;
  context.fillText("Meal plan", padding, 118);
  context.fillStyle = imageAccent;
  context.font = `700 34px ${imageSans}`;
  context.fillText(plan.displayName, padding, 172);

  let y = 240;
  for (const line of lines.slice(1)) {
    if (line === "") {
      y += mealGap;
      continue;
    }

    const isMealHeading = plan.meals.some((meal) => meal.displayName === line);
    const isTotal = line.startsWith("Daily total:") || line.startsWith("Meal total:");
    context.fillStyle = isMealHeading ? imageInk : isTotal ? imageAccent : imageBody;
    context.font = isMealHeading || isTotal
      ? `700 30px ${imageSans}`
      : `500 27px ${imageSans}`;
    context.fillText(ellipsizeCanvasText(context, line, width - (padding * 2)), padding, y);
    y += lineHeight;
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Image export failed."));
      }
    }, "image/png");
  });

  return new File([blob], exportFilename("png"), { type: "image/png" });
}

function ellipsizeCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && context.measureText(`${truncated}...`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}...`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function amountStep(item: DailyPlanItem, unit: string) {
  if (unit !== "g") {
    return "1";
  }

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

function readGoogleTranslateLanguage() {
  if (typeof document === "undefined") return "";
  const cookieValue = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${googleTranslateCookieName}=`))
    ?.split("=")[1];
  const language = (cookieValue ?? "").replace(/%2F/gi, "/").split("/").filter(Boolean)[1] ?? "";
  return translationLanguages.some((option) => option.code === language) ? language : "";
}

function writeGoogleTranslateCookie(language: string) {
  const value = language ? `/en/${language}` : "";
  const expires = language ? "max-age=31536000" : "expires=Thu, 01 Jan 1970 00:00:00 GMT";
  document.cookie = `${googleTranslateCookieName}=${value}; path=/; ${expires}; SameSite=Lax`;
}

function syncGoogleTranslateLanguage(language: string, attempt = 0, onReady?: () => void, onUnavailable?: () => void) {
  const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
  if (combo) {
    if (combo.value !== language) {
      combo.value = language;
      combo.dispatchEvent(new Event("change", { bubbles: true }));
    }
    onReady?.();
    return;
  }

  if (attempt < 60) {
    window.setTimeout(() => syncGoogleTranslateLanguage(language, attempt + 1, onReady, onUnavailable), 150);
    return;
  }

  onUnavailable?.();
}

function openGoogleTranslateFallback(language: string) {
  if (!language || typeof window === "undefined") return;
  const url = new URL("https://translate.google.com/translate");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", language);
  url.searchParams.set("u", window.location.href);
  window.location.assign(url.toString());
}

type TargetDeltaTone = BoundEvaluation["status"] | "neutral";

type TargetDelta = {
  text: string;
  tone: TargetDeltaTone;
};

function SummaryMetric({
  icon,
  label,
  value,
  suffix,
  targetDelta,
}: {
  icon: IconName;
  label: string;
  value: number;
  suffix: string;
  targetDelta?: TargetDelta;
}) {
  return (
    <div className="metric">
      <span><Icon name={icon} />{label}</span>
      <strong className="notranslate" translate="no">{value}<small>{suffix}</small></strong>
      {targetDelta && <p className={`metric-delta is-${targetDelta.tone}`}>{targetDelta.text}</p>}
    </div>
  );
}

function dailyTargetDelta(evaluation: PlanEvaluation, metric: "calories" | "protein"): TargetDelta {
  const item = evaluation.targetBounds.find((candidate) => candidate.bound.metric === metric);

  if (!item || item.bound.target === undefined) {
    return {
      text: metric === "protein" ? "No protein target set" : "No target set",
      tone: "neutral",
    };
  }

  const delta = Math.round(item.value - item.bound.target);

  if (item.status === "pass" && delta === 0) {
    return { text: "within target band", tone: "pass" };
  }

  if (delta === 0) {
    return { text: "at target", tone: item.status };
  }

  const direction = delta < 0 ? "under" : "over";
  const bandSuffix = item.status === "pass" ? " · within band" : "";

  return {
    text: `${formatCompactMetricValue(Math.abs(delta), metric)} ${direction} target${bandSuffix}`,
    tone: item.status,
  };
}

function TargetStatusItem({ item }: { item: BoundEvaluation }) {
  const status = item.unknown ? "unknown" : item.status;

  return (
    <div className={`target-status-item is-${status}`}>
      <div>
        <strong><Icon name={metricIcon(item.bound.metric)} />{metricDisplayNames[item.bound.metric]}</strong>
        <span className="notranslate" translate="no">{targetBoundLabel(item)}</span>
      </div>
      <div>
        <span className="notranslate" translate="no">{formatMetricValue(item.value, item.bound.metric)}{item.unknown ? " + unknown" : ""}</span>
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

function formatCompactMetricValue(value: number, metric: "calories" | "protein") {
  return metric === "calories" ? `${Math.round(value)} kcal` : `${Math.round(value)}gm`;
}

function formatKnownNutritionValue(value: number | null | undefined, metric: "calories" | "protein") {
  if (value == null) {
    return metric === "calories" ? "Unknown kcal" : "Protein unknown";
  }

  return metric === "calories" ? `${Math.round(value)} kcal` : `${Math.round(value)}gm`;
}

function formatSwapNutritionImpact(
  nextValue: number | null | undefined,
  currentValue: number | null | undefined,
  metric: "calories" | "protein",
) {
  if (nextValue == null || currentValue == null) {
    return metric === "calories" ? "kcal impact unknown" : "protein impact unknown";
  }

  const delta = Math.round(nextValue - currentValue);

  if (delta === 0) {
    return metric === "calories" ? "same kcal" : "same protein";
  }

  const signedDelta = delta > 0 ? `+${delta}` : String(delta);

  return metric === "calories" ? `${signedDelta} kcal` : `${signedDelta}gm protein`;
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
  const currentOption = getExchangeOption(item.exchangeGroupId, item.exchangeOptionId);
  const currentUnits = item.exchangeUnits ?? currentOption.exchangeUnits ?? 1;
  const servingAmount = exchangeOptionGramAmount(item.exchangeGroupId, item.exchangeOptionId) * currentUnits;
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
  onSwapOpen,
  onSwap,
  onServingUndo,
  lockConfirmation,
  servingConfirmation,
  swapConfirmation,
}: {
  form: EditableFormState;
  item: DailyPlanItem;
  locked: boolean;
  mealId: string;
  mealName: string;
  onAmount: (amount: number) => void;
  onDelete: () => void;
  onLock: () => void;
  onSwapOpen: () => void;
  onSwap: (optionId: string) => void;
  onServingUndo: () => void;
  lockConfirmation?: LockConfirmation;
  servingConfirmation?: ServingEditConfirmation;
  swapConfirmation?: string;
}) {
  const label = planItemLabel(item);
  const quantity = planItemDisplayQuantity(item);
  const quantityUnitLabel = planItemDisplayUnitLabel(item, quantity.amount);
  const nutrition = calculateDailyPlanItemNutrition(item);
  const exchangeOptions = exchangeOptionsForItem(item, form, mealId);
  const hasSelectableSwapAlternative = item.kind === "exchange"
    ? exchangeOptions.some((option) => option.id !== item.exchangeOptionId)
    : true;
  const [servingDraft, setServingDraft] = useState(String(quantity.amount));
  const [servingValidationMessage, setServingValidationMessage] = useState("");
  const [swapSheetOpen, setSwapSheetOpen] = useState(false);
  const swapDialogRef = useRef<HTMLDialogElement>(null);
  const servingErrorId = useId();
  const swapTitleId = useId();
  const swapDescriptionId = useId();
  const isExchangeItem = item.kind === "exchange";
  const servingStep = Number(amountStep(item, quantity.unit));
  const servingStepUnitLabel = planItemDisplayUnitLabel(item, servingStep);
  const servingAmountLabel = `${label} amount in ${quantityUnitLabel} for ${mealName}`;

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
    if (item.kind === "exchange" && optionId === item.exchangeOptionId) return;
    onSwap(optionId);
    setSwapSheetOpen(false);
  }

  function updateServingDraft(value: string) {
    const parsed = parseServingAmountInput(value);

    if (parsed.status === "empty") {
      setServingDraft(value);
      setServingValidationMessage("Enter a serving amount before totals update.");
      return;
    }

    if (parsed.status === "invalid") {
      setServingDraft(value);
      setServingValidationMessage("Use a valid serving amount before totals update.");
      return;
    }

    if (parsed.status === "zero") {
      setServingValidationMessage("0gm is not a meaningful serving. Last amount kept; use Delete to remove this food, then Undo if needed.");
      return;
    }

    setServingDraft(value);
    setServingValidationMessage("");
    onAmount(parsed.amount);
  }

  return (
    <div className="plan-row">
      <div className="item-summary">
        <strong>{label}</strong>
        <small className="item-metrics">
          <span><span className="notranslate" translate="no">{formatKnownNutritionValue(nutrition.calories, "calories")}</span></span>
          <span><span className="notranslate" translate="no">{formatKnownNutritionValue(nutrition.protein, "protein")}</span>{nutrition.protein == null ? "" : " protein"}</span>
        </small>
        {swapConfirmation && (
          <p className="item-swap-confirmation" role="status">
            {swapConfirmation}
          </p>
        )}
        {lockConfirmation && (
          <p className={"item-lock-confirmation is-" + lockConfirmation.tone} role="status" aria-live="polite" aria-atomic="true">
            {lockConfirmation.message}
          </p>
        )}
        {servingConfirmation && (
          <p className={`item-serving-confirmation randomize-feedback-inline is-${servingConfirmation.tone}${servingConfirmation.previousAmount === undefined ? "" : " has-action"}`} role="status">
            <span>{servingConfirmation.message}</span>
            {servingConfirmation.previousAmount !== undefined && (
              <button type="button" onClick={onServingUndo}>Undo</button>
            )}
          </p>
        )}
      </div>
      <div className={`item-actions ${item.kind === "exchange" ? "has-swap" : "no-swap"}`}>
        <div className="amount-line">
          <NumberStepper
            ariaDescribedBy={servingValidationMessage ? servingErrorId : undefined}
            ariaInvalid={Boolean(servingValidationMessage)}
            ariaLabel={servingAmountLabel}
            className="amount-control"
            decrementLabel={`Decrease ${servingAmountLabel} by ${servingStep} ${servingStepUnitLabel}`}
            incrementLabel={`Increase ${servingAmountLabel} by ${servingStep} ${servingStepUnitLabel}`}
            onChange={updateServingDraft}
            size="compact"
            step={servingStep}
            value={servingDraft}
          />
          <span className="unit-label notranslate" translate="no" title={quantityUnitLabel}>{quantityUnitLabel}</span>
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
          {isExchangeItem && (
            <button
              className="swap-button with-icon"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={swapSheetOpen}
              onClick={() => {
                onSwapOpen();
                setSwapSheetOpen(true);
              }}
            >
              <Icon name="swap" />
              <span>Swap</span>
            </button>
          )}
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
                  {!hasSelectableSwapAlternative && (
                    <p className="swap-unavailable-message" role="note">
                      No other swap choices match your active rules. Change diet or Leave out choices in Customize, or relax meal-specific food rules, then try Swap again.
                    </p>
                  )}
                  {exchangeOptions.map((option) => {
                    const previewNutrition = swapOptionPreviewNutrition(item, option.id);
                    const isCurrentOption = option.id === item.exchangeOptionId;
                    const calorieImpact = formatSwapNutritionImpact(previewNutrition.calories, nutrition.calories, "calories");
                    const proteinImpact = formatSwapNutritionImpact(previewNutrition.protein, nutrition.protein, "protein");

                    return (
                      <button
                        className="swap-option"
                        type="button"
                        key={option.id}
                        aria-pressed={isCurrentOption}
                        aria-current={isCurrentOption ? "true" : undefined}
                        disabled={isCurrentOption}
                        onClick={() => chooseSwapOption(option.id)}
                      >
                        <span className="swap-option-main">
                          <span className="swap-option-name">{option.displayName}</span>
                          <span className="swap-option-exchange"><span className="notranslate" translate="no">{exchangeOptionDisplayAmountLabel(item.exchangeGroupId, option.id)}</span> exchange</span>
                        </span>
                        <small className="swap-option-meta">
                          <span className="swap-option-metric notranslate" translate="no">{formatKnownNutritionValue(previewNutrition.calories, "calories")}</span>
                          <span className="swap-option-metric"><span className="notranslate" translate="no">{formatKnownNutritionValue(previewNutrition.protein, "protein")}</span>{previewNutrition.protein == null ? "" : " protein"}</span>
                          {isCurrentOption && <span className="swap-option-current">Current</span>}
                          {!isCurrentOption && (
                            <span className="swap-option-impact" aria-label={`Impact compared with current item: ${calorieImpact}, ${proteinImpact}`}>
                              <span>Impact</span>
                              <span className="notranslate" translate="no">{calorieImpact}</span>
                              <span className="notranslate" translate="no">{proteinImpact}</span>
                            </span>
                          )}
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
