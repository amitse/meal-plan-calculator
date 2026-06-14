import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  calculateDailyPlanItemNutrition,
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
  const [result, setResult] = useState<GenerateMealPlanResult>(() => generateFromState(initialState));
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const selectedPlan = result.selected?.plan;
  const evaluation = result.selected?.evaluation;
  const statusText = result.selected
    ? "Plan meets your active targets"
    : "No plan satisfies every active target yet";

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(generateFromState(form));
  }

  function applyPreset(preset: ScenarioPreset) {
    setForm(preset.state);
    setAdvancedOpen(Boolean(preset.advancedOpen));
    setResult(generateFromState(preset.state));
  }

  const selectedOptions = useMemo(() => {
    if (!selectedPlan) {
      return [];
    }

    return selectedPlan.meals.flatMap((meal) =>
      meal.items.filter((item) => item.kind === "exchange").map((item) => item.exchangeOptionId),
    );
  }, [selectedPlan]);

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Indian meal planner</p>
          <h1 id="hero-title">
            Build your day.
          </h1>
          <p>Calories, macros, food rules.</p>
        </div>
        <div className="hero-panel" aria-label="Generated plan preview">
          <span className="panel-kicker">Preview</span>
          <strong>{Math.round(evaluation?.totals.values.calories ?? 0)} kcal</strong>
          <span>{Math.round(evaluation?.totals.values.protein ?? 0)}g protein</span>
          <p>{statusText}</p>
        </div>
      </section>

      <form className="planner" onSubmit={submit}>
        <section className="input-panel" aria-labelledby="targets-title">
          <div className="section-heading">
            <span className="step-num">01</span>
            <div>
              <p className="eyebrow">Targets</p>
              <h2 id="targets-title">Targets</h2>
            </div>
          </div>

          <details className="preset-drawer">
            <summary>Presets</summary>
            <div className="preset-strip" aria-label="Scenario presets">
              {scenarioPresets.map((preset) => (
                <button key={preset.id} type="button" onClick={() => applyPreset(preset)}>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </details>

          <label className="field">
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
            <span>Protein min</span>
            <input
              inputMode="numeric"
              value={form.protein}
              onChange={(event) => update("protein", event.target.value)}
              min="0"
              type="number"
            />
          </label>

          <button className="text-toggle" type="button" onClick={() => setAdvancedOpen((open) => !open)}>
            {advancedOpen ? "Hide optional macros" : "Add optional macro bounds"}
          </button>

          {advancedOpen && (
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
          )}
        </section>

        <section className="input-panel" aria-labelledby="rules-title">
          <div className="section-heading">
            <span className="step-num">02</span>
            <div>
              <p className="eyebrow">Food rules</p>
              <h2 id="rules-title">Food rules</h2>
            </div>
          </div>

          <fieldset className="segmented">
            <legend>Dietary level</legend>
            {(["vegetarian", "eggetarian", "nonVegetarian"] as DietaryLevel[]).map((level) => (
              <label key={level}>
                <input
                  type="radio"
                  name="dietary"
                  checked={form.dietaryLevel === level}
                  onChange={() => update("dietaryLevel", level)}
                />
                <span>{dietLabel(level)}</span>
              </label>
            ))}
          </fieldset>
          <ChoiceGroup
            legend="Grain"
            options={grainOptions}
            value={form.preferredGrain}
            onChange={(value) => update("preferredGrain", value)}
          />
          <ChoiceGroup
            legend="Protein"
            options={proteinOptions}
            value={form.preferredProtein}
            onChange={(value) => update("preferredProtein", value)}
          />

          <fieldset className="avoid-list">
            <legend>Avoid</legend>
            <CheckChip label="Paneer" checked={form.avoidPaneer} onChange={(checked) => update("avoidPaneer", checked)} />
            <CheckChip label="Whey" checked={form.avoidWhey} onChange={(checked) => update("avoidWhey", checked)} />
            <CheckChip label="Eggs" checked={form.avoidEggs} onChange={(checked) => update("avoidEggs", checked)} />
            <CheckChip
              label="Chicken / fish"
              checked={form.avoidChickenFish}
              onChange={(checked) => update("avoidChickenFish", checked)}
            />
          </fieldset>
        </section>

        <div className="bottom-action">
          <button className="primary-action" type="submit">
            Generate meal plan
          </button>
        </div>
      </form>

      <section className="result-panel" aria-labelledby="result-title">
        <div className="section-heading">
          <span className="step-num">03</span>
          <div>
            <p className="eyebrow">Result</p>
            <h2 id="result-title">{result.selected ? "Your generated day" : "Plan needs a small adjustment"}</h2>
          </div>
        </div>

        {result.selected && evaluation ? (
          <>
            <div className="summary-grid">
              <SummaryMetric label="Calories" value={Math.round(evaluation.totals.values.calories)} suffix="kcal" />
              <SummaryMetric label="Protein" value={Math.round(evaluation.totals.values.protein)} suffix="g" />
              <SummaryMetric label="Carbs" value={Math.round(evaluation.totals.values.carbs)} suffix="g" />
              <SummaryMetric label="Fat" value={Math.round(evaluation.totals.values.fat)} suffix="g" />
            </div>
            <div className="status-strip" role="status">
              <strong>{statusText}</strong>
              <span>{selectedOptions.length} exchange choices selected from your food rules.</span>
            </div>
            <div className="meal-list">
              {result.selected.plan.meals.map((meal) => (
                <details className="meal-card" key={meal.id} open={meal.id === "lunch"}>
                  <summary>
                    <span>{meal.displayName}</span>
                    <small>{meal.patternId === "cooked-plate" ? "cooking fat · carb · protein · vegetables" : "snack"}</small>
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
  const nutrition = calculateDailyPlanItemNutrition(item);

  return (
    <div className="plan-row">
      <div>
        <strong>{label}</strong>
        <span>{item.roles?.join(" · ") ?? "food"}</span>
      </div>
      <div>
        <span>{quantity}</span>
        <small>
          {Math.round(nutrition.calories ?? 0)} kcal · {Math.round(nutrition.protein ?? 0)}g protein
        </small>
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
