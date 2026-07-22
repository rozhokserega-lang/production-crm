import { memo } from "react";
import {
  LABOR_MONTHLY_LOAD_MODE_DETAIL,
  LABOR_MONTHLY_LOAD_MODE_HINT,
  LABOR_MONTHLY_LOAD_MODE_LABEL,
  LABOR_PARALLEL_MODE_DETAIL,
  LABOR_PARALLEL_MODE_HINT,
  LABOR_PARALLEL_MODE_LABEL,
  LABOR_SEQUENTIAL_MODE_DETAIL,
  LABOR_SEQUENTIAL_MODE_HINT,
  LABOR_SEQUENTIAL_MODE_LABEL,
} from "../app/laborKitPlanner";

const MODELS = {
  sequential: {
    label: LABOR_SEQUENTIAL_MODE_LABEL,
    detail: LABOR_SEQUENTIAL_MODE_DETAIL,
    hint: LABOR_SEQUENTIAL_MODE_HINT,
  },
  parallel: {
    label: LABOR_PARALLEL_MODE_LABEL,
    detail: LABOR_PARALLEL_MODE_DETAIL,
    hint: LABOR_PARALLEL_MODE_HINT,
  },
  monthly: {
    label: LABOR_MONTHLY_LOAD_MODE_LABEL,
    detail: LABOR_MONTHLY_LOAD_MODE_DETAIL,
    hint: LABOR_MONTHLY_LOAD_MODE_HINT,
  },
};

export const LaborCalcModelHint = memo(function LaborCalcModelHint({
  mode = "sequential",
  variant = "badge",
  className = "",
}) {
  const model = MODELS[mode] || MODELS.sequential;
  const rootClass = [
    "labor-calc-model",
    `labor-calc-model--${mode}`,
    `labor-calc-model--${variant}`,
    className,
  ].filter(Boolean).join(" ");

  if (variant === "block") {
    return (
      <div className={rootClass} title={model.hint}>
        <div className="labor-calc-model__head">
          <span className="labor-calc-model__badge">{model.label}</span>
          <span className="labor-calc-model__detail">{model.detail}</span>
        </div>
        <p className="labor-calc-model__text">{model.hint}</p>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <span className={rootClass} title={model.hint}>
        <span className="labor-calc-model__badge">{model.label}</span>
        <span className="labor-calc-model__detail">{model.detail}</span>
      </span>
    );
  }

  return (
    <span className={rootClass} title={model.hint}>
      <span className="labor-calc-model__badge">{model.label}</span>
      <span className="labor-calc-model__detail">{model.detail}</span>
    </span>
  );
});
