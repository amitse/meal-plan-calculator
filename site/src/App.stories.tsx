import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DailyPlan } from "../../src/index.js";
import { App } from "./main.js";
import {
  encodeShareState,
  generateEditablePlan,
  initialFormState,
  type EditableFormState,
  type ShareablePlannerState,
} from "./editable-planner.js";

type StoryVariant = "default" | "adjust" | "share" | "swap" | "add-meal-blocked";
type StoryTheme = "dark" | "light";

type AppStoryProps = {
  search?: string;
  theme?: StoryTheme;
  variant?: StoryVariant;
};

const generatedForm: EditableFormState = {
  ...initialFormState,
  calories: "1900",
  protein: "80",
  dietaryLevel: "vegetarian",
  preferredGrains: ["roti", "cooked-rice"],
  preferredProteins: ["paneer-50g", "whey-30g"],
  avoidEggs: true,
  avoidChickenFish: true,
};

const activeSettingsForm: EditableFormState = {
  ...generatedForm,
  carbs: { mode: "min", value: "170" },
  fat: { mode: "max", value: "70" },
  avoidWhey: true,
  preferredProteins: ["paneer-50g"],
};

const addMealBlockedForm: EditableFormState = {
  ...generatedForm,
  preferredProteins: ["paneer-50g", "whey-30g"],
  avoidPaneer: true,
  avoidWhey: true,
  avoidEggs: true,
  avoidChickenFish: true,
};

const generatedPlan = createPlan(generatedForm, 20260615);

function createPlan(form: EditableFormState, seed: number) {
  const plan = generateEditablePlan(form, undefined, new Set<string>(), seed);
  if (!plan) {
    throw new Error("Story plan generation failed.");
  }
  return plan;
}

function encodedStateSearch(state: ShareablePlannerState) {
  return `?s=${encodeShareState(state)}`;
}

function storySearch(form: EditableFormState, plan?: DailyPlan) {
  return encodedStateSearch({
    form,
    plan,
    lockedItemIds: [],
    mealTargets: plan ? { lunch: { calories: "550", protein: "25" } } : {},
  });
}

function installStoryEnvironment(search: string, theme: StoryTheme) {
  document.body.dataset.storyReady = "false";
  window.history.replaceState(null, "", `${window.location.pathname}${search}`);
  window.localStorage.setItem("meal-plan-theme", theme);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = theme;

  class FakeTranslateElement {
    static InlineLayout = { SIMPLE: "SIMPLE" };

    constructor(_options: Record<string, unknown>, elementId: string) {
      const widget = document.getElementById(elementId);
      if (widget && widget.childElementCount === 0) {
        const marker = document.createElement("span");
        marker.dataset.storyTranslate = "ready";
        widget.append(marker);
      }
    }
  }

  window.google = {
    translate: {
      TranslateElement: FakeTranslateElement,
    },
  };
}

function clickButton(label: string) {
  const buttons = [...document.querySelectorAll("button")];
  const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
  if (button instanceof HTMLButtonElement) {
    button.click();
  }
}

function runStoryVariant(variant: StoryVariant) {
  if (variant === "adjust") {
    clickButton("Adjust");
  }

  if (variant === "share") {
    clickButton("Share");
  }

  if (variant === "swap") {
    const firstMealSummary = document.querySelector<HTMLDetailsElement>(".meal-card")?.querySelector("summary");
    if (firstMealSummary instanceof HTMLElement) {
      firstMealSummary.click();
    }
    window.setTimeout(() => clickButton("Swap"), 80);
  }

  if (variant === "add-meal-blocked") {
    document.querySelector<HTMLButtonElement>(".meal-list-toolbar button")?.click();
  }

  window.setTimeout(() => {
    if (document.activeElement instanceof HTMLElement && !document.activeElement.matches("input, textarea")) {
      document.activeElement.blur();
    }
    document.body.dataset.storyReady = "true";
  }, variant === "swap" ? 260 : 180);
}

function AppStory({ search = "", theme = "dark", variant = "default" }: AppStoryProps) {
  installStoryEnvironment(search, theme);

  useEffect(() => {
    const timer = window.setTimeout(() => runStoryVariant(variant), 160);
    return () => window.clearTimeout(timer);
  }, [variant]);

  return <App key={`${theme}-${variant}-${search}`} />;
}

const meta = {
  title: "App/Screens",
  component: AppStory,
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
} satisfies Meta<typeof AppStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstRun: Story = {
  args: {},
};

export const FirstRunWithActiveSettings: Story = {
  args: {
    search: storySearch(activeSettingsForm),
  },
};

export const GeneratedPlan: Story = {
  args: {
    search: storySearch(generatedForm, generatedPlan),
  },
};

export const AdjustDrawer: Story = {
  args: {
    search: storySearch(generatedForm, generatedPlan),
    variant: "adjust",
  },
};

export const ShareDrawer: Story = {
  args: {
    search: storySearch(generatedForm, generatedPlan),
    variant: "share",
  },
};

export const SwapDrawer: Story = {
  args: {
    search: storySearch(generatedForm, generatedPlan),
    variant: "swap",
  },
};

export const AddMealBlocked: Story = {
  args: {
    search: storySearch(addMealBlockedForm, generatedPlan),
    variant: "add-meal-blocked",
  },
};

export const LightTheme: Story = {
  args: {
    search: storySearch(generatedForm, generatedPlan),
    theme: "light",
  },
};
