import { memo, useEffect, useMemo, useState } from "react";
import { KROMKA_EXECUTORS, PRAS_EXECUTORS } from "../config";
import { extractPlanItemArticle, extractPlanItemQrQty, stripPlanItemMeta } from "../app/orderHelpers";
import { buildStrapDisplayDeps, resolveStrapTargetCaption } from "../app/strapDisplayHelpers";
import { sheetsFromTemplateKits } from "../app/appUtils";
import { findFurnitureTemplate, resolveKitsPerSheetFromTemplate } from "../app/furnitureMaterialYield";
import {
  getResolvedWorkshopStrapNeeds,
  isWorkshopStrapOrderItem,
  normalizeStrapInventoryCode,
  orderCountsTowardStrapDemand,
} from "../app/workshopStrapNeeds";
import { resolvePipelineStage, getOrderStageDisplayLabel } from "../orderPipeline";
import {
  readActiveKromkaExecutor,
  readActivePrasExecutor,
  readKromkaExecutor,
  readPrasExecutor,
} from "../app/workshopFloorMapHelpers";
import { WorkshopPlanPrintSheetIcon } from "../components/WorkshopPlanPrintDialog";

function WorkshopExecutorBadge({ name, stageLabel: stage }) {
  if (!name) return null;
  return (
    <span className="workshop-executor-badge" title={stage ? `Оператор: ${stage}` : "Оператор"}>
      <span className="workshop-executor-badge__label">{stage ? `${stage}:` : "Оператор"}</span>
      <span className="workshop-executor-badge__name">{name}</span>
    </span>
  );
}

const STAGE_PILL_CLASS = {
  pilka:            "stage-pill stage-pill--pilka",
  kromka:           "stage-pill stage-pill--kromka",
  pras:             "stage-pill stage-pill--pras",
  workshop_complete:"stage-pill stage-pill--complete",
  assembled:        "stage-pill stage-pill--assembled",
  warehouse_kit:    "stage-pill stage-pill--ready",
  ready_to_ship:    "stage-pill stage-pill--ready",
  shipped:          "stage-pill stage-pill--shipped",
};

const STAGE_ICON = {
  pilka:            "🪚",
  kromka:           "✂",
  pras:             "⚙",
  workshop_complete:"✓",
  assembled:        "📦",
  warehouse_kit:    "📦",
  ready_to_ship:    "🚚",
  shipped:          "✅",
};

