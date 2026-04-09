import { useEffect, useMemo, useRef, useState } from "react";
import { callBackend } from "./api";

const TABS = [
  { id: "pilka", label: "Пила" },
  { id: "kromka", label: "Кромка" },
  { id: "pras", label: "Присадка" },
];
const VIEWS = [
  { id: "shipment", label: "Отгрузка" },
  { id: "workshop", label: "Производство" },
  { id: "stats", label: "Статистика" },
];
const DEFAULT_SHIPMENT_PREFS = {
  weekFilter: "all",
  shipmentSort: "name",
  showOnlyEmpty: false,
  showBlueCells: true,
  showYellowCells: true,
  collapsedSections: {},
};
const SHIPMENT_SECTION_ORDER = [
  "Stabile",
  "Solito2",
  "Solito",
  "Cremona",
  "Avella",
  "Avella lite",
  "Премьер",
  "Премьер белый",
  "Классико +",
  "Классико",
  "Donini Grande",
  "Donini 806",
  "Donini 750",
  "Donini R 750",
  "Donini R 806",
  "ТВ Лофт",
  "ТВ Лофт 1500",
  "TV Siena",
  "ТВ Siena",
];
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
];
const STRAP_SHEET_WIDTH = 2800;
const STRAP_SHEET_HEIGHT = 2070;

