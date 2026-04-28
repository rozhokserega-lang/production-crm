const ACTION_OPTIMISTIC_MAP = {
  webSetPilkaInWork: {
    field: "pilkaStatus",
    snakeField: "pilka_status",
    value: (payload) => `В работе${payload?.executor ? ` (${payload.executor})` : ""}`,
    pipelineStage: "pilka",
  },
  webSetPilkaDone: { field: "pilkaStatus", snakeField: "pilka_status", value: "Готово", pipelineStage: "kromka" },
  webSetPilkaPause: { field: "pilkaStatus", snakeField: "pilka_status", value: "Пауза", pipelineStage: "pilka" },
  webSetKromkaInWork: {
    field: "kromkaStatus",
    snakeField: "kromka_status",
    value: (payload) => `В работе${payload?.executor ? ` (${payload.executor})` : ""}`,
    pipelineStage: "kromka",
  },
  webSetKromkaDone: { field: "kromkaStatus", snakeField: "kromka_status", value: "Готово", pipelineStage: "pras" },
  webSetKromkaPause: { field: "kromkaStatus", snakeField: "kromka_status", value: "Пауза", pipelineStage: "kromka" },
  webSetPrasInWork: {
    field: "prasStatus",
    snakeField: "pras_status",
    value: (payload) => `В работе${payload?.executor ? ` (${payload.executor})` : ""}`,
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

export function hasOptimisticActionRule(action) {
  return Boolean(ACTION_OPTIMISTIC_MAP[action]);
}

export function applyOptimisticOrderRow(row, action, payload = {}) {
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

export function resolveDefaultConsumeSheets(order, shipmentOrders) {
  const direct = Number(order?.sheetsNeeded ?? order?.sheets_needed ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const orderId = String(order?.orderId || order?.order_id || "").trim();
  const sourceRowId = String(order?.sourceRowId || order?.source_row_id || "").trim();
  const week = String(order?.week || "").trim();
  const item = String(order?.item || "").trim();
  const all = Array.isArray(shipmentOrders) ? shipmentOrders : [];

  const getSheets = (x) => Number(x?.sheetsNeeded ?? x?.sheets_needed ?? 0);

  if (orderId) {
    const byOrderId = all.find((x) => String(x?.orderId || x?.order_id || "").trim() === orderId && getSheets(x) > 0);
    if (byOrderId) return getSheets(byOrderId);
  }
  if (sourceRowId && week) {
    const byRowWeek = all.find(
      (x) =>
        String(x?.sourceRowId || x?.source_row_id || "").trim() === sourceRowId &&
        String(x?.week || "").trim() === week &&
        getSheets(x) > 0,
    );
    if (byRowWeek) return getSheets(byRowWeek);
  }
  if (item && week) {
    const byItemWeek = all.find(
      (x) => String(x?.item || "").trim() === item && String(x?.week || "").trim() === week && getSheets(x) > 0,
    );
    if (byItemWeek) return getSheets(byItemWeek);
  }
  return 0;
}

export function resolveDefaultConsumeSheetsFromBoard(order, shipmentBoard) {
  const direct = Number(order?.sheetsNeeded ?? order?.sheets_needed ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const sourceRowId = String(order?.sourceRowId || order?.source_row_id || "").trim();
  const week = String(order?.week || "").trim();
  const item = String(order?.item || "").trim();
  const sections = Array.isArray(shipmentBoard?.sections) ? shipmentBoard.sections : [];

  let byRowWeek = 0;
  let byItemWeek = 0;
  for (const section of sections) {
    for (const it of section?.items || []) {
      const rowId = String(it?.sourceRowId || it?.source_row_id || it?.row || "").trim();
      const itemName = String(it?.item || "").trim();
      for (const c of it?.cells || []) {
        const cellWeek = String(c?.week || "").trim();
        const sheets = Number(c?.sheetsNeeded ?? c?.sheets_needed ?? 0);
        if (!(Number.isFinite(sheets) && sheets > 0)) continue;
        if (sourceRowId && week && rowId === sourceRowId && cellWeek === week) byRowWeek = Math.max(byRowWeek, sheets);
        if (item && week && itemName === item && cellWeek === week) byItemWeek = Math.max(byItemWeek, sheets);
      }
    }
  }
  return byRowWeek || byItemWeek || 0;
}

export function normalizeShipmentBoard(data) {
  if (data && Array.isArray(data.sections)) return applyStorageAutoCutToBoard(data);
  if (!Array.isArray(data)) return { sections: [] };
  const sectionMap = new Map();
  data.forEach((row, idx) => {
    const sectionName = String(row?.section_name || row?.sectionName || "Прочее").trim() || "Прочее";
    const itemName = String(row?.item || "").trim();
    if (!itemName) return;
    if (!sectionMap.has(sectionName)) sectionMap.set(sectionName, new Map());
    const itemMap = sectionMap.get(sectionName);
    const rowKey = String(row?.row_ref || row?.rowRef || row?.source_row_id || `${sectionName}:${itemName}`);
    if (!itemMap.has(rowKey)) {
      const productArticle = String(
        row?.article_code || row?.articleCode || row?.article || row?.mapped_article_code || row?.mappedArticleCode || "",
      ).trim();
      itemMap.set(rowKey, {
        row: rowKey,
        sourceRowId: String(row?.source_row_id || row?.sourceRowId || rowKey),
        item: itemName,
        productArticle,
        material: row?.material || "",
        cells: [],
      });
    }
    const qtyRaw = Number(row?.qty || 0);
    const directOutputPerSheet = Number(row?.output_per_sheet ?? row?.outputPerSheet ?? 0);
    const directSheetsNeeded = Number(row?.sheets_needed ?? row?.sheetsNeeded ?? 0);
    const storageAutoCut = resolveStorageAutoCut(sectionName, itemName, qtyRaw);
    const outputPerSheet =
      directOutputPerSheet > 0 ? directOutputPerSheet : Number(storageAutoCut.outputPerSheet || 0);
    const sheetsNeeded =
      directSheetsNeeded > 0
        ? directSheetsNeeded
        : outputPerSheet > 0 && qtyRaw > 0
          ? Math.ceil(qtyRaw / outputPerSheet)
          : 0;
    itemMap.get(rowKey).cells.push({
      col: row?.source_col_id || row?.sourceColId || row?.col_ref || row?.colRef || String(idx + 1),
      sourceColId: row?.source_col_id || row?.sourceColId || row?.col_ref || row?.colRef || String(idx + 1),
      week: row?.week || "",
      qty: qtyRaw,
      bg: row?.bg || "#ffffff",
      canSendToWork: !!row?.can_send_to_work || !!row?.canSendToWork,
      inWork: !!row?.in_work || !!row?.inWork,
      sheetsNeeded,
      outputPerSheet,
      availableSheets: Number(row?.available_sheets ?? row?.availableSheets ?? 0),
      materialEnoughForOrder:
        row?.material_enough_for_order == null ? row?.materialEnoughForOrder : !!row?.material_enough_for_order,
      note: row?.note || "",
    });
  });
  const sections = [...sectionMap.entries()].map(([name, items]) => ({
    name,
    items: [...items.values()],
  }));
  return applyStorageAutoCutToBoard({ sections });
}

export function mergeShipmentBoardWithTable(board, tableRows) {
  const normalized = normalizeShipmentBoard(board);
  const rows = Array.isArray(tableRows) ? tableRows : [];
  if (!rows.length) return normalized;

  const bySource = new Map();
  rows.forEach((r) => {
    const sourceRow = String(r?.source_row_id || r?.sourceRowId || "").trim();
    const sourceCol = String(r?.source_col_id || r?.sourceColId || "").trim();
    if (!sourceRow || !sourceCol) return;
    bySource.set(`${sourceRow}|${sourceCol}`, {
      availableSheets: Number(r?.available_sheets ?? r?.availableSheets ?? 0),
      sheetsNeeded: Number(r?.sheets_needed ?? r?.sheetsNeeded ?? 0),
      materialEnoughForOrder:
        r?.material_enough_for_order == null
          ? (r?.materialEnoughForOrder == null ? undefined : !!r?.materialEnoughForOrder)
          : !!r?.material_enough_for_order,
    });
  });

  return {
    ...normalized,
    sections: (normalized.sections || []).map((section) => ({
      ...section,
      items: (section.items || []).map((item) => ({
        ...item,
        cells: (item.cells || []).map((cell) => {
          const key = `${String(item?.sourceRowId || item?.row || "").trim()}|${String(cell?.sourceColId || cell?.col || "").trim()}`;
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

function resolveStorageAutoCut(sectionName, itemName, qty) {
  const section = String(sectionName || "").toLowerCase();
  if (!section.includes("система хранения")) return { outputPerSheet: 0 };
  const size = parseItemSize(itemName);
  if (!size) return { outputPerSheet: 0 };
  const a = Number(size.a || 0);
  const b = Number(size.b || 0);
  if (!(a > 0) || !(b > 0)) return { outputPerSheet: 0 };
  const byAB = Math.floor(STORAGE_SHEET_WIDTH / a) * Math.floor(STORAGE_SHEET_HEIGHT / b);
  const byBA = Math.floor(STORAGE_SHEET_WIDTH / b) * Math.floor(STORAGE_SHEET_HEIGHT / a);
  const outputPerSheet = Math.max(byAB, byBA, 0);
  const sheetsNeeded = outputPerSheet > 0 && qty > 0 ? Math.ceil(Number(qty || 0) / outputPerSheet) : 0;
  return { outputPerSheet, sheetsNeeded };
}

function parseItemSize(itemName) {
  const m = String(itemName || "").match(/(\d{2,4})\s*[_xх]\s*(\d{2,4})/i);
  if (!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
}

function applyStorageAutoCutToBoard(board) {
  const sections = Array.isArray(board?.sections) ? board.sections : [];
  return {
    ...board,
    sections: sections.map((section) => {
      const sectionName = String(section?.name || "").trim();
      const items = Array.isArray(section?.items) ? section.items : [];
      return {
        ...section,
        items: items.map((item) => {
          const itemName = String(item?.item || "").trim();
          const cells = Array.isArray(item?.cells) ? item.cells : [];
          return {
            ...item,
            cells: cells.map((cell) => {
              const qty = Number(cell?.qty || 0);
              const directOutputPerSheet = Number(cell?.outputPerSheet || 0);
              const directSheetsNeeded = Number(cell?.sheetsNeeded || 0);
              if (directOutputPerSheet > 0 || directSheetsNeeded > 0) return cell;
              const autoCut = resolveStorageAutoCut(sectionName, itemName, qty);
              const outputPerSheet = Number(autoCut.outputPerSheet || 0);
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

export function parseStrapSize(name) {
  const m = String(name || "").match(/\((\d+)\s*[_xх]\s*(\d+)\)/i);
  if (!m) return null;
  const length = Number(m[1]);
  const width = Number(m[2]);
  if (!(length > 0 && width > 0)) return null;
  return { length, width };
}

export function formatDateTimeForPrint(date) {
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildPreviewRowsFromFurnitureTemplate(template, orderQty) {
  const qtyNum = Number(orderQty || 0);
  const baseQty = Number(template?.baseQty || 0) > 0 ? Number(template.baseQty) : 1;
  if (!(qtyNum > 0) || !Array.isArray(template?.details)) return [];
  const sizeFromName = (() => {
    const m = String(template?.productName || "").match(/(\d{2,4})\s*[_xх×]\s*(\d{2,4})/i);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!(a > 0) || !(b > 0)) return null;
    return { len: Math.max(a, b), dep: Math.min(a, b) };
  })();
  const patchDetailNameByProductSize = (detailName) => {
    const raw = String(detailName || "").trim();
    if (!raw || !sizeFromName?.len) return raw;
    // If a detail has a large size token (like крышка/полка), align its main dimension
    // with the product length from the item name. Do not touch small side pieces.
    return raw.replace(/(\d{2,4})\s*[_xх×]\s*(\d{2,4})/gi, (full, aRaw, bRaw) => {
      const a = Number(aRaw);
      const b = Number(bRaw);
      if (!(a > 0) || !(b > 0)) return full;
      const maxDim = Math.max(a, b);
      const minDim = Math.min(a, b);
      if (maxDim < 500) return full; // likely боковина/стойка/etc
      const nextMax = sizeFromName.len;
      // preserve the smaller dimension as-is (depth-like or height-like)
      const next = a >= b ? `${nextMax}_${minDim}` : `${minDim}_${nextMax}`;
      // keep the original separator style
      const sep = String(full).includes("x") ? "x" : String(full).includes("х") ? "х" : String(full).includes("×") ? "×" : "_";
      return next.replace("_", sep);
    });
  };
  const productKey = String(template?.productName || "")
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const details = productKey === "авелла лайт"
    ? template.details.slice(0, 3)
    : template.details;
  return details
    .map((d) => {
      const perUnit = Number(d?.perUnit || 0);
      const raw = perUnit > 0 ? perUnit * qtyNum : 0;
      const rounded = Math.round(raw * 1000) / 1000;
      const normalizedQty = Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded).replace(".", ",");
      const partName = patchDetailNameByProductSize(String(d?.detailName || "").trim());
      return {
        part: partName,
        qty: normalizedQty,
        baseQty,
      };
    })
    .filter((x) => x.part);
}

export function normalizeExecutorList(rawList, fallback) {
  const source = Array.isArray(rawList) ? rawList : [];
  const normalized = source
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

export function isDone(s) {
  const v = String(s || "").toLowerCase();
  if (/\bне\s*готов/.test(v) || v.includes("неготов")) return false;
  return v.includes("готов") || v.includes("собрано");
}

export function getColorGroup(item) {
  const text = String(item || "").trim();
  if (!text) return "Без цвета";
  const parts = text.split(".").map((x) => String(x || "").trim()).filter(Boolean);
  const tail = String(parts[parts.length - 1] || "").trim();
  return tail || "Без цвета";
}

export function resolvePlanMaterial(articleRow) {
  const fromApi = String(articleRow?.material || "").trim();
  if (fromApi) return fromApi;
  const itemName = String(articleRow?.itemName || "").trim();
  const parsedColor = getColorGroup(itemName);
  if (parsedColor && parsedColor !== "Без цвета") return parsedColor;
  return "";
}

export function getWeekday(order) {
  const d = new Date(order?.createdAt || "");
  if (!isFinite(d.getTime())) return "Неизвестно";
  return d.toLocaleDateString("ru-RU", { weekday: "long" });
}

export function getStageClassByLabel(label) {
  const s = String(label || "").toLowerCase();
  if (s.includes("отгруж")) return "ship";
  if (s.includes("отправ") && !s.includes("готово к отправке")) return "ship";
  if (s.includes("собран")) return "done";
  if (s.includes("готов")) return "ready";
  if (s.includes("присад")) return "pras";
  if (s.includes("кром")) return "kromka";
  return "pilka";
}

export function isInWork(s) {
  return String(s || "").toLowerCase().includes("в работе");
}

export function passesShipmentStageFilter(stageKey, filters) {
  if (stageKey === "awaiting") return filters.showAwaiting;
  if (stageKey === "on_pilka_wait" || stageKey === "on_pilka_work") return filters.showOnPilka;
  if (stageKey === "on_kromka_wait" || stageKey === "on_kromka_work") return filters.showOnKromka;
  if (stageKey === "on_pras_wait" || stageKey === "on_pras_work") return filters.showOnPras;
  if (stageKey === "ready_assembly") return filters.showReadyAssembly;
  if (stageKey === "assembled_wait_ship") return filters.showAwaitShipment;
  if (stageKey === "shipped") return filters.showShipped;
  return true;
}

export function resolveSectionNameForOrder(order, shipmentBoard) {
  const week = String(order?.week || "").trim();
  const sourceRowId = String(order?.sourceRowId || order?.source_row_id || "").trim();
  const itemName = String(order?.item || "").trim();
  if (!week) return "";
  const sections = Array.isArray(shipmentBoard?.sections) ? shipmentBoard.sections : [];
  for (const section of sections) {
    const sectionName = String(section?.name || "").trim();
    const items = Array.isArray(section?.items) ? section.items : [];
    for (const it of items) {
      const rowId = String(it?.sourceRowId || it?.source_row_id || it?.row || "").trim();
      const cells = Array.isArray(it?.cells) ? it.cells : [];
      for (const c of cells) {
        const cellWeek = String(c?.week || "").trim();
        if (!cellWeek || cellWeek !== week) continue;
        if (sourceRowId && rowId && rowId === sourceRowId) return sectionName;
        if (!sourceRowId && itemName && String(it?.item || "").trim() === itemName) return sectionName;
      }
    }
  }
  return "";
}