export const WorkshopView = memo(function WorkshopView({
  workshop,
  permissions,
  helpers,
}) {
  const {
    workshopRows,
    loading,
    tab,
    shipmentOrders,
    shipmentBoard,
    actionLoading,
    isActionPending,
    runAction,
    executorByOrder,
    setExecutorByOrder,
    executorOptions,
    furnitureCustomTemplates,
    furnitureDetailArticleRows,
    furnitureTemplates,
    normalizeFurnitureKey,
    strapStock,
    productionDebts,
    refreshProductionDebts,
    openFinalDoneDialog,
    openPlanPrint,
    pilkaQueueSaving,
    reorderPilkaRows,
  } = workshop;
  const { canOperateProduction, canOperateWorkshopStage } = permissions;
  const canPilka = typeof canOperateWorkshopStage === "function"
    ? canOperateWorkshopStage("pilka")
    : canOperateProduction;
  const canKromka = typeof canOperateWorkshopStage === "function"
    ? canOperateWorkshopStage("kromka")
    : canOperateProduction;
  const canPras = typeof canOperateWorkshopStage === "function"
    ? canOperateWorkshopStage("pras")
    : canOperateProduction;
  const canAssembly = typeof canOperateWorkshopStage === "function"
    ? canOperateWorkshopStage("assembly")
    : canOperateProduction;
  const canFinal = typeof canOperateWorkshopStage === "function"
    ? canOperateWorkshopStage("final")
    : canOperateProduction;
  const {
    statusClass,
    resolveDefaultConsumeSheets,
    resolveDefaultConsumeSheetsFromBoard,
    isDone,
    isInWork,
    isOrderCustomerShipped,
    getMaterialLabel,
  } = helpers;

  const kromkaOptions = Array.isArray(executorOptions?.kromka) && executorOptions.kromka.length > 0
    ? executorOptions.kromka
    : KROMKA_EXECUTORS;
  const prasOptions = Array.isArray(executorOptions?.pras) && executorOptions.pras.length > 0
    ? executorOptions.pras
    : PRAS_EXECUTORS;
  const isPending = (key) => (typeof isActionPending === "function" ? isActionPending(key) : actionLoading === key);
  const pilkaReorderEnabled = tab === "pilka" && canPilka;
  const [dragOrderId, setDragOrderId] = useState(null);
  const [dragOverOrderId, setDragOverOrderId] = useState(null);

  const handlePilkaDragStart = (orderId) => (e) => {
    if (!pilkaReorderEnabled || !orderId) return;
    setDragOrderId(orderId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", orderId);
  };

  const handlePilkaDragOver = (orderId) => (e) => {
    if (!pilkaReorderEnabled || !dragOrderId || !orderId || dragOrderId === orderId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverOrderId(orderId);
  };

  const handlePilkaDrop = (orderId) => (e) => {
    e.preventDefault();
    if (!pilkaReorderEnabled || !dragOrderId || !orderId || dragOrderId === orderId) return;
    if (typeof reorderPilkaRows === "function") {
      reorderPilkaRows(workshopRows, dragOrderId, orderId);
    }
    setDragOrderId(null);
    setDragOverOrderId(null);
  };

  const resetPilkaDrag = () => {
    setDragOrderId(null);
    setDragOverOrderId(null);
  };

  // Build strap stock lookup: { "1158_50": 98, ... } (нормализуем код размера)
  const strapStockByType = useMemo(() => {
    const map = {};
    (Array.isArray(strapStock) ? strapStock : []).forEach((s) => {
      const key = normalizeStrapInventoryCode(String(s.strap_type || "").trim());
      if (key) map[key] = (map[key] || 0) + Number(s.qty || 0);
    });
    return map;
  }, [strapStock]);

  const strapDeps = useMemo(
    () => ({
      furnitureTemplates,
      furnitureCustomTemplates,
      furnitureDetailArticleRows,
      normalizeFurnitureKey,
    }),
    [furnitureTemplates, furnitureCustomTemplates, furnitureDetailArticleRows, normalizeFurnitureKey],
  );

  const strapDisplayDeps = useMemo(
    () => buildStrapDisplayDeps(furnitureDetailArticleRows),
    [furnitureDetailArticleRows],
  );

  const workshopStrapRows = useMemo(() => {
    return workshopRows.map((o) => {
      if (!orderCountsTowardStrapDemand(o)) {
        return { strapNeeds: [], strapDeficit: 0 };
      }
      const strapNeeds = getResolvedWorkshopStrapNeeds(o, strapDeps);
      const strapDeficit = strapNeeds.reduce((sum, { code, needed }) => {
        const k = normalizeStrapInventoryCode(code);
        const available = strapStockByType[k] ?? 0;
        return sum + Math.max(0, Number(needed || 0) - available);
      }, 0);
      return { strapNeeds, strapDeficit };
    });
  }, [workshopRows, strapStockByType, strapDeps]);

  useEffect(() => {
    if (tab === "debt" && typeof refreshProductionDebts === "function") {
      refreshProductionDebts();
    }
  }, [tab, refreshProductionDebts]);

  const debtByPlan = useMemo(() => {
    const map = new Map();
    (Array.isArray(productionDebts) ? productionDebts : []).forEach((row) => {
      const week = String(row?.week || "—").trim() || "—";
      const item = String(row?.item || "—").trim() || "—";
      const key = `${week}|${item}|${String(row?.material || "").trim()}`;
      if (!map.has(key)) {
        map.set(key, {
          week,
          item: stripPlanItemMeta(item),
          material: String(row?.material || "").trim(),
          qty: 0,
          rows: [],
        });
      }
      const bucket = map.get(key);
      bucket.qty += Number(row?.qty || 0) || 0;
      bucket.rows.push(row);
    });
    return Array.from(map.values()).sort((a, b) => {
      const wa = Number(String(a.week).replace(/\D/g, "")) || 0;
      const wb = Number(String(b.week).replace(/\D/g, "")) || 0;
      if (wa !== wb) return wb - wa;
      return String(a.item || "").localeCompare(String(b.item || ""), "ru");
    });
  }, [productionDebts]);

  if (tab === "debt") {
    return (
      <>
        {!debtByPlan.length && !loading && (
          <div className="empty">Нет долга по планам — все комплекты закрыты.</div>
        )}
        {debtByPlan.map((group) => (
          <article key={`${group.week}-${group.item}-${group.material}`} className="card">
            <div className="line1">
              <strong>{group.item}</strong>
              <span className="badge">План {group.week}</span>
              <span className="badge meta-inline" style={{ background: "#fff7ed", borderColor: "#fdba74", color: "#9a3412" }}>
                Долг: {group.qty} шт.
              </span>
            </div>
            <div className="line2" style={{ color: "#64748b", fontSize: 13 }}>
              {group.material ? <span>Материал: {group.material}</span> : null}
              {group.rows.map((r) => (
                <span key={r.id} style={{ display: "block", marginTop: 4 }}>
                  {Number(r.qty || 0)} шт. · заказ {r.order_id}
                  {r.created_at ? ` · ${new Date(r.created_at).toLocaleString("ru-RU")}` : ""}
                </span>
              ))}
            </div>
          </article>
        ))}
      </>
    );
  }

  return (
    <>
      {pilkaReorderEnabled && workshopRows.length > 1 && (
        <div className="workshop-pilka-queue-hint">
          Перетащите карточки для приоритета пиления
          {pilkaQueueSaving ? " · сохранение…" : ""}
        </div>
      )}
      {!workshopRows.length && !loading && <div className="empty">Нет заказов</div>}
      {workshopRows.map((o, idx) => {
        const orderId = String(o.orderId || o.order_id || "");
        const isPaused = (status) => /пауза/i.test(String(status || ""));
        const rawItem = stripPlanItemMeta(String(o.item || ""));
        const displayArticle = extractPlanItemArticle(String(o.item || ""));
        const qrQty = extractPlanItemQrQty(String(o.item || ""));
        const orderQty = Number(o.qty || 0);
        const baseDisplaySheetsNeeded =
          resolveDefaultConsumeSheets(o, shipmentOrders) || resolveDefaultConsumeSheetsFromBoard(o, shipmentBoard);

        const normalize = (v) =>
          typeof normalizeFurnitureKey === "function" ? normalizeFurnitureKey(v) : String(v || "").toLowerCase().trim();

        // Fallback: for any order which has a custom template with kits_per_sheet, use it to
        // derive sheets when backend stored 0.
        const fallbackMainFurnitureSheets = (() => {
          const kitsList = Array.isArray(furnitureCustomTemplates) ? furnitureCustomTemplates : [];
          if (!kitsList.length) return 0;
          const itemKey = normalize(rawItem);
          if (!itemKey) return 0;
          const tpl = findFurnitureTemplate(kitsList, rawItem, normalize);
          const material = String(o.material || o.colorName || o.color || "").trim();
          const kitsPerSheet = resolveKitsPerSheetFromTemplate(tpl, material);
          const qty = Number(o.qty || 0) || 0;
          return sheetsFromTemplateKits(kitsPerSheet, qty);
        })();

        const displaySheetsNeeded = Number(baseDisplaySheetsNeeded || 0) > 0 ? baseDisplaySheetsNeeded : fallbackMainFurnitureSheets;
        const displayMaterial = String(o.material || o.colorName || "").trim() || "Материал не указан";
        const adminNote = String(o.adminComment ?? o.admin_comment ?? "").trim();

        const { strapNeeds, strapDeficit } = workshopStrapRows[idx] || { strapNeeds: [], strapDeficit: 0 };

        const pilkaDone = isDone(o.pilkaStatus);
        const pilkaInWork = isInWork(o.pilkaStatus);
        const kromkaDone = isDone(o.kromkaStatus);
        const kromkaInWork = isInWork(o.kromkaStatus);
        const prasDone = isDone(o.prasStatus);
        const prasInWork = isInWork(o.prasStatus);
        const activeKromkaExecutor = readActiveKromkaExecutor(o, executorByOrder);
        const activePrasExecutor = readActivePrasExecutor(o, executorByOrder);
        const kromkaExecValue = readKromkaExecutor(o, executorByOrder, kromkaOptions);
        const prasExecValue = readPrasExecutor(o, executorByOrder, prasOptions);
        const kromkaPaused = isPaused(o.kromkaStatus);
        const prasPaused = isPaused(o.prasStatus);
        const showKromkaExecutor = Boolean(activeKromkaExecutor) && (kromkaInWork || kromkaPaused);
        const showPrasExecutor = Boolean(activePrasExecutor) && (prasInWork || prasPaused);
        const showPilka = tab === "all" || tab === "pilka";
        const showKromka = tab === "all" || tab === "kromka";
        const showPras = tab === "all" || tab === "pras";
        const strapPlankOrder = isWorkshopStrapOrderItem(o.item);
        const strapTargetCaption = resolveStrapTargetCaption(o, strapDisplayDeps);
        const showAssembly = (tab === "all" || tab === "assembly") && !strapPlankOrder;
        const showDone = (tab === "all" || tab === "done") && !strapPlankOrder;
        const assemblyDone = isDone(o.assemblyStatus);
        const packagingDone = isOrderCustomerShipped(o);
        const pauseLabels = [];
        if (isPaused(o.pilkaStatus)) pauseLabels.push("Пила");
        if (isPaused(o.kromkaStatus)) pauseLabels.push("Кромка");
        if (isPaused(o.prasStatus)) pauseLabels.push("Присадка");
        if (isPaused(o.assemblyStatus)) pauseLabels.push("Сборка");
        const hasPause = pauseLabels.length > 0;

        const pipelineStage = resolvePipelineStage(o);
        const stageLabel = getOrderStageDisplayLabel(o);
        const stagePillClass = STAGE_PILL_CLASS[pipelineStage] || "stage-pill stage-pill--pilka";
        const stageIcon = STAGE_ICON[pipelineStage] || "🪚";

        return (
          <article
            key={orderId || `${o.item}-${o.row}`}
            className={`card workshop-card ${statusClass(o)}${dragOverOrderId === orderId ? " workshop-card--drag-over" : ""}${dragOrderId === orderId ? " workshop-card--dragging" : ""}`}
            onDragOver={handlePilkaDragOver(orderId)}
            onDragLeave={() => {
              if (dragOverOrderId === orderId) setDragOverOrderId(null);
            }}
            onDrop={handlePilkaDrop(orderId)}
          >
            <div className="workshop-card__row">
              {pilkaReorderEnabled ? (
                <button
                  type="button"
                  className="workshop-card__drag"
                  draggable
                  title="Перетащите для приоритета"
                  aria-label="Перетащите для приоритета"
                  onDragStart={handlePilkaDragStart(orderId)}
                  onDragEnd={resetPilkaDrag}
                >
                  ⋮⋮
                </button>
              ) : null}
              <div className="workshop-card__body">
            <div className="card__content">
              <div className="card__main">
                <div className="line1">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>{rawItem || "—"}</strong>
                    <span className={stagePillClass}>{stageIcon} {stageLabel}</span>
                    {displayArticle ? (
                      <span className="badge meta-inline" title="Артикул комплекта">
                        {displayArticle}
                      </span>
                    ) : null}
                    <span className="badge meta-inline">План: {o.week || "-"}</span>
                    {strapTargetCaption ? (
                      <span className="badge meta-inline" title={strapTargetCaption}>
                        {strapTargetCaption}
                      </span>
                    ) : null}
                    <span className="badge meta-inline" title={qrQty > 0 && qrQty !== orderQty ? `Комплектов по QR: ${qrQty}` : undefined}>
                      Кол-во: {orderQty || 0}
                      {qrQty > 0 && qrQty !== orderQty ? ` (${qrQty} компл.)` : ""}
                    </span>
                    {hasPause && (
                      <span
                        className="badge meta-inline"
                        style={{ background: "#fff1f2", borderColor: "#fda4af", color: "#9f1239" }}
                        title={`На паузе: ${pauseLabels.join(", ")}`}
                      >
                        ПАУЗА: {pauseLabels.join(", ")}
                      </span>
                    )}
                    {showKromka && showKromkaExecutor && (
                      <span
                        className="badge meta-inline workshop-executor-badge--header"
                        title="Оператор на кромке"
                      >
                        Кромка: {activeKromkaExecutor}
                      </span>
                    )}
                    {showPras && showPrasExecutor && (
                      <span
                        className="badge meta-inline workshop-executor-badge--header"
                        title="Оператор на присадке"
                      >
                        Присадка: {activePrasExecutor}
                      </span>
                    )}
                  </div>
                </div>
                <div className="line2 workshop-card-line2">
                  <div
                    className="workshop-card-line2__meta"
                    title={`ID: ${orderId || "-"} · Листов нужно: ${Number(displaySheetsNeeded || 0)} · Листы: ${displayMaterial} (${Number(displaySheetsNeeded || 0)} шт)`}
                  >
                    <span className="workshop-card-line2__meta-text">
                      ID: {orderId || "-"} · Листов нужно: {Number(displaySheetsNeeded || 0)} · Листы:{" "}
                      {displayMaterial} ({Number(displaySheetsNeeded || 0)} шт)
                    </span>
                  </div>
                  {strapNeeds.length > 0 && (
                    <div className="workshop-card-line2__straps">
                      <div className="workshop-strap-strip" role="list">
                        {strapNeeds.map(({ code, needed, name }) => {
                          const k = normalizeStrapInventoryCode(code);
                          const available = strapStockByType[k] ?? 0;
                          const enough = available >= needed;
                          return (
                            <span
                              role="listitem"
                              key={k}
                              className={`workshop-strap-chip${enough ? " workshop-strap-chip--ok" : " workshop-strap-chip--short"}`}
                              title={`${name || k}: нужно ${needed}, в наличии ${available}${enough ? "" : `, нехватает ${Math.max(0, Number(needed || 0) - available)}`}`}
                            >
                              {k}: {available}/{needed}
                            </span>
                          );
                        })}
                      </div>
                      <span
                        className={`workshop-strap-total${strapDeficit > 0 ? " workshop-strap-total--warn" : " workshop-strap-total--ok"}`}
                        title="Сумма нехватки по всем типам планок для этого заказа"
                      >
                        {strapDeficit > 0 ? `Нехв. ${strapDeficit}` : "OK"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {adminNote ? (
                <aside className="card__admin-note card__admin-note--side" role="note">
                  <span className="card__admin-note-label">Комментарий администратора</span>
                  <span className="card__admin-note-text">{adminNote}</span>
                </aside>
              ) : null}
            </div>
            {tab !== "all" && (
              <div className="actions">
                {showPilka && (
                  <>
                    <button
                      type="button"
                      className={pilkaInWork ? "mini" : "mini ghost"}
                      disabled={isPending(`webSetPilkaInWork:${orderId}`) || pilkaDone || pilkaInWork || !canPilka}
                      onClick={() => runAction("webSetPilkaInWork", orderId, {})}
                    >
                      ▶ {tab === "pilka" ? "Начать" : "Пила: Начать"}
                    </button>
                    <button
                      className="mini ok"
                      disabled={isPending(`webSetPilkaDone:${orderId}`) || pilkaDone || !pilkaInWork || !canPilka}
                      onClick={() =>
                        runAction("webSetPilkaDone", orderId, {}, {
                          defaultSheets: displaySheetsNeeded,
                          item: o.item,
                          material: displayMaterial,
                          isPlankOrder: String(o.item || "").includes("Планки обвязки"),
                        })
                      }
                    >
                      ✓ {tab === "pilka" ? "Готово" : "Пила: Готово"}
                    </button>
                    <button
                      className="mini warn"
                      disabled={isPending(`webSetPilkaPause:${orderId}`) || pilkaDone || !pilkaInWork || !canPilka}
                      onClick={() => runAction("webSetPilkaPause", orderId)}
                    >
                      ⏸ {tab === "pilka" ? "Пауза" : "Пила: Пауза"}
                    </button>
                  </>
                )}

                {showKromka && (
                  <>
                    {!kromkaInWork ? (
                      <select
                        value={kromkaExecValue}
                        disabled={!canKromka}
                        onChange={(e) => setExecutorByOrder((prev) => ({ ...prev, [orderId]: e.target.value }))}
                      >
                        {kromkaOptions.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    ) : (
                      <WorkshopExecutorBadge name={activeKromkaExecutor} stageLabel="Кромка" />
                    )}
                    <button
                      type="button"
                      className={kromkaInWork ? "mini" : "mini ghost"}
                      disabled={isPending(`webSetKromkaInWork:${orderId}`) || kromkaDone || kromkaInWork || !canKromka}
                      onClick={() =>
                        runAction("webSetKromkaInWork", orderId, {
                          executor: kromkaExecValue,
                        })
                      }
                    >
                      ▶ {tab === "kromka" ? "Начать" : "Кромка: Начать"}
                    </button>
                    <button
                      className="mini ok"
                      disabled={isPending(`webSetKromkaDone:${orderId}`) || kromkaDone || !kromkaInWork || !canKromka}
                      onClick={() => runAction("webSetKromkaDone", orderId)}
                    >
                      ✓ {tab === "kromka" ? "Готово" : "Кромка: Готово"}
                    </button>
                    <button
                      className="mini warn"
                      disabled={isPending(`webSetKromkaPause:${orderId}`) || kromkaDone || !kromkaInWork || !canKromka}
                      onClick={() => runAction("webSetKromkaPause", orderId)}
                    >
                      ⏸ {tab === "kromka" ? "Пауза" : "Кромка: Пауза"}
                    </button>
                  </>
                )}

                {showPras && (
                  <>
                    {!prasInWork ? (
                      <select
                        value={prasExecValue}
                        disabled={!canPras}
                        onChange={(e) => setExecutorByOrder((prev) => ({ ...prev, [`${orderId}:pras`]: e.target.value }))}
                      >
                        {prasOptions.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    ) : (
                      <WorkshopExecutorBadge name={activePrasExecutor} stageLabel="Присадка" />
                    )}
                    <button
                      type="button"
                      className={prasInWork ? "mini" : "mini ghost"}
                      disabled={isPending(`webSetPrasInWork:${orderId}`) || prasDone || prasInWork || !canPras}
                      onClick={() =>
                        runAction("webSetPrasInWork", orderId, {
                          executor: prasExecValue,
                        })
                      }
                    >
                      ▶ {tab === "pras" ? "Начать" : "Присадка: Начать"}
                    </button>
                    <button
                      className="mini ok"
                      disabled={isPending(`webSetPrasDone:${orderId}`) || prasDone || !prasInWork || !canPras}
                      onClick={() =>
                        runAction("webSetPrasDone", orderId, {}, {
                          notifyOnAssembly: pilkaDone && kromkaDone && !assemblyDone,
                          item: o.item,
                          material: getMaterialLabel(o.item, o.material || o.colorName || ""),
                          week: o.week,
                          qty: o.qty,
                          executor: executorByOrder[orderId] || o.prasExecutor || "",
                          isStrapOrder: isWorkshopStrapOrderItem(o.item),
                        })
                      }
                    >
                      ✓ {tab === "pras" ? "Готово" : "Присадка: Готово"}
                    </button>
                    <button
                      className="mini warn"
                      disabled={isPending(`webSetPrasPause:${orderId}`) || prasDone || !prasInWork || !canPras}
                      onClick={() =>
                        runAction("webSetPrasPause", orderId, {}, {
                          item: o.item,
                          material: getMaterialLabel(o.item, o.material || o.colorName || ""),
                          qty: o.qty,
                          isStrapOrder: isWorkshopStrapOrderItem(o.item),
                        })
                      }
                    >
                      ⏸ {tab === "pras" ? "Пауза" : "Присадка: Пауза"}
                    </button>
                  </>
                )}
                {showAssembly && (
                  <button
                    className="mini ok"
                    disabled={isPending(`webSetAssemblyDone:${orderId}`) || assemblyDone || !canAssembly}
                    onClick={() =>
                      openFinalDoneDialog(orderId, {
                        stage: "assembly",
                        order: o,
                        qty: orderQty,
                        week: o.week,
                        item: o.item,
                        itemLabel: rawItem,
                        material: getMaterialLabel(o.item, o.material || o.colorName || ""),
                      })
                    }
                  >
                    ✓ {tab === "assembly" ? "Готово" : "Сборка: Готово"}
                  </button>
                )}
                {showDone && (
                  <button
                    className="mini ok"
                    disabled={isPending(`webSetWarehouseKitReady:${orderId}`) || packagingDone || !canFinal}
                    onClick={() =>
                      openFinalDoneDialog(orderId, {
                        stage: "final",
                        order: o,
                        qty: orderQty,
                        week: o.week,
                        item: o.item,
                        itemLabel: rawItem,
                        material: getMaterialLabel(o.item, o.material || o.colorName || ""),
                        notifyMeta: {
                          item: o.item,
                          material: getMaterialLabel(o.item, o.material || o.colorName || ""),
                          week: o.week,
                          qty: o.qty,
                          executor: executorByOrder[orderId] || o.prasExecutor || "",
                        },
                      })
                    }
                  >
                    ✓ {tab === "done" ? "Готово" : "Готово к отправке: Готово"}
                  </button>
                )}
              </div>
            )}
              </div>
              <button
                type="button"
                className="workshop-print-sheet-btn"
                title="Лист для печати"
                aria-label="Лист для печати"
                onClick={() => openPlanPrint?.(o)}
              >
                <WorkshopPlanPrintSheetIcon />
              </button>
            </div>
          </article>
        );
      })}
    </>
  );
});