function statusClass(order) {
  const pilka = String(order?.pilkaStatus || order?.pilka || "");
  const kromka = String(order?.kromkaStatus || order?.kromka || "");
  const pras = String(order?.prasStatus || order?.pras || "");
  if (String(order?.assemblyStatus || "").includes("СОБРАНО")) return "done";
  if (pilka.includes("Пауза") || kromka.includes("Пауза") || pras.includes("Пауза")) return "pause";
  if (pras.includes("В работе") || kromka.includes("В работе") || pilka.includes("В работе")) return "work";
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

function toUserError(e) {
  const msg = String(e?.message || e || "");
  if (msg.includes("Система занята")) return "Система занята, повторите через 1-2 секунды.";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return "Нет связи с сервером. Проверьте интернет и повторите.";
  return msg || "Неизвестная ошибка";
}

function extractErrorMessage(e) {
  return String(e?.message || e || "").trim() || "Неизвестная ошибка";
}

function parseStrapSize(name) {
  const m = String(name || "").match(/\((\d+)_(\d+)\)/);
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
  const [shipmentTab, setShipmentTab] = useState("orders");
  const [rows, setRows] = useState([]);
  const [shipmentBoard, setShipmentBoard] = useState({ sections: [] });
  const [selectedShipments, setSelectedShipments] = useState([]);
  const [planPreviews, setPlanPreviews] = useState([]);
  const [hoverTip, setHoverTip] = useState({ visible: false, text: "", x: 0, y: 0 });
  const [query, setQuery] = useState("");
  const [weekFilter, setWeekFilter] = useState("all");
  const [showOnlyEmpty, setShowOnlyEmpty] = useState(false);
  const [showBlueCells, setShowBlueCells] = useState(true);
  const [showYellowCells, setShowYellowCells] = useState(true);
  const [shipmentSort, setShipmentSort] = useState("name");
  const [statsSort, setStatsSort] = useState("stage");
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
  const [planItem, setPlanItem] = useState("");
  const [planMaterial, setPlanMaterial] = useState("");
  const [planWeek, setPlanWeek] = useState("");
  const [planQty, setPlanQty] = useState("");
  const [planSaving, setPlanSaving] = useState(false);
  const [strapDraft, setStrapDraft] = useState(() =>
    STRAP_OPTIONS.reduce((acc, name) => ({ ...acc, [name]: "" }), {})
  );
  const [strapItems, setStrapItems] = useState([]);
  const loadSeqRef = useRef(0);
  const loadInFlightRef = useRef(false);

  async function load() {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError("");
    try {
      const action =
        view === "shipment"
          ? "webGetShipmentBoard"
          : view === "stats"
            ? "webGetOrdersAll"
            : tab === "pilka"
              ? "webGetOrdersPilka"
              : tab === "kromka"
                ? "webGetOrdersKromka"
                : tab === "pras"
                  ? "webGetOrdersPras"
                  : "webGetOrdersAll";
      const data = await callBackend(action);
      // Игнорируем запоздавшие ответы, чтобы старая вкладка не перетирала новую.
      if (seq !== loadSeqRef.current) return;
      if (view === "shipment") setShipmentBoard(data && data.sections ? data : { sections: [] });
      else setRows(Array.isArray(data) ? data : []);
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
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [tab, view]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("shipmentUiPrefs");
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs && typeof prefs === "object") {
        if (typeof prefs.weekFilter === "string") setWeekFilter(prefs.weekFilter);
        if (typeof prefs.shipmentSort === "string") setShipmentSort(prefs.shipmentSort);
        if (typeof prefs.showOnlyEmpty === "boolean") setShowOnlyEmpty(prefs.showOnlyEmpty);
        if (typeof prefs.showBlueCells === "boolean") setShowBlueCells(prefs.showBlueCells);
        if (typeof prefs.showYellowCells === "boolean") setShowYellowCells(prefs.showYellowCells);
        if (prefs.collapsedSections && typeof prefs.collapsedSections === "object") {
          setCollapsedSections(prefs.collapsedSections);
        }
      }
    } catch (_) {}
  }, []);

  function resetShipmentFilters() {
    setWeekFilter(DEFAULT_SHIPMENT_PREFS.weekFilter);
    setShipmentSort(DEFAULT_SHIPMENT_PREFS.shipmentSort);
    setShowOnlyEmpty(DEFAULT_SHIPMENT_PREFS.showOnlyEmpty);
    setShowBlueCells(DEFAULT_SHIPMENT_PREFS.showBlueCells);
    setShowYellowCells(DEFAULT_SHIPMENT_PREFS.showYellowCells);
    setCollapsedSections(DEFAULT_SHIPMENT_PREFS.collapsedSections);
  }

  useEffect(() => {
    try {
      localStorage.setItem(
        "shipmentUiPrefs",
        JSON.stringify({ weekFilter, shipmentSort, showOnlyEmpty, showBlueCells, showYellowCells, collapsedSections })
      );
    } catch (_) {}
  }, [weekFilter, shipmentSort, showOnlyEmpty, showBlueCells, showYellowCells, collapsedSections]);

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
    const pilkaDone = isDone(order.pilkaStatus);
    const kromkaDone = isDone(order.kromkaStatus);
    const prasDone = isDone(order.prasStatus);
    if (!pilkaDone) return "Пила";
    if (!kromkaDone) return "Кромка";
    if (!prasDone) return "Присадка";
    return "Завершено";
  }
  function getColorGroup(item) {
    const text = String(item || "").trim();
    if (!text) return "Без цвета";
    const parts = text.split(".");
    const tail = String(parts[parts.length - 1] || "").trim();
    return tail || "Без цвета";
  }
  function getWeekday(order) {
    const d = new Date(order?.createdAt || "");
    if (!isFinite(d.getTime())) return "Неизвестно";
    return d.toLocaleDateString("ru-RU", { weekday: "long" });
  }
  function getStageLabel(order) {
    const overall = String(order?.overall || "").toLowerCase();
    const assembly = String(order?.assemblyStatus || "").toLowerCase();
    const pilka = String(order?.pilkaStatus || order?.pilka || "").toLowerCase();
    const kromka = String(order?.kromkaStatus || order?.kromka || "").toLowerCase();
    const pras = String(order?.prasStatus || order?.pras || "").toLowerCase();

    if (overall.includes("отправ") || overall.includes("отгруж")) return "Собран и отправлен";
    if (assembly.includes("собрано")) return "Собран";
    if (pilka.includes("готов") && kromka.includes("готов") && pras.includes("готов")) return "Готов";
    if (pras.includes("в работе") || pras.includes("пауза") || (pilka.includes("готов") && kromka.includes("готов") && !pras.includes("готов"))) return "Присадка";
    if (kromka.includes("в работе") || kromka.includes("пауза") || (pilka.includes("готов") && !kromka.includes("готов"))) return "Кромка";
    return "Пила";
  }
  function getStageClassByLabel(label) {
    const s = String(label || "").toLowerCase();
    if (s.includes("отправ")) return "ship";
    if (s.includes("собран")) return "done";
    if (s.includes("готов")) return "ready";
    if (s.includes("присад")) return "pras";
    if (s.includes("кром")) return "kromka";
    return "pilka";
  }
  function isInWork(s) {
    return String(s || "").includes("В работе");
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

  async function runAction(action, orderId, payload = {}, meta = {}) {
    const key = `${action}:${orderId}`;
    setActionLoading(key);
    setError("");
    try {
      const data = await callBackend(action, { orderId, ...payload });
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

        // Не блокируем UI ожиданием подсказок.
        callBackend("webGetConsumeOptions", { orderId })
          .then((options) => {
            setConsumeDialogData(options || { orderId });
            const suggested = isPlankOrder ? "Черный" : String(options?.suggestedMaterial || "").trim();
            if (suggested) setConsumeMaterial(suggested);
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
    return [...new Set(rows.map((x) => String(x.week || "")).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  }, [rows, shipmentBoard, view]);
  const shipmentSectionNames = useMemo(() => {
    const names = (shipmentBoard.sections || [])
      .map((s) => String(s?.name || "").trim())
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ru"));
  }, [shipmentBoard]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (view === "shipment") {
      return (shipmentBoard.sections || [])
        .filter((s) => !isStorageLikeName(s.name))
        .map((s) => ({
          ...s,
          items: (s.items || []).filter((it) => {
            if (isStorageLikeName(it.item)) return false;
            const visibleCells = (it.cells || []).filter((c) => {
              const qtyOk = (Number(c.qty) || 0) > 0;
              if (!qtyOk) return false;
              if (showOnlyEmpty) return !!c.canSendToWork; // только пустые (не начатые)
              if (!passesBlueYellowFilter(c.bg, showBlueCells, showYellowCells)) return false;
              return !isRedCell(c.bg);
            });
            const byWeek = weekFilter === "all" || visibleCells.some((c) => String(c.week || "") === weekFilter);
            const byQuery = !q || String(it.item || "").toLowerCase().includes(q);
            return byWeek && byQuery && visibleCells.length > 0;
          }),
        }))
        .filter((s) => s.items.length > 0);
    }
    return rows.filter((x) => {
      const byWeek = weekFilter === "all" || String(x.week || "") === weekFilter;
      const byQuery = !q || String(x.item || "").toLowerCase().includes(q) || String(x.orderId || "").toLowerCase().includes(q);
      if (!byWeek || !byQuery) return false;
      if (view === "stats") return true;
      const pilkaStatus = String(x.pilkaStatus || x.pilka || "");
      const kromkaStatus = String(x.kromkaStatus || x.kromka || "");
      const prasStatus = String(x.prasStatus || x.pras || "");
      const pilkaDone = isDone(pilkaStatus);
      const kromkaDone = isDone(kromkaStatus);
      const prasDone = isDone(prasStatus);
      if (tab === "pilka") return !pilkaDone; // готовые не показываем
      if (tab === "kromka") return pilkaDone && !kromkaDone;
      if (tab === "pras") return pilkaDone && kromkaDone && !prasDone;
      return true;
    });
  }, [rows, shipmentBoard, view, query, weekFilter, shipmentSort, showOnlyEmpty, showBlueCells, showYellowCells]);

  function visibleCellsForItem(it) {
    return (it?.cells || []).filter((c) => {
      const qtyOk = (Number(c.qty) || 0) > 0;
      if (!qtyOk) return false;
      if (showOnlyEmpty) return !!c.canSendToWork;
      if (!passesBlueYellowFilter(c.bg, showBlueCells, showYellowCells)) return false;
      return !isRedCell(c.bg);
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
  }, [view, shipmentSort, filtered, showOnlyEmpty]);

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
    const work = filtered.filter((x) => statusClass(x) === "work").length;
    const paused = filtered.filter((x) => statusClass(x) === "pause").length;
    const done = filtered.filter((x) => statusClass(x) === "done").length;
    return { total, work, paused, done };
  }, [filtered]);
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
      const pilkaDone = isDone(pilkaStatus);
      const kromkaDone = isDone(kromkaStatus);
      const prasDone = isDone(prasStatus);
      if (tab === "pilka") return !pilkaDone;
      if (tab === "kromka") return pilkaDone && !kromkaDone;
      if (tab === "pras") return pilkaDone && kromkaDone && !prasDone;
      return true;
    });
    const isRowInWork = (o) => {
      if (tab === "pilka") return isInWork(o.pilkaStatus);
      if (tab === "kromka") return isInWork(o.kromkaStatus);
      if (tab === "pras") return isInWork(o.prasStatus);
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

  const selectedShipmentSummary = useMemo(() => {
    const items = selectedShipments.map((s) => {
      const qty = Number(s.qty || 0);
      const sheetsNeeded = Number(s.sheetsNeeded || 0);
      const material = String(s.material || "Материал не указан");
      return { ...s, qty, sheetsNeeded, material };
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
    setActionLoading("shipment:bulk");
    setError("");
    try {
      for (const s of selectedShipments) {
        await callBackend("webSendShipmentToWork", { row: s.row, col: s.col });
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

  function openStrapDialog() {
    const nextDraft = STRAP_OPTIONS.reduce((acc, name) => ({ ...acc, [name]: "" }), {});
    strapItems.forEach((x) => {
      if (nextDraft[x.name] !== undefined) nextDraft[x.name] = String(x.qty || "");
    });
    setStrapDraft(nextDraft);
    setStrapDialogOpen(true);
  }

  function openCreatePlanDialog() {
    const firstSection = shipmentSectionNames[0] || "Прочее";
    const firstWeek = weeks[0] || "";
    setPlanSection(firstSection);
    setPlanItem("");
    setPlanMaterial("");
    setPlanWeek(firstWeek);
    setPlanQty("");
    setPlanDialogOpen(true);
  }

  function closeCreatePlanDialog() {
    if (planSaving) return;
    setPlanDialogOpen(false);
  }

  async function saveCreatePlanDialog() {
    const item = String(planItem || "").trim();
    const week = String(planWeek || "").trim();
    const qty = Number(String(planQty || "").replace(",", "."));
    if (!item) {
      setError("Укажите изделие для нового плана.");
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
        material: planMaterial,
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
    <div className="page">
      <header className="top">
        <h1>Отгрузки - CRM</h1>
        <button onClick={load} disabled={loading}>{loading ? "Обновляю..." : "Обновить"}</button>
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
            <div className="kpi"><span>Готово к сборке</span><b>{shipmentKpi.readyAssembly}</b></div>
            <div className="kpi"><span>Собрано</span><b>{shipmentKpi.assembled}</b></div>
          </>
        ) : (
          <>
            <div className="kpi"><span>Всего</span><b>{kpi.total}</b></div>
            <div className="kpi"><span>В работе</span><b>{kpi.work}</b></div>
            <div className="kpi"><span>На паузе</span><b>{kpi.paused}</b></div>
            <div className="kpi"><span>Собрано</span><b>{kpi.done}</b></div>
          </>
        )}
      </section>

      {view === "shipment" && (
        <section className="color-legend">
          <span className="legend-item"><i className="legend-dot white"></i> Белый: не начато</span>
          <span className="legend-item"><i className="legend-dot blue"></i> Синий: в процессе / этап завершен</span>
          <span className="legend-item"><i className="legend-dot yellow"></i> Желтый: отправлено в работу / пауза</span>
          <span className="legend-item"><i className="legend-dot green"></i> Зеленый: собрано / готово</span>
        </section>
      )}

      <section className="controls">
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
        <div className="filters">
          <input
            placeholder={view === "shipment" ? "Поиск отгрузки: название или ID" : "Поиск по названию или ID"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)}>
            <option value="all">Все недели</option>
            {weeks.map((w) => <option key={w} value={w}>Неделя {w}</option>)}
          </select>
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
            <div className="filters-right">
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showOnlyEmpty}
                  onChange={(e) => setShowOnlyEmpty(e.target.checked)}
                />
                <span>Только пустые (не начато)</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showBlueCells}
                  onChange={(e) => setShowBlueCells(e.target.checked)}
                />
                <span>Показывать синие</span>
              </label>
              <label className="empty-only-toggle">
                <input
                  type="checkbox"
                  checked={showYellowCells}
                  onChange={(e) => setShowYellowCells(e.target.checked)}
                />
                <span>Показывать желтые</span>
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
                      <div>{x.qty} шт. → {x.sheetsNeeded} лист(ов) {x.material}</div>
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
                    <>Выбрано ячеек: <b>{selectedShipments.length}</b></>
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
                      (shipmentTab === "straps" ? strapItems.length === 0 : selectedShipments.length === 0)
                    }
                    onClick={sendSelectedShipmentToWork}
                  >
                    {shipmentTab === "straps"
                      ? `Отправить в работу (${strapItems.length})`
                      : `Отправить в работу (${selectedShipments.length})`}
                  </button>
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
            {(shipmentTab === "straps" ? strapRenderSections : shipmentRenderSections).map((section) => (
              <div key={section.name} className="shipment-section">
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => toggleSectionCollapsed(section.name)}
                >
                  <span>{isSectionCollapsed(section.name) ? "▸" : "▾"}</span>
                  <span>{section.name}</span>
                  <span className="section-count">{(section.items || []).length}</span>
                </button>
                {!isSectionCollapsed(section.name) && sortItemsForShipment(section.items || []).map((it) => (
                  (() => {
                    const itemCells = visibleCellsForItem(it);
                    const sheetsE = itemCells.length ? (Number(itemCells[0].availableSheets || 0) || 0) : 0;
                    const pendingCells = itemCells.filter((c) => c.canSendToWork);
                    const hasPendingShortage = pendingCells.some((c) => c.materialEnoughForOrder === false);
                    return (
                  <article
                    key={`${section.name}-${it.row}`}
                    className={`card ${
                      hasPendingShortage
                        ? "shortage-row"
                        : ""
                    }`}
                  >
                    <div className="line1">
                      <strong>{it.item}</strong>
                      <span className="badge-stack">
                        <span className="badge">{it.material || "Материал не указан"}</span>
                        <span className="badge-sub">{sheetsE}</span>
                      </span>
                    </div>
                    {hasPendingShortage && (
                      <div className="line2">
                        <span>⚠️ Для не начатых заказов материала не хватает</span>
                      </div>
                    )}
                    <div className="shipment-grid">
                      {itemCells
                        .map((c) => {
                        const sourceRow = it.sourceRowId != null ? String(it.sourceRowId) : String(it.row);
                        const sourceCol = c.sourceColId != null ? String(c.sourceColId) : String(c.col);
                        const isSelected = selectedShipments.some((s) => s.row === sourceRow && s.col === sourceCol);
                        const cls = c.canSendToWork ? "ship-cell selectable" : c.inWork ? "ship-cell inwork" : "ship-cell blocked";
                        return (
                          <button
                            key={`${sourceRow}-${sourceCol}`}
                            className={`${cls} ${isSelected ? "selected" : ""}`}
                            onMouseEnter={(e) =>
                              setHoverTip({
                                visible: true,
                                text: getShipmentCellStatus(c),
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
                              background: c.bg || "#ffffff",
                              backgroundImage: "none",
                              color: getReadableTextColor(c.bg || "#ffffff"),
                            }}
                            onClick={() => {
                              if (!c.canSendToWork) return;
                              const payload = {
                                row: sourceRow,
                                col: sourceCol,
                                item: it.item,
                                week: c.week,
                                qty: c.qty,
                                material: it.material,
                                sheetsNeeded: Number(c.sheetsNeeded || 0),
                              };
                              setSelectedShipments((prev) => {
                                const exists = prev.some((s) => s.row === payload.row && s.col === payload.col);
                                if (exists) return prev.filter((s) => !(s.row === payload.row && s.col === payload.col));
                                return [...prev, payload];
                              });
                            }}
                          >
                            {isSelected && <span className="selected-mark">✓</span>}
                            <span>Нед {c.week || "-"}</span>
                            <b>{c.qty}</b>
                            <span className="cell-sheets">Л: {Number(c.sheetsNeeded || 0)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </article>
                    );
                  })()
                ))}
              </div>
            ))}
            </div>
          </div>
        )}
        {view === "stats" && (
          <>
        {!statsList.length && !loading && <div className="empty">Нет данных для статистики</div>}
        {statsList.map((o) => (
          <article key={`stats-${o.orderId || o.row}`} className="card stats-row">
            <div className={`stats-stage ${getStageClassByLabel(getStageLabel(o))}`}>{getStageLabel(o)}</div>
            <div className="stats-item">{o.item}</div>
            <div className="stats-meta">План: {o.week || "-"}</div>
            <div className="stats-meta">Кол-во: {o.qty || 0}</div>
          </article>
        ))}
          </>
        )}
        {view === "workshop" && (
          <>
        {!workshopRows.length && !loading && <div className="empty">Нет заказов</div>}
        {workshopRows.map((o) => (
          <article key={o.orderId || `${o.item}-${o.row}`} className={`card ${statusClass(o)}`}>
            <div className="line1">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong>{o.item}</strong>
                <span className="badge meta-inline">План: {o.week || "-"}</span>
                <span className="badge meta-inline">Кол-во: {o.qty || 0}</span>
              </div>
            </div>
            <div className="line2">
              <span>ID: {o.orderId || "-"}</span>
              <span>Листов нужно: {Number(o.sheetsNeeded || 0)}</span>
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
                  String(o.prasStatus || "").includes("Лёха") || String(o.prasStatus || "").includes("Леха") ? "Лёха" : "";
                const kromkaExecValue = executorByOrder[o.orderId] || currentKromkaExec || "Слава";
                const prasExecValue = executorByOrder[`${o.orderId}:pras`] || currentPrasExec || "Лёха";
                const showPilka = tab === "all" || tab === "pilka";
                const showKromka = tab === "all" || tab === "kromka";
                const showPras = tab === "all" || tab === "pras";
                return (
                  <>
              {showPilka && (
                <>
              <button
                className="mini"
                disabled={actionLoading === `webSetPilkaInWork:${o.orderId}` || pilkaDone}
                onClick={() => runAction("webSetPilkaInWork", o.orderId)}
              >
                {tab === "pilka" ? "В работе" : "Пила: В работе"}
              </button>
              <button
                className="mini ok"
                disabled={actionLoading === `webSetPilkaDone:${o.orderId}` || pilkaDone || !pilkaInWork}
                onClick={() =>
                  runAction("webSetPilkaDone", o.orderId, {}, {
                    defaultSheets: o.sheetsNeeded,
                    item: o.item,
                    isPlankOrder: String(o.item || "").includes("Планки обвязки"),
                  })
                }
              >
                {tab === "pilka" ? "Готово" : "Пила: Готово"}
              </button>
              <button
                className="mini warn"
                disabled={actionLoading === `webSetPilkaPause:${o.orderId}` || pilkaDone || !pilkaInWork}
                onClick={() => runAction("webSetPilkaPause", o.orderId)}
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
                  onChange={(e) => setExecutorByOrder((prev) => ({ ...prev, [o.orderId]: e.target.value }))}
                >
                  <option>Слава</option>
                  <option>Сережа</option>
                </select>
              )}
              <button
                className="mini"
                disabled={actionLoading === `webSetKromkaInWork:${o.orderId}` || kromkaDone}
                onClick={() =>
                  runAction("webSetKromkaInWork", o.orderId, {
                    executor: kromkaExecValue,
                  })
                }
              >
                {tab === "kromka" ? "В работе" : "Кромка: В работе"}
              </button>
              <button
                className="mini ok"
                disabled={actionLoading === `webSetKromkaDone:${o.orderId}` || kromkaDone || !kromkaInWork}
                onClick={() => runAction("webSetKromkaDone", o.orderId)}
              >
                {tab === "kromka" ? "Готово" : "Кромка: Готово"}
              </button>
              <button
                className="mini warn"
                disabled={actionLoading === `webSetKromkaPause:${o.orderId}` || kromkaDone || !kromkaInWork}
                onClick={() => runAction("webSetKromkaPause", o.orderId)}
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
                  onChange={(e) => setExecutorByOrder((prev) => ({ ...prev, [`${o.orderId}:pras`]: e.target.value }))}
                >
                  <option>Лёха</option>
                  <option>Виталик</option>
                </select>
              )}
              <button
                className="mini"
                disabled={actionLoading === `webSetPrasInWork:${o.orderId}` || prasDone}
                onClick={() =>
                  runAction("webSetPrasInWork", o.orderId, {
                    executor: prasExecValue,
                  })
                }
              >
                {tab === "pras" ? "В работе" : "Присадка: В работе"}
              </button>
              <button
                className="mini ok"
                disabled={actionLoading === `webSetPrasDone:${o.orderId}` || prasDone || !prasInWork}
                onClick={() => runAction("webSetPrasDone", o.orderId)}
              >
                {tab === "pras" ? "Готово" : "Присадка: Готово"}
              </button>
              <button
                className="mini warn"
                disabled={actionLoading === `webSetPrasPause:${o.orderId}` || prasDone || !prasInWork}
                onClick={() => runAction("webSetPrasPause", o.orderId)}
              >
                {tab === "pras" ? "Пауза" : "Присадка: Пауза"}
              </button>
                </>
              )}
                  </>
                );
              })()}
            </div>}
          </article>
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
                <select value={planSection} onChange={(e) => setPlanSection(e.target.value)}>
                  {[...shipmentSectionNames, "Прочее"].filter((v, i, a) => a.indexOf(v) === i).map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Изделие</label>
                <input
                  value={planItem}
                  onChange={(e) => setPlanItem(e.target.value)}
                  placeholder="Например: Donini 750 ..."
                />
              </div>
              <div className="strap-row" style={{ gridTemplateColumns: "170px 1fr" }}>
                <label>Материал</label>
                <input
                  value={planMaterial}
                  onChange={(e) => setPlanMaterial(e.target.value)}
                  placeholder="Необязательно"
                />
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


