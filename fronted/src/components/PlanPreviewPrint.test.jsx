import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanPreviewPrint } from "./PlanPreviewPrint";

const months = [
  { id: 1, name: "Октябрь", weeks: ["92", "93", "94", "95"] },
  { id: 2, name: "Сентябрь", weeks: ["88", "89", "90", "91"], isHidden: true },
];

function preview(overrides = {}) {
  return {
    firstName: "Тумба под ТВ 1600",
    colorName: "Дуб Сонома",
    planNumber: "92",
    week: "92",
    qty: 3,
    rows: [{ part: "Столешница", qty: "3" }],
    ...overrides,
  };
}

function monthLabel(container) {
  return container.querySelector(".plan-number-month")?.textContent || "";
}

describe("PlanPreviewPrint — месяц рядом с номером плана", () => {
  it("подписывает план названием месяца", () => {
    const { container } = render(<PlanPreviewPrint planPreview={preview()} planMonths={months} />);
    expect(container.querySelector(".plan-number-box .num")?.textContent).toBe("92");
    expect(monthLabel(container)).toBe("Октябрь");
  });

  it("находит месяц и для скрытого (архивного) месяца", () => {
    const { container } = render(
      <PlanPreviewPrint planPreview={preview({ planNumber: "89", week: "89" })} planMonths={months} />,
    );
    expect(monthLabel(container)).toBe("Сентябрь");
  });

  it("берёт месяц по переопределённому номеру плана (лист долга плана)", () => {
    const { container } = render(
      <PlanPreviewPrint
        planPreview={preview({ planNumberTitle: "ДОЛГ ПЛАНА", planNumber: "93" })}
        planMonths={months}
      />,
    );
    expect(container.querySelector(".plan-number-title")?.textContent).toBe("ДОЛГ ПЛАНА");
    expect(monthLabel(container)).toBe("Октябрь");
  });

  it("без списка месяцев подписи нет (портал и старые вызовы не падают)", () => {
    const { container } = render(<PlanPreviewPrint planPreview={preview()} />);
    expect(monthLabel(container)).toBe("");
    expect(container.querySelector(".plan-number-box")?.textContent).toContain("92");
  });

  it("план без номера месяца (X / обвязка) подписывается как раньше", () => {
    const { container } = render(
      <PlanPreviewPrint planPreview={preview({ planNumber: "обвязка", week: "обвязка" })} planMonths={months} />,
    );
    expect(monthLabel(container)).toBe("");
  });
});
