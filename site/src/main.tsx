import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  generateMealPlan,
  getExchangeGroup,
  getExchangeOption,
  getFoodItem,
  type DietaryLevel,
  type GenerateMealPlanInput,
  type GenerateMealPlanResult,
} from "../../src/index.js";
import "./styles.css";

type BoundField = "none" | "min" | "max" | "target";

interface MacroField {
  mode: BoundField;
  value: string;
}

interface FormState {
  calories: string;
  protein: string;
  carbs: MacroField;
  fat: MacroField;
  fiber: MacroField;
  saturatedFat: MacroField;
  dietaryLevel: DietaryLevel;
  preferredGrain: string;
  preferredProtein: string;
  avoidPaneer: boolean;
  avoidWhey: boolean;
  avoidEggs: boolean;
  avoidChickenFish: boolean;
}

interface ScenarioPreset {
  id: string;
  label: string;
  note: string;
  state: FormState;
  advancedOpen?: boolean;
}

const initialState: FormState = {
  calories: "2000",
  protein: "75",
  carbs: { mode: "min", value: "100" },
  fat: { mode: "max", value: "120" },
  fiber: { mode: "min", value: "10" },
  saturatedFat: { mode: "max", value: "20" },
  dietaryLevel: "vegetarian",
  preferredGrain: "roti",
  preferredProtein: "paneer-50g",
  avoidPaneer: false,
  avoidWhey: false,
  avoidEggs: false,
  avoidChickenFish: false,
};

const grainOptions = [
  { id: "roti", label: "Roti" },
  { id: "cooked-rice", label: "Cooked rice" },
  { id: "raw-oats", label: "Oats" },
  { id: "dosa", label: "Dosa" },
];

const proteinOptions = [
  { id: "paneer-50g", label: "Paneer" },
  { id: "whey-30g", label: "Whey" },
  { id: "tofu-100g", label: "Tofu" },
  { id: "two-whole-eggs", label: "Eggs" },
  { id: "chicken-fish-100g", label: "Chicken / fish" },
];

const scenarioPresets: ScenarioPreset[] = [
  {
    id: "veg-low",
    label: "Light vegetarian day",
    note: "1400 kcal, dairy allowed, no eggs or meat",
    state: {
      ...initialState,
      calories: "1400",
      protein: "",
      dietaryLevel: "vegetarian",
      preferredGrain: "roti",
      preferredProtein: "paneer-50g",
    },
  },
  {
    id: "veg-macro",
    label: "Vegetarian macro target",
    note: "2000 kcal with protein, carb, fat, fiber, saturated-fat bounds",
    advancedOpen: true,
    state: initialState,
  },
  {
    id: "eggetarian",
    label: "Eggetarian protein",
    note: "Eggs preferred, meat/fish still excluded",
    state: {
      ...initialState,
      calories: "1800",
      protein: "80",
      dietaryLevel: "eggetarian",
      preferredProtein: "two-whole-eggs",
    },
  },
  {
    id: "non-veg",
    label: "Non-veg high protein",
    note: "Chicken/fish preferred with a higher target",
    state: {
      ...initialState,
      calories: "2200",
      protein: "100",
      dietaryLevel: "nonVegetarian",
      preferredProtein: "chicken-fish-100g",
    },
  },
  {
    id: "taste-rice-whey",
    label: "Rice + whey taste",
    note: "Shows taste preferences changing the generated exchanges",
    state: {
      ...initialState,
      calories: "1900",
      protein: "80",
      preferredGrain: "cooked-rice",
      preferredProtein: "whey-30g",
    },
  },
  {
    id: "no-paneer-whey",
    label: "No paneer or whey",
    note: "Exclusions force a different vegetarian protein option",
    state: {
      ...initialState,
      calories: "1900",
      protein: "70",
      avoidPaneer: true,
      avoidWhey: true,
    },
  },
  {
    id: "impossible",
    label: "Impossible rule demo",
    note: "Vegetarian but only chicken/fish is preferred and allowed",
    state: {
      ...initialState,
      calories: "1800",
      preferredProtein: "chicken-fish-100g",
      avoidPaneer: true,
      avoidWhey: true,
      avoidEggs: true,
    },
  },
];

