export interface StageSyncMetaItem {
  code: string;
  label: string;
}

export const STAGE_SYNC_META: Record<string, StageSyncMetaItem> = {
  webSetPilkaInWork: { code: "pilka_in_work", label: "Пила: в работе" },
  webSetPilkaDone: { code: "pilka_done", label: "Пила: готово" },
  webSetPilkaPause: { code: "pilka_pause", label: "Пила: пауза" },
  webSetKromkaInWork: { code: "kromka_in_work", label: "Кромка: в работе" },
  webSetKromkaDone: { code: "kromka_done", label: "Кромка: готово" },
  webSetKromkaPause: { code: "kromka_pause", label: "Кромка: пауза" },
  webSetPrasInWork: { code: "pras_in_work", label: "Присадка: в работе" },
  webSetPrasDone: { code: "pras_done", label: "Присадка: готово" },
  webSetPrasPause: { code: "pras_pause", label: "Присадка: пауза" },
  webSetAssemblyDone: { code: "assembly_done", label: "Сборка: готово" },
  webSetShippingDone: { code: "shipping_done", label: "Отгрузка: готово" },
};

export const TERMINAL_PIPELINE_STAGES: Set<string> = new Set([
  "assembled",
  "ready_to_ship",
  "shipped",
]);

export const OVERVIEW_LANE_READY_TO_SHIP = "ready_to_ship";
export const OVERVIEW_LANE_SHIPPED = "shipped";
export const OVERVIEW_LANE_WORKSHOP_COMPLETE = "workshop_complete";
export const OVERVIEW_LANE_ASSEMBLED = "assembled";
export const OVERVIEW_POST_PRODUCTION_LANE_IDS: string[] = [
  OVERVIEW_LANE_READY_TO_SHIP,
  OVERVIEW_LANE_SHIPPED,
];
