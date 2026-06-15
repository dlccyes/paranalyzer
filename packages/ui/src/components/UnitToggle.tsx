import type { UnitSystem } from "@paranalyzer/core";

interface Props {
  value: UnitSystem;
  onChange: (next: UnitSystem) => void;
}

export function UnitToggle({ value, onChange }: Props) {
  return (
    <div className="unit-toggle" role="radiogroup" aria-label="Unit system">
      {(["metric", "imperial"] as const).map((sys) => (
        <button
          key={sys}
          role="radio"
          aria-checked={value === sys}
          className={value === sys ? "active" : ""}
          onClick={() => onChange(sys)}
        >
          {sys === "metric" ? "Metric" : "Imperial"}
        </button>
      ))}
    </div>
  );
}
