import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OrderService } from "../services/orderService";

const STAGE_LABELS = {
  laser: "Лазер",
  saw: "Пила",
  bending: "Гибка",
  welding: "Сварка",
  painting: "Покраска",
};

function formatStageTime(seconds) {
  const sec = Math.max(0, Number(seconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}ч ${String(m).padStart(2, "0")}м`;
}

function getStageSeconds(row, stageKey) {
  if (stageKey === "laser") return Number(row?.laserSeconds || 0);
  if (stageKey === "saw") return Number(row?.sawSeconds || 0);
  if (stageKey === "bending") return Number(row?.bendingSeconds || 0);
  if (stageKey === "welding") return Number(row?.weldingSeconds || 0);
  if (stageKey === "painting") return Number(row?.paintingSeconds || 0);
  return 0;
}

const DEFAULT_METAL_ROUTE = ["laser", "bending", "welding", "painting"];

/** Catalog-aware route for row (fallback if article missing from catalog). */
function resolveMetalRoute(row, catalogRows) {
  const article = String(row?.article || "").trim().toUpperCase();
  const list = Array.isArray(catalogRows) ? catalogRows : [];
  const match = list.find((c) => String(c?.article || "").trim().toUpperCase() === article);
  if (match && Array.isArray(match.stageRoute) && match.stageRoute.length > 0) {
    return match.stageRoute;
  }
  const stage = String(row?.currentStage || "").toLowerCase();
  if (stage === "saw") return ["saw", "welding", "painting"];
  return [...DEFAULT_METAL_ROUTE];
}

/** Human-readable remaining stages after current (including immediate next). */
function formatNextStagesLabel(route, currentStageKey, routeIdx = null) {
  const routeArr = Array.isArray(route) && route.length > 0 ? route : DEFAULT_METAL_ROUTE;
  const cur = String(currentStageKey || "").toLowerCase();
  const idxFromState = Number.isFinite(Number(routeIdx)) ? Number(routeIdx) : null;
  const idx = idxFromState != null ? idxFromState : routeArr.indexOf(cur);
  if (!(idx >= 0)) return "-";
  if (idx >= routeArr.length - 1) return "Завершение";
  return routeArr.slice(idx + 1).map((s) => STAGE_LABELS[s] || s).join(" → ");
}

function getQueuedStatusLabel(stageKey) {
  if (stageKey === "laser") return "Ожидает лазер";
  if (stageKey === "saw") return "Ожидает пилу";
  if (stageKey === "bending") return "Ожидает гибку";
  if (stageKey === "welding") return "Ожидает сварку";
  if (stageKey === "painting") return "Ожидает покраску";
  return "Ожидает этап";
}

function getKanbanStatusLine(row, stageKey) {
  const stageStatus = String(row?.stageStatus || "").toLowerCase();
  if (stageStatus === "queued") return { icon: "⌛", text: getQueuedStatusLabel(stageKey) };
  if (stageStatus === "in_progress") return { icon: "▶", text: "В работе" };
  if (stageStatus === "paused") return { icon: "Ⅱ", text: "Пауза" };
  if (String(row?.status || "").toLowerCase() === "done") return { icon: "✓", text: "Завершен" };
  return { icon: "•", text: row?.stageStatus || "-" };
}

function drawerDotClass(kind) {
  if (kind === "done") return "order-drawer__dot order-drawer__dot--done";
  if (kind === "work") return "order-drawer__dot order-drawer__dot--work";
  return "order-drawer__dot order-drawer__dot--wait";
}

function getRouteStepKind(row, stageKey, catalogRows) {
  const route = resolveMetalRoute(row, catalogRows);
  const idx = route.indexOf(stageKey);
  if (idx === -1) return "wait";
  const currentStage = String(row?.currentStage || "").toLowerCase();
  const currentIdx = route.indexOf(currentStage);
  const status = String(row?.status || "").toLowerCase();
  const stageStatus = String(row?.stageStatus || "").toLowerCase();
  if (status === "done") return "done";
  if (idx < currentIdx) return "done";
  if (idx > currentIdx) return "wait";
  if (stageStatus === "in_progress") return "work";
  return "wait";
}

function getPlanStageLabel(row) {
  const status = String(row?.status || "").toLowerCase();
  const stageStatus = String(row?.stageStatus || "").toLowerCase();
  if (status === "planned" && stageStatus === "queued") return "Ожидает старта";
  return STAGE_LABELS[row?.currentStage] || row?.currentStage || "-";
}

function formatPlanStatus(row) {
  const status = String(row?.status || "").toLowerCase();
  const stageStatus = String(row?.stageStatus || "").toLowerCase();
  if (status === "planned" && stageStatus === "queued") return "Ожидает старта";
  if (status === "active" && stageStatus === "queued") return "Ожидает на этапе";
  if (status === "active" && stageStatus === "in_progress") return "В работе";
  if (status === "active" && stageStatus === "paused") return "Пауза";
  if (status === "done") return "Завершен";
  return row?.stageStatus || row?.status || "-";
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isOneEditAway(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right) return false;
  const lenDiff = Math.abs(left.length - right.length);
  if (lenDiff > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) {
      i += 1;
    } else if (right.length > left.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  if (i < left.length || j < right.length) edits += 1;
  return edits <= 1;
}

function matchesCatalogQuery(item, rawQuery) {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const article = normalizeSearchText(item?.article);
  const name = normalizeSearchText(item?.name);
  const label = `${article} ${name}`.trim();
  if (!label) return false;
  if (label.includes(q) || article.includes(q) || name.includes(q)) return true;
  return (
    isOneEditAway(article, q) ||
    isOneEditAway(name, q) ||
    label
      .split(" ")
      .filter(Boolean)
      .some((part) => isOneEditAway(part, q))
  );
}

const ALL_STAGES_ORDERED = ["laser", "saw", "bending", "welding", "painting"];

const STAGE_COLORS = {
  laser:    { bg: "#1a3a5c", border: "#3b82f6", text: "#93c5fd", icon: "⚡" },
  saw:      { bg: "#1a2e1a", border: "#22c55e", text: "#86efac", icon: "🔩" },
  bending:  { bg: "#2d1a3a", border: "#a855f7", text: "#d8b4fe", icon: "⚙️" },
  welding:  { bg: "#3a2a1a", border: "#f97316", text: "#fdba74", icon: "🔥" },
  painting: { bg: "#1a2a3a", border: "#06b6d4", text: "#67e8f9", icon: "🎨" },
};

const WELDING_EXECUTORS = ["Сергей", "Иван", "Виталик", "Андрей"];

function StageBadge({ stage, size = "md" }) {
  const c = STAGE_COLORS[stage] || { bg: "#222", border: "#666", text: "#ccc", icon: "•" };
  const label = STAGE_LABELS[stage] || stage;
  return (
    <span
      className={`stage-badge stage-badge--${size}`}
      style={{ background: c.bg, borderColor: c.border, color: c.text }}
    >
      <span className="stage-badge__icon">{c.icon}</span>
      {label}
    </span>
  );
}

function RouteEditor({ value, onChange, disabled }) {
  const route = Array.isArray(value) && value.length > 0 ? value : ["laser", "bending", "welding", "painting"];
  const [dragSourceIdx, setDragSourceIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const addStage = (stage) => {
    if (disabled) return;
    const next = [...route, stage];
    onChange(next);
  };

  const removeAt = (idx) => {
    if (disabled) return;
    if (!(idx >= 0 && idx < route.length)) return;
    if (route.length <= 1) return;
    const next = [...route];
    next.splice(idx, 1);
    onChange(next);
  };

  const handleDragStart = (idx) => {
    setDragSourceIdx(idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (e, toIdx) => {
    e.preventDefault();
    setDragOverIdx(null);
    const fromIdx = dragSourceIdx;
    setDragSourceIdx(null);
    if (!(fromIdx >= 0)) return;
    if (fromIdx === toIdx) return;
    const next = [...route];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onChange(next);
  };

  const handleDragEnd = () => {
    setDragSourceIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div className="route-editor">
      <div className="route-editor__active-label">
        Активные этапы — перетащите для изменения порядка:
      </div>
      <div className="route-editor__chain">
        {route.map((stage, idx) => {
          const c = STAGE_COLORS[stage] || { border: "#555" };
          const isDragOver = dragOverIdx === idx && dragSourceIdx !== idx;
          return (
            <div key={`${stage}-${idx}`} className="route-editor__chain-step">
              {idx > 0 && <span className="route-editor__chain-arrow">→</span>}
              <div
                className={`route-editor__item${isDragOver ? " route-editor__item--drop-target" : ""}`}
                style={{ borderColor: c.border, cursor: disabled ? "default" : "grab" }}
                draggable={!disabled}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
              >
                <span className="route-editor__drag-handle" title="Перетащите для изменения порядка">⠿</span>
                <span className="route-editor__step-num">{idx + 1}</span>
                <StageBadge stage={stage} size="sm" />
                <button
                  type="button"
                  className="route-editor__btn route-editor__btn--remove"
                  title="Убрать из маршрута"
                  disabled={disabled || route.length <= 1}
                  onClick={() => removeAt(idx)}
                >✕</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="route-editor__unused">
        <span className="route-editor__unused-label">Добавить этап:</span>
        {ALL_STAGES_ORDERED.map((stage) => (
          <button
            key={`add-${stage}`}
            type="button"
            className="route-editor__btn route-editor__btn--add"
            disabled={disabled}
            onClick={() => addStage(stage)}
            style={{ borderColor: STAGE_COLORS[stage]?.border, color: STAGE_COLORS[stage]?.text }}
          >
            {STAGE_COLORS[stage]?.icon} {STAGE_LABELS[stage]}
          </button>
        ))}
      </div>
    </div>
  );
}

const EMPTY_CATALOG_FORM = { article: "", name: "", stageRoute: ["laser", "bending", "welding", "painting"] };

export function MetalProcessView({
  loading,
  catalogLoading,
  canOperateProduction,
  canManageOrders,
  metalProcessRows,
  metalProcessCatalogRows,
  metalProcessDraft,
  setMetalProcessDraft,
  createMetalProcessPlanItem,
  transitionMetalProcessStage,
  saveMetalProcessComment,
  deleteMetalProcessItem,
  upsertMetalCatalogItem,
  deleteMetalCatalogItem,
  metalProcessActionKey,
}) {
  const [subView, setSubView] = useState("plan");
  const [productionTab, setProductionTab] = useState("laser");
  const [catalogSearchText, setCatalogSearchText] = useState("");
  const [commentDraftById, setCommentDraftById] = useState({});
  const [kanbanDrawerId, setKanbanDrawerId] = useState("");
  const [planPreviewRow, setPlanPreviewRow] = useState(null);
  const [catalogForm, setCatalogForm] = useState(EMPTY_CATALOG_FORM);
  const [catalogEditArticle, setCatalogEditArticle] = useState(null);
  const [catalogTableSearch, setCatalogTableSearch] = useState("");
  const [doneDialog, setDoneDialog] = useState({ open: false, row: null, edit: false, doneQty: "", note: "" });
  const [weldingDialog, setWeldingDialog] = useState({ open: false, row: null, executor: "" });
  const [eventsDialog, setEventsDialog] = useState({ open: false, row: null, loading: false, error: "", events: [] });
  const catalogEditorRef = useRef(null);
  const catalogArticleInputRef = useRef(null);
  const options = useMemo(
    () => (Array.isArray(metalProcessCatalogRows) ? metalProcessCatalogRows : []),
    [metalProcessCatalogRows],
  );
  const rows = useMemo(
    () => (Array.isArray(metalProcessRows) ? metalProcessRows : []),
    [metalProcessRows],
  );

  const filteredCatalog = useMemo(() => {
    const q = normalizeSearchText(catalogSearchText);
    if (!q) return options;
    return options.filter((x) => matchesCatalogQuery(x, q));
  }, [catalogSearchText, options]);
  const applyCatalogMatch = (list, rawValue) => {
    const normalized = normalizeSearchText(rawValue);
    if (!normalized) return;
    const exact = list.find((x) => `${x.article} - ${x.name}`.toLowerCase() === normalized);
    const byArticle = list.find((x) => String(x.article || "").toLowerCase() === normalized);
    const byName = list.find((x) => String(x.name || "").toLowerCase() === normalized);
    const contains = list.find((x) => matchesCatalogQuery(x, normalized));
    const matched = exact || byArticle || byName || contains || null;
    if (!matched) return;
    setMetalProcessDraft((prev) => ({
      ...prev,
      article: matched.article || prev.article,
      name: matched.name || prev.name,
    }));
  };
  const handleCatalogSearchChange = (rawValue) => {
    const value = String(rawValue || "");
    setCatalogSearchText(value);
    applyCatalogMatch(options, value);
  };

  const activeRows = useMemo(
    () => rows.filter((row) => {
      const status = String(row.status || "").toLowerCase();
      return status === "active";
    }),
    [rows],
  );
  const stageRows = useMemo(() => {
    return {
      laser: activeRows.filter((x) => x.currentStage === "laser"),
      saw: activeRows.filter((x) => x.currentStage === "saw"),
      bending: activeRows.filter((x) => x.currentStage === "bending"),
      welding: activeRows.filter((x) => x.currentStage === "welding"),
      painting: activeRows.filter((x) => x.currentStage === "painting"),
    };
  }, [activeRows]);

  const operatorRows = useMemo(
    () => activeRows.filter((row) => String(row.status || "").toLowerCase() !== "done"),
    [activeRows],
  );
  const doneRows = useMemo(
    () => rows.filter((row) => String(row.status || "").toLowerCase() === "done"),
    [rows],
  );
  const planRows = useMemo(
    () => rows.filter((row) => String(row?.status || "").toLowerCase() !== "cancelled"),
    [rows],
  );
  const productionRows = useMemo(() => {
    if (productionTab === "done") return doneRows;
    return operatorRows.filter((row) => row.currentStage === productionTab);
  }, [doneRows, operatorRows, productionTab]);
  const statsRows = useMemo(() => {
    return [...rows]
      .filter((row) => String(row?.status || "").toLowerCase() !== "cancelled")
      .map((row) => {
        const laser = Number(row.laserSeconds || 0);
        const saw = Number(row.sawSeconds || 0);
        const bending = Number(row.bendingSeconds || 0);
        const welding = Number(row.weldingSeconds || 0);
        const painting = Number(row.paintingSeconds || 0);
        return {
          ...row,
          totalSeconds: laser + saw + bending + welding + painting,
        };
      })
      .sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [rows]);
  const statsTotals = useMemo(() => {
    return statsRows.reduce(
      (acc, row) => {
        acc.laser += Number(row.laserSeconds || 0);
        acc.saw += Number(row.sawSeconds || 0);
        acc.bending += Number(row.bendingSeconds || 0);
        acc.welding += Number(row.weldingSeconds || 0);
        acc.painting += Number(row.paintingSeconds || 0);
        acc.total += Number(row.totalSeconds || 0);
        return acc;
      },
      { laser: 0, saw: 0, bending: 0, welding: 0, painting: 0, total: 0 },
    );
  }, [statsRows]);
  const kanbanDrawerRow = useMemo(() => {
    const id = Number(kanbanDrawerId || 0);
    if (!(id > 0)) return null;
    return rows.find((row) => Number(row?.id || 0) === id) || null;
  }, [kanbanDrawerId, rows]);

  useEffect(() => {
    if (!kanbanDrawerId) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setKanbanDrawerId("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kanbanDrawerId]);
  const startFromPlan = async (rowId, stage) => {
    await transitionMetalProcessStage(rowId, "start", stage);
  };

  const removePlanItem = async (row) => {
    const rowId = Number(row?.id || 0);
    if (!(rowId > 0)) return;
    const ok = window.confirm(`Удалить заказ из плана?\n\n${row?.article || ""} — ${row?.name || ""}\nКол-во: ${row?.qty || 0}\n\nДействие необратимо.`);
    if (!ok) return;
    await deleteMetalProcessItem(rowId);
  };

  const openDoneDialog = (row) => {
    const qty = Number(row?.qty || 0);
    const doneAlready = Number(row?.stageDoneQty || 0);
    const remaining = Math.max(0, qty - doneAlready);
    setDoneDialog({
      open: true,
      row,
      edit: false,
      doneQty: String(remaining > 0 ? remaining : qty || ""),
      note: "",
    });
  };

  const closeDoneDialog = () => {
    setDoneDialog({ open: false, row: null, edit: false, doneQty: "", note: "" });
  };

  const submitDoneDialog = async (forceAllDone = false) => {
    const row = doneDialog.row;
    if (!row) return;
    const qty = Number(row?.qty || 0);
    const doneAlready = Number(row?.stageDoneQty || 0);
    const remaining = Math.max(0, qty - doneAlready);
    const doneQty = forceAllDone
      ? remaining
      : Number(String(doneDialog.doneQty || "").replace(",", "."));
    if (!(doneQty >= 0) || !(doneQty <= remaining)) {
      window.alert(`Укажите выполненное кол-во от 0 до ${remaining}.`);
      return;
    }
    const note = String(doneDialog.note || "").trim();
    if (!forceAllDone && doneQty < remaining && !note) {
      window.alert("Если выполнено не всё — укажите причину (комментарий).");
      return;
    }
    closeDoneDialog();
    await transitionMetalProcessStage(row.id, "done", null, doneQty, forceAllDone ? null : (note || null));
  };

  const openWeldingExecutorDialog = (row) => {
    setWeldingDialog({
      open: true,
      row,
      executor: WELDING_EXECUTORS[0] || "",
    });
  };

  const closeWeldingExecutorDialog = () => {
    setWeldingDialog({ open: false, row: null, executor: "" });
  };

  const submitWeldingExecutorDialog = async () => {
    const row = weldingDialog.row;
    if (!row) return;
    const executor = String(weldingDialog.executor || "").trim();
    if (!executor) {
      window.alert("Выберите сварщика.");
      return;
    }
    closeWeldingExecutorDialog();
    await transitionMetalProcessStage(row.id, "start", null, null, `Сварщик: ${executor}`);
  };

  const closeEventsDialog = () => {
    setEventsDialog({ open: false, row: null, loading: false, error: "", events: [] });
  };

  const openEventsDialog = async (row) => {
    const rowId = Number(row?.id || 0);
    if (!(rowId > 0)) return;
    setEventsDialog({ open: true, row, loading: true, error: "", events: [] });
    try {
      const list = await OrderService.listMetalStageEvents(rowId);
      setEventsDialog((p) => ({ ...p, loading: false, events: Array.isArray(list) ? list : [] }));
    } catch (e) {
      const msg = String(e?.message || e || "Ошибка загрузки истории");
      setEventsDialog((p) => ({ ...p, loading: false, error: msg }));
    }
  };
  const openPlanPreview = (row) => setPlanPreviewRow(row || null);
  const closePlanPreview = () => setPlanPreviewRow(null);
  const printPlanPreview = () => window.print();
  const removeDoneItem = async (rowId) => {
    if (!canManageOrders) return;
    const ok = window.confirm("Удалить готовую позицию из metal-процесса? Действие необратимо.");
    if (!ok) return;
    await deleteMetalProcessItem(rowId);
  };
  const getCommentDraft = (row) => {
    const key = String(row?.id || "");
    if (!key) return "";
    const own = Object.prototype.hasOwnProperty.call(commentDraftById, key);
    if (own) return String(commentDraftById[key] || "");
    return String(row?.operatorComment || "");
  };
  const setCommentDraft = (rowId, value) => {
    const key = String(rowId || "");
    if (!key) return;
    setCommentDraftById((prev) => ({ ...prev, [key]: String(value || "") }));
  };
  const saveDrawerComment = async () => {
    if (!kanbanDrawerRow || !canManageOrders) return;
    await saveMetalProcessComment(kanbanDrawerRow.id, getCommentDraft(kanbanDrawerRow));
  };
  const pickCatalogValue = (rawValue) => {
    applyCatalogMatch(options, rawValue);
    setCatalogSearchText(String(rawValue || ""));
  };
  const selectedCatalogValue = useMemo(() => {
    const currentArticle = String(metalProcessDraft.article || "").trim().toLowerCase();
    const currentName = String(metalProcessDraft.name || "").trim().toLowerCase();
    if (!currentArticle && !currentName) return "";
    const exact = filteredCatalog.find((x) => {
      const article = String(x.article || "").trim().toLowerCase();
      const name = String(x.name || "").trim().toLowerCase();
      return article === currentArticle && name === currentName;
    });
    return exact ? `${exact.article} - ${exact.name}` : "";
  }, [filteredCatalog, metalProcessDraft.article, metalProcessDraft.name]);

  return (
    <div className="metal-process-root">
      <div className="tabs tabs--overview-sub">
        <button
          type="button"
          className={subView === "plan" ? "tab active" : "tab"}
          onClick={() => setSubView("plan")}
        >
          План
        </button>
        <button
          type="button"
          className={subView === "kanban" ? "tab active" : "tab"}
          onClick={() => setSubView("kanban")}
        >
          Канбан
        </button>
        <button
          type="button"
          className={subView === "production" ? "tab active" : "tab"}
          onClick={() => setSubView("production")}
        >
          Производство
        </button>
        <button
          type="button"
          className={subView === "stats" ? "tab active" : "tab"}
          onClick={() => setSubView("stats")}
        >
          Статистика
        </button>
        {canManageOrders && (
          <button
            type="button"
            className={subView === "catalog" ? "tab active" : "tab"}
            onClick={() => setSubView("catalog")}
          >
            Каталог
          </button>
        )}
      </div>

      {subView === "plan" && planPreviewRow && (
        <div className="print-area metal-plan-print" style={{ marginBottom: 12 }}>
          <div className="print-plan-page">
            <div className="plan-top-meta">
              <span>{new Date().toLocaleString("ru-RU")}</span>
              <span>Отгрузки CRM</span>
            </div>
            <div className="plan-head-grid">
              <div className="plan-yellow" style={{ background: "#fff" }}>
                <div className="name">{escapeHtml(planPreviewRow.name || "Металл")}</div>
                <div className="strap-target">Артикул: {escapeHtml(planPreviewRow.article || "—")}</div>
              </div>
              <div className="plan-right-meta">
                <div className="plan-number-box">
                  <div>КОЛ-ВО</div>
                  <div className="num">{escapeHtml(planPreviewRow.qty ?? "—")}</div>
                </div>
              </div>
            </div>
            <table className="plan-table">
              <thead>
                <tr>
                  <th className="w-model">Изделие</th>
                  <th>Артикул</th>
                  <th className="w-qty">Кол-во</th>
                  <th>Статус</th>
                  <th>Этап</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{planPreviewRow.name || "—"}</td>
                  <td>{planPreviewRow.article || "—"}</td>
                  <td style={{ fontWeight: 900, textAlign: "center" }}>{planPreviewRow.qty ?? "—"}</td>
                  <td>{formatPlanStatus(planPreviewRow)}</td>
                  <td>{getPlanStageLabel(planPreviewRow)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="actions" style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button type="button" className="mini" onClick={printPlanPreview}>Печать</button>
            <button type="button" className="mini" onClick={closePlanPreview}>Закрыть</button>
          </div>
        </div>
      )}

      {doneDialog.open && doneDialog.row && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="dialog-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDoneDialog();
          }}
        >
          <div className="dialog-card" style={{ maxWidth: 520 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Завершить этап</div>
            <div style={{ color: "#475569", fontSize: 12, marginBottom: 12 }}>
              {doneDialog.row.name} — {doneDialog.row.article} (этап: {STAGE_LABELS[String(doneDialog.row.currentStage || "").toLowerCase()] || doneDialog.row.currentStage})
            </div>
            {!doneDialog.edit ? (
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
                <button type="button" className="mini" onClick={closeDoneDialog}>Отмена</button>
                <button type="button" className="mini" onClick={() => setDoneDialog((p) => ({ ...p, edit: true }))}>
                  Изменить
                </button>
                <button type="button" className="mini ok" onClick={() => void submitDoneDialog(true)}>
                  Всё сделано
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 800 }}>Сколько выполнено на этом этапе</span>
                    <input
                      value={doneDialog.doneQty}
                      onChange={(e) => setDoneDialog((p) => ({ ...p, doneQty: e.target.value.replace(/[^0-9.,]/g, "") }))}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 800 }}>
                      Причина (если выполнено не всё)
                    </span>
                    <textarea
                      rows={3}
                      value={doneDialog.note}
                      onChange={(e) => setDoneDialog((p) => ({ ...p, note: e.target.value }))}
                      placeholder="Например: не хватило материала / брак / поломка / нет людей..."
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
                  <button type="button" className="mini" onClick={closeDoneDialog}>Отмена</button>
                  <button type="button" className="mini ok" onClick={() => void submitDoneDialog(false)}>Готово</button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}

      {weldingDialog.open && weldingDialog.row && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="dialog-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeWeldingExecutorDialog();
          }}
        >
          <div className="dialog-card" style={{ maxWidth: 520 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Сварка: выбрать сварщика</div>
            <div style={{ color: "#475569", fontSize: 12, marginBottom: 12 }}>
              {weldingDialog.row.name} — {weldingDialog.row.article}
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>Исполнитель</span>
              <select
                className="metal-process-field"
                value={weldingDialog.executor}
                onChange={(e) => setWeldingDialog((p) => ({ ...p, executor: e.target.value }))}
              >
                {WELDING_EXECUTORS.map((x) => (
                  <option key={`welder-${x}`} value={x}>{x}</option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
              <button type="button" className="mini" onClick={closeWeldingExecutorDialog}>Отмена</button>
              <button type="button" className="mini ok" onClick={() => void submitWeldingExecutorDialog()}>Начать</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {eventsDialog.open && eventsDialog.row && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="dialog-backdrop metal-events-dialog"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEventsDialog();
          }}
        >
          <div className="dialog-card">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>История этапов</div>
              <button type="button" className="mini" onClick={closeEventsDialog}>Закрыть</button>
            </div>
            <div style={{ color: "#475569", fontSize: 12, marginTop: 6 }}>
              {eventsDialog.row.name} — {eventsDialog.row.article}
            </div>
            {eventsDialog.loading ? (
              <div className="empty" style={{ marginTop: 12 }}>Загрузка…</div>
            ) : eventsDialog.error ? (
              <div className="empty" style={{ marginTop: 12, color: "#b91c1c" }}>{eventsDialog.error}</div>
            ) : (
              <div style={{ marginTop: 12, overflow: "auto" }}>
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th>Время</th>
                      <th>Этап</th>
                      <th>Действие</th>
                      <th>Сделано</th>
                      <th>Было → стало</th>
                      <th>Не хватило</th>
                      <th>Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(eventsDialog.events || []).length === 0 ? (
                      <tr><td colSpan={7} className="empty">Событий пока нет.</td></tr>
                    ) : (
                      (eventsDialog.events || []).map((ev) => {
                        const stageKey = String(ev.stage || "").toLowerCase();
                        const action = String(ev.action || "");
                        const doneQty = ev.done_qty ?? ev.doneQty;
                        const qtyBefore = ev.qty_before ?? ev.qtyBefore;
                        const qtyAfter = ev.qty_after ?? ev.qtyAfter;
                        const shortfall = ev.shortfall_added ?? ev.shortfallAdded;
                        const note = String(ev.note || "").trim();
                        const ts = ev.event_at || ev.eventAt;
                        const timeLabel = ts ? new Date(ts).toLocaleString("ru-RU") : "-";
                        const actionLabel =
                          action === "start" ? "Начать" :
                          action === "pause" ? "Пауза" :
                          action === "resume" ? "Продолжить" :
                          action === "done" ? "Готово" : action;
                        return (
                          <tr key={`ev-${ev.id}-${timeLabel}`}>
                            <td style={{ whiteSpace: "nowrap" }}>{timeLabel}</td>
                            <td>{STAGE_LABELS[stageKey] || stageKey || "-"}</td>
                            <td>{actionLabel}</td>
                            <td>{doneQty != null ? doneQty : "-"}</td>
                            <td>{qtyBefore != null || qtyAfter != null ? `${qtyBefore ?? "-"} → ${qtyAfter ?? "-"}` : "-"}</td>
                            <td>{Number(shortfall || 0) > 0 ? <b>{shortfall}</b> : "-"}</td>
                            <td style={{ minWidth: 220 }}>{note || "-"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {subView === "plan" && (
        <div className="sheet-table-wrap" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Добавить план</div>
          <div className="metal-process-form">
            <input
              className="metal-process-field metal-process-field--search"
              placeholder="Поиск по артикулу или названию"
              value={catalogSearchText}
              onChange={(e) => handleCatalogSearchChange(e.target.value)}
            />
            <input
              className="metal-process-field metal-process-field--article"
              placeholder="Артикул металла"
              value={metalProcessDraft.article}
              onChange={(e) => setMetalProcessDraft((prev) => ({ ...prev, article: e.target.value }))}
            />
            <select
              className="metal-process-field metal-process-field--catalog"
              value={selectedCatalogValue}
              onChange={(e) => pickCatalogValue(e.target.value)}
            >
              <option value="">Выберите из каталога</option>
              {filteredCatalog.slice(0, 200).map((x) => (
                <option key={`catalog-${x.article}-${x.name}`} value={`${x.article} - ${x.name}`}>
                  {x.article} - {x.name}
                </option>
              ))}
            </select>
            <input
              className="metal-process-field metal-process-field--name"
              placeholder="Название"
              value={metalProcessDraft.name}
              onChange={(e) => setMetalProcessDraft((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              className="metal-process-field metal-process-field--qty"
              placeholder="Кол-во"
              value={metalProcessDraft.qty}
              onChange={(e) =>
                setMetalProcessDraft((prev) => ({ ...prev, qty: e.target.value.replace(/[^0-9.,]/g, "") }))
              }
            />
            <button
              type="button"
              className="mini ok metal-process-field metal-process-field--submit"
              disabled={!canOperateProduction || metalProcessActionKey === "create"}
              onClick={createMetalProcessPlanItem}
            >
              {metalProcessActionKey === "create" ? "Создаю..." : "Добавить в план"}
            </button>
          </div>
          <div className="sheet-table-wrap" style={{ marginTop: 10 }}>
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th>Название</th>
                  <th>Кол-во</th>
                  <th>Текущий этап</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {!loading && planRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">План металла пока пуст.</td>
                  </tr>
                )}
                {planRows.map((row) => {
                  const rowKey = String(row.id);
                  const busy = metalProcessActionKey.startsWith(`row:${rowKey}:`);
                  const catalogItem = options.find((c) => c.article === row.article);
                  const firstStage = Array.isArray(catalogItem?.stageRoute) && catalogItem.stageRoute.length > 0
                    ? catalogItem.stageRoute[0]
                    : "laser";
                  return (
                    <tr key={`plan-${row.id}`}>
                      <td>{row.article || "-"}</td>
                      <td>{row.name || "-"}</td>
                      <td>{row.qty}</td>
                      <td>{getPlanStageLabel(row)}</td>
                      <td>{formatPlanStatus(row)}</td>
                      <td>
                        {String(row.status || "").toLowerCase() === "planned" ? (
                          <>
                            <button
                              type="button"
                              className="mini ok"
                              disabled={!canOperateProduction || busy}
                              onClick={() => void startFromPlan(row.id, firstStage)}
                              title={`Первый этап: ${STAGE_LABELS[firstStage] || firstStage}`}
                            >
                              {busy ? "Запуск..." : `В работу → ${STAGE_LABELS[firstStage] || firstStage}`}
                            </button>
                            <button
                              type="button"
                              className="mini"
                              style={{ marginLeft: 8 }}
                              onClick={() => openPlanPreview(row)}
                              title="Просмотр: изделие / артикул / количество"
                            >
                              Просмотр
                            </button>
                            {canManageOrders && (
                              <button
                                type="button"
                                className="mini warn"
                                style={{ marginLeft: 8 }}
                                disabled={busy}
                                onClick={() => void removePlanItem(row)}
                                title="Удалить заказ из плана"
                              >
                                {busy ? "…" : "Удалить"}
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="mini"
                              onClick={() => openPlanPreview(row)}
                              title="Просмотр: изделие / артикул / количество"
                            >
                              Просмотр
                            </button>
                            {canManageOrders && (
                              <button
                                type="button"
                                className="mini warn"
                                style={{ marginLeft: 8 }}
                                disabled={busy}
                                onClick={() => void removePlanItem(row)}
                                title="Удалить заказ из плана"
                              >
                                {busy ? "…" : "Удалить"}
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subView === "kanban" && (
        <div className="metal-process-kanban">
          {Object.keys(STAGE_LABELS).map((stageKey) => (
            <section key={stageKey} className="metal-process-column">
              <div className="metal-process-column__head">
                {STAGE_LABELS[stageKey]} ({stageRows[stageKey].length})
              </div>
              <div className="metal-process-column__body">
                {stageRows[stageKey].length === 0 && <div className="empty">Нет позиций</div>}
                {stageRows[stageKey].map((row) => (
                  <article
                    key={`kanban-${row.id}`}
                    className={`metal-process-card lane-${stageKey} overview-card--clickable`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setKanbanDrawerId(String(row.id))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setKanbanDrawerId(String(row.id));
                      }
                    }}
                  >
                    <div className="metal-process-card__id">#{row.article || `MP-${row.id}`}</div>
                    <div className="metal-process-card__item">{row.name || "-"}</div>
                    <div className="metal-process-card__sub">Артикул: {row.article || "-"}</div>
                    <div className="metal-process-card__meta">
                      <span>План: {row.week || "-"}</span>
                      <span>Кол-во: {row.qty || 0}</span>
                    </div>
                    <div className="metal-process-card__stage">{STAGE_LABELS[stageKey] || stageKey}</div>
                    <div className="metal-process-card__status">
                      <span>{getKanbanStatusLine(row, stageKey).icon}</span>
                      <span>{getKanbanStatusLine(row, stageKey).text}</span>
                    </div>
                    <div className="metal-process-card__next">
                      Следующий этап: {formatNextStagesLabel(resolveMetalRoute(row, options), row.currentStage, row.routeIdx)}
                    </div>
                    <div className="metal-process-card__time">Время: {formatStageTime(getStageSeconds(row, stageKey))}</div>
                    {String(row.operatorComment || "").trim() && (
                      <div className="metal-process-card__comment">Комментарий: {row.operatorComment}</div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {subView === "production" && (
        <>
          <div className="tabs tabs--overview-sub">
            <button
              type="button"
              className={productionTab === "laser" ? "tab active" : "tab"}
              onClick={() => setProductionTab("laser")}
            >
              Лазер
            </button>
            <button
              type="button"
              className={productionTab === "saw" ? "tab active" : "tab"}
              onClick={() => setProductionTab("saw")}
            >
              Пила
            </button>
            <button
              type="button"
              className={productionTab === "bending" ? "tab active" : "tab"}
              onClick={() => setProductionTab("bending")}
            >
              Гибка
            </button>
            <button
              type="button"
              className={productionTab === "welding" ? "tab active" : "tab"}
              onClick={() => setProductionTab("welding")}
            >
              Сварка
            </button>
            <button
              type="button"
              className={productionTab === "painting" ? "tab active" : "tab"}
              onClick={() => setProductionTab("painting")}
            >
              Покраска
            </button>
            <button
              type="button"
              className={productionTab === "done" ? "tab active" : "tab"}
              onClick={() => setProductionTab("done")}
            >
              Готовые
            </button>
          </div>
          {!loading && productionRows.length === 0 && (
            <div className="empty">
              {productionTab === "done" ? "Нет готовых позиций" : "Нет позиций на выбранном этапе"}
            </div>
          )}
          <div className="metal-process-production-list">
            {productionRows.map((row) => {
              const rowKey = String(row.id);
              const busy = metalProcessActionKey.startsWith(`row:${rowKey}:`);
              const stageKey = String(row.currentStage || "");
              const stageSeconds = getStageSeconds(row, stageKey);
              const stageStatus = String(row.stageStatus || "").toLowerCase();
              const isWelding = String(stageKey || "").toLowerCase() === "welding";
              return (
                <article key={`prod-${row.id}`} className="card">
                  <div className="card__content">
                    <div className="card__main">
                      <div className="line1">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <strong>{row.article} - {row.name}</strong>
                          <span className="badge meta-inline">План: {row.week || "-"}</span>
                          <span className="badge meta-inline">Кол-во: {row.qty || 0}</span>
                          <span className="badge meta-inline">{STAGE_LABELS[stageKey] || stageKey}</span>
                          <span className="badge meta-inline">Статус: {row.stageStatus || "-"}</span>
                        </div>
                      </div>
                      <div className="line2">
                        <span>ID: {row.id}</span>
                        <span>Время этапа: {formatStageTime(stageSeconds)}</span>
                      </div>
                      {String(row.operatorComment || "").trim() && (
                        <div className="card__admin-note" role="note">
                          <span className="card__admin-note-label">Комментарий для оператора</span>
                          <span className="card__admin-note-text">{row.operatorComment}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="actions">
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="mini ghost"
                        disabled={!canOperateProduction || busy || productionTab === "done" || stageStatus === "in_progress"}
                        onClick={() => {
                          if (!canOperateProduction || busy || productionTab === "done") return;
                          if (stageStatus === "paused") {
                            transitionMetalProcessStage(row.id, "resume");
                            return;
                          }
                          if (isWelding) {
                            openWeldingExecutorDialog(row);
                            return;
                          }
                          transitionMetalProcessStage(row.id, "start");
                        }}
                      >
                        {stageStatus === "paused" ? "Продолжить" : "Начать"}
                      </button>
                      <button
                        type="button"
                        className="mini ok"
                        disabled={
                          !canOperateProduction ||
                          busy ||
                          productionTab === "done" ||
                          (stageStatus !== "in_progress" && stageStatus !== "paused")
                        }
                        onClick={() => openDoneDialog(row)}
                      >
                        Готово
                      </button>
                      <button
                        type="button"
                        className="mini warn"
                        disabled={!canOperateProduction || busy || productionTab === "done" || stageStatus !== "in_progress"}
                        onClick={() => transitionMetalProcessStage(row.id, "pause")}
                      >
                        Пауза
                      </button>
                      {productionTab === "done" && canManageOrders && (
                        <button
                          type="button"
                          className="mini warn"
                          disabled={busy}
                          onClick={() => void removeDoneItem(row.id)}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      {subView === "stats" && (
        <div className="metal-process-stats">
          <div className="metal-process-stats__kpi">
            <div className="kpi"><span>Лазер</span><b>{formatStageTime(statsTotals.laser)}</b></div>
            <div className="kpi"><span>Пила</span><b>{formatStageTime(statsTotals.saw)}</b></div>
            <div className="kpi"><span>Гибка</span><b>{formatStageTime(statsTotals.bending)}</b></div>
            <div className="kpi"><span>Сварка</span><b>{formatStageTime(statsTotals.welding)}</b></div>
            <div className="kpi"><span>Покраска</span><b>{formatStageTime(statsTotals.painting)}</b></div>
            <div className="kpi"><span>Итого</span><b>{formatStageTime(statsTotals.total)}</b></div>
          </div>
          <div className="sheet-table-wrap">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th>Название</th>
                  <th>Лазер</th>
                  <th>Пила</th>
                  <th>Гибка</th>
                  <th>Сварка</th>
                  <th>Покраска</th>
                  <th>Итого</th>
                  <th>Статус</th>
                  <th>Не хватило</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {statsRows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="empty">Пока нет данных по этапам.</td>
                  </tr>
                )}
                {statsRows.map((row) => {
                  const rowKey = String(row.id);
                  const busy = metalProcessActionKey.startsWith(`row:${rowKey}:`);
                  const canDelete = canManageOrders && String(row.status || "").toLowerCase() === "done";
                  return (
                    <tr key={`stats-${row.id}`}>
                      <td>{row.article || "-"}</td>
                      <td>{row.name || "-"}</td>
                      <td>{formatStageTime(row.laserSeconds)}</td>
                      <td>{formatStageTime(row.sawSeconds)}</td>
                      <td>{formatStageTime(row.bendingSeconds)}</td>
                      <td>{formatStageTime(row.weldingSeconds)}</td>
                      <td>{formatStageTime(row.paintingSeconds)}</td>
                      <td><b>{formatStageTime(row.totalSeconds)}</b></td>
                      <td>{formatPlanStatus(row)}</td>
                      <td>{Number(row.shortfallQty || 0) > 0 ? <b>{row.shortfallQty}</b> : "-"}</td>
                      <td>
                        <button
                          type="button"
                          className="mini"
                          disabled={busy}
                          onClick={() => void openEventsDialog(row)}
                          title="История этапов и причин"
                        >
                          История
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            className="mini warn"
                            disabled={!canManageOrders || busy}
                            onClick={() => void removeDoneItem(row.id)}
                          >
                            {busy ? "Удаление..." : "Удалить"}
                          </button>
                        ) : (
                          <span className="empty" style={{ margin: 0, padding: "2px 8px" }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subView === "catalog" && canManageOrders && (() => {
        const allCatalogRows = Array.isArray(metalProcessCatalogRows)
          ? metalProcessCatalogRows.filter((x) => x?.isActive !== false)
          : [];
        const filteredCatalogRows = catalogTableSearch.trim()
          ? allCatalogRows.filter((x) => matchesCatalogQuery(x, catalogTableSearch))
          : allCatalogRows;
        const isEditing = catalogEditArticle !== null;
        const isSaving = catalogLoading || metalProcessActionKey.startsWith("catalog:");
        const startEdit = (row) => {
          setCatalogEditArticle(row.article);
          setCatalogForm({
            article: row.article,
            name: row.name,
            stageRoute: Array.isArray(row.stageRoute) && row.stageRoute.length > 0
              ? row.stageRoute
              : ["laser", "bending", "welding", "painting"],
          });
          requestAnimationFrame(() => {
            try {
              catalogEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            } catch (_) {
              /* ignore */
            }
            try {
              catalogArticleInputRef.current?.focus();
            } catch (_) {
              /* ignore */
            }
          });
        };
        const cancelEdit = () => {
          setCatalogEditArticle(null);
          setCatalogForm(EMPTY_CATALOG_FORM);
        };
        const handleSave = async () => {
          const article = String(catalogForm.article || "").trim().toUpperCase();
          const name = String(catalogForm.name || "").trim();
          if (!article || !name || !catalogForm.stageRoute.length) return;
          await upsertMetalCatalogItem(article, name, catalogForm.stageRoute, true);
          cancelEdit();
        };
        const handleDelete = async (row) => {
          const ok = window.confirm(`Удалить артикул "${row.article} — ${row.name}"?\n\nЕсли по нему уже есть история производства, он будет скрыт из каталога.\nНельзя удалить, если есть активные задания в производстве.`);
          if (!ok) return;
          await deleteMetalCatalogItem(row.article, row.name);
        };
        const isNewMode = isEditing && catalogEditArticle === "__new__";
        return (
          <div className="sheet-table-wrap" style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>Каталог артикулов</span>
              <input
                className="metal-process-field"
                style={{ flex: 1, minWidth: 160, maxWidth: 320 }}
                placeholder="Поиск по артикулу или названию…"
                value={catalogTableSearch}
                onChange={(e) => setCatalogTableSearch(e.target.value)}
              />
              <button
                type="button"
                className="mini ok"
                disabled={isSaving || isEditing}
                onClick={() => {
                  setCatalogEditArticle("__new__");
                  setCatalogForm(EMPTY_CATALOG_FORM);
                }}
              >
                + Добавить изделие
              </button>
            </div>

            {isEditing && (
              <div className="catalog-edit-card" ref={catalogEditorRef}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {isNewMode ? "Новое изделие" : `Редактирование: ${catalogEditArticle}`}
                </div>
                <div className="catalog-edit-row">
                  <label className="catalog-edit-label">Артикул</label>
                  <input
                    ref={catalogArticleInputRef}
                    className="metal-process-field"
                    placeholder="Артикул (заглавными)"
                    value={catalogForm.article}
                    disabled={!isNewMode}
                    onChange={(e) => setCatalogForm((p) => ({ ...p, article: e.target.value }))}
                    style={{ maxWidth: 220 }}
                  />
                </div>
                <div className="catalog-edit-row">
                  <label className="catalog-edit-label">Название</label>
                  <input
                    className="metal-process-field"
                    placeholder="Название изделия"
                    value={catalogForm.name}
                    onChange={(e) => setCatalogForm((p) => ({ ...p, name: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                </div>
                <div className="catalog-edit-row" style={{ alignItems: "flex-start" }}>
                  <label className="catalog-edit-label" style={{ paddingTop: 4 }}>Маршрут</label>
                  <RouteEditor
                    value={catalogForm.stageRoute}
                    onChange={(r) => setCatalogForm((p) => ({ ...p, stageRoute: r }))}
                    disabled={isSaving}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    className="mini ok"
                    disabled={
                      isSaving ||
                      !String(catalogForm.article || "").trim() ||
                      !String(catalogForm.name || "").trim() ||
                      !catalogForm.stageRoute.length
                    }
                    onClick={() => void handleSave()}
                  >
                    {isSaving ? "Сохранение…" : "Сохранить"}
                  </button>
                  <button type="button" className="mini" disabled={isSaving} onClick={cancelEdit}>
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {filteredCatalogRows.length === 0 ? (
              <div className="empty" style={{ marginTop: 12 }}>
                {catalogTableSearch.trim() ? "Ничего не найдено" : "Каталог пуст"}
              </div>
            ) : (
              <table className="catalog-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Артикул</th>
                    <th>Название</th>
                    <th>Маршрут производства</th>
                    <th style={{ width: 120 }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalogRows.map((row, rowIdx) => {
                    const route = Array.isArray(row.stageRoute) && row.stageRoute.length > 0
                      ? row.stageRoute
                      : ["laser", "bending", "welding", "painting"];
                    const busyRow = metalProcessActionKey === `catalog:delete:${row.article}`;
                    return (
                      <tr key={row.article} className={catalogEditArticle === row.article ? "row--editing" : ""}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: "var(--text-soft)", minWidth: 20, textAlign: "right" }}>
                              {rowIdx + 1}
                            </span>
                            <code style={{ fontSize: 12, background: "var(--border-main)", color: "var(--text-main)", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.02em" }}>
                              {row.article}
                            </code>
                          </div>
                        </td>
                        <td style={{ fontWeight: 500 }}>{row.name}</td>
                        <td>
                          <div className="route-badge-row">
                            {route.map((stage, idx) => (
                              <span key={`${row.article}-${idx}-${stage}`} className="route-badge">
                                {idx > 0 && <span className="route-badge__arrow">→</span>}
                                <StageBadge stage={stage} size="sm" />
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="mini"
                              disabled={isSaving || isEditing}
                              onClick={() => startEdit(row)}
                            >
                              Изменить
                            </button>
                            <button
                              type="button"
                              className="mini warn"
                              disabled={isSaving || busyRow}
                              onClick={() => void handleDelete(row)}
                            >
                              {busyRow ? "…" : "Удалить"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })()}

      <div className="empty metal-process-hint">
        Подсказка: запустите изделие в работу — первый этап берётся из маршрута каталога. Далее в «Производстве» отмечайте этапы кнопками Начать / Пауза / Готово.
      </div>

      {kanbanDrawerRow &&
        createPortal(
          <div className="order-drawer-root" role="dialog" aria-modal="true" aria-labelledby="metal-kanban-drawer-title">
            <div
              role="button"
              tabIndex={0}
              className="order-drawer-backdrop"
              aria-label="Закрыть"
              onClick={() => setKanbanDrawerId("")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setKanbanDrawerId("");
                }
              }}
            />
            <aside className="order-drawer">
              <header className="order-drawer__head">
                <div>
                  <h2 id="metal-kanban-drawer-title" className="order-drawer__title">
                    Заказ #{kanbanDrawerRow.article || kanbanDrawerRow.id}
                  </h2>
                  <p className="order-drawer__stage">
                    {STAGE_LABELS[kanbanDrawerRow.currentStage] || kanbanDrawerRow.currentStage || "-"}
                  </p>
                </div>
                <button type="button" className="order-drawer__close mini" onClick={() => setKanbanDrawerId("")}>
                  ✕
                </button>
              </header>

              <div className="order-drawer__section">
                <h3 className="order-drawer__h3">Кратко</h3>
                <ul className="order-drawer__meta">
                  <li><span>Артикул</span> <strong>{kanbanDrawerRow.article || "—"}</strong></li>
                  <li><span>Кол-во</span> <strong>{kanbanDrawerRow.qty || 0}</strong></li>
                  {Number(kanbanDrawerRow.shortfallQty || 0) > 0 && (
                    <li><span>Не хватило</span> <strong>{kanbanDrawerRow.shortfallQty}</strong></li>
                  )}
                  <li><span>Статус</span> <strong>{formatPlanStatus(kanbanDrawerRow)}</strong></li>
                </ul>
              </div>
              {String(kanbanDrawerRow.lastEventNote || "").trim() && (
                <div className="order-drawer__section">
                  <h3 className="order-drawer__h3">Причина / заметка</h3>
                  <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.35 }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>
                      Этап: {STAGE_LABELS[String(kanbanDrawerRow.lastEventStage || "").toLowerCase()] || kanbanDrawerRow.lastEventStage || "—"}
                    </div>
                    <div style={{ color: "#334155" }}>{String(kanbanDrawerRow.lastEventNote || "").trim()}</div>
                  </div>
                </div>
              )}

              <div className="order-drawer__section">
                <h3 className="order-drawer__h3">Производство</h3>
                <div className="order-drawer__pipeline">
                  {resolveMetalRoute(kanbanDrawerRow, options).map((pipeStageKey) => (
                    <div key={pipeStageKey} className="order-drawer__pipe-step">
                      <span className={drawerDotClass(getRouteStepKind(kanbanDrawerRow, pipeStageKey, options))} />
                      <span className="order-drawer__pipe-label">{STAGE_LABELS[pipeStageKey] || pipeStageKey}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="order-drawer__section order-drawer__section--comment">
                <h3 className="order-drawer__h3">Комментарий администратора</h3>
                {canManageOrders ? (
                  <>
                    <textarea
                      className="order-drawer__textarea"
                      rows={4}
                      value={getCommentDraft(kanbanDrawerRow)}
                      onChange={(e) => setCommentDraft(kanbanDrawerRow.id, e.target.value)}
                      placeholder="Заметка для оператора..."
                      maxLength={2000}
                    />
                    <div className="order-drawer__comment-actions">
                      <button
                        type="button"
                        className="mini ok"
                        disabled={
                          metalProcessActionKey === `row:${String(kanbanDrawerRow.id)}:comment` ||
                          getCommentDraft(kanbanDrawerRow) === String(kanbanDrawerRow.operatorComment || "")
                        }
                        onClick={() => void saveDrawerComment()}
                      >
                        {metalProcessActionKey === `row:${String(kanbanDrawerRow.id)}:comment` ? "Сохранение…" : "Сохранить"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="order-drawer__comment-readonly">{String(kanbanDrawerRow.operatorComment || "").trim() || "—"}</p>
                )}
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </div>
  );
}