function App() {
  const [form, setForm] = useState<FormState>(initialState);
  const [result, setResult] = useState<GenerateMealPlanResult>();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  const evaluation = result?.selected?.evaluation;

  useEffect(() => {
    if (result) {
      resultRef.current?.focus();
    }
  }, [result]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(generateFromState(form));
  }

  function updateDietaryLevel(level: DietaryLevel) {
    setForm((current) => ({
      ...current,
      dietaryLevel: level,
      preferredProtein:
        level === "vegetarian" ? "paneer-50g" : level === "eggetarian" ? "two-whole-eggs" : "chicken-fish-100g",
      avoidEggs: level === "vegetarian",
      avoidChickenFish: level !== "nonVegetarian",
    }));
  }

  function applyPreset(preset: ScenarioPreset) {
    setForm(preset.state);
    setOptionsOpen(Boolean(preset.advancedOpen));
    setResult(generateFromState(preset.state));
  }

  return (
    <main className="app-shell">
      <header className="mobile-header">
        <h1>Meal plan</h1>
      </header>

      <form className="planner" onSubmit={submit}>
        <section className="input-panel primary-panel" aria-labelledby="targets-title">
          <h2 id="targets-title" className="sr-only">Plan</h2>

          <div className="quick-fields">
            <label className="field calorie-field">
              <span>Calories</span>
              <input
                inputMode="numeric"
                value={form.calories}
                onChange={(event) => update("calories", event.target.value)}
                required
                min="800"
                max="4000"
                type="number"
              />
            </label>

            <label className="field">
              <span>Protein</span>
              <input
                inputMode="numeric"
                value={form.protein}
                onChange={(event) => update("protein", event.target.value)}
                min="0"
                type="number"
              />
            </label>
          </div>

          <fieldset className="segmented">
            <legend>Dietary level</legend>
            {(["vegetarian", "eggetarian", "nonVegetarian"] as DietaryLevel[]).map((level) => (
              <label key={level}>
                <input
                  type="radio"
                  name="dietary"
                  checked={form.dietaryLevel === level}
                  onChange={() => updateDietaryLevel(level)}
                />
                <span>{dietLabel(level)}</span>
              </label>
            ))}
          </fieldset>

          <details className="options-drawer" open={optionsOpen} onToggle={(event) => setOptionsOpen(event.currentTarget.open)}>
            <summary>Customize</summary>

            <details className="nested-drawer">
              <summary>Food</summary>
              <ChoiceGroup
                legend="Protein"
                options={proteinOptions.filter((option) => isProteinVisible(option.id, form.dietaryLevel))}
                value={form.preferredProtein}
                onChange={(value) => update("preferredProtein", value)}
              />
              <ChoiceGroup
                legend="Grain"
                options={grainOptions}
                value={form.preferredGrain}
                onChange={(value) => update("preferredGrain", value)}
              />
              <fieldset className="avoid-list">
                <legend>Avoid</legend>
                <CheckChip label="Paneer" checked={form.avoidPaneer} onChange={(checked) => update("avoidPaneer", checked)} />
                <CheckChip label="Whey" checked={form.avoidWhey} onChange={(checked) => update("avoidWhey", checked)} />
                {form.dietaryLevel !== "vegetarian" && (
                  <CheckChip label="Eggs" checked={form.avoidEggs} onChange={(checked) => update("avoidEggs", checked)} />
                )}
                {form.dietaryLevel === "nonVegetarian" && (
                  <CheckChip
                    label="Chicken / fish"
                    checked={form.avoidChickenFish}
                    onChange={(checked) => update("avoidChickenFish", checked)}
                  />
                )}
              </fieldset>
            </details>

            <details className="nested-drawer">
              <summary>Macros</summary>
              <div className="macro-grid">
                <MacroInput label="Carbs" value={form.carbs} onChange={(value) => update("carbs", value)} />
                <MacroInput label="Fat" value={form.fat} onChange={(value) => update("fat", value)} />
                <MacroInput label="Fiber" value={form.fiber} onChange={(value) => update("fiber", value)} />
                <MacroInput
                  label="Saturated fat"
                  value={form.saturatedFat}
                  onChange={(value) => update("saturatedFat", value)}
                />
              </div>
            </details>

            <details className="nested-drawer">
              <summary>Presets</summary>
              <div className="preset-strip" aria-label="Scenario presets">
                {scenarioPresets.map((preset) => (
                  <button key={preset.id} type="button" onClick={() => applyPreset(preset)}>
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </details>
          </details>
        </section>

        <div className="bottom-action">
          <button className="primary-action" type="submit">
            Generate meal plan
          </button>
        </div>
      </form>

      {result && (
      <section className="result-panel" aria-labelledby="result-title" aria-live="polite" tabIndex={-1} ref={resultRef}>
        <div className="section-heading">
          <div>
            <h2 id="result-title">{result.selected ? "Day" : "Adjust"}</h2>
          </div>
        </div>

        {result.selected && evaluation ? (
          <>
            <div className="summary-grid">
              <SummaryMetric label="Calories" value={Math.round(evaluation.totals.values.calories)} suffix="kcal" />
              <SummaryMetric label="Protein" value={Math.round(evaluation.totals.values.protein)} suffix="g" />
            </div>
            <div className="meal-list">
              {result.selected.plan.meals.map((meal) => (
                <details className="meal-card" key={meal.id} open={meal.id === "lunch"}>
                  <summary>
                    <span>{meal.displayName}</span>
                    <small>{meal.items.length} items</small>
                  </summary>
                  <div className="meal-items">
                    {meal.items.map((item, index) => (
                      <PlanItemRow item={item} key={`${meal.id}-${index}`} />
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </>
        ) : (
          <div className="failure" role="alert">
            <p>Rules conflict.</p>
            <ul>
              {result.rejected.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p>Loosen a bound or remove an exclusion.</p>
          </div>
        )}
      </section>
      )}
    </main>
  );
}

function MacroInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MacroField;
  onChange: (value: MacroField) => void;
}) {
  return (
    <label className="field compact">
      <span>{label}</span>
      <div className="inline-inputs">
        <select value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value as BoundField })}>
          <option value="none">Off</option>
          <option value="min">Min</option>
          <option value="max">Max</option>
          <option value="target">Target</option>
        </select>
        <input
          inputMode="numeric"
          value={value.value}
          onChange={(event) => onChange({ ...value, value: event.target.value })}
          type="number"
          disabled={value.mode === "none"}
        />
      </div>
    </label>
  );
}

function ChoiceGroup({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="choice-group">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.id}>
          <input
            type="radio"
            name={legend}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function CheckChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SummaryMetric({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>
        {value}
        <small>{suffix}</small>
      </strong>
    </div>
  );
}

function PlanItemRow({ item }: { item: NonNullable<GenerateMealPlanResult["selected"]>["plan"]["meals"][number]["items"][number] }) {
  const label =
    item.kind === "food"
      ? getFoodItem(item.foodItemId).displayName
      : getExchangeOption(item.exchangeGroupId, item.exchangeOptionId).displayName;
  const quantity =
    item.kind === "food"
      ? `${item.quantity.amount} ${item.quantity.unit}`
      : `${item.exchangeUnits ?? 1} × ${getExchangeGroup(item.exchangeGroupId).exchangeUnit.displayName}`;

  return (
    <div className="plan-row">
      <div>
        <strong>{label}</strong>
      </div>
      <div>
        <span>{quantity}</span>
      </div>
    </div>
  );
}

function generateFromState(form: FormState): GenerateMealPlanResult {
  const preferredProtein =
    form.preferredProtein === "chicken-fish-100g" &&
    form.dietaryLevel === "vegetarian" &&
    form.avoidPaneer &&
    form.avoidWhey &&
    form.avoidEggs
      ? {
          allowedExchangeOptionIds: {
            "protein-serving": ["chicken-fish-100g"],
          },
        }
      : {};
  const input: GenerateMealPlanInput = {
    calories: Number(form.calories || 0),
    dietaryLevel: form.dietaryLevel,
    protein: Number(form.protein || 0) || undefined,
    preferences: {
      ...preferredProtein,
      preferredExchangeOptionIds: {
        grain: [form.preferredGrain],
        "protein-serving": [form.preferredProtein],
      },
      excludedFoodItemIds: [
        form.avoidPaneer ? "paneer" : undefined,
        form.avoidWhey ? "whey" : undefined,
        form.avoidEggs ? "egg-whole" : undefined,
        form.avoidChickenFish ? "chicken-breast" : undefined,
        form.avoidChickenFish ? "rohu-fish" : undefined,
      ].filter((item): item is string => Boolean(item)),
    },
  };

  addMacro(input, "carbs", form.carbs);
  addMacro(input, "fat", form.fat);
  addMacro(input, "fiber", form.fiber);
  addMacro(input, "saturatedFat", form.saturatedFat);

  return generateMealPlan(input);
}

function addMacro(input: GenerateMealPlanInput, key: "carbs" | "fat" | "fiber" | "saturatedFat", field: MacroField) {
  const value = Number(field.value || 0);

  if (!value || field.mode === "none") {
    return;
  }

  input[key] = { [field.mode]: value };
}

function dietLabel(level: DietaryLevel) {
  if (level === "nonVegetarian") {
    return "Non-veg";
  }

  return level[0]!.toUpperCase() + level.slice(1);
}

function isProteinVisible(optionId: string, dietaryLevel: DietaryLevel) {
  if (dietaryLevel === "vegetarian") {
    return optionId !== "two-whole-eggs" && optionId !== "chicken-fish-100g";
  }

  if (dietaryLevel === "eggetarian") {
    return optionId !== "chicken-fish-100g";
  }

  return true;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
