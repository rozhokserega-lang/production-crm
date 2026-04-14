import { useEffect, useMemo, useRef, useState } from "react";
import { callBackend } from "./api";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import {
  getOrderStageDisplayLabel as getStageLabel,
  getOverviewLaneId,
  OVERVIEW_POST_PRODUCTION_LANE_IDS,
  isCustomerShippedOverall,
  isOrderCustomerShipped,
  PipelineStage,
  resolvePipelineStage,
} from "./orderPipeline";

/** Для KPI «Статистика»: собрано, готово к отправке клиенту, отгружено. */
const TERMINAL_PIPELINE_STAGES = new Set([
  PipelineStage.ASSEMBLED,
  PipelineStage.READY_TO_SHIP,
  PipelineStage.SHIPPED,
]);

const TABS = [
  { id: "pilka", label: "Пила" },
  { id: "kromka", label: "Кромка" },
  { id: "pras", label: "Присадка" },
  { id: "assembly", label: "Сборка" },
  { id: "done", label: "Финал" },
];
const VIEWS = [
  { id: "shipment", label: "Отгрузка" },
  { id: "overview", label: "Обзор заказов" },
  { id: "workshop", label: "Производство" },
  { id: "warehouse", label: "Склад" },
  { id: "labor", label: "Трудоемкость" },
  { id: "stats", label: "Статистика" },
];
const DEFAULT_SHIPMENT_PREFS = {
  weekFilter: "all",
  shipmentSort: "name",
  showAwaiting: true,
  showOnPilka: true,
  showOnKromka: true,
  showOnPras: true,
  showReadyAssembly: true,
  /** Собран / готово к отправке клиенту — «ждёт отправку» (отдельно от «готовы к сборке»). */
  showAwaitShipment: true,
  showShipped: true,
  collapsedSections: {},
};
const UI_SCALE_STORAGE_KEY = "crmUiScale";
const SHIPMENT_SECTION_ORDER = [];
const STRAP_OPTIONS = [
  "Бока (316_167)",
  "Обвязка (1000_80)",
  "Обвязка (558_80)",
  "Обвязка (750_80)",
  "Обвязка (618_80)",
  "Обвязка (600_80)",
  "Обвязка (586_80)",
  "Обвязка (1158_50)",
  "Обвязка (600_50)",
  "Обвязка (502_80)",
  "Обвязка (544_80)",
  "Обвязка (288_80)",
  "Обвязка (520_80)",
  "Фасад (396_305)",
  "Фасад (153x320)",
];
const STRAP_SHEET_WIDTH = 2800;
const STRAP_SHEET_HEIGHT = 2070;

function statusClass(order) {
  const ps = resolvePipelineStage(order);
  if (ps === PipelineStage.SHIPPED || ps === PipelineStage.READY_TO_SHIP || ps === PipelineStage.ASSEMBLED) {
    return "done";
  }
  const a = String(order?.assemblyStatus || "");
  if (a.includes("СОБРАНО") || a.toLowerCase().includes("собрано")) return "done";
  const pilka = String(order?.pilkaStatus || order?.pilka || "");
  const kromka = String(order?.kromkaStatus || order?.kromka || "");
  const pras = String(order?.prasStatus || order?.pras || "");
  const lc = (s) => String(s || "").toLowerCase();
  const inWork = (s) => lc(s).includes("в работе");
  const onPause = (s) => lc(s).includes("пауза");
  if (ps === PipelineStage.PILKA && onPause(pilka)) return "pause";
  if (ps === PipelineStage.KROMKA && onPause(kromka)) return "pause";
  if (ps === PipelineStage.PRAS && onPause(pras)) return "pause";
  if (ps === PipelineStage.PILKA && inWork(pilka)) return "work";
  if (ps === PipelineStage.KROMKA && inWork(kromka)) return "work";
  if (ps === PipelineStage.PRAS && inWork(pras)) return "work";
  return "wait";
}

function getReadableTextColor(bg) {
  const hex = String(bg || "").toLowerCase().trim();
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return "#111827";
  const n = m[1];
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 150 ? "#f9fafb" : "#111827";
}

function normText(v) {
  return String(v || "").trim().toLowerCase();
}

