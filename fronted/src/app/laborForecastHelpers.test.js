import { describe, expect, it } from "vitest";
import { buildProductionLoadForecast } from "./laborForecastHelpers";

describe("buildProductionLoadForecast", () => {
  it("groups labor by week and marks overloaded stages", () => {
    const rows = buildProductionLoadForecast({
      workSchedule: { hoursPerDay: 1, workingDays: ["mon"] },
      stationMultipliers: { kromka: 2 },
      laborTableRows: [
        {
          orderId: "100",
          item: "A",
          week: "12",
          qty: 2,
          pilkaMin: 70,
          kromkaMin: 100,
          prasMin: 20,
          assemblyMin: 10,
        },
        {
          orderId: "101",
          item: "B",
          week: "12",
          qty: 1,
          pilkaMin: 5,
          kromkaMin: 0,
          prasMin: 0,
          assemblyMin: 0,
        },
        {
          orderId: "import-1",
          item: "Imported",
          week: "12",
          qty: 1,
          pilkaMin: 999,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].ordersCount).toBe(2);
    expect(rows[0].qty).toBe(3);
    expect(rows[0].stages.find((x) => x.key === "pilka")).toMatchObject({
      used: 75,
      capacity: 60,
      status: "over",
    });
    expect(rows[0].stages.find((x) => x.key === "kromka")).toMatchObject({
      used: 100,
      capacity: 120,
      status: "warn",
    });
  });
});
