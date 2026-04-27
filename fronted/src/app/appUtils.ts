function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown): boolean {
  return !!v;
}

interface OptimisticRule {
  field: string;
  snakeField: string;
  value: string | ((payload: Record<string, unknown>) => string);
  pipelineStage: string;
}

interface ActionOptimisticMap {
  [action: string]: OptimisticRule;
}

const ACTION_OPTIMISTIC_MAP: ActionOptimisticMap = {
  webSetPilkaInWork: {
    field: "pilkaStatus",
    snakeField: "pilka_status",
    value: (payload: Record<string, unknown>) =>
      `В работе${payload?.executor ? ` (${str(payload.executor)})` : ""}`,
    pipelineStage: "pilka",
  },
  webSetPilkaDone: { field: "pilkaStatus", snakeField: "pilka_status", value: "Готово", pipelineStage: "kromka" },
  webSetPilkaPause: { field: "pilkaStatus", snakeField: "pilka_status", value: "Пауза", pipelineStage: "pilka" },
  webSetKromkaInWork: {
    field: "kromkaStatus",
    snakeField: "kromka_status",
    value: (payload: Record<string, unknown>) =>
      `В работе${payload?.executor ? ` (${str(payload.executor)})` : ""}`,
    pipelineStage: "kromka",
  },
  webSetKromkaDone: { field: "kromkaStatus", snakeField: "kromka_status", value: "Готово", pipelineStage: "pras" },
  webSetKromkaPause: { field: "kromkaStatus", snakeField: "kromka_status", value: "Пауза", pipelineStage: "kromka" },
  webSetPrasInWork: {
    field: "prasStatus",
    snakeField: "pras_status",
    value: (payload: Record<string, unknown>) =>
      `В работе${payload?.executor ? ` (${str(payload.executor)})` : ""}`,
    pipelineStage: "pras",
  },
  webSetPrasDone: { field: "prasStatus", snakeField: "pras_status", value: "Готово", pipelineStage: "assembly" },
  webSetPrasPause: { field: "prasStatus", snakeField: "pras_status", value: "Пауза", pipelineStage: "pras" },
  webSetAssemblyDone: {
    field: "assemblyStatus",
    snakeField: "assembly_status",
    value: "Собрано",
    pipelineStage: "assembled",
  },
  webSetShippingDone: {
    field: "overallStatus",
    snakeField: "overall_status",
    value: "Отгружено",
    pipelineStage: "shipped",
  },
};

const STORAGE_SHEET_WIDTH = 2800;
const STORAGE_SHEET_HEIGHT = 2070;

export function hasOptimisticActionRule(action: string): boolean {
  return Boolean(ACTION_OPTIMISTIC_MAP[action]);
}

export function applyOptimisticOrderRow(
  row: Record<string, unknown>,
  action: string,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  const config = ACTION_OPTIMISTIC_MAP[action];
  if (!config) return row;
  const nextValue = typeof config.value === "function" ? config.value(payload) : config.value;
  return {
    ...row,
    [config.field]: nextValue,
    [config.snakeField]: nextValue,
    ...(config.pipelineStage ? { pipelineStage: config.pipelineStage, pipeline_stage: config.pipelineStage } : {}),
  };
}