function isRedCell(bg) {
  const raw = String(bg || "").toLowerCase().trim();
  let r = null, g = null, b = null;

  const hex6 = raw.match(/^#([0-9a-f]{6})$/i);
  const hex3 = raw.match(/^#([0-9a-f]{3})$/i);
  const rgb = raw.match(/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/i);

  if (hex6) {
    const n = hex6[1];
    r = parseInt(n.slice(0, 2), 16);
    g = parseInt(n.slice(2, 4), 16);
    b = parseInt(n.slice(4, 6), 16);
  } else if (hex3) {
    const n = hex3[1];
    r = parseInt(n[0] + n[0], 16);
    g = parseInt(n[1] + n[1], 16);
    b = parseInt(n[2] + n[2], 16);
  } else if (rgb) {
    r = Number(rgb[1]);
    g = Number(rgb[2]);
    b = Number(rgb[3]);
  } else {
    return false;
  }

  // Устойчивое определение "красного" для разных оттенков таблицы.
  return r > 120 && r > g * 1.2 && r > b * 1.2 && (r - g) > 35 && (r - b) > 35;
}

function isBlueCell(bg) {
  const { r, g, b } = parseColor(bg);
  if (r == null) return false;
  return b > 120 && b > r * 1.15 && b > g * 1.05;
}

function isYellowCell(bg) {
  const { r, g, b } = parseColor(bg);
  if (r == null) return false;
  return r > 170 && g > 130 && b < 170;
}

function passesBlueYellowFilter(bg, showBlueCells, showYellowCells) {
  const hasBlueYellowFilter = showBlueCells || showYellowCells;
  if (!hasBlueYellowFilter) return true;
  const blue = isBlueCell(bg);
  const yellow = isYellowCell(bg);
  return (showBlueCells && blue) || (showYellowCells && yellow);
}

function sectionSortKey(name) {
  const n = normText(name);
  const idx = SHIPMENT_SECTION_ORDER.findIndex((x) => normText(x) === n);
  return idx === -1 ? 999 : idx;
}

function isStorageLikeName(text) {
  const t = normText(text);
  if (!t) return false;
  if (t.includes("система хранения")) return true;
  // Частые имена тех-позиций хранения: "387_330 Вотан", "587_330 Сонома" и т.п.
  if (/^\d{2,4}\s*[_xх]\s*\d{2,4}\b/.test(t)) return true;
  return false;
}

function isGarbageShipmentItemName(text) {
  const t = normText(text);
  if (!t) return false;
  if (t === "123" || t === "ава") return true;
  if (t.includes("[obv-")) return true;
  return false;
}

function parseColor(bg) {
  const raw = String(bg || "").toLowerCase().trim();
  let r = null, g = null, b = null;
  const hex6 = raw.match(/^#([0-9a-f]{6})$/i);
  const hex3 = raw.match(/^#([0-9a-f]{3})$/i);
  const rgb = raw.match(/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/i);

  if (hex6) {
    const n = hex6[1];
    r = parseInt(n.slice(0, 2), 16);
    g = parseInt(n.slice(2, 4), 16);
    b = parseInt(n.slice(4, 6), 16);
  } else if (hex3) {
    const n = hex3[1];
    r = parseInt(n[0] + n[0], 16);
    g = parseInt(n[1] + n[1], 16);
    b = parseInt(n[2] + n[2], 16);
  } else if (rgb) {
    r = Number(rgb[1]);
    g = Number(rgb[2]);
    b = Number(rgb[3]);
  }
  return { r, g, b };
}

function isWhiteCell(bg) {
  const raw = String(bg || "").toLowerCase().trim();
  if (raw === "#fff" || raw === "#ffffff" || raw === "white") return true;
  const { r, g, b } = parseColor(bg);
  if (r == null) return false;
  return r >= 245 && g >= 245 && b >= 245;
}

function shipmentOrderKey(sourceRow, week) {
  return `${String(sourceRow || "").trim()}|${String(week || "").trim()}`;
}

/** Резервная привязка заказа к ячейке, если в API нет source_row_id (типично для Supabase orders). */
function shipmentOrderItemWeekKey(itemName, week) {
  return `${normText(itemName)}|${String(week || "").trim()}`;
}

function orderUpdatedTs(o) {
  return new Date(o?.updatedAt || o?.updated_at || o?.createdAt || o?.created_at || 0).getTime();
}

function mergeOrderPreferNewer(map, key, o) {
  if (!key || !o) return;
  const prev = map.get(key);
  if (!prev || orderUpdatedTs(o) >= orderUpdatedTs(prev)) map.set(key, o);
}

/** Согласование этапа отгрузки с pipeline заказа (Производство ↔ Отгрузка). */
function mapPipelineStageToShipmentKey(order) {
  const ps = resolvePipelineStage(order);
  const pilka = String(order?.pilkaStatus || "").toLowerCase();
  const kromka = String(order?.kromkaStatus || "").toLowerCase();
  const pras = String(order?.prasStatus || "").toLowerCase();
  switch (ps) {
    case PipelineStage.SHIPPED:
      return "shipped";
    case PipelineStage.READY_TO_SHIP:
    case PipelineStage.ASSEMBLED:
      return "assembled_wait_ship";
    case PipelineStage.WORKSHOP_COMPLETE:
      return "ready_assembly";
    case PipelineStage.PRAS:
      if (pras.includes("в работе")) return "on_pras_work";
      return "on_pras_wait";
    case PipelineStage.KROMKA:
      if (kromka.includes("в работе") || kromka.includes("пауза")) return "on_kromka_work";
      return "on_kromka_wait";
    case PipelineStage.PILKA:
    default:
      if (pilka.includes("в работе") || pilka.includes("пауза")) return "on_pilka_work";
      return "on_pilka_wait";
  }
}

function stageLabel(stageKey) {
  if (stageKey === "awaiting") return "Ожидаю заказ";
  if (stageKey === "on_pilka_wait") return "На пиле (ожидает запуск)";
  if (stageKey === "on_pilka_work") return "На пиле";
  if (stageKey === "on_kromka_wait") return "Ожидает кромку";
  if (stageKey === "on_kromka_work") return "На кромке";
  if (stageKey === "on_pras_wait") return "Ожидает присадку";
  if (stageKey === "on_pras_work") return "На присадке";
  if (stageKey === "ready_assembly") return "Готово к сборке";
  if (stageKey === "assembled_wait_ship") return "Собран, ждет отправку";
  if (stageKey === "shipped") return "Отправлен";
  return "Статус неизвестен";
}

function stageBg(stageKey, rawBg = "#ffffff") {
  if (stageKey === "awaiting") return "#ffffff";
  if (stageKey === "on_pilka_wait") return "#fff7cc";
  if (stageKey === "on_pilka_work") return "#ffe066";
  if (stageKey === "on_kromka_wait") return "#dbeafe";
  if (stageKey === "on_kromka_work") return "#3b82f6";
  if (stageKey === "on_pras_wait") return "#ffddb5";
  if (stageKey === "on_pras_work") return "#8b5a2b";
  if (stageKey === "ready_assembly") return "#f59e0b";
  if (stageKey === "assembled_wait_ship") return "#22c55e";
  if (stageKey === "shipped") return "#d31d1d";
  return rawBg || "#ffffff";
}

function getShipmentCellStatus(c) {
  if (!c) return "Статус неизвестен";
  const materialInfoText =
    Number(c.sheetsNeeded || 0) > 0
      ? `\n📦 Доступно листов (E): ${Number(c.availableSheets || 0)}\n${
          c.materialEnoughForOrder ? "✅ На этот заказ материала хватает" : "❌ На этот заказ материала не хватает"
        }`
      : "";
  const calcText =
    Number(c.sheetsNeeded || 0) > 0
      ? `\n📐 На заказ: ${c.sheetsNeeded} лист(ов) (B=${Number(c.outputPerSheet || 0)} изд/лист)`
      : "";
  // Материал показываем только для стартовых (белых) карточек, которые можно отправить в работу.
  const extraText = c.canSendToWork ? calcText + materialInfoText : "";
  if (String(c.note || "").trim()) return String(c.note).trim() + extraText;
  if (c.canSendToWork) return "Готово к отправке в работу" + extraText;
  if (c.inWork) return "Уже отправлено в работу";
  const { r, g, b } = parseColor(c.bg);
  if (r == null) return "Статус неизвестен";
  if (r > 180 && g < 100 && b < 100) return "Отправлено (красная ячейка)";
  if (g > 150 && r < 140 && b < 140) return "Собрано";
  if (r > 200 && g > 150 && b < 120) return "Пауза / ожидание";
  if (b > 140 && r < 140) return "Этап выполнен";
  if (r > 180 && g > 120 && b < 80) return "Присадка готова";
  return "Статус по цвету";
}

function getShipmentCellStatusShort(c) {
  if (!c) return "Статус";
  if (c.canSendToWork) return "Не начато";
  if (c.inWork) return "В работе";
  if (isRedCell(c.bg)) return "Выполнено";
  if (isYellowCell(c.bg)) return "Пауза";
  if (isBlueCell(c.bg)) return "Этап";
  return "Статус";
}

function getShipmentStageKey(c, sourceRow, orderMaps, itemName) {
  if (!c) return "awaiting";
  if (c.canSendToWork && !c.inWork) return "awaiting";
  const rowKey = shipmentOrderKey(sourceRow, c.week);
  let order = orderMaps?.byRowWeek?.get(rowKey);
  if (!order && itemName && orderMaps?.byItemWeek) {
    order = orderMaps.byItemWeek.get(shipmentOrderItemWeekKey(itemName, c.week));
  }
  if (order) {
    return mapPipelineStageToShipmentKey(order);
  }
  if (c.inWork) return "on_pilka_wait";
  if (isRedCell(c.bg)) return "shipped";
  if (isBlueCell(c.bg)) return "on_kromka_work";
  if (isYellowCell(c.bg)) return "on_pilka_work";
  return "awaiting";
}

function getMaterialLabel(item, material) {
  const direct = String(material || "").trim();
  if (direct) return direct;
  const name = String(item || "").trim();
  if (!name) return "Материал не указан";
  const parts = name
    .split(".")
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const tail = String(parts[parts.length - 1] || "").trim();
  return tail || "Материал не указан";
}

function normalizeCatalogItemName(name) {
  return String(name || "")
    .replace(/^стол\s+письменный\s+/i, "")
    .trim();
}

function normalizeCatalogDedupKey(name) {
  return normalizeCatalogItemName(name)
    .toLowerCase()
    .replaceAll("х", "x")
    .replace(/\s+/g, " ")
    .trim();
}

function toUserError(e) {
  const msg = String(e?.message || e || "");
  if (msg.includes("Система занята")) return "Система занята, повторите через 1-2 секунды.";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return "Нет связи с сервером. Проверьте интернет и повторите.";
  return msg || "Неизвестная ошибка";
}

function extractErrorMessage(e) {
  return String(e?.message || e || "").trim() || "Неизвестная ошибка";
}

function isShipmentCellMissingError(e) {
  let raw = "";
  try {
    raw = JSON.stringify(e);
  } catch {
    raw = "";
  }
  const text = [
    e?.message,
    e?.details,
    e?.hint,
    e?.error_description,
    raw,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /shipment cell not found|not\s*found|не найден|not\s*exists/.test(text);
}

function normalizeOrder(row) {
  if (!row || typeof row !== "object") return row;
  const out = {
    ...row,
    orderId: row.orderId ?? row.order_id ?? "",
    pilkaStatus: row.pilkaStatus ?? row.pilka_status ?? row.pilka ?? "",
    kromkaStatus: row.kromkaStatus ?? row.kromka_status ?? row.kromka ?? "",
    prasStatus: row.prasStatus ?? row.pras_status ?? row.pras ?? "",
    assemblyStatus: row.assemblyStatus ?? row.assembly_status ?? "",
    overallStatus: row.overallStatus ?? row.overall_status ?? row.overall ?? "",
    colorName: row.colorName ?? row.color_name ?? "",
    createdAt: row.createdAt ?? row.created_at ?? "",
    sheetsNeeded: row.sheetsNeeded ?? row.sheets_needed ?? 0,
  };
  out.pipelineStage = row.pipeline_stage ?? row.pipelineStage ?? null;
  out.pipelineStage = resolvePipelineStage(out);
  return out;
}

function resolveDefaultConsumeSheets(order, shipmentOrders) {
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
        getSheets(x) > 0
    );
    if (byRowWeek) return getSheets(byRowWeek);
  }
  if (item && week) {
    const byItemWeek = all.find(
      (x) =>
        String(x?.item || "").trim() === item &&
        String(x?.week || "").trim() === week &&
        getSheets(x) > 0
    );
    if (byItemWeek) return getSheets(byItemWeek);
  }
  return 0;
}

function resolveDefaultConsumeSheetsFromBoard(order, shipmentBoard) {
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

function normalizeShipmentBoard(data) {
  if (data && Array.isArray(data.sections)) return data;
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
      itemMap.set(rowKey, {
        row: rowKey,
        sourceRowId: String(row?.source_row_id || row?.sourceRowId || rowKey),
        item: itemName,
        material: row?.material || "",
        cells: [],
      });
    }
    itemMap.get(rowKey).cells.push({
      col: row?.source_col_id || row?.sourceColId || row?.col_ref || row?.colRef || String(idx + 1),
      sourceColId: row?.source_col_id || row?.sourceColId || row?.col_ref || row?.colRef || String(idx + 1),
      week: row?.week || "",
      qty: Number(row?.qty || 0),
      bg: row?.bg || "#ffffff",
      canSendToWork: !!row?.can_send_to_work || !!row?.canSendToWork,
      inWork: !!row?.in_work || !!row?.inWork,
      sheetsNeeded: Number(row?.sheets_needed ?? row?.sheetsNeeded ?? 0),
      outputPerSheet: Number(row?.output_per_sheet ?? row?.outputPerSheet ?? 0),
      availableSheets: Number(row?.available_sheets ?? row?.availableSheets ?? 0),
      materialEnoughForOrder:
        row?.material_enough_for_order == null
          ? row?.materialEnoughForOrder
          : !!row?.material_enough_for_order,
      note: row?.note || "",
    });
  });
  const sections = [...sectionMap.entries()].map(([name, items]) => ({
    name,
    items: [...items.values()],
  }));
  return { sections };
}

function parseStrapSize(name) {
  const m = String(name || "").match(/\((\d+)\s*[_xх]\s*(\d+)\)/i);
  if (!m) return null;
  const length = Number(m[1]);
  const width = Number(m[2]);
  if (!(length > 0 && width > 0)) return null;
  return { length, width };
}

function formatDateTimeForPrint(date) {
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function App() {
  const [view, setView] = useState("shipment");
  const [tab, setTab] = useState("all");
  /** Подраздел внутри «Обзор заказов»: канбан или список отгруженных (вкладка в конце блока). */
  const [overviewSubView, setOverviewSubView] = useState("kanban");
  const [shipmentTab, setShipmentTab] = useState("orders");
  const [rows, setRows] = useState([]);
  const [shipmentBoard, setShipmentBoard] = useState({ sections: [] });
  const [planCatalogRows, setPlanCatalogRows] = useState([]);
  const [sectionCatalogRows, setSectionCatalogRows] = useState([]);
  const [sectionArticleRows, setSectionArticleRows] = useState([]);
  const [shipmentOrders, setShipmentOrders] = useState([]);
  const [selectedShipments, setSelectedShipments] = useState([]);
  const [planPreviews, setPlanPreviews] = useState([]);
  const [hoverTip, setHoverTip] = useState({ visible: false, text: "", x: 0, y: 0 });
  const [query, setQuery] = useState("");
  const [weekFilter, setWeekFilter] = useState("all");
  const [showAwaiting, setShowAwaiting] = useState(true);
  const [showOnPilka, setShowOnPilka] = useState(true);
  const [showOnKromka, setShowOnKromka] = useState(true);
  const [showOnPras, setShowOnPras] = useState(true);
  const [showReadyAssembly, setShowReadyAssembly] = useState(true);
  const [showAwaitShipment, setShowAwaitShipment] = useState(true);
  const [showShipped, setShowShipped] = useState(true);
  const [shipmentSort, setShipmentSort] = useState("name");
  const [shipmentViewMode, setShipmentViewMode] = useState("table");
  const [statsSort, setStatsSort] = useState("stage");
  const [laborSort, setLaborSort] = useState("total_desc");
  const [uiScale, setUiScale] = useState("large");
  const [collapsedSections, setCollapsedSections] = useState({});
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [executorByOrder, setExecutorByOrder] = useState({});
  const [consumeDialogOpen, setConsumeDialogOpen] = useState(false);
  const [consumeEditMode, setConsumeEditMode] = useState(false);
  const [consumeDialogData, setConsumeDialogData] = useState(null);
  const [consumeMaterial, setConsumeMaterial] = useState("");
  const [consumeQty, setConsumeQty] = useState("");
  const [consumeSaving, setConsumeSaving] = useState(false);
  const [consumeError, setConsumeError] = useState("");
  const [consumeLoading, setConsumeLoading] = useState(false);
  const [strapDialogOpen, setStrapDialogOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planSection, setPlanSection] = useState("Прочее");
  const [planArticle, setPlanArticle] = useState("");
  const [planMaterial, setPlanMaterial] = useState("");
  const [planWeek, setPlanWeek] = useState("");
  const [planQty, setPlanQty] = useState("");
  const [planSaving, setPlanSaving] = useState(false);
  const [strapDraft, setStrapDraft] = useState(() =>
    STRAP_OPTIONS.reduce((acc, name) => ({ ...acc, [name]: "" }), {})
  );
  const [strapItems, setStrapItems] = useState([]);
  const [laborRows, setLaborRows] = useState([]);
  const [warehouseRows, setWarehouseRows] = useState([]);
  const [leftoversRows, setLeftoversRows] = useState([]);
  const [warehouseSubView, setWarehouseSubView] = useState("sheets");
  const loadSeqRef = useRef(0);
  const loadInFlightRef = useRef(false);

  async function load() {
    // Не выходим при «занято»: иначе при смене вкладки во время запроса новый load не стартует,
    // старый ответ отбрасывается по seq — и список заказов может остаться пустым (Обзор/Производство).
    loadInFlightRef.current = true;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError("");
    try {
      let data;
      if (view === "shipment") {
        try {
          data = await callBackend("webGetShipmentBoard");
        } catch (_) {
          data = await callBackend("webGetShipmentTable");
        }
        try {
          const catalogData = await callBackend("webGetPlanCatalog");
          setPlanCatalogRows(Array.isArray(catalogData) ? catalogData : []);
        } catch (_) {
          setPlanCatalogRows([]);
        }
        try {
          const sectionsData = await callBackend("webGetSectionCatalog");
          setSectionCatalogRows(Array.isArray(sectionsData) ? sectionsData : []);
        } catch (_) {
          setSectionCatalogRows([]);
        }
        try {
          const articlesData = await callBackend("webGetSectionArticles");
          setSectionArticleRows(Array.isArray(articlesData) ? articlesData : []);
        } catch (_) {
          setSectionArticleRows([]);
        }
        try {
          const shipmentOrdersData = await callBackend("webGetOrdersAll");
          setShipmentOrders(Array.isArray(shipmentOrdersData) ? shipmentOrdersData.map(normalizeOrder) : []);
        } catch (_) {
          setShipmentOrders([]);
        }
      } else if (view === "overview") {
        data = await callBackend("webGetOrdersAll");
      } else if (view === "warehouse") {
        data = await callBackend("webGetMaterialsStock");
        try {
          const leftoversData = await callBackend("webGetLeftovers");
          setLeftoversRows(Array.isArray(leftoversData) ? leftoversData : []);
        } catch (_) {
          setLeftoversRows([]);
        }
      } else if (view === "labor") {
        data = await callBackend("webGetLaborTable");
      } else if (view === "stats") {
        try {
          data = await callBackend("webGetOrderStats");
        } catch (_) {
          data = await callBackend("webGetOrdersAll");
        }
      } else {
        // Для согласованности с "Обзор заказов" всегда берем полный список
        // и уже на фронте раскладываем по табам этапов.
        data = await callBackend("webGetOrdersAll");
      }
      // Игнорируем запоздавшие ответы, чтобы старая вкладка не перетирала новую.
      if (seq !== loadSeqRef.current) return;
      if (view === "shipment") {
        setShipmentBoard(normalizeShipmentBoard(data));
      } else if (view === "warehouse") {
        setWarehouseRows(Array.isArray(data) ? data : []);
      } else if (view === "labor") {
        setLaborRows(Array.isArray(data) ? data : []);
      } else {
        const normalizedRows = Array.isArray(data) ? data.map(normalizeOrder) : [];
        setRows(normalizedRows);
        if (view === "workshop" || view === "overview" || view === "stats") {
          setShipmentOrders(normalizedRows);
        }
        if (view === "workshop") {
          try {
            const boardData = await callBackend("webGetShipmentBoard");
            setShipmentBoard(normalizeShipmentBoard(boardData));
          } catch (_) {
            // keep previous shipment board snapshot
          }
        }
      }
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setError(toUserError(e));
    } finally {
      loadInFlightRef.current = false;
      if (seq !== loadSeqRef.current) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (view === "workshop") setRows([]);
    if (view === "shipment") setShipmentBoard({ sections: [] });
    if (view === "warehouse") {
      setWarehouseRows([]);
      setLeftoversRows([]);
    }
    if (view === "labor") setLaborRows([]);
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [tab, view]);

  useEffect(() => {
    if (view !== "overview") setOverviewSubView("kanban");
  }, [view]);
  useEffect(() => {
    if (view !== "warehouse") setWarehouseSubView("sheets");
  }, [view]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("shipmentUiPrefs");
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs && typeof prefs === "object") {
        if (typeof prefs.weekFilter === "string") setWeekFilter(prefs.weekFilter);
        if (typeof prefs.shipmentSort === "string") setShipmentSort(prefs.shipmentSort);
        if (typeof prefs.showAwaiting === "boolean") setShowAwaiting(prefs.showAwaiting);
        if (typeof prefs.showOnPilka === "boolean") setShowOnPilka(prefs.showOnPilka);
        if (typeof prefs.showOnKromka === "boolean") setShowOnKromka(prefs.showOnKromka);
        if (typeof prefs.showOnPras === "boolean") setShowOnPras(prefs.showOnPras);
        if (typeof prefs.showReadyAssembly === "boolean") setShowReadyAssembly(prefs.showReadyAssembly);
        if (typeof prefs.showAwaitShipment === "boolean") setShowAwaitShipment(prefs.showAwaitShipment);
        if (typeof prefs.showShipped === "boolean") setShowShipped(prefs.showShipped);
        if (typeof prefs.showOnlyEmpty === "boolean") setShowAwaiting(prefs.showOnlyEmpty);
        if (typeof prefs.showCompletedRedCells === "boolean") setShowShipped(prefs.showCompletedRedCells);
        if (prefs.collapsedSections && typeof prefs.collapsedSections === "object") {
          setCollapsedSections(prefs.collapsedSections);
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    try {
      const savedScale = localStorage.getItem(UI_SCALE_STORAGE_KEY);
      if (savedScale === "standard" || savedScale === "large") {
        setUiScale(savedScale);
      }
    } catch (_) {}
  }, []);

  function resetShipmentFilters() {
    setWeekFilter(DEFAULT_SHIPMENT_PREFS.weekFilter);
    setShipmentSort(DEFAULT_SHIPMENT_PREFS.shipmentSort);
    setShowAwaiting(DEFAULT_SHIPMENT_PREFS.showAwaiting);
    setShowOnPilka(DEFAULT_SHIPMENT_PREFS.showOnPilka);
    setShowOnKromka(DEFAULT_SHIPMENT_PREFS.showOnKromka);
    setShowOnPras(DEFAULT_SHIPMENT_PREFS.showOnPras);
    setShowReadyAssembly(DEFAULT_SHIPMENT_PREFS.showReadyAssembly);
    setShowAwaitShipment(DEFAULT_SHIPMENT_PREFS.showAwaitShipment);
    setShowShipped(DEFAULT_SHIPMENT_PREFS.showShipped);
    setCollapsedSections(DEFAULT_SHIPMENT_PREFS.collapsedSections);
  }

  useEffect(() => {
    try {
      localStorage.setItem(
        "shipmentUiPrefs",
        JSON.stringify({
          weekFilter,
          shipmentSort,
          showAwaiting,
          showOnPilka,
          showOnKromka,
          showOnPras,
          showReadyAssembly,
          showAwaitShipment,
          showShipped,
          collapsedSections,
        })
      );
    } catch (_) {}
  }, [
    weekFilter,
    shipmentSort,
    showAwaiting,
    showOnPilka,
    showOnKromka,
    showOnPras,
    showReadyAssembly,
    showAwaitShipment,
    showShipped,
    collapsedSections,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(UI_SCALE_STORAGE_KEY, uiScale);
    } catch (_) {}
  }, [uiScale]);

  function sectionCollapseKey(name) {
    return `${shipmentSort}:${String(name || "")}`;
  }

  function isSectionCollapsed(name) {
    return !!collapsedSections[sectionCollapseKey(name)];
  }

  function toggleSectionCollapsed(name) {
    const key = sectionCollapseKey(name);
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function isDone(s) {
    const v = String(s || "").toLowerCase();
    return v.includes("готов") || v.includes("собрано");
  }
  function getCurrentStage(order) {
    return getStageLabel(order);
  }
  function getColorGroup(item) {
    const text = String(item || "").trim();
    if (!text) return "Без цвета";
    const parts = text.split(".").map((x) => String(x || "").trim()).filter(Boolean);
    const tail = String(parts[parts.length - 1] || "").trim();
    return tail || "Без цвета";
  }
  function resolvePlanMaterial(articleRow) {
    const fromApi = String(articleRow?.material || "").trim();
    if (fromApi) return fromApi;
    const itemName = String(articleRow?.itemName || "").trim();
    const parsedColor = getColorGroup(itemName);
    if (parsedColor && parsedColor !== "Без цвета") return parsedColor;
    return "";
  }
  function getWeekday(order) {
    const d = new Date(order?.createdAt || "");
    if (!isFinite(d.getTime())) return "Неизвестно";
    return d.toLocaleDateString("ru-RU", { weekday: "long" });
  }
  function getStageClassByLabel(label) {
    const s = String(label || "").toLowerCase();
    if (s.includes("отгруж")) return "ship";
    if (s.includes("отправ") && !s.includes("готово к отправке")) return "ship";
    if (s.includes("собран")) return "done";
    if (s.includes("готов")) return "ready";
    if (s.includes("присад")) return "pras";
    if (s.includes("кром")) return "kromka";
    return "pilka";
  }
  function isInWork(s) {
    return String(s || "").toLowerCase().includes("в работе");
  }

  function closeConsumeDialog() {
    setConsumeDialogOpen(false);
    setConsumeEditMode(false);
    setConsumeDialogData(null);
    setConsumeMaterial("");
    setConsumeQty("");
    setConsumeError("");
    setConsumeSaving(false);
    setConsumeLoading(false);
  }

  async function submitConsume(materialRaw, qtyRaw) {
    if (!consumeDialogData?.orderId) return;
    const material = String(materialRaw || "").trim();
    const qty = Number(String(qtyRaw || "").replace(",", "."));
    if (!material) return setConsumeError("Укажите материал");
    if (!isFinite(qty) || qty <= 0) return setConsumeError("Некорректное количество");
    setConsumeSaving(true);
    setConsumeError("");
    try {
      await callBackend("webConsumeSheetsByOrderId", {
        orderId: consumeDialogData.orderId,
        material,
        qty,
      });
      closeConsumeDialog();
      await load();
    } catch (e) {
      setConsumeError(String(e.message || e));
    } finally {
      setConsumeSaving(false);
    }
  }

  async function notifyAssemblyReadyTelegram(meta = {}) {
    const baseUrl = String(SUPABASE_URL || "").replace(/\/$/, "");
    const token = String(SUPABASE_ANON_KEY || "").trim();
    if (!baseUrl || !token) return;
    try {
      await fetch(`${baseUrl}/functions/v1/notify-assembly-ready`, {
        method: "POST",
        headers: {
          apikey: token,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: String(meta.orderId || "").trim(),
          item: String(meta.item || "").trim(),
          material: String(meta.material || "").trim(),
          week: String(meta.week || "").trim(),
          qty: Number(meta.qty || 0),
          executor: String(meta.executor || "").trim(),
        }),
      });
    } catch (_) {
      // Notification is best-effort and should not block production workflow.
    }
  }

  async function notifyFinalStageTelegram(meta = {}) {
    const baseUrl = String(SUPABASE_URL || "").replace(/\/$/, "");
    const token = String(SUPABASE_ANON_KEY || "").trim();
    if (!baseUrl || !token) return;
    try {
      await fetch(`${baseUrl}/functions/v1/notify-assembly-ready`, {
        method: "POST",
        headers: {
          apikey: token,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stage: "final_done",
          orderId: String(meta.orderId || "").trim(),
          item: String(meta.item || "").trim(),
          material: String(meta.material || "").trim(),
          week: String(meta.week || "").trim(),
          qty: Number(meta.qty || 0),
          executor: String(meta.executor || "").trim(),
        }),
      });
    } catch (_) {
      // Notification is best-effort and should not block production workflow.
    }
  }

  async function runAction(action, orderId, payload = {}, meta = {}) {
    const key = `${action}:${orderId}`;
    setActionLoading(key);
    setError("");
    try {
      const data = await callBackend(action, { orderId, ...payload });
      if (action === "webSetPrasDone" && meta.notifyOnAssembly) {
        notifyAssemblyReadyTelegram({
          orderId,
          item: meta.item,
          material: meta.material,
          week: meta.week,
          qty: meta.qty,
          executor: meta.executor,
        });
      }
      if (action === "webSetShippingDone" && meta.notifyOnFinalStage) {
        notifyFinalStageTelegram({
          orderId,
          item: meta.item,
          material: meta.material,
          week: meta.week,
          qty: meta.qty,
          executor: meta.executor,
        });
      }
      if (action === "webSetPilkaDone") {
        const isPlankOrder = !!meta.isPlankOrder;
        const defaultQty = Number(meta.defaultSheets || 0) > 0 ? String(Number(meta.defaultSheets || 0)) : "";
        // Открываем диалог сразу, а подсказки подтягиваем в фоне.
        setConsumeDialogData({ orderId, item: String(meta.item || ""), suggestedMaterial: "", materials: [] });
        setConsumeMaterial(isPlankOrder ? "Черный" : "");
        setConsumeQty(defaultQty);
        setConsumeEditMode(true);
        setConsumeError("");
        setConsumeLoading(true);
        setConsumeDialogOpen(true);
        if (view === "workshop" && tab === "pilka") {
          setTab("kromka");
        }

        // Не блокируем UI ожиданием подсказок.
        callBackend("webGetConsumeOptions", { orderId })
          .then((options) => {
            setConsumeDialogData(options || { orderId });
            const suggested = isPlankOrder
              ? "Черный"
              : String(options?.suggestedMaterial || meta.material || "").trim();
            if (suggested) setConsumeMaterial(suggested);
            const suggestedSheetsRaw = options?.suggestedSheets ?? options?.sheetsNeeded ?? defaultQty ?? 0;
            const suggestedSheets = Number(suggestedSheetsRaw);
            if (Number.isFinite(suggestedSheets) && suggestedSheets > 0) {
              setConsumeQty((prev) => {
                const prevNum = Number(String(prev || "").replace(",", "."));
                if (Number.isFinite(prevNum) && prevNum > 0) return prev;
                return String(suggestedSheets);
              });
            }
            if (!isPlankOrder && suggested) setConsumeEditMode(false);
          })
          .catch(() => {
            // Оставляем ручной режим без подсказок.
          })
          .finally(() => setConsumeLoading(false));

        await load();
        return;
      }
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }

  const weeks = useMemo(() => {
    if (view === "shipment") {
      const set = new Set();
      (shipmentBoard.sections || []).forEach((s) =>
        (s.items || []).forEach((it) =>
          (it.cells || []).forEach((c) => c.week && set.add(String(c.week)))
        )
      );
      return [...set].sort((a, b) => Number(a) - Number(b));
    }
    if (view === "labor") {
      return [...new Set(laborRows.map((x) => String(x.week || "")).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    }
    return [...new Set(rows.map((x) => String(x.week || "")).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  }, [rows, shipmentBoard, laborRows, view]);
  const planCatalogBySection = useMemo(() => {
    const map = {};
    // Base options from current shipment cells.
    (shipmentBoard.sections || []).forEach((s) => {
      const section = String(s?.name || "").trim();
      if (!section) return;
      (s.items || []).forEach((it) => {
        const itemName = String(it?.item || "").trim();
        if (!itemName) return;
        const materialLabel = getMaterialLabel(itemName, it?.material);
        if (!map[section]) map[section] = [];
        const exists = map[section].some((x) => normText(x.material) === normText(materialLabel));
        if (!exists) map[section].push({ material: materialLabel, itemName });
      });
      map[section].sort((a, b) => a.material.localeCompare(b.material, "ru"));
    });
    // Merge full catalog so materials are available even without active shipment rows.
    (planCatalogRows || []).forEach((row) => {
      const section = String(row?.section_name || row?.sectionName || "").trim();
      const itemName = String(row?.item_name || row?.itemName || "").trim();
      const material = String(row?.material || "").trim();
      if (!section || !itemName || !material) return;
      if (!map[section]) map[section] = [];
      const exists = map[section].some((x) => normText(x.material) === normText(material));
      if (!exists) map[section].push({ material, itemName });
    });
    Object.keys(map).forEach((section) => {
      map[section].sort((a, b) => a.material.localeCompare(b.material, "ru"));
    });
    return map;
  }, [shipmentBoard, planCatalogRows]);
  const shipmentSectionNames = useMemo(() => {
    const names = Object.keys(planCatalogBySection).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ru"));
  }, [planCatalogBySection]);
  const sectionCatalogNames = useMemo(() => {
    return (sectionCatalogRows || [])
      .map((x) => String(x.section_name || x.sectionName || "").trim())
      .filter(Boolean);
  }, [sectionCatalogRows]);
  const sectionOptions = useMemo(() => {
    return [...sectionCatalogNames, ...shipmentSectionNames, "Прочее"]
      .filter((v, i, a) => a.indexOf(v) === i);
  }, [sectionCatalogNames, shipmentSectionNames]);
  const sectionArticles = useMemo(() => {
    const hasWhiteAliasSection = sectionOptions.includes(`${planSection} белый`);
    const rows = (sectionArticleRows || [])
      .map((x) => ({
        sectionName: String(x.section_name || x.sectionName || "").trim(),
        article: String(x.article || "").trim(),
        itemName: normalizeCatalogItemName(String(x.item_name || x.itemName || "").trim()),
        material: String(x.material || "").trim(),
      }))
      .filter((x) => x.sectionName === planSection && x.article && x.itemName)
      .filter((x) => {
        if (!hasWhiteAliasSection) return true;
        return !/(белый|белые ноги)/i.test(x.itemName);
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName, "ru"));
    const byItemName = new Map();
    rows.forEach((row) => {
      const dedupKey = normalizeCatalogDedupKey(row.itemName);
      if (!byItemName.has(dedupKey)) {
        byItemName.set(dedupKey, row);
      }
    });
    return [...byItemName.values()];
  }, [sectionArticleRows, planSection, sectionOptions]);
  const selectedArticleRow = useMemo(() => {
    return sectionArticles.find((x) => x.itemName === planArticle) || null;
  }, [sectionArticles, planArticle]);
  const resolvedPlanItem = useMemo(() => {
    return String(selectedArticleRow?.itemName || "").trim();
  }, [selectedArticleRow]);

  const shipmentOrderMaps = useMemo(() => {
    const byRowWeek = new Map();
    const byItemWeek = new Map();
    (shipmentOrders || []).forEach((o) => {
      const week = String(o?.week || "").trim();
      if (!week) return;
      const sourceRow = String(o?.source_row_id || o?.sourceRowId || "").trim();
      if (sourceRow) mergeOrderPreferNewer(byRowWeek, shipmentOrderKey(sourceRow, week), o);
      const item = String(o?.item || "").trim();
      if (item) mergeOrderPreferNewer(byItemWeek, shipmentOrderItemWeekKey(item, week), o);
    });
    return { byRowWeek, byItemWeek };
  }, [shipmentOrders]);

  function passesShipmentStageFilter(stageKey) {
    if (stageKey === "awaiting") return showAwaiting;
    if (stageKey === "on_pilka_wait" || stageKey === "on_pilka_work") return showOnPilka;
    if (stageKey === "on_kromka_wait" || stageKey === "on_kromka_work") return showOnKromka;
    if (stageKey === "on_pras_wait" || stageKey === "on_pras_work") return showOnPras;
    if (stageKey === "ready_assembly") return showReadyAssembly;
    if (stageKey === "assembled_wait_ship") return showAwaitShipment;
    if (stageKey === "shipped") return showShipped;
    return true;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (view === "shipment") {
      return (shipmentBoard.sections || [])
        .filter((s) => !isStorageLikeName(s.name))
        .map((s) => ({
          ...s,
          items: (s.items || []).filter((it) => {
            if (isStorageLikeName(it.item)) return false;
            if (isGarbageShipmentItemName(it.item)) return false;
            const sourceRow = it.sourceRowId != null ? String(it.sourceRowId) : String(it.row);
            const visibleCells = (it.cells || []).filter((c) => {
              const qtyOk = (Number(c.qty) || 0) > 0;
              if (!qtyOk) return false;
              const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item);
              return passesShipmentStageFilter(stageKey);
            });
            const byWeek = weekFilter === "all" || visibleCells.some((c) => String(c.week || "") === weekFilter);
            const byQuery = !q || String(it.item || "").toLowerCase().includes(q);
            return byWeek && byQuery && visibleCells.length > 0;
          }),
        }))
        .filter((s) => s.items.length > 0);
    }
    if (view === "labor") {
      return laborRows.filter((x) => {
        const byWeek = weekFilter === "all" || String(x.week || "") === weekFilter;
        const byQuery =
          !q ||
          String(x.item || "").toLowerCase().includes(q) ||
          String(x.order_id || x.orderId || "").toLowerCase().includes(q);
        return byWeek && byQuery;
      });
    }
    return rows.filter((x) => {
      // Скрываем тех/мусорные позиции во вкладках заказов (Производство/Обзор/Статистика).
      if (isStorageLikeName(x.item) || isGarbageShipmentItemName(x.item)) return false;
      const byWeek = weekFilter === "all" || String(x.week || "") === weekFilter;
      const byQuery =
        !q ||
        String(x.item || "").toLowerCase().includes(q) ||
        String(x.orderId || x.order_id || "").toLowerCase().includes(q);
      if (!byWeek || !byQuery) return false;
      if (view === "stats" || view === "overview") return true;
      // Производство: те же «дорожки», что и в «Обзор заказов» (pipeline), иначе вкладки и канбан расходятся.
      if (tab === "pilka") return getOverviewLaneId(x) === "pilka";
      if (tab === "kromka") return getOverviewLaneId(x) === "kromka";
      if (tab === "pras") return getOverviewLaneId(x) === "pras";
      return true;
    });
  }, [
    rows,
    shipmentBoard,
    shipmentOrderMaps,
    laborRows,
    view,
    tab,
    query,
    weekFilter,
    shipmentSort,
    showAwaiting,
    showOnPilka,
    showOnKromka,
    showOnPras,
    showReadyAssembly,
    showAwaitShipment,
    showShipped,
  ]);

  const overviewShippedOnly = useMemo(() => {
    if (view !== "overview") return [];
    return filtered.filter((x) => getOverviewLaneId(x) === "shipped");
  }, [view, filtered]);

  function visibleCellsForItem(it) {
    const sourceRow = it?.sourceRowId != null ? String(it.sourceRowId) : String(it?.row || "");
    return (it?.cells || []).filter((c) => {
      const qtyOk = (Number(c.qty) || 0) > 0;
      if (!qtyOk) return false;
      const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item);
      return passesShipmentStageFilter(stageKey);
    });
  }

  function weekSortValue(it) {
    const arr = visibleCellsForItem(it)
      .map((c) => Number(c.week))
      .filter((n) => Number.isFinite(n));
    if (!arr.length) return 9999;
    return Math.min(...arr);
  }

  function colorSortValue(it) {
    return normText(it?.material || "");
  }

  function sortItemsForShipment(items) {
    const arr = [...(items || [])];
    arr.sort((a, b) => {
      if (shipmentSort === "week") {
        const wa = weekSortValue(a);
        const wb = weekSortValue(b);
        if (wa !== wb) return wa - wb;
      } else if (shipmentSort === "color") {
        const wa = weekSortValue(a);
        const wb = weekSortValue(b);
        if (wa !== wb) return wa - wb;
        const ca = colorSortValue(a);
        const cb = colorSortValue(b);
        if (ca !== cb) return ca.localeCompare(cb, "ru");
      }
      return String(a.item || "").localeCompare(String(b.item || ""), "ru");
    });
    return arr;
  }

  const shipmentRenderSections = useMemo(() => {
    if (view !== "shipment") return [];

    // Режим "по названию": текущие секции по моделям (как было).
    if (shipmentSort === "name") {
      return [...filtered]
        .sort((a, b) => {
          const ka = sectionSortKey(a.name);
          const kb = sectionSortKey(b.name);
          if (ka !== kb) return ka - kb;
          return String(a.name || "").localeCompare(String(b.name || ""), "ru");
        })
        .map((section) => ({
          name: section.name,
          items: sortItemsForShipment(section.items || []),
        }));
    }

    // Для режимов "по цвету" и "по неделе" убираем секции по моделям.
    const groups = {};
    (filtered || []).forEach((section) => {
      (section.items || []).forEach((it) => {
        const visibleCells = visibleCellsForItem(it);
        if (!visibleCells.length) return;

        if (shipmentSort === "color") {
          const key = String(it.material || "Материал не указан").trim() || "Материал не указан";
          if (!groups[key]) groups[key] = [];
          groups[key].push({ ...it, cells: visibleCells });
          return;
        }

        // shipmentSort === "week"
        visibleCells.forEach((cell) => {
          const wk = String(cell.week || "-").trim() || "-";
          const key = `Неделя ${wk}`;
          if (!groups[key]) groups[key] = {};
          const rowKey = String(it.row);
          if (!groups[key][rowKey]) groups[key][rowKey] = { ...it, cells: [] };
          groups[key][rowKey].cells.push(cell);
        });
      });
    });

    if (shipmentSort === "color") {
      return Object.keys(groups)
        .sort((a, b) => a.localeCompare(b, "ru"))
        .map((name) => ({
          name,
          items: sortItemsForShipment(groups[name]),
        }));
    }

    return Object.keys(groups)
      .sort((a, b) => {
        const na = Number(String(a).replace(/[^\d]/g, ""));
        const nb = Number(String(b).replace(/[^\d]/g, ""));
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return String(a).localeCompare(String(b), "ru");
      })
      .map((name) => ({
        name,
        items: sortItemsForShipment(Object.values(groups[name])),
      }));
  }, [view, shipmentSort, filtered]);

  const strapRenderSections = useMemo(() => {
    if (view !== "shipment" || !strapItems.length) return [];
    const rows = strapItems.map((x, idx) => {
      const blackByColorSort = shipmentSort === "color";
      return {
        row: `strap:${idx}`,
        item: x.name,
        material: "Черный",
        cells: [
          {
            col: 1,
            week: "-",
            qty: Number(x.qty || 0),
            bg: blackByColorSort ? "#111111" : "#ffffff",
            canSendToWork: true,
            inWork: false,
            sheetsNeeded: 0,
            note: "Обвязка: готово к работе",
          },
        ],
      };
    });
    const sectionName = shipmentSort === "color" ? "Черный" : "Обвязка";
    return [{ name: sectionName, items: rows }];
  }, [view, strapItems, shipmentSort]);

  const kpi = useMemo(() => {
    const total = filtered.length;
    const stageWork = (o) => {
      if (view !== "workshop") return statusClass(o) === "work";
      if (tab === "pilka") return isInWork(o.pilkaStatus);
      if (tab === "kromka") return isInWork(o.kromkaStatus);
      if (tab === "pras") return isInWork(o.prasStatus);
      if (tab === "assembly") return isInWork(o.assemblyStatus);
      if (tab === "done") return false;
      return isInWork(o.pilkaStatus) || isInWork(o.kromkaStatus) || isInWork(o.prasStatus);
    };
    const onPause = (s) => String(s || "").toLowerCase().includes("пауза");
    const stagePause = (o) => {
      if (view !== "workshop") return statusClass(o) === "pause";
      if (tab === "pilka") return onPause(o.pilkaStatus);
      if (tab === "kromka") return onPause(o.kromkaStatus);
      if (tab === "pras") return onPause(o.prasStatus);
      if (tab === "assembly") return onPause(o.assemblyStatus);
      if (tab === "done") return false;
      return onPause(o.pilkaStatus) || onPause(o.kromkaStatus) || onPause(o.prasStatus);
    };
    const work = filtered.filter(stageWork).length;
    const paused = filtered.filter(stagePause).length;
    const done =
      view === "workshop"
        ? filtered.filter((x) => resolvePipelineStage(x) === PipelineStage.ASSEMBLED).length
        : filtered.filter((x) => TERMINAL_PIPELINE_STAGES.has(resolvePipelineStage(x))).length;
    return { total, work, paused, done };
  }, [filtered, view, tab]);
  const statsGroups = useMemo(() => {
    if (view !== "stats") return [];
    const map = {};
    filtered.forEach((o) => {
      let key = "";
      if (statsSort === "stage") key = getCurrentStage(o);
      else if (statsSort === "readiness") {
        const cls = statusClass(o);
        key = cls === "done" ? "Готово" : cls === "work" ? "В работе" : cls === "pause" ? "Пауза" : "Ожидание";
      } else if (statsSort === "color") key = getColorGroup(o.item);
      else key = getWeekday(o);
      if (!map[key]) map[key] = { key, count: 0, qty: 0, orders: [] };
      map[key].count += 1;
      map[key].qty += Number(o.qty || 0);
      map[key].orders.push(o);
    });
    return Object.values(map).sort((a, b) => String(a.key).localeCompare(String(b.key), "ru"));
  }, [filtered, view, tab, statsSort]);
  const statsList = useMemo(() => {
    if (view !== "stats") return [];
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (statsSort === "stage") {
        const sa = getStageLabel(a);
        const sb = getStageLabel(b);
        if (sa !== sb) return sa.localeCompare(sb, "ru");
      } else if (statsSort === "readiness") {
        const ra = statusClass(a);
        const rb = statusClass(b);
        if (ra !== rb) return ra.localeCompare(rb, "ru");
      } else if (statsSort === "color") {
        const ca = getColorGroup(a.item);
        const cb = getColorGroup(b.item);
        if (ca !== cb) return ca.localeCompare(cb, "ru");
      } else if (statsSort === "weekday") {
        const wa = getWeekday(a);
        const wb = getWeekday(b);
        if (wa !== wb) return wa.localeCompare(wb, "ru");
      }
      return String(a.item || "").localeCompare(String(b.item || ""), "ru");
    });
    return arr;
  }, [filtered, view, statsSort]);
  const workshopRows = useMemo(() => {
    if (view !== "workshop" || tab === "stats") return [];
    const arr = [...filtered].filter((o) => {
      const pilkaStatus = String(o.pilkaStatus || o.pilka || "");
      const kromkaStatus = String(o.kromkaStatus || o.kromka || "");
      const prasStatus = String(o.prasStatus || o.pras || "");
      const assemblyStatus = String(o.assemblyStatus || "");
      const overallStatus = String(o.overallStatus || o.overall || "");
      const pilkaDone = isDone(pilkaStatus);
      const kromkaDone = isDone(kromkaStatus);
      const prasDone = isDone(prasStatus);
      const assemblyDone = isDone(assemblyStatus);
      const shipped = isOrderCustomerShipped(o);
      const onPackaging = /упаков/i.test(overallStatus);
      const lane = getOverviewLaneId(o);
      if (tab === "pilka") return lane === "pilka";
      if (tab === "kromka") return lane === "kromka";
      if (tab === "pras") return lane === "pras";
      if (tab === "assembly") return pilkaDone && kromkaDone && prasDone && !assemblyDone && !shipped;
      if (tab === "done") return assemblyDone && !onPackaging && !shipped;
      return true;
    });
    const isRowInWork = (o) => {
      if (tab === "pilka") return isInWork(o.pilkaStatus);
      if (tab === "kromka") return isInWork(o.kromkaStatus);
      if (tab === "pras") return isInWork(o.prasStatus);
      if (tab === "assembly") return isInWork(o.assemblyStatus);
      if (tab === "done") return false;
      return isInWork(o.pilkaStatus) || isInWork(o.kromkaStatus) || isInWork(o.prasStatus);
    };
    arr.sort((a, b) => {
      const aw = isRowInWork(a) ? 1 : 0;
      const bw = isRowInWork(b) ? 1 : 0;
      if (aw !== bw) return bw - aw; // "В работе" вверху
      return String(a.item || "").localeCompare(String(b.item || ""), "ru");
    });
    return arr;
  }, [filtered, view, tab]);
  const overviewColumns = useMemo(() => {
    if (view !== "overview") return [];
    const defs = [
      { id: "pilka", title: "Пила" },
      { id: "kromka", title: "Кромка" },
      { id: "pras", title: "Присадка" },
      { id: "workshop_complete", title: "Готов к сборке" },
      { id: "assembled", title: "Собран" },
      { id: "ready_to_ship", title: "Готово к отправке" },
      { id: "shipped", title: "Отгружено" },
    ];
    const grouped = Object.fromEntries(defs.map((x) => [x.id, []]));
    (filtered || []).forEach((o) => {
      const lane = getOverviewLaneId(o);
      if (!grouped[lane]) grouped[lane] = [];
      grouped[lane].push(o);
    });
    defs.forEach((d) => {
      grouped[d.id].sort((a, b) => String(a.item || "").localeCompare(String(b.item || ""), "ru"));
    });
    return defs.map((d) => ({ ...d, items: grouped[d.id] || [] }));
  }, [filtered, view]);
  const shipmentKpi = useMemo(() => {
    if (view !== "shipment") return { totalOrders: 0, totalQty: 0, readyAssembly: 0, assembled: 0 };
    let totalOrders = 0;
    let totalQty = 0;
    let readyAssembly = 0;
    let assembled = 0;
    (filtered || []).forEach((s) => {
      (s.items || []).forEach((it) => {
        (it.cells || []).forEach((c) => {
          totalOrders += 1;
          totalQty += Number(c.qty) || 0;
          if (c.canSendToWork) readyAssembly += 1;
          if (c.inWork) assembled += 1;
        });
      });
    });
    return { totalOrders, totalQty, readyAssembly, assembled };
  }, [filtered, view]);
  const shipmentTableRows = useMemo(() => {
    if (view !== "shipment") return [];
    const rowsFlat = [];
    shipmentRenderSections.forEach((section) => {
      (section.items || []).forEach((it) => {
        visibleCellsForItem(it).forEach((c) => {
          const sourceRow = it.sourceRowId != null ? String(it.sourceRowId) : String(it.row);
          const sourceCol = c.sourceColId != null ? String(c.sourceColId) : String(c.col);
          const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item);
          const displayBg = stageBg(stageKey, c.bg || "#ffffff");
          rowsFlat.push({
            key: `${sourceRow}-${sourceCol}`,
            section: section.name,
            item: it.item,
            material: it.material || "",
            week: c.week || "-",
            qty: Number(c.qty || 0),
            sheets: Number(c.sheetsNeeded || 0),
            outputPerSheet: Number(c.outputPerSheet || 0),
            availableSheets: Number(c.availableSheets || 0),
            bg: displayBg,
            status: stageLabel(stageKey),
            stageKey,
            canSendToWork: !!c.canSendToWork,
            inWork: !!c.inWork,
            sourceRow,
            sourceCol,
          });
        });
      });
    });
    return rowsFlat;
  }, [view, shipmentRenderSections, shipmentOrderMaps]);
  const laborTableRows = useMemo(() => {
    if (view !== "labor") return [];
    const toNum = (v) => Number(v || 0);
    const list = [...filtered].map((x) => ({
      orderId: String(x.order_id || x.orderId || ""),
      item: String(x.item || ""),
      week: String(x.week || ""),
      qty: toNum(x.qty),
      pilkaMin: toNum(x.pilka_min ?? x.pilkaMin),
      kromkaMin: toNum(x.kromka_min ?? x.kromkaMin),
      prasMin: toNum(x.pras_min ?? x.prasMin),
      assemblyMin: toNum(x.assembly_min ?? x.assemblyMin),
      totalMin: toNum(x.total_min ?? x.totalMin),
      dateFinished: String(x.date_finished || x.dateFinished || ""),
    }));
    list.sort((a, b) => {
      if (laborSort === "total_asc") return a.totalMin - b.totalMin;
      if (laborSort === "week") return Number(a.week || 0) - Number(b.week || 0);
      if (laborSort === "item") return a.item.localeCompare(b.item, "ru");
      return b.totalMin - a.totalMin;
    });
    return list;
  }, [filtered, laborSort, view]);
  const laborKpi = useMemo(() => {
    const totalOrders = laborTableRows.length;
    const totalMinutes = laborTableRows.reduce((sum, x) => sum + x.totalMin, 0);
    const totalQty = laborTableRows.reduce((sum, x) => sum + x.qty, 0);
    const avgPerOrder = totalOrders > 0 ? totalMinutes / totalOrders : 0;
    return { totalOrders, totalMinutes, totalQty, avgPerOrder };
  }, [laborTableRows]);
  const warehouseTableRows = useMemo(() => {
    if (view !== "warehouse") return [];
    const q = String(query || "").trim().toLowerCase();
    return [...warehouseRows]
      .map((x) => ({
        material: String(x.material || ""),
        qtySheets: Number(x.qty_sheets ?? x.qtySheets ?? 0),
        sizeLabel: String(x.size_label || x.sizeLabel || ""),
        widthMm: Number(x.sheet_width_mm ?? x.sheetWidthMm ?? 0),
        heightMm: Number(x.sheet_height_mm ?? x.sheetHeightMm ?? 0),
        updatedAt: String(x.updated_at || x.updatedAt || ""),
      }))
      .filter((x) => !q || x.material.toLowerCase().includes(q))
      .sort((a, b) => a.material.localeCompare(b.material, "ru"));
  }, [query, view, warehouseRows]);
  const leftoversTableRows = useMemo(() => {
    if (view !== "warehouse") return [];
    return [...leftoversRows]
      .map((x) => ({
        orderId: String(x.orderId || x.order_id || ""),
        item: String(x.item || ""),
        material: String(x.material || ""),
        sheetsNeeded: Number(x.sheetsNeeded || x.sheets_needed || 0),
        leftoverFormat: String(x.leftoverFormat || x.leftover_format || ""),
        leftoversQty: Number(x.leftoversQty || x.leftovers_qty || 0),
        createdAt: String(x.createdAt || x.created_at || ""),
      }))
      .filter((x) => {
        const q = String(query || "").trim().toLowerCase();
        return !q || x.item.toLowerCase().includes(q) || x.orderId.toLowerCase().includes(q) || x.material.toLowerCase().includes(q);
      })
      .sort((a, b) => a.item.localeCompare(b.item, "ru"));
  }, [leftoversRows, query, view]);

  const selectedShipmentSummary = useMemo(() => {
    const items = selectedShipments.map((s) => {
      const qty = Number(s.qty || 0);
      const sheetsRaw = Number(s.sheetsNeeded || 0);
      const outputPerSheet = Number(s.outputPerSheet || 0);
      const sheetsNeeded =
        sheetsRaw > 0
          ? sheetsRaw
          : (outputPerSheet > 0 && qty > 0 ? Math.ceil(qty / outputPerSheet) : 0);
      const material = String(s.material || "Материал не указан");
      return { ...s, qty, sheetsNeeded, material, outputPerSheet, sheetsExact: sheetsRaw > 0 };
    });
    const byMaterial = {};
    let totalSheets = 0;
    items.forEach((x) => {
      totalSheets += x.sheetsNeeded;
      byMaterial[x.material] = (byMaterial[x.material] || 0) + x.sheetsNeeded;
    });
    const materials = Object.keys(byMaterial)
      .sort((a, b) => a.localeCompare(b, "ru"))
      .map((m) => ({ material: m, sheets: byMaterial[m] }));
    return {
      items,
      materials,
      selectedCount: items.length,
      totalSheets,
    };
  }, [selectedShipments]);
  const sendableSelectedCount = useMemo(
    () => selectedShipments.filter((x) => !!x.canSendToWork).length,
    [selectedShipments]
  );

  const strapCalculation = useMemo(() => {
    const lines = [];
    let totalSheets = 0;
    for (const x of strapItems) {
      const size = parseStrapSize(x.name);
      const qty = Number(x.qty || 0);
      if (!size || !(qty > 0)) continue;
      const stripsPerSheet = Math.floor(STRAP_SHEET_HEIGHT / size.width);
      const perStrip = Math.floor(STRAP_SHEET_WIDTH / size.length);
      const perSheet = stripsPerSheet * perStrip;
      if (perSheet <= 0) {
        lines.push({ name: x.name, qty, perSheet: 0, sheets: 0, invalid: true });
        continue;
      }
      const sheets = Math.ceil(qty / perSheet);
      totalSheets += sheets;
      lines.push({ name: x.name, qty, perSheet, sheets, invalid: false });
    }
    return { lines, totalSheets };
  }, [strapItems]);

  async function sendSelectedShipmentToWork() {
    if (shipmentTab === "straps") {
      if (!strapItems.length) return;
      setActionLoading("shipment:bulk");
      setError("");
      try {
        const res = await callBackend("webSendPlanksToWork", { items: strapItems });
        const added = Number(res?.added || 0);
        setStrapItems([]);
        setPlanPreviews([]);
        setSelectedShipments([]);
        await load();
        setView("workshop");
        setTab("pilka");
        if (added <= 0) setError("Позиции уже были в заказах и не добавлены повторно.");
      } catch (e) {
        setError(toUserError(e));
      } finally {
        setActionLoading("");
      }
      return;
    }
    if (!selectedShipments.length) return;
    const sendable = selectedShipments.filter((s) => !!s.canSendToWork);
    if (!sendable.length) {
      setError("Среди выбранных ячеек нет доступных для отправки в работу.");
      return;
    }
    setActionLoading("shipment:bulk");
    setError("");
    try {
      for (const s of sendable) {
        const attempts = [
          { row: s.row, col: s.col },
          { row: s.rawRow, col: s.rawCol },
          { row: s.row, col: s.weekCol },
          { row: s.rawRow, col: s.weekCol },
        ].filter((x) => x.row != null && x.col != null && String(x.row).trim() && String(x.col).trim());
        let sent = false;
        let lastErr = null;
        try {
          for (const p of attempts) {
            try {
              await callBackend("webSendShipmentToWork", { row: p.row, col: p.col });
              sent = true;
              break;
            } catch (e) {
              lastErr = e;
              if (!isShipmentCellMissingError(e)) throw e;
            }
          }
          if (!sent) throw lastErr || new Error("Shipment cell not found");
        } catch (e) {
          throw e;
        }
      }
      setPlanPreviews([]);
      setSelectedShipments([]);
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }

  async function deleteSelectedShipmentPlan() {
    if (!selectedShipments.length) return;
    const deletable = selectedShipments.filter((s) => !!s.canSendToWork);
    if (!deletable.length) {
      setError("Среди выбранных ячеек нет доступных для удаления из плана.");
      return;
    }
    const ok = window.confirm(`Удалить ${deletable.length} поз. из плана? Это действие необратимо.`);
    if (!ok) return;
    setActionLoading("shipment:delete");
    setError("");
    try {
      for (const s of deletable) {
        const attempts = [
          { row: s.row, col: s.col },
          { row: s.rawRow, col: s.rawCol },
          { row: s.row, col: s.weekCol },
          { row: s.rawRow, col: s.weekCol },
        ].filter((x) => x.row != null && x.col != null && String(x.row).trim() && String(x.col).trim());
        let done = false;
        let lastErr = null;
        for (const p of attempts) {
          try {
            await callBackend("webDeleteShipmentPlanCell", { p_row: p.row, p_col: p.col });
            done = true;
            break;
          } catch (e) {
            lastErr = e;
            if (!isShipmentCellMissingError(e)) throw e;
          }
        }
        if (!done) throw lastErr || new Error("Shipment cell not found");
      }
      setPlanPreviews([]);
      setSelectedShipments([]);
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }

  function toggleShipmentSelection(payload) {
    setSelectedShipments((prev) => {
      const exists = prev.some((s) => s.row === payload.row && s.col === payload.col);
      if (exists) return prev.filter((s) => !(s.row === payload.row && s.col === payload.col));
      return [...prev, payload];
    });
  }

  function openStrapDialog() {
    const nextDraft = STRAP_OPTIONS.reduce((acc, name) => ({ ...acc, [name]: "" }), {});
    strapItems.forEach((x) => {
      if (nextDraft[x.name] !== undefined) nextDraft[x.name] = String(x.qty || "");
    });
    setStrapDraft(nextDraft);
    setStrapDialogOpen(true);
  }

  function openCreatePlanDialog() {
    const firstSection = sectionOptions[0] || "Прочее";
    const firstWeek = weeks[0] || "";
    const firstArticle = (sectionArticleRows || [])
      .map((x) => ({
        sectionName: String(x.section_name || x.sectionName || "").trim(),
        article: String(x.article || "").trim(),
        itemName: String(x.item_name || x.itemName || "").trim(),
        material: String(x.material || "").trim(),
      }))
      .find((x) => x.sectionName === firstSection && x.article);
    setPlanSection(firstSection);
    setPlanArticle(firstArticle?.itemName || "");
    setPlanMaterial(resolvePlanMaterial(firstArticle));
    setPlanWeek(firstWeek);
    setPlanQty("");
    setPlanDialogOpen(true);
  }

  function closeCreatePlanDialog() {
    if (planSaving) return;
    setPlanDialogOpen(false);
  }

  async function saveCreatePlanDialog() {
    const item = String(resolvedPlanItem || "").trim();
    const material = String(planMaterial || "").trim();
    const week = String(planWeek || "").trim();
    const qty = Number(String(planQty || "").replace(",", "."));
    if (!item) {
      setError("Выберите материал для изделия.");
      return;
    }
    if (!material) {
      setError("Выберите материал.");
      return;
    }
    if (!week) {
      setError("Укажите неделю плана.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Количество должно быть больше 0.");
      return;
    }
    setPlanSaving(true);
    setError("");
    try {
      await callBackend("webCreateShipmentPlanCell", {
        sectionName: planSection,
        item,
        material,
        week,
        qty,
      });
      setPlanDialogOpen(false);
      await load();
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setPlanSaving(false);
    }
  }

  function saveStrapDialog() {
    const next = STRAP_OPTIONS
      .map((name) => ({ name, qty: Number(String(strapDraft[name] || "").replace(",", ".")) }))
      .filter((x) => Number.isFinite(x.qty) && x.qty > 0);
    setStrapItems(next);
    setStrapDialogOpen(false);
  }

  async function previewSelectedShipmentPlan() {
    if (shipmentTab === "straps") {
      if (!strapItems.length) return;
      const now = new Date();
      setPlanPreviews([
        {
          _key: "strap-plan",
          isStrapPlan: true,
          generatedAt: formatDateTimeForPrint(now),
          rows: strapItems.map((x) => ({ part: x.name, qty: Number(x.qty || 0) })),
        },
      ]);
      return;
    }
    if (!selectedShipments.length) return;
    setActionLoading("preview:batch");
    setError("");
    try {
      if (selectedShipments.length === 1) {
        const s = selectedShipments[0];
        const preview = await callBackend("webPreviewPlanFromShipment", {
          row: s.row,
          col: s.col,
        });
        setPlanPreviews(preview ? [{ ...preview, _key: `${s.row}-${s.col}` }] : []);
      } else {
        let plans = [];
        try {
          const batch = await callBackend("webPreviewPlansBatch", {
            items: selectedShipments.map((x) => ({ row: x.row, col: x.col })),
          });
          plans = (batch && Array.isArray(batch.plans) ? batch.plans : [])
            .map((p) => ({ ...(p.plan || {}), _key: `${p.row}-${p.col}` }));
        } catch (batchError) {
          // Fallback: если пачка упала из-за одной позиции, собираем предпросмотры поштучно.
          const settled = await Promise.allSettled(
            selectedShipments.map((s) =>
              callBackend("webPreviewPlanFromShipment", { row: s.row, col: s.col })
                .then((plan) => ({ ...plan, _key: `${s.row}-${s.col}` }))
            )
          );
          plans = settled
            .filter((x) => x.status === "fulfilled" && x.value)
            .map((x) => x.value);
          const failedCount = settled.length - plans.length;
          if (failedCount > 0) {
            setError(
              `Часть предпросмотров не построена (${failedCount} шт). ` +
              `Причина: ${extractErrorMessage(batchError)}`
            );
          }
        }
        if (!plans.length) {
          throw new Error("Не удалось построить предпросмотр ни для одной выбранной позиции.");
        }
        setPlanPreviews(plans);
      }
    } catch (e) {
      setError(toUserError(e));
    } finally {
      setActionLoading("");
    }
  }

  return (
    <div className={`page ${uiScale === "large" ? "scale-large" : "scale-standard"}`}>
      <header className="top">
        <h1>Управление производственными заказами</h1>
        <button
          type="button"
          className="scale-toggle"
          onClick={() => setUiScale((prev) => (prev === "large" ? "standard" : "large"))}
          title="Переключить масштаб интерфейса"
        >
          Масштаб: {uiScale === "large" ? "Крупный" : "Стандарт"}
        </button>
      </header>

      <section className="view-switch">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={view === v.id ? "tab active" : "tab"}
            onClick={() => {
              setView(v.id);
              if (v.id === "workshop") setTab("pilka");
            }}
          >
            {v.label}
          </button>
        ))}
      </section>

      <section className="kpi-grid">
        {view === "shipment" ? (
          <>
            <div className="kpi"><span>Заказов</span><b>{shipmentKpi.totalOrders}</b></div>
            <div className="kpi"><span>Кол-во (шт)</span><b>{shipmentKpi.totalQty}</b></div>
            <div className="kpi"><span>К отправке в работу</span><b>{shipmentKpi.readyAssembly}</b></div>
            <div className="kpi"><span>Отправлено в цех</span><b>{shipmentKpi.assembled}</b></div>
          </>
        ) : view === "overview" && overviewSubView === "shipped" ? (
          <>
            <div className="kpi">
              <span>Отгружено заказов</span>
              <b>{overviewShippedOnly.length}</b>
            </div>
            <div className="kpi">
              <span>Суммарно шт</span>
              <b>{overviewShippedOnly.reduce((s, x) => s + (Number(x.qty) || 0), 0)}</b>
            </div>
          </>
        ) : view === "overview" ? (
          <>
            <div className="kpi"><span>Всего заказов</span><b>{filtered.length}</b></div>
            <div className="kpi">
              <span>В производстве</span>
              <b>
                {
                  filtered.filter(
                    (x) => !OVERVIEW_POST_PRODUCTION_LANE_IDS.includes(getOverviewLaneId(x))
                  ).length
                }
              </b>
            </div>
            <div className="kpi"><span>На паузе</span><b>{filtered.filter((x) => statusClass(x) === "pause").length}</b></div>
            <div className="kpi">
              <span>Готово к отправке</span>
              <b>{filtered.filter((x) => getOverviewLaneId(x) === "ready_to_ship").length}</b>
            </div>
            <div className="kpi">
              <span>Отгружено</span>
              <b>{filtered.filter((x) => getOverviewLaneId(x) === "shipped").length}</b>
            </div>
          </>
        ) : view === "labor" ? (
          <>
            <div className="kpi"><span>Заказов</span><b>{laborKpi.totalOrders}</b></div>
            <div className="kpi"><span>Общее время (мин)</span><b>{Math.round(laborKpi.totalMinutes)}</b></div>
            <div className="kpi"><span>Всего изделий</span><b>{Math.round(laborKpi.totalQty)}</b></div>
            <div className="kpi"><span>Среднее / заказ (мин)</span><b>{Math.round(laborKpi.avgPerOrder)}</b></div>
          </>
        ) : view === "workshop" ? (
          <>
            <div className="kpi"><span>Всего</span><b>{kpi.total}</b></div>
            <div className="kpi"><span>В работе</span><b>{kpi.work}</b></div>
            <div className="kpi"><span>На паузе</span><b>{kpi.paused}</b></div>
            <div className="kpi"><span>Собрано</span><b>{kpi.done}</b></div>
          </>
        ) : (
          <>
            <div className="kpi"><span>Всего</span><b>{kpi.total}</b></div>
            <div className="kpi"><span>В работе</span><b>{kpi.work}</b></div>
            <div className="kpi"><span>На паузе</span><b>{kpi.paused}</b></div>
            <div className="kpi">
              <span>Собрано и отгрузка</span>
              <b>{kpi.done}</b>
            </div>
          </>
        )}
      </section>

      {view === "shipment" && (
        <section className="color-legend">
          <span className="legend-item"><i className="legend-dot white"></i> Белый: ожидаю заказ</span>
          <span className="legend-item"><i className="legend-dot yellow"></i> Пила: бледно-желтый/желтый</span>
          <span className="legend-item"><i className="legend-dot blue"></i> Кромка: голубой/синий</span>
          <span className="legend-item"><i className="legend-dot orange"></i> Присадка/готово к сборке: бледно-оранжевый/коричневый/оранжевый</span>
          <span className="legend-item"><i className="legend-dot green"></i> Собран, ждет отправку</span>
          <span className="legend-item"><i className="legend-dot red"></i> Отправлен</span>
        </section>
      )}

      <section className="controls">
        {view === "overview" && (
          <div className="tabs tabs--overview-sub">
            <button
              type="button"
              className={overviewSubView === "kanban" ? "tab active" : "tab"}
              onClick={() => setOverviewSubView("kanban")}
            >
              Канбан
            </button>
            <button
              type="button"
              className={overviewSubView === "shipped" ? "tab active" : "tab"}
              onClick={() => setOverviewSubView("shipped")}
            >
              Отгружено
            </button>
          </div>
        )}
        {view === "workshop" && (
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? "tab active" : "tab"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {view === "warehouse" && (
          <div className="tabs tabs--overview-sub">
            <button
              type="button"
              className={warehouseSubView === "sheets" ? "tab active" : "tab"}
              onClick={() => setWarehouseSubView("sheets")}
            >
              Листы
            </button>
            <button
              type="button"
              className={warehouseSubView === "leftovers" ? "tab active" : "tab"}
              onClick={() => setWarehouseSubView("leftovers")}
            >
              Остатки
            </button>
          </div>
        )}
        <div className="filters">
          <input
            placeholder={view === "shipment" ? "Поиск отгрузки: название или ID" : view === "warehouse" ? (warehouseSubView === "leftovers" ? "Поиск по заказу или изделию" : "Поиск материала") : "Поиск по названию или ID"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {view !== "warehouse" && (
            <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)}>
              <option value="all">Все недели</option>
              {weeks.map((w) => <option key={w} value={w}>Неделя {w}</option>)}
            </select>
          )}
          {view === "stats" && (
            <select value={statsSort} onChange={(e) => setStatsSort(e.target.value)}>
              <option value="stage">Сортировка: по этапам</option>
              <option value="readiness">Сортировка: по готовности</option>
              <option value="color">Сортировка: по цвету</option>
              <option value="weekday">Сортировка: по дням недели</option>
            </select>
          )}
          {view === "shipment" && (
            <select value={shipmentSort} onChange={(e) => setShipmentSort(e.target.value)}>
              <option value="name">Сортировка: по названию</option>
              <option value="week">Сортировка: по неделе плана</option>
              <option value="color">Сортировка: по цвету</option>
            </select>
          )}
          {view === "shipment" && (
            <select value={shipmentViewMode} onChange={(e) => setShipmentViewMode(e.target.value)}>
              <option value="table">Вид: таблица</option>
              <option value="cards">Вид: карточки</option>
            </select>
          )}
          {view === "labor" && (
            <select value={laborSort} onChange={(e) => setLaborSort(e.target.value)}>
              <option value="total_desc">Трудоемкость: больше времени</option>
              <option value="total_asc">Трудоемкость: меньше времени</option>
              <option value="week">Трудоемкость: по неделе</option>
              <option value="item">Трудоемкость: по изделию</option>
            </select>
          )}
          {view === "shipment" && (
            <div className="filters-right">
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showAwaiting}
                  onChange={(e) => setShowAwaiting(e.target.checked)}
                />
                <span>Ожидаю заказ</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showOnPilka}
                  onChange={(e) => setShowOnPilka(e.target.checked)}
                />
                <span>На пиле</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showOnKromka}
                  onChange={(e) => setShowOnKromka(e.target.checked)}
                />
                <span>На кромке</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showOnPras}
                  onChange={(e) => setShowOnPras(e.target.checked)}
                />
                <span>На присадке</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showReadyAssembly}
                  onChange={(e) => setShowReadyAssembly(e.target.checked)}
                />
                <span>Готовы к сборке</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showAwaitShipment}
                  onChange={(e) => setShowAwaitShipment(e.target.checked)}
                />
                <span>Ждёт отправку</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showShipped}
                  onChange={(e) => setShowShipped(e.target.checked)}
                />
                <span>Отправленные</span>
              </label>
              <button className="mini" onClick={resetShipmentFilters}>
                Сброс фильтров
              </button>
              <button className="mini" onClick={openStrapDialog}>
                Добавить обвязку
              </button>
              <button className="mini ok" onClick={openCreatePlanDialog}>
                Добавить план
              </button>
            </div>
          )}
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      <section className="cards">
        {view === "shipment" && (
          <div className="shipment-layout">
            <aside className="selection-summary-pane">
              {selectedShipments.length > 0 || strapItems.length > 0 ? (
                <div className="selection-summary">
                  <div className="selection-summary-title">Расчет для выделенных ячеек:</div>
                  {selectedShipmentSummary.items.map((x, idx) => (
                    <div key={`${x.row}-${x.col}-${idx}`} className="selection-summary-item">
                      <div>{x.item}</div>
                      <div>
                        {x.qty} шт. → {x.sheetsNeeded} лист(ов) {x.material}
                        {!x.sheetsExact && x.outputPerSheet > 0 ? " (оценка)" : ""}
                        {!x.sheetsExact && x.outputPerSheet <= 0 ? " (нет данных по раскрою)" : ""}
                      </div>
                    </div>
                  ))}
                  <div className="selection-summary-title" style={{ marginTop: 10 }}>Общее количество:</div>
                  {selectedShipmentSummary.materials.map((m) => (
                    <div key={m.material}>• {m.material}: {m.sheets} лист(ов)</div>
                  ))}
                  <div style={{ marginTop: 10 }}>Обработано ячеек: {selectedShipmentSummary.selectedCount}</div>
                  <div>Всего листов: {selectedShipmentSummary.totalSheets}</div>
                  {strapItems.length > 0 && (
                    <>
                      <div className="selection-summary-title" style={{ marginTop: 10 }}>Добавленная обвязка:</div>
                      {strapItems.map((x) => (
                        <div key={x.name}>• {x.name}: {x.qty} шт.</div>
                      ))}
                      {strapCalculation.lines.length > 0 && (
                        <>
                          <div className="selection-summary-title" style={{ marginTop: 10 }}>Расчет обвязки (черный):</div>
                          {strapCalculation.lines.map((x) => (
                            <div key={`calc-${x.name}`}>
                              • {x.name.replace(/[()]/g, "").replace("_", "×")}: {x.qty} шт → {x.invalid ? "не помещается" : `${x.sheets} листов (по ${x.perSheet} шт/лист)`}
                            </div>
                          ))}
                          <div>• Итого по обвязке: <b>{strapCalculation.totalSheets}</b> листов</div>
                        </>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="selection-summary placeholder">
                  Выделите ячейки в блоках отгрузки или добавьте обвязку, чтобы увидеть расчет листов.
                </div>
              )}
            </aside>
            <div className="shipment-main">
            <div className="tabs" style={{ marginBottom: 8 }}>
              <button
                className={shipmentTab === "orders" ? "tab active" : "tab"}
                onClick={() => setShipmentTab("orders")}
              >
                Заказы
              </button>
              <button
                className={shipmentTab === "straps" ? "tab active" : "tab"}
                onClick={() => setShipmentTab("straps")}
              >
                Обвязка
              </button>
            </div>
            {(shipmentTab === "straps" ? strapItems.length > 0 : selectedShipments.length > 0) && (
              <div className="shipment-toolbar">
                <div>
                  {shipmentTab === "straps" ? (
                    <>Позиции обвязки: <b>{strapItems.length}</b></>
                  ) : (
                    <>Выбрано ячеек: <b>{selectedShipments.length}</b> | Готово к отправке: <b>{sendableSelectedCount}</b></>
                  )}
                  {strapItems.length > 0 && (
                    <> | Обвязка: <b>{strapItems.reduce((sum, x) => sum + Number(x.qty || 0), 0)} шт.</b></>
                  )}
                  {shipmentTab !== "straps" && selectedShipments.length === 1 && (
                    <>
                      {" "} | <b>{selectedShipments[0].item}</b> | Неделя <b>{selectedShipments[0].week || "-"}</b> | Кол-во <b>{selectedShipments[0].qty}</b>
                    </>
                  )}
                </div>
                <div className="actions">
                  <button
                    className="mini"
                    disabled={
                      actionLoading === "preview:batch" ||
                      (shipmentTab === "straps" ? strapItems.length === 0 : selectedShipments.length === 0)
                    }
                    onClick={previewSelectedShipmentPlan}
                  >
                    Предпросмотр плана
                    {shipmentTab !== "straps" && selectedShipments.length > 1 ? ` (${selectedShipments.length})` : ""}
                  </button>
                  <button
                    className="mini"
                    disabled={
                      actionLoading === "shipment:bulk" ||
                      (shipmentTab === "straps" ? strapItems.length === 0 : sendableSelectedCount === 0)
                    }
                    onClick={sendSelectedShipmentToWork}
                  >
                    {shipmentTab === "straps"
                      ? `Отправить в работу (${strapItems.length})`
                      : `Отправить в работу (${sendableSelectedCount})`}
                  </button>
                  {shipmentTab !== "straps" && (
                    <button
                      className="mini warn"
                      disabled={actionLoading === "shipment:delete" || selectedShipments.filter((s) => !!s.canSendToWork).length === 0}
                      onClick={deleteSelectedShipmentPlan}
                    >
                      Удалить из плана
                    </button>
                  )}
                  <button
                    className="mini"
                    onClick={() => {
                      setSelectedShipments([]);
                      if (shipmentTab === "straps") setStrapItems([]);
                    }}
                  >
                    Сбросить выбор
                  </button>
                </div>
              </div>
            )}
            {planPreviews.length > 0 && (
              <div className="print-area">
                {planPreviews.map((planPreview, idx) => (
              <div key={planPreview._key || idx} className="plan-preview print-plan-page">
                {planPreview.isStrapPlan ? (
                  <>
                    <div className="strap-print-title">ЗАДАНИЕ В РАБОТУ: ПЛАНКИ ОБВЯЗКИ</div>
                    <div className="strap-print-meta">Дата: {planPreview.generatedAt}</div>
                    <table className="plan-table strap-plan-table">
                      <thead>
                        <tr>
                          <th className="w-qty">№</th>
                          <th>Наименование</th>
                          <th className="w-qty">Кол-во</th>
                          <th className="w-model">Отметка</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(planPreview.rows || []).map((r, rowIdx) => (
                          <tr key={`${r.part}-${rowIdx}`}>
                            <td>{rowIdx + 1}</td>
                            <td>{r.part}</td>
                            <td>{r.qty}</td>
                            <td></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <>
                <div className="plan-top-meta">
                  <span>{planPreview.generatedAt || ""}</span>
                  <span>Отгрузки CRM</span>
                </div>
                <div className="plan-head-grid">
                  <div className="plan-yellow">
                    <div className="name">{planPreview.firstName || planPreview.detailedName || "-"}</div>
                    <div className="color">{planPreview.colorName || "-"}</div>
                  </div>
                  <div className="plan-number-box">
                    <div>ПЛАН</div>
                    <div className="num">{planPreview.planNumber || "-"}</div>
                  </div>
                </div>
                <table className="plan-table">
                  <thead>
                    <tr>
                      <th className="w-model"></th>
                      <th className="w-qty">{planPreview.qty || 0}</th>
                      <th>Деталь</th>
                      <th>Кол-во</th>
                      <th>Пила</th>
                      <th>Кромка</th>
                      <th>При 1</th>
                      <th>При 2</th>
                      <th>Упаковка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(planPreview.rows || []).map((r, idx) => (
                      <tr key={`${r.part}-${idx}`}>
                        <td>{idx === 0 ? (planPreview.firstName || "") : ""}</td>
                        <td></td>
                        <td>{r.part}</td>
                        <td>{r.qty}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                  </>
                )}
                <div className="actions">
                  <button className="mini" onClick={() => window.print()}>Печать</button>
                  <button className="mini" onClick={() => setPlanPreviews([])}>Закрыть</button>
                </div>
              </div>
                ))}
              </div>
            )}
            {shipmentTab === "orders" && !filtered.length && !loading && <div className="empty">Нет позиций в отгрузке</div>}
            {shipmentTab === "straps" && !strapItems.length && !loading && (
              <div className="empty">Нет добавленной обвязки. Нажмите "Добавить обвязку".</div>
            )}
            {shipmentTab === "orders" && shipmentViewMode === "table" && (
              <div className="sheet-table-wrap">
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th>Группа</th>
                      <th>Изделие</th>
                      <th>Материал</th>
                      <th>План</th>
                      <th>Кол-во</th>
                      <th>Листов</th>
                      <th>Доступно</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipmentTableRows.map((row) => {
                      const isSelected = selectedShipments.some((s) => s.row === row.sourceRow && s.col === row.sourceCol);
                      return (
                        <tr
                          key={row.key}
                          className={isSelected ? "selected-row" : ""}
                          style={{ backgroundColor: row.bg || "#ffffff", color: getReadableTextColor(row.bg || "#ffffff") }}
                          onClick={() => {
                            const payload = {
                              row: row.sourceRow,
                              col: row.sourceCol,
                              rawRow: row.sourceRow,
                              rawCol: row.sourceCol,
                              item: row.item,
                              week: row.week,
                              weekCol: row.week,
                              qty: row.qty,
                              material: getMaterialLabel(row.item, row.material),
                              sheetsNeeded: row.sheets,
                              outputPerSheet: row.outputPerSheet,
                              canSendToWork: !!row.canSendToWork,
                            };
                            toggleShipmentSelection(payload);
                          }}
                        >
                          <td>{row.section}</td>
                          <td>{row.item}</td>
                          <td>{row.material || "-"}</td>
                          <td>{row.week}</td>
                          <td>{row.qty}</td>
                          <td>{row.sheets}</td>
                          <td>{row.availableSheets}</td>
                          <td>{row.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!(shipmentTab === "orders" && shipmentViewMode === "table") && (shipmentTab === "straps" ? strapRenderSections : shipmentRenderSections).map((section) => (
              <div key={section.name} className="shipment-section">
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => toggleSectionCollapsed(section.name)}
                >
                  <span>{isSectionCollapsed(section.name) ? "▸" : "▾"}</span>
                  <span>{section.name}</span>
                  <span className="section-count">Q {(section.items || []).length}</span>
                </button>
                {!isSectionCollapsed(section.name) && (
                  <div className="shipment-items-grid">
                    {sortItemsForShipment(section.items || []).map((it) => {
                      const itemCells = visibleCellsForItem(it);
                      const sheetsE = itemCells.length ? (Number(itemCells[0].availableSheets || 0) || 0) : 0;
                      const pendingCells = itemCells.filter((c) => c.canSendToWork);
                      const hasPendingShortage = pendingCells.some((c) => c.materialEnoughForOrder === false);
                      const materialLabel = getMaterialLabel(it.item, it.material);
                      return (
                        <article
                          key={`${section.name}-${it.row}`}
                          className={`shipment-item-card ${hasPendingShortage ? "shortage-row" : ""}`}
                        >
                          <div className="shipment-item-card__head">
                            <span className="shipment-item-card__title" title={it.item}>
                              {materialLabel}
                            </span>
                            {sheetsE > 0 && (
                              <span className="shipment-item-card__meta-pill" title="Доступно листов (E)">
                                {sheetsE} л
                              </span>
                            )}
                          </div>
                          {hasPendingShortage && (
                            <div className="shipment-item-card__warn">
                              <span>⚠️ Для не начатых заказов материала не хватает</span>
                            </div>
                          )}
                          <div className="shipment-item-card__cells">
                            {itemCells.map((c) => {
                              const sourceRow = it.sourceRowId != null ? String(it.sourceRowId) : String(it.row);
                              const sourceCol = c.sourceColId != null ? String(c.sourceColId) : String(c.col);
                              const isSelected = selectedShipments.some((s) => s.row === sourceRow && s.col === sourceCol);
                              const cls = c.canSendToWork
                                ? "ship-cell-lg selectable"
                                : c.inWork
                                  ? "ship-cell-lg inwork"
                                  : "ship-cell-lg blocked";
                              const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item);
                              const displayBg = stageBg(stageKey, c.bg || "#ffffff");
                              const sheetsN = Number(c.sheetsNeeded || 0);
                              const bottomPill =
                                sheetsN > 0
                                  ? `${sheetsN} ${sheetsN === 1 ? "лист" : sheetsN < 5 ? "листа" : "листов"}`
                                  : stageLabel(stageKey);
                              return (
                                <button
                                  key={`${sourceRow}-${sourceCol}`}
                                  type="button"
                                  className={`${cls} ${isSelected ? "selected" : ""}`}
                                  onMouseEnter={(e) =>
                                    setHoverTip({
                                      visible: true,
                                      text: stageLabel(stageKey),
                                      x: e.clientX + 12,
                                      y: e.clientY + 12,
                                    })
                                  }
                                  onMouseMove={(e) =>
                                    setHoverTip((prev) => ({
                                      ...prev,
                                      x: e.clientX + 12,
                                      y: e.clientY + 12,
                                    }))
                                  }
                                  onMouseLeave={() => setHoverTip({ visible: false, text: "", x: 0, y: 0 })}
                                  style={{
                                    background: displayBg,
                                    backgroundImage: "none",
                                    color: getReadableTextColor(displayBg),
                                  }}
                                  onClick={() => {
                                    const payload = {
                                      row: sourceRow,
                                      col: sourceCol,
                                      rawRow: String(it.row),
                                      rawCol: String(c.col),
                                      item: it.item,
                                      week: c.week,
                                      weekCol: c.week,
                                      qty: c.qty,
                                      material: materialLabel,
                                      sheetsNeeded: sheetsN,
                                      outputPerSheet: Number(c.outputPerSheet || 0),
                                      canSendToWork: !!c.canSendToWork,
                                    };
                                    toggleShipmentSelection(payload);
                                  }}
                                >
                                  {isSelected && <span className="selected-mark">✓</span>}
                                  <span className="ship-cell-lg__week">Нед {c.week || "-"}</span>
                                  <span className="ship-cell-lg__qty">{c.qty}</span>
                                  <span className="ship-cell-lg__badge">{bottomPill}</span>
                                </button>
                              );
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            </div>
          </div>
        )}
        {view === "overview" && overviewSubView === "kanban" && (
          <>
            {!filtered.length && !loading && <div className="empty">Нет заказов для обзора</div>}
            {overviewColumns.some((c) => c.items.length) && (
              <div className="overview-board">
                {overviewColumns.map((col) => (
                  <div key={col.id} className="overview-column">
                    <div className="overview-column__head">
                      <span>{col.title}</span>
                      <span className="section-count">{col.items.length}</span>
                    </div>
                    <div className="overview-column__list">
                      {col.items.map((o) => {
                        const orderId = String(o.orderId || o.order_id || "");
                        return (
                          <article key={`${col.id}-${orderId || o.item}`} className={`overview-card lane-${col.id}`}>
                            <div className="overview-card__id">Заказ #{orderId || "-"}</div>
                            <div className="overview-card__item">{o.item}</div>
                            <div className="overview-card__meta">
                              <span>План: {o.week || "-"}</span>
                              <span>Кол-во: {Number(o.qty || 0)}</span>
                            </div>
                            <div className={`overview-card__stage lane-${col.id}`}>{getStageLabel(o)}</div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {view === "overview" && overviewSubView === "shipped" && (
          <>
            {!overviewShippedOnly.length && !loading && <div className="empty">Нет отгруженных заказов</div>}
            {overviewShippedOnly.length > 0 && (
              <div className="overview-board overview-board--shipped-tab">
                <div className="overview-column">
                  <div className="overview-column__head">
                    <span>Отгружено</span>
                    <span className="section-count">{overviewShippedOnly.length}</span>
                  </div>
                  <div className="overview-column__list">
                    {[...overviewShippedOnly]
                      .sort((a, b) => String(a.item || "").localeCompare(String(b.item || ""), "ru"))
                      .map((o) => {
                        const orderId = String(o.orderId || o.order_id || "");
                        return (
                          <article
                            key={`shipped-${orderId || o.item}`}
                            className="overview-card lane-shipped"
                          >
                            <div className="overview-card__id">Заказ #{orderId || "-"}</div>
                            <div className="overview-card__item">{o.item}</div>
                            <div className="overview-card__meta">
                              <span>План: {o.week || "-"}</span>
                              <span>Кол-во: {Number(o.qty || 0)}</span>
                            </div>
                            <div className="overview-card__stage lane-shipped">{getStageLabel(o)}</div>
                          </article>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {view === "labor" && (
          <>
            {!laborTableRows.length && !loading && <div className="empty">Нет данных по трудоемкости</div>}
            {laborTableRows.length > 0 && (
              <div className="sheet-table-wrap">
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th>ID заказа</th>
                      <th>Изделие</th>
                      <th>План</th>
                      <th>Кол-во</th>
                      <th>Пилка (мин)</th>
                      <th>Кромка (мин)</th>
                      <th>Присадка (мин)</th>
                      <th>Итого (мин)</th>
                      <th>Дата завершения</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laborTableRows.map((r) => (
                      <tr key={`${r.orderId}-${r.item}`}>
                        <td>{r.orderId || "-"}</td>
                        <td>{r.item}</td>
                        <td>{r.week || "-"}</td>
                        <td>{r.qty}</td>
                        <td>{r.pilkaMin}</td>
                        <td>{r.kromkaMin}</td>
                        <td>{r.prasMin}</td>
                        <td><b>{r.totalMin}</b></td>
                        <td>{r.dateFinished || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {view === "warehouse" && (
          <>
            {warehouseSubView === "sheets" && !warehouseTableRows.length && !loading && <div className="empty">Нет данных по складу</div>}
            {warehouseSubView === "sheets" && warehouseTableRows.length > 0 && (
              <div className="sheet-table-wrap">
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th>Материал</th>
                      <th>Листов в наличии</th>
                      <th>Размер</th>
                      <th>Обновлено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warehouseTableRows.map((r) => (
                      <tr key={`${r.material}-${r.sizeLabel}`}>
                        <td>{r.material || "-"}</td>
                        <td><b>{r.qtySheets}</b></td>
                        <td>{r.sizeLabel || "-"}</td>
                        <td>{r.updatedAt ? new Date(r.updatedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {warehouseSubView === "leftovers" && !leftoversTableRows.length && !loading && <div className="empty">Нет данных по остаткам</div>}
            {warehouseSubView === "leftovers" && leftoversTableRows.length > 0 && (
              <div className="sheet-table-wrap">
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th>ID заказа</th>
                      <th>Изделие</th>
                      <th>Материал</th>
                      <th>Листов в раскрое</th>
                      <th>Формат остатка</th>
                      <th>Остатков (шт)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leftoversTableRows.map((r) => (
                      <tr key={`${r.orderId}-${r.item}`}>
                        <td>{r.orderId || "-"}</td>
                        <td>{r.item || "-"}</td>
                        <td>{r.material || "-"}</td>
                        <td>{r.sheetsNeeded}</td>
                        <td>{r.leftoverFormat}</td>
                        <td><b>{r.leftoversQty}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {view === "stats" && (
          <>
            {!statsList.length && !loading && <div className="empty">Нет данных для статистики</div>}
            {statsList.length > 0 && (
              <div className="sheet-table-wrap">
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th>ID заказа</th>
                      <th>Этап</th>
                      <th>Изделие</th>
                      <th>План</th>
                      <th>Кол-во</th>
                      <th>Пила</th>
                      <th>Кромка</th>
                      <th>Присадка</th>
                      <th>Сборка</th>
                      <th>Общий статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statsList.map((o) => (
                      <tr key={`stats-${o.orderId || o.row}`}>
                        <td>{o.orderId || "-"}</td>
                        <td>{getStageLabel(o)}</td>
                        <td>{o.item}</td>
                        <td>{o.week || "-"}</td>
                        <td>{o.qty || 0}</td>
                        <td>{o.pilkaStatus || "-"}</td>
                        <td>{o.kromkaStatus || "-"}</td>
                        <td>{o.prasStatus || "-"}</td>
                        <td>{o.assemblyStatus || "-"}</td>
                        <td>{o.overallStatus || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {view === "workshop" && (
          <>
        {!workshopRows.length && !loading && <div className="empty">Нет заказов</div>}
        {workshopRows.map((o) => (
          (() => {
            const orderId = String(o.orderId || o.order_id || "");
            const displaySheetsNeeded =
              resolveDefaultConsumeSheets(o, shipmentOrders) || resolveDefaultConsumeSheetsFromBoard(o, shipmentBoard);
            const displayMaterial = String(o.material || o.colorName || "").trim() || "Материал не указан";
            return (
          <article key={orderId || `${o.item}-${o.row}`} className={`card ${statusClass(o)}`}>
            <div className="line1">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong>{o.item}</strong>
                <span className="badge meta-inline">План: {o.week || "-"}</span>
                <span className="badge meta-inline">Кол-во: {o.qty || 0}</span>
              </div>
            </div>
            <div className="line2">
              <span>ID: {orderId || "-"}</span>
              <span>Листов нужно: {Number(displaySheetsNeeded || 0)}</span>
              <span>
                Листы: {displayMaterial} ({Number(displaySheetsNeeded || 0)} шт)
              </span>
            </div>
            {view === "workshop" && tab !== "all" && <div className="actions">
              {(() => {
                const pilkaDone = isDone(o.pilkaStatus);
                const pilkaInWork = isInWork(o.pilkaStatus);
                const kromkaDone = isDone(o.kromkaStatus);
                const kromkaInWork = isInWork(o.kromkaStatus);
                const prasDone = isDone(o.prasStatus);
                const prasInWork = isInWork(o.prasStatus);
                const currentKromkaExec =
                  String(o.kromkaStatus || "").includes("Сережа") ? "Сережа" :
                  String(o.kromkaStatus || "").includes("Слава") ? "Слава" : "";
                const currentPrasExec =
                  String(o.prasStatus || "").includes("Виталик") ? "Виталик" :
                  String(o.prasStatus || "").includes("Леха") || String(o.prasStatus || "").includes("Лёха") ? "Леха" :
                  "";
                const kromkaExecValue = executorByOrder[orderId] || currentKromkaExec || "Слава";
                const prasExecValue = executorByOrder[`${orderId}:pras`] || currentPrasExec || "Леха";
                const showPilka = tab === "all" || tab === "pilka";
                const showKromka = tab === "all" || tab === "kromka";
                const showPras = tab === "all" || tab === "pras";
                const showAssembly = tab === "all" || tab === "assembly";
                const showDone = tab === "all" || tab === "done";
                const assemblyDone = isDone(o.assemblyStatus);
                const packagingDone = isOrderCustomerShipped(o);
                return (
                  <>
              {showPilka && (
                <>
              <button
                type="button"
                className={pilkaInWork ? "mini" : "mini ghost"}
                disabled={actionLoading === `webSetPilkaInWork:${orderId}` || pilkaDone || pilkaInWork}
                onClick={() => runAction("webSetPilkaInWork", orderId, {})}
              >
                {tab === "pilka" ? "Начать" : "Пила: Начать"}
              </button>
              <button
                className="mini ok"
                disabled={actionLoading === `webSetPilkaDone:${orderId}` || pilkaDone || !pilkaInWork}
                onClick={() =>
                  runAction("webSetPilkaDone", orderId, {}, {
                    defaultSheets: displaySheetsNeeded,
                    item: o.item,
                    material: displayMaterial,
                    isPlankOrder: String(o.item || "").includes("Планки обвязки"),
                  })
                }
              >
                {tab === "pilka" ? "Готово" : "Пила: Готово"}
              </button>
              <button
                className="mini warn"
                disabled={actionLoading === `webSetPilkaPause:${orderId}` || pilkaDone || !pilkaInWork}
                onClick={() => runAction("webSetPilkaPause", orderId)}
              >
                {tab === "pilka" ? "Пауза" : "Пила: Пауза"}
              </button>
                </>
              )}

              {showKromka && (
                <>
              {!kromkaInWork && (
                <select
                  value={kromkaExecValue}
                  onChange={(e) => setExecutorByOrder((prev) => ({ ...prev, [orderId]: e.target.value }))}
                >
                  <option>Слава</option>
                  <option>Сережа</option>
                </select>
              )}
              <button
                type="button"
                className={kromkaInWork ? "mini" : "mini ghost"}
                disabled={actionLoading === `webSetKromkaInWork:${orderId}` || kromkaDone || kromkaInWork}
                onClick={() =>
                  runAction("webSetKromkaInWork", orderId, {
                    executor: kromkaExecValue,
                  })
                }
              >
                {tab === "kromka" ? "Начать" : "Кромка: Начать"}
              </button>
              <button
                className="mini ok"
                disabled={actionLoading === `webSetKromkaDone:${orderId}` || kromkaDone || !kromkaInWork}
                onClick={() => runAction("webSetKromkaDone", orderId)}
              >
                {tab === "kromka" ? "Готово" : "Кромка: Готово"}
              </button>
              <button
                className="mini warn"
                disabled={actionLoading === `webSetKromkaPause:${orderId}` || kromkaDone || !kromkaInWork}
                onClick={() => runAction("webSetKromkaPause", orderId)}
              >
                {tab === "kromka" ? "Пауза" : "Кромка: Пауза"}
              </button>
                </>
              )}

              {showPras && (
                <>
              {!prasInWork && (
                <select
                  value={prasExecValue}
                  onChange={(e) => setExecutorByOrder((prev) => ({ ...prev, [`${orderId}:pras`]: e.target.value }))}
                >
                  <option>Леха</option>
                  <option>Виталик</option>
                </select>
              )}
              <button
                type="button"
                className={prasInWork ? "mini" : "mini ghost"}
                disabled={actionLoading === `webSetPrasInWork:${orderId}` || prasDone || prasInWork}
                onClick={() =>
                  runAction("webSetPrasInWork", orderId, {
                    executor: prasExecValue,
                  })
                }
              >
                {tab === "pras" ? "Начать" : "Присадка: Начать"}
              </button>
              <button
                className="mini ok"
                disabled={actionLoading === `webSetPrasDone:${orderId}` || prasDone || !prasInWork}
                onClick={() =>
                  runAction("webSetPrasDone", orderId, {}, {
                    notifyOnAssembly: pilkaDone && kromkaDone && !assemblyDone,
                    item: o.item,
                    material: getMaterialLabel(o.item, o.material || o.colorName || ""),
                    week: o.week,
                    qty: o.qty,
                    executor: executorByOrder[orderId] || o.prasExecutor || "",
                  })
                }
              >
                {tab === "pras" ? "Готово" : "Присадка: Готово"}
              </button>
              <button
                className="mini warn"
                disabled={actionLoading === `webSetPrasPause:${orderId}` || prasDone || !prasInWork}
                onClick={() => runAction("webSetPrasPause", orderId)}
              >
                {tab === "pras" ? "Пауза" : "Присадка: Пауза"}
              </button>
                </>
              )}
              {showAssembly && (
                <>
              <button
                className="mini ok"
                disabled={actionLoading === `webSetAssemblyDone:${orderId}` || assemblyDone}
                onClick={() => runAction("webSetAssemblyDone", orderId)}
              >
                {tab === "assembly" ? "Готово" : "Сборка: Готово"}
              </button>
                </>
              )}
              {showDone && (
                <>
              <button
                className="mini ok"
                disabled={actionLoading === `webSetShippingDone:${orderId}` || packagingDone}
                onClick={() =>
                  runAction("webSetShippingDone", orderId, {}, {
                    notifyOnFinalStage: true,
                    item: o.item,
                    material: getMaterialLabel(o.item, o.material || o.colorName || ""),
                    week: o.week,
                    qty: o.qty,
                    executor: executorByOrder[orderId] || o.prasExecutor || "",
                  })
                }
              >
                {tab === "done" ? "Готово" : "Готово к отправке: Готово"}
              </button>
                </>
              )}
                  </>
                );
              })()}
            </div>}
          </article>
            );
          })()
        ))}
          </>
        )}
      </section>
      {hoverTip.visible && (
        <div
          className="hover-tip"
          style={{ left: `${hoverTip.x}px`, top: `${hoverTip.y}px` }}
        >
          {hoverTip.text}
        </div>
      )}
      {consumeDialogOpen && (
        <div className="dialog-backdrop">
          <div className="dialog-card">
            <h3 style={{ marginTop: 0 }}>Списание листов после пилки</h3>
            <div className="line2" style={{ marginBottom: 8 }}>
              <span>{consumeDialogData?.item || "Заказ"}</span>
              <span>ID: {consumeDialogData?.orderId || "-"}</span>
            </div>
            {consumeLoading && <div className="line2" style={{ marginBottom: 8 }}>Загружаю подсказки по материалу...</div>}
            {!consumeEditMode ? (
              <>
                <div className="line2">
                  <span>Списать количество листов материала:</span>
                  <b>{consumeMaterial || "—"}</b>
                </div>
                <div className="line2">
                  <span>Количество:</span>
                  <b>{consumeQty || "—"}</b>
                </div>
                <div className="actions">
                  <button
                    className="mini ok"
                    disabled={consumeSaving}
                    onClick={() => submitConsume(consumeMaterial, consumeQty)}
                  >
                    {consumeSaving ? "Списываю..." : "Подтвердить"}
                  </button>
                  <button
                    className="mini"
                    disabled={consumeSaving}
                    onClick={() => setConsumeEditMode(true)}
                  >
                    Изменить
                  </button>
                  <button className="mini warn" disabled={consumeSaving} onClick={closeConsumeDialog}>
                    Нет
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="actions" style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
                  <input
                    list="consumeMaterialsList"
                    value={consumeMaterial}
                    onChange={(e) => setConsumeMaterial(e.target.value)}
                    placeholder="Материал"
                  />
                  <input
                    value={consumeQty}
                    onChange={(e) => setConsumeQty(e.target.value)}
                    placeholder="Листов"
                  />
                </div>
                <datalist id="consumeMaterialsList">
                  {(consumeDialogData?.materials || []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <div className="actions">
                  <button
                    className="mini ok"
                    disabled={consumeSaving}
                    onClick={() => submitConsume(consumeMaterial, consumeQty)}
                  >
                    {consumeSaving ? "Списываю..." : "Сохранить и списать"}
                  </button>
                  <button className="mini" disabled={consumeSaving} onClick={() => setConsumeEditMode(false)}>
                    Назад
                  </button>
                  <button className="mini warn" disabled={consumeSaving} onClick={closeConsumeDialog}>
                    Нет
                  </button>
                </div>
              </>
            )}
            {consumeError && <div className="error" style={{ marginTop: 8 }}>{consumeError}</div>}
          </div>
        </div>
      )}
      {strapDialogOpen && (
        <div className="dialog-backdrop">
          <div className="dialog-card">
            <h3 style={{ marginTop: 0 }}>Конструктор планок (обвязка)</h3>
            <div className="line2" style={{ marginBottom: 10 }}>
              Укажите количество для нужных позиций. Пусто или 0 — не добавлять.
            </div>
            <div className="strap-grid">
              {STRAP_OPTIONS.map((name) => (
                <div key={name} className="strap-row">
                  <label>{name}</label>
                  <input
                    inputMode="numeric"
                    value={strapDraft[name]}
                    onChange={(e) =>
                      setStrapDraft((prev) => ({
                        ...prev,
                        [name]: e.target.value.replace(/[^0-9.,]/g, ""),
                      }))
                    }
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="mini ok" onClick={saveStrapDialog}>
                Готово
              </button>
              <button className="mini" onClick={() => setStrapDialogOpen(false)}>
                Отмена
              </button>
              <button
                className="mini warn"
                onClick={() => {
                  setStrapItems([]);
                  setStrapDraft(STRAP_OPTIONS.reduce((acc, name) => ({ ...acc, [name]: "" }), {}));
                  setStrapDialogOpen(false);
                }}
              >
                Очистить
              </button>
            </div>
          </div>
        </div>
      )}
      {planDialogOpen && (
        <div className="dialog-backdrop">
          <div className="dialog-card">
            <h3 style={{ marginTop: 0 }}>Добавить новый план</h3>
            <div className="line2" style={{ marginBottom: 10 }}>
              Создаёт или обновляет позицию плана в отгрузке по неделе и изделию.
            </div>
            <div className="strap-grid">
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Секция</label>
                <select
                  value={planSection}
                  onChange={(e) => {
                    const nextSection = e.target.value;
                    setPlanSection(nextSection);
                    const firstArticle = (sectionArticleRows || [])
                      .map((x) => ({
                        sectionName: String(x.section_name || x.sectionName || "").trim(),
                        article: String(x.article || "").trim(),
                        itemName: String(x.item_name || x.itemName || "").trim(),
                        material: String(x.material || "").trim(),
                      }))
                      .find((x) => x.sectionName === nextSection && x.article);
                    setPlanArticle(firstArticle?.itemName || "");
                    setPlanMaterial(resolvePlanMaterial(firstArticle));
                  }}
                >
                  {sectionOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Артикул</label>
                <select
                  value={planArticle}
                  onChange={(e) => {
                    const nextArticle = e.target.value;
                    setPlanArticle(nextArticle);
                    const matched = sectionArticles.find((x) => x.itemName === nextArticle);
                    setPlanMaterial(resolvePlanMaterial(matched));
                  }}
                >
                  {sectionArticles.length === 0 ? (
                    <option value="">Нет артикулов для секции</option>
                  ) : (
                    sectionArticles.map((x) => (
                      <option key={`${x.article}::${x.itemName}`} value={x.itemName}>{x.itemName}</option>
                    ))
                  )}
                </select>
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Материал</label>
                <input value={planMaterial} readOnly placeholder="Материал подставляется из артикула" />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Неделя</label>
                <input
                  value={planWeek}
                  onChange={(e) => setPlanWeek(e.target.value.replace(/[^\d-]/g, ""))}
                  placeholder="Например: 70"
                />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Количество</label>
                <input
                  inputMode="decimal"
                  value={planQty}
                  onChange={(e) => setPlanQty(e.target.value.replace(/[^0-9.,]/g, ""))}
                  placeholder="Например: 36"
                />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="mini ok" disabled={planSaving} onClick={saveCreatePlanDialog}>
                {planSaving ? "Сохраняю..." : "Сохранить план"}
              </button>
              <button className="mini" disabled={planSaving} onClick={closeCreatePlanDialog}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


