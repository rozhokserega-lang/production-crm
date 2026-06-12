import { describe, expect, it } from "vitest";
import {
  buildWorkshopFloorMap,
  classifyWorkshopFloorZone,
  extractExecutorFromWorkStatus,
  readActiveKromkaExecutor,
  FLOOR_ZONES,
} from "./workshopFloorMapHelpers";

const isDone = (s) => String(s || "").toLowerCase().includes("готов");
const isInWork = (s) => String(s || "").toLowerCase().includes("в работе");

const opts = {
  isDone,
  isInWork,
  kromkaExecutors: ["Слава", "Сережа"],
  prasExecutors: ["Леха", "Виталик"],
};

describe("workshopFloorMapHelpers", () => {
  it("classifies pilka and wait queues", () => {
    expect(classifyWorkshopFloorZone({
      pilkaStatus: "в работе",
      kromkaStatus: "",
      prasStatus: "",
    }, opts)).toBe(FLOOR_ZONES.pilka);

    expect(classifyWorkshopFloorZone({
      pilkaStatus: "ожидает",
      kromkaStatus: "",
      prasStatus: "",
    }, opts)).toBe(FLOOR_ZONES.wait_pilka);

    expect(classifyWorkshopFloorZone({
      pilkaStatus: "готов",
      kromkaStatus: "ожидает",
      prasStatus: "",
    }, opts)).toBe(FLOOR_ZONES.wait_kromka);
  });

  it("extracts executor from status string", () => {
    expect(extractExecutorFromWorkStatus("В работе (Слава)")).toBe("Слава");
    expect(extractExecutorFromWorkStatus("в работе Сережа")).toBe("");
    expect(readActiveKromkaExecutor({ kromkaStatus: "В работе (Сережа)" }, {})).toBe("Сережа");
  });

  it("splits kromka by executor", () => {
    expect(classifyWorkshopFloorZone({
      pilkaStatus: "готов",
      kromkaStatus: "в работе Сережа",
      prasStatus: "",
    }, opts)).toBe(FLOOR_ZONES.kromka_top);

    expect(classifyWorkshopFloorZone({
      pilkaStatus: "готов",
      kromkaStatus: "в работе Слава",
      prasStatus: "",
    }, opts)).toBe(FLOOR_ZONES.kromka_bottom);
  });

  it("builds floor map buckets", () => {
    const map = buildWorkshopFloorMap([
      { orderId: "1", item: "Donini", pilkaStatus: "в работе" },
      { orderId: "2", item: "Cremona", pilkaStatus: "готов", kromkaStatus: "ожидает" },
      { orderId: "3", item: "Solito", pilkaStatus: "готов", kromkaStatus: "готов", prasStatus: "готов", assemblyStatus: "" },
    ], opts);
    expect(map.counts.pilka).toBe(1);
    expect(map.counts.wait_kromka).toBe(1);
    expect(map.counts.assembly_ready).toBe(1);
  });

  it("puts assembled orders on gazelle zone", () => {
    expect(classifyWorkshopFloorZone({
      pilkaStatus: "готов",
      kromkaStatus: "готов",
      prasStatus: "готов",
      assemblyStatus: "собрано",
      overallStatus: "собрано",
    }, opts)).toBe(FLOOR_ZONES.ready_to_ship);
  });
});