export function resolveDefaultConsumeSheets(
  order: Record<string, unknown>,
  shipmentOrders: Record<string, unknown>[],
): number {
  const direct = num(order?.sheetsNeeded ?? order?.sheets_needed ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const orderId = str(order?.orderId || order?.order_id || "").trim();
  const sourceRowId = str(order?.sourceRowId || order?.source_row_id || "").trim();
  const week = str(order?.week || "").trim();
  const item = str(order?.item || "").trim();
  const all = Array.isArray(shipmentOrders) ? shipmentOrders : [];

  const getSheets = (x: Record<string, unknown>) => num(x?.sheetsNeeded ?? x?.sheets_needed ?? 0);

  if (orderId) {
    const byOrderId = all.find(
      (x) => str(x?.orderId || x?.order_id || "").trim() === orderId && getSheets(x) > 0,
    );
    if (byOrderId) return getSheets(byOrderId);
  }
  if (sourceRowId && week) {
    const byRowWeek = all.find(
      (x) =>
        str(x?.sourceRowId || x?.source_row_id || "").trim() === sourceRowId &&
        str(x?.week || "").trim() === week &&
        getSheets(x) > 0,
    );
    if (byRowWeek) return getSheets(byRowWeek);
  }
  if (item && week) {
    const byItemWeek = all.find(
      (x) => str(x?.item || "").trim() === item && str(x?.week || "").trim() === week && getSheets(x) > 0,
    );
    if (byItemWeek) return getSheets(byItemWeek);
  }
  return 0;
}

export function resolveDefaultConsumeSheetsFromBoard(
  order: Record<string, unknown>,
  shipmentBoard: Record<string, unknown>,
): number {
  const direct = num(order?.sheetsNeeded ?? order?.sheets_needed ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const sourceRowId = str(order?.sourceRowId || order?.source_row_id || "").trim();
  const week = str(order?.week || "").trim();
  const item = str(order?.item || "").trim();
  const sections = Array.isArray(shipmentBoard?.sections) ? (shipmentBoard.sections as Record<string, unknown>[]) : [];

  let byRowWeek = 0;
  let byItemWeek = 0;
  for (const section of sections) {
    for (const it of (section?.items || []) as Record<string, unknown>[]) {
      const rowId = str(it?.sourceRowId || it?.source_row_id || it?.row || "").trim();
      const itemName = str(it?.item || "").trim();
      for (const c of (it?.cells || []) as Record<string, unknown>[]) {
        const cellWeek = str(c?.week || "").trim();
        const sheets = num(c?.sheetsNeeded ?? c?.sheets_needed ?? 0);
        if (!(Number.isFinite(sheets) && sheets > 0)) continue;
        if (sourceRowId && week && rowId === sourceRowId && cellWeek === week) byRowWeek = Math.max(byRowWeek, sheets);
        if (item && week && itemName === item && cellWeek === week) byItemWeek = Math.max(byItemWeek, sheets);
      }
    }
  }
  return byRowWeek || byItemWeek || 0;
}

interface BoardCell {
  col: string;
  sourceColId: string;
  week: string;
  qty: number;
  bg: string;
  canSendToWork: boolean;
  inWork: boolean;
  sheetsNeeded: number;
  outputPerSheet: number;
  availableSheets: number;
  materialEnoughForOrder?: boolean;
  note: string;
}

interface BoardItem {
  row: string;
  sourceRowId: string;
  item: string;
  productArticle: string;
  material: string;
  cells: BoardCell[];
}

interface BoardSection {
  name: string;
  items: BoardItem[];
}

interface NormalizedBoard {
  sections: BoardSection[];
}

export function normalizeShipmentBoard(data: unknown): NormalizedBoard {
  const d = data as Record<string, unknown>;
  if (d && Array.isArray(d.sections)) return applyStorageAutoCutToBoard(d as unknown as NormalizedBoard);
  if (!Array.isArray(data)) return { sections: [] };
  const sectionMap = new Map<string, Map<string, BoardItem>>();
  (data as Record<string, unknown>[]).forEach((row, idx) => {
    const sectionName = str(row?.section_name || row?.sectionName || "Прочее").trim() || "Прочее";
    const itemName = str(row?.item || "").trim();
    if (!itemName) return;
    if (!sectionMap.has(sectionName)) sectionMap.set(sectionName, new Map());
    const itemMap = sectionMap.get(sectionName)!;
    const rowKey = str(row?.row_ref || row?.rowRef || row?.source_row_id || `${sectionName}:${itemName}`);
    if (!itemMap.has(rowKey)) {
      const productArticle = str(
        row?.article_code || row?.articleCode || row?.article || row?.mapped_article_code || row?.mappedArticleCode || "",
      ).trim();
      itemMap.set(rowKey, {
        row: rowKey,
        sourceRowId: str(row?.source_row_id || row?.sourceRowId || rowKey),
        item: itemName,
        productArticle,
        material: str(row?.material || ""),
        cells: [],
      });
    }
    const qtyRaw = num(row?.qty || 0);
    const directOutputPerSheet = num(row?.output_per_sheet ?? row?.outputPerSheet ?? 0);
    const directSheetsNeeded = num(row?.sheets_needed ?? row?.sheetsNeeded ?? 0);
    const storageAutoCut = resolveStorageAutoCut(sectionName, itemName, qtyRaw);
    const outputPerSheet =
      directOutputPerSheet > 0 ? directOutputPerSheet : num(storageAutoCut.outputPerSheet || 0);
    const sheetsNeeded =
      directSheetsNeeded > 0
        ? directSheetsNeeded
        : outputPerSheet > 0 && qtyRaw > 0
          ? Math.ceil(qtyRaw / outputPerSheet)
          : 0;
    itemMap.get(rowKey)!.cells.push({
      col: str(row?.source_col_id || row?.sourceColId || row?.col_ref || row?.colRef || String(idx + 1)),
      sourceColId: str(row?.source_col_id || row?.sourceColId || row?.col_ref || row?.colRef || String(idx + 1)),
      week: str(row?.week || ""),
      qty: qtyRaw,
      bg: str(row?.bg || "#ffffff"),
      canSendToWork: bool(row?.can_send_to_work) || bool(row?.canSendToWork),
      inWork: bool(row?.in_work) || bool(row?.inWork),
      sheetsNeeded,
      outputPerSheet,
      availableSheets: num(row?.available_sheets ?? row?.availableSheets ?? 0),
      materialEnoughForOrder:
        row?.material_enough_for_order == null ? (row?.materialEnoughForOrder as boolean | undefined) : bool(row?.material_enough_for_order),
      note: str(row?.note || ""),
    });
  });
  const sections: BoardSection[] = [...sectionMap.entries()].map(([name, items]) => ({
    name,
    items: [...items.values()],
  }));
  return applyStorageAutoCutToBoard({ sections });
}

export function mergeShipmentBoardWithTable(
  board: unknown,
  tableRows: Record<string, unknown>[],
): NormalizedBoard {
  const normalized = normalizeShipmentBoard(board);
  const rows = Array.isArray(tableRows) ? tableRows : [];
  if (!rows.length) return normalized;

  const bySource = new Map<string, { availableSheets: number; sheetsNeeded: number; materialEnoughForOrder?: boolean }>();
  rows.forEach((r) => {
    const sourceRow = str(r?.source_row_id || r?.sourceRowId || "").trim();
    const sourceCol = str(r?.source_col_id || r?.sourceColId || "").trim();
    if (!sourceRow || !sourceCol) return;
    bySource.set(`${sourceRow}|${sourceCol}`, {
      availableSheets: num(r?.available_sheets ?? r?.availableSheets ?? 0),
      sheetsNeeded: num(r?.sheets_needed ?? r?.sheetsNeeded ?? 0),
      materialEnoughForOrder:
        r?.material_enough_for_order == null
          ? (r?.materialEnoughForOrder == null ? undefined : bool(r?.materialEnoughForOrder))
          : bool(r?.material_enough_for_order),
    });
  });

  return {
    ...normalized,
    sections: (normalized.sections || []).map((section) => ({
      ...section,
      items: (section.items || []).map((item) => ({
        ...item,
        cells: (item.cells || []).map((cell) => {
          const key = `${str(item?.sourceRowId || item?.row || "").trim()}|${str(cell?.sourceColId || cell?.col || "").trim()}`;
          const fromTable = bySource.get(key);
          if (!fromTable) return cell;
          return {
            ...cell,
            availableSheets: fromTable.availableSheets,
            sheetsNeeded: fromTable.sheetsNeeded > 0 ? fromTable.sheetsNeeded : cell.sheetsNeeded,
            materialEnoughForOrder:
              fromTable.materialEnoughForOrder == null ? cell.materialEnoughForOrder : fromTable.materialEnoughForOrder,
          };
        }),
      })),
    })),
  };
}

interface StorageCutResult {
  outputPerSheet: number;
  sheetsNeeded?: number;
}

function resolveStorageAutoCut(sectionName: string, itemName: string, qty: number): StorageCutResult {
  const section = str(sectionName || "").toLowerCase();
  if (!section.includes("система хранения")) return { outputPerSheet: 0 };
  const size = parseItemSize(itemName);
  if (!size) return { outputPerSheet: 0 };
  const a = num(size.a || 0);
  const b = num(size.b || 0);
  if (!(a > 0) || !(b > 0)) return { outputPerSheet: 0 };
  const byAB = Math.floor(STORAGE_SHEET_WIDTH / a) * Math.floor(STORAGE_SHEET_HEIGHT / b);
  const byBA = Math.floor(STORAGE_SHEET_WIDTH / b) * Math.floor(STORAGE_SHEET_HEIGHT / a);
  const outputPerSheet = Math.max(byAB, byBA, 0);
  const sheetsNeeded = outputPerSheet > 0 && qty > 0 ? Math.ceil(num(qty || 0) / outputPerSheet) : 0;
  return { outputPerSheet, sheetsNeeded };
}

interface ItemSize {
  a: number;
  b: number;
}

function parseItemSize(itemName: string): ItemSize | null {
  const m = str(itemName || "").match(/(\d{2,4})\s*[_xх]\s*(\d{2,4})/i);
  if (!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
}

function applyStorageAutoCutToBoard(board: NormalizedBoard): NormalizedBoard {
  const sections = Array.isArray(board?.sections) ? board.sections : [];
  return {
    ...board,
    sections: sections.map((section) => {
      const sectionName = str(section?.name || "").trim();
      const items = Array.isArray(section?.items) ? section.items : [];
      return {
        ...section,
        items: items.map((item) => {
          const itemName = str(item?.item || "").trim();
          const cells = Array.isArray(item?.cells) ? item.cells : [];
          return {
            ...item,
            cells: cells.map((cell) => {
              const qty = num(cell?.qty || 0);
              const directOutputPerSheet = num(cell?.outputPerSheet || 0);
              const directSheetsNeeded = num(cell?.sheetsNeeded || 0);
              if (directOutputPerSheet > 0 || directSheetsNeeded > 0) return cell;
              const autoCut = resolveStorageAutoCut(sectionName, itemName, qty);
              const outputPerSheet = num(autoCut.outputPerSheet || 0);
              const sheetsNeeded = outputPerSheet > 0 && qty > 0 ? Math.ceil(qty / outputPerSheet) : 0;
              if (!(outputPerSheet > 0) && !(sheetsNeeded > 0)) return cell;
              return {
                ...cell,
                outputPerSheet,
                sheetsNeeded,
              };
            }),
          };
        }),
      };
    }),
  };
}

interface StrapSize {
  length: number;
  width: number;
}

export function parseStrapSize(name: string): StrapSize | null {
  const m = str(name || "").match(/\((\d+)\s*[_xх]\s*(\d+)\)/i);
  if (!m) return null;
  const length = Number(m[1]);
  const width = Number(m[2]);
  if (!(length > 0 && width > 0)) return null;
  return { length, width };
}

export function formatDateTimeForPrint(date: Date): string {
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface FurnitureTemplateDetail {
  detailName: string;
  perUnit: number;
  sampleQty: number;
  color: string;
}

interface FurnitureTemplate {
  productName: string;
  productColor: string;
  baseQty: number;
  details: FurnitureTemplateDetail[];
}

interface PreviewRow {
  part: string;
  qty: string;
  baseQty: number;
}

export function buildPreviewRowsFromFurnitureTemplate(
  template: FurnitureTemplate,
  orderQty: number | string,
): PreviewRow[] {
  const qtyNum = Number(orderQty || 0);
  const baseQty = num(template?.baseQty || 0) > 0 ? num(template.baseQty) : 1;
  if (!(qtyNum > 0) || !Array.isArray(template?.details)) return [];
  return template.details
    .map((d) => {
      const perUnit = num(d?.perUnit || 0);
      const raw = perUnit > 0 ? perUnit * qtyNum : 0;
      const rounded = Math.round(raw * 1000) / 1000;
      const normalizedQty = Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded).replace(".", ",");
      const partName = str(d?.detailName || "").trim();
      return {
        part: partName,
        qty: normalizedQty,
        baseQty,
      };
    })
    .filter((x) => x.part);
}

export function normalizeExecutorList(rawList: unknown, fallback: string[]): string[] {
  const source = Array.isArray(rawList) ? rawList : [];
  const normalized = source
    .map((x: unknown) => str(x || "").trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

export function isDone(s: string): boolean {
  const v = str(s || "").toLowerCase();
  if (/\bне\s*готов/.test(v) || v.includes("неготов")) return false;
  return v.includes("готов") || v.includes("собрано");
}

export function getColorGroup(item: string): string {
  const text = str(item || "").trim();
  if (!text) return "Без цвета";
  const parts = text.split(".").map((x) => str(x || "").trim()).filter(Boolean);
  const tail = str(parts[parts.length - 1] || "").trim();
  return tail || "Без цвета";
}

export function resolvePlanMaterial(articleRow: Record<string, unknown>): string {
  const fromApi = str(articleRow?.material || "").trim();
  if (fromApi) return fromApi;
  const itemName = str(articleRow?.itemName || "").trim();
  const parsedColor = getColorGroup(itemName);
  if (parsedColor && parsedColor !== "Без цвета") return parsedColor;
  return "";
}

export function getWeekday(order: Record<string, unknown>): string {
  const d = new Date(str(order?.createdAt || ""));
  if (!isFinite(d.getTime())) return "Неизвестно";
  return d.toLocaleDateString("ru-RU", { weekday: "long" });
}

export function getStageClassByLabel(label: string): string {
  const s = str(label || "").toLowerCase();
  if (s.includes("отгруж")) return "ship";
  if (s.includes("отправ") && !s.includes("готово к отправке")) return "ship";
  if (s.includes("собран")) return "done";
  if (s.includes("готов")) return "ready";
  if (s.includes("присад")) return "pras";
  if (s.includes("кром")) return "kromka";
  return "pilka";
}

export function isInWork(s: string): boolean {
  return str(s || "").toLowerCase().includes("в работе");
}

interface ShipmentFilters {
  showAwaiting?: boolean;
  showOnPilka?: boolean;
  showOnKromka?: boolean;
  showOnPras?: boolean;
  showReadyAssembly?: boolean;
  showAwaitShipment?: boolean;
  showShipped?: boolean;
}

export function passesShipmentStageFilter(stageKey: string, filters: ShipmentFilters): boolean {
  if (stageKey === "awaiting") return !!filters.showAwaiting;
  if (stageKey === "on_pilka_wait" || stageKey === "on_pilka_work") return !!filters.showOnPilka;
  if (stageKey === "on_kromka_wait" || stageKey === "on_kromka_work") return !!filters.showOnKromka;
  if (stageKey === "on_pras_wait" || stageKey === "on_pras_work") return !!filters.showOnPras;
  if (stageKey === "ready_assembly") return !!filters.showReadyAssembly;
  if (stageKey === "assembled_wait_ship") return !!filters.showAwaitShipment;
  if (stageKey === "shipped") return !!filters.showShipped;
  return true;
}

export function resolveSectionNameForOrder(
  order: Record<string, unknown>,
  shipmentBoard: Record<string, unknown>,
): string {
  const week = str(order?.week || "").trim();
  const sourceRowId = str(order?.sourceRowId || order?.source_row_id || "").trim();
  const itemName = str(order?.item || "").trim();
  if (!week) return "";
  const sections = Array.isArray(shipmentBoard?.sections) ? (shipmentBoard.sections as Record<string, unknown>[]) : [];
  for (const section of sections) {
    const sectionName = str(section?.name || "").trim();
    const items = Array.isArray(section?.items) ? (section.items as Record<string, unknown>[]) : [];
    for (const it of items) {
      const rowId = str(it?.sourceRowId || it?.source_row_id || it?.row || "").trim();
      const cells = Array.isArray(it?.cells) ? (it.cells as Record<string, unknown>[]) : [];
      for (const c of cells) {
        const cellWeek = str(c?.week || "").trim();
        if (!cellWeek || cellWeek !== week) continue;
        if (sourceRowId && rowId && rowId === sourceRowId) return sectionName;
        if (!sourceRowId && itemName && str(it?.item || "").trim() === itemName) return sectionName;
      }
    }
  }
  return "";
}
