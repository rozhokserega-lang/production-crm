import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShipmentSplitDialog } from "../components/ShipmentSplitDialog";
import { stripPlanItemMeta, getMaterialLabel } from "../app/orderHelpers";
import { buildStrapDisplayDeps, resolveStrapTargetCaption } from "../app/strapDisplayHelpers";
import { useShipment } from "../contexts/ShipmentContext";
import { useCutting } from "../contexts/CuttingContext";
import { useNavigation } from "../contexts/NavigationContext";
import { useAuth } from "../contexts/AuthContext";
import { useUiState } from "../contexts/UiStateContext";
import { PlanPreviewPrint } from "../components/PlanPreviewPrint";
import { getReadableTextColor } from "../utils/colorUtils";
import { normalizeFurnitureKey } from "../utils/furnitureUtils";
import { getShipmentStageKey, isStorageShipmentRow } from "../utils/shipmentUtils";
import { stageBg, stageLabel } from "../app/statusHelpers";
import { parseItemSize } from "../app/appUtils";

export const ShipmentView = memo(function ShipmentView() {
  const { loading, actionLoading } = useUiState();
  const { canOperateProduction, canManageOrders } = useAuth();
  const { addItems: addItemsToCutting } = useCutting();
  const { setView } = useNavigation();
  const {
    selectedShipments,
    strapItems,
    selectedShipmentSummary,
    selectedShipmentStockCheck,
    selectedShipmentMetal,
    strapCalculation,
    shipmentPlanDeficits,
    articleLookupByItemKey,
    planPreviews,
    setPlanPreviews,
    filtered,
    shipmentViewMode,
    shipmentTableGroupNames,
    shipmentTableGroupNamesForView,
    hiddenShipmentGroups,
    setHiddenShipmentGroups,
    shipmentTableRowsWithStockStatus,
    shipmentTableRowsForView,
    toggleShipmentSelection,
    shipmentRenderSections,
    shipmentRenderSectionsForView,
    toggleSectionCollapsed,
    isSectionCollapsed,
    sortItemsForShipment,
    visibleCellsForItem,
    shipmentMaterialBalance,
    shipmentOrderMaps,
    setHoverTip,
    sendableSelectedCount,
    previewSelectedShipmentPlan,
    sendSelectedShipmentToWork,
    deleteSelectedShipmentPlan,
    splitSelectedShipmentPlan,
    openEditPlanDialog,
    setSelectedShipments,
    weeks,
    furnitureDetailArticleRows,
  } = useShipment();

  const strapDisplayDeps = useMemo(
    () => buildStrapDisplayDeps(furnitureDetailArticleRows),
    [furnitureDetailArticleRows],
  );

  const [splitDialogOpen, setSplitDialogOpen] = useState(false);

  const tableRows = shipmentTableRowsForView ?? shipmentTableRowsWithStockStatus;
  const tableSections = shipmentRenderSectionsForView ?? shipmentRenderSections;
  const tableGroupNames = shipmentTableGroupNamesForView ?? shipmentTableGroupNames;

  const isPlanPreviewOpen = planPreviews.length > 0;
  const planPreviewRef = useRef(null);

  useEffect(() => {
    if (!isPlanPreviewOpen) return;
    // Opening preview does not necessarily change scroll position; if the user is deep in the table,
    // bring the preview sheet into view automatically.
    const el = planPreviewRef.current;
    // Defer one tick to ensure layout is committed.
    requestAnimationFrame(() => {
      // Jump close to the top first to avoid weird nested scroll containers.
      try {
        window.scrollTo?.(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        document.querySelector?.(".shipment-layout")?.scrollTo?.(0, 0);
      } catch (_) {
        // no-op
      }
      if (el?.scrollIntoView) {
        // Use default behavior ("auto") for broad browser compatibility.
        el.scrollIntoView({ block: "start" });
        return;
      }
      // Fallback: jump to top so the preview is visible.
      window.scrollTo?.({ top: 0, left: 0 });
    });
  }, [isPlanPreviewOpen]);
  const storageSelected = selectedShipments.filter(isStorageShipmentRow);
  const storageSelectedCount = storageSelected.length;

  const addToCutting = useCallback(() => {
    const cuttingItems = [];
    for (const s of storageSelected) {
      const name = String(s.item || "").trim();
      const size = parseItemSize(name);
      if (!size) continue;
      cuttingItems.push({
        itemName: name,
        w: size.a,
        h: size.b,
        qty: Math.max(1, Number(s.qty || 1)),
        material: String(s.material || "").trim() || "ДСП",
        week: String(s.week || "").trim(),
        section: String(s.section || "").trim(),
      });
    }
    if (cuttingItems.length > 0) {
      addItemsToCutting(cuttingItems);
    }
    setView("cutting");
  }, [storageSelected, addItemsToCutting, setView]);
  const norm = (v) => {
    const raw = String(v || "").trim();
    if (!raw) return "";
    const base = typeof normalizeFurnitureKey === "function"
      ? normalizeFurnitureKey(raw)
      : raw.toLowerCase().replace(/[ё]/g, "е").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    return String(base || "").replace(/[xх×]/g, "x").replace(/\s+/g, " ").trim();
  };
  const isPlaceholderPlanPreview = (p) => {
    const rows = Array.isArray(p?.rows) ? p.rows.filter((r) => String(r?.part || "").trim()) : [];
    if (rows.length !== 1) return false;
    const part = norm(rows[0]?.part);
    const name1 = norm(p?.firstName);
    const name2 = norm(p?.detailedName);
    if (!part || (!name1 && !name2)) return false;
    const qtyOk = Number(rows[0]?.qty || 0) === Number(p?.qty || 0);
    return qtyOk && (part === name1 || part === name2);
  };

  return (
    <div className={`shipment-layout ${isPlanPreviewOpen ? "is-plan-preview-open" : ""}`}>
      {!isPlanPreviewOpen && <aside className="selection-summary-pane">
        {selectedShipments.length > 0 || strapItems.length > 0 ? (
          <div className="selection-summary">
            <div className="selection-summary-title">Расчет для выделенных ячеек:</div>
            {selectedShipmentSummary.items.map((x, idx) => {
              const strapCaption = resolveStrapTargetCaption(x, strapDisplayDeps);
              return (
              <div key={`${x.row}-${x.col}-${idx}`} className="selection-summary-item">
                <div>{x.item}</div>
                {strapCaption ? <div style={{ color: "#92400e", fontSize: 13 }}>{strapCaption}</div> : null}
                {x.multiDecor && x.materialLines?.length > 0 ? (
                  <div>
                    <div>
                      {x.qty} шт. {"->"} {x.sheetsNeeded} лист(ов) всего:
                    </div>
                    {x.materialLines.map((line) => (
                      <div key={`${x.row}-${x.col}-${line.material}`} style={{ marginLeft: 8, fontSize: 13 }}>
                        • {line.material}: {line.sheets} лист(ов)
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    {x.qty} шт. {"->"} {x.sheetsNeeded} лист(ов) {x.material}
                    {!x.sheetsExact && x.outputPerSheet > 0 ? " (оценка)" : ""}
                    {!x.sheetsExact && x.outputPerSheet <= 0 ? " (нет данных по раскрою)" : ""}
                  </div>
                )}
              </div>
            );
            })}
            <div className="selection-summary-title" style={{ marginTop: 10 }}>Общее количество:</div>
            {selectedShipmentSummary.materials.map((m) => (
              <div key={m.material}>• {m.material}: {m.sheets} лист(ов)</div>
            ))}
            {selectedShipmentStockCheck.deficits.length > 0 && (
              <>
                <div className="selection-summary-title" style={{ marginTop: 10, color: "#be123c" }}>
                  Нехватка материала по выбранным заказам:
                </div>
                {selectedShipmentStockCheck.deficits.map((d) => (
                  <div key={`deficit-${d.material}`} style={{ color: "#be123c" }}>
                    • {d.material}: нужно {d.needed}, доступно {d.available}, не хватает {d.deficit} лист(ов)
                  </div>
                ))}
              </>
            )}
            <div className="selection-summary-title" style={{ marginTop: 10 }}>
              Металл по выбранным заказам:
            </div>
            {selectedShipmentMetal.loading && <div>Считаю комплектующие металла...</div>}
            {!selectedShipmentMetal.loading && selectedShipmentMetal.rows.length === 0 && (
              <div>Нет данных по металлу для выбранных изделий.</div>
            )}
            {!selectedShipmentMetal.loading && selectedShipmentMetal.rows.map((m) => (
              <div key={`metal-${m.metalArticle}`} style={{ color: m.deficitQty > 0 ? "#be123c" : undefined }}>
                • {m.metalName} ({m.metalArticle}): нужно {m.neededQty}, в наличии {m.qtyAvailable}
                {m.deficitQty > 0 ? `, не хватает ${m.deficitQty}` : " • хватает"}
              </div>
            ))}
            {!selectedShipmentMetal.loading && selectedShipmentMetal.missingItems.length > 0 && (
              <div style={{ marginTop: 6, color: "#7c2d12" }}>
                Нет мебельного артикула для: {selectedShipmentMetal.missingItems.join(", ")}
              </div>
            )}
            <div className="selection-summary-stats">
              <div>Обработано ячеек: {selectedShipmentSummary.selectedCount}</div>
              <div>Всего листов: {selectedShipmentSummary.totalSheets}</div>
              {selectedShipmentSummary.selectedCount > 0 ? (
                <div className="selection-summary-total-qty">
                  Сумма изделий: <b>{selectedShipmentSummary.totalQty}</b> шт.
                </div>
              ) : null}
            </div>
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
                        • {x.name.replace(/[()]/g, "").replace("_", "×")}: {x.qty} шт {"->"} {x.invalid ? "не помещается" : `${x.sheets} листов (по ${x.perSheet} шт/лист)`}
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
            {shipmentPlanDeficits.length > 0 && (
              <>
                <div className="selection-summary-title" style={{ marginTop: 10, color: "#be123c" }}>
                  Нехватка по всему плану:
                </div>
                {shipmentPlanDeficits.map((d) => (
                  <div key={`plan-deficit-${d.material}`} style={{ color: "#be123c" }}>
                    • {d.material}: нужно {d.needed}, доступно {d.available}, не хватает {d.deficit} лист(ов)
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </aside>}
      <div className="shipment-main">
        {isPlanPreviewOpen && (
          <div ref={planPreviewRef} className="print-area">
            {planPreviews.map((planPreview, idx) => (
              <div key={planPreview._key || idx} className="plan-preview-stack">
                {planPreview.isStrapPlan ? (
                  <div className="plan-preview print-plan-page">
                    <div className="strap-print-title">ЗАДАНИЕ В РАБОТУ: ПЛАНКИ ОБВЯЗКИ</div>
                    <div className="strap-print-meta no-print">Дата: {planPreview.generatedAt}</div>
                    {Array.isArray(planPreview.products) && planPreview.products.length > 0 && (
                      <div className="strap-print-meta no-print">
                        Для изделия: {planPreview.products.join(", ")}
                      </div>
                    )}
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
                  </div>
                ) : (
                  <PlanPreviewPrint
                    planPreview={planPreview}
                    articleLookupByItemKey={articleLookupByItemKey}
                    showFurnitureDebug={isPlaceholderPlanPreview(planPreview)}
                  />
                )}
                <div className="actions">
                  <button className="mini" onClick={() => window.print()}>Печать</button>
                  <button className="mini" onClick={() => setPlanPreviews([])}>Закрыть</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!isPlanPreviewOpen && !filtered.length && !loading && <div className="empty">Нет позиций в отгрузке</div>}
        {!isPlanPreviewOpen && shipmentViewMode === "table" && (
          <div>
            <div className="shipment-group-filters">
              <span className="shipment-group-filters__label">Группы:</span>
              {tableGroupNames.map((groupName) => {
                const hidden = !!hiddenShipmentGroups[groupName];
                return (
                  <button
                    type="button"
                    key={groupName}
                    className={hidden ? "mini shipment-group-chip hidden" : "mini shipment-group-chip"}
                    onClick={() => setHiddenShipmentGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }))}
                    title={hidden ? "Показать группу" : "Скрыть группу"}
                  >
                    {groupName}
                  </button>
                );
              })}
              {tableGroupNames.length > 0 && (
                <button
                  type="button"
                  className="mini shipment-group-reset"
                  onClick={() =>
                    setHiddenShipmentGroups(
                      Object.fromEntries(tableGroupNames.map((name) => [name, true]))
                    )
                  }
                >
                  Скрыть все
                </button>
              )}
              {Object.values(hiddenShipmentGroups).some(Boolean) && (
                <button
                  type="button"
                  className="mini shipment-group-reset"
                  onClick={() => setHiddenShipmentGroups({})}
                >
                  Показать все
                </button>
              )}
            </div>
            <div className="sheet-table-wrap">
              <table className="sheet-table shipment-plan-table">
                <thead>
                  <tr>
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
                  {tableGroupNames.flatMap((groupName) => {
                    const hidden = !!hiddenShipmentGroups[groupName];
                    const groupRows = tableRows.filter(
                      (row) => String(row.section || "Прочее") === groupName
                    );
                    const rows = [
                      <tr
                        key={`section-${groupName}`}
                        className={`shipment-plan-group-row${hidden ? " shipment-plan-group-row--collapsed" : ""}`}
                      >
                        <td colSpan={7}>
                          <button
                            type="button"
                            className="shipment-plan-group-toggle"
                            onClick={() => setHiddenShipmentGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }))}
                            title={hidden ? "Показать группу" : "Скрыть группу"}
                          >
                            <span className="shipment-plan-group-marker">{hidden ? "▸" : "▾"}</span>
                            <span className="shipment-plan-group-title">{groupName}</span>
                          </button>
                        </td>
                      </tr>,
                    ];
                    if (hidden) return rows;
                    groupRows.forEach((row) => {
                      const isSelected = selectedShipments.some((s) => s.row === row.sourceRow && s.col === row.sourceCol);
                      const isDeficitSelected = selectedShipmentStockCheck.deficitSourceKeys.has(
                        `${String(row.sourceRow || "").trim()}|${String(row.sourceCol || "").trim()}`
                      );
                      const isAwaitingLaunch = row.stageKey === "awaiting";
                      const showDeficitHighlight = isAwaitingLaunch && row.materialHasDeficit;
                      const rowBg = showDeficitHighlight
                        ? "#fbcfe8"
                        : (isDeficitSelected && isSelected ? "#fbcfe8" : (row.bg || "#ffffff"));
                      rows.push(
                        <tr
                          key={row.key}
                          className={isSelected ? "selected-row" : ""}
                          style={{ backgroundColor: rowBg, color: getReadableTextColor(rowBg) }}
                          onClick={() => {
                            const payload = {
                              row: row.sourceRow,
                              col: row.sourceCol,
                              rawRow: row.sourceRow,
                              rawCol: row.sourceCol,
                              section: row.section,
                              item: row.item,
                              sourceItem: row.sourceItem,
                              productArticle: row.productArticle,
                              strapProduct: row.strapProduct,
                              week: row.week,
                              weekCol: row.week,
                              qty: row.qty,
                              material: getMaterialLabel(row.item, row.material),
                              sheetsNeeded: row.sheets,
                              availableSheets: row.availableSheets,
                              outputPerSheet: row.outputPerSheet,
                              canSendToWork: !!row.canSendToWork,
                            };
                            toggleShipmentSelection(payload);
                          }}
                        >
                          <td>{row.item}</td>
                          <td>{row.material || "-"}</td>
                          <td>{row.week}</td>
                          <td>{row.qty}</td>
                          <td>{row.sheets}</td>
                          <td>{row.availableSheets}</td>
                          <td>
                            {row.status}
                            {isAwaitingLaunch &&
                              (row.materialHasDeficit
                                ? ` • ❌ Не хватает: ${row.materialDeficit}`
                                : " • ✅ Хватает")}
                          </td>
                        </tr>
                      );
                    });
                    return rows;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!isPlanPreviewOpen && shipmentViewMode !== "table" && tableSections.map((section) => (
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
                  const materialTotals = shipmentMaterialBalance.get(normalizeFurnitureKey(it.material || "")) || { needed: 0, available: 0 };
                  const hasPendingShortage =
                    pendingCells.length > 0 &&
                    Number(materialTotals.needed || 0) > Number(materialTotals.available || 0);
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
                          const isDeficitSelected = selectedShipmentStockCheck.deficitSourceKeys.has(
                            `${String(sourceRow || "").trim()}|${String(sourceCol || "").trim()}`
                          );
                          const cls = c.canSendToWork
                            ? "ship-cell-lg selectable"
                            : c.inWork
                              ? "ship-cell-lg inwork"
                              : "ship-cell-lg blocked";
                          const stageKey = getShipmentStageKey(c, sourceRow, shipmentOrderMaps, it.item, it.material);
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
                              title={`${stageLabel(stageKey)}${bottomPill ? ` · ${bottomPill}` : ""}`}
                              aria-label={`${stageLabel(stageKey)}${bottomPill ? `, ${bottomPill}` : ""}`}
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
                                background: hasPendingShortage ? "#fbcfe8" : (isDeficitSelected && isSelected ? "#fbcfe8" : displayBg),
                                backgroundImage: "none",
                                color: getReadableTextColor(hasPendingShortage ? "#fbcfe8" : (isDeficitSelected && isSelected ? "#fbcfe8" : displayBg)),
                              }}
                              onClick={() => {
                                const payload = {
                                  row: sourceRow,
                                  col: sourceCol,
                                  rawRow: String(it.row),
                                  rawCol: String(c.col),
                                  section: section.name,
                                  item: it.item,
                                  sourceItem: it.item,
                                  productArticle: String(
                                    it.productArticle ||
                                      it.article_code ||
                                      it.articleCode ||
                                      it.article ||
                                      it.mapped_article_code ||
                                      it.mappedArticleCode ||
                                      "",
                                  ).trim(),
                                  strapProduct: String(it.strapProduct || ""),
                                  week: c.week,
                                  weekCol: c.week,
                                  qty: c.qty,
                                  material: materialLabel,
                                  sheetsNeeded: sheetsN,
                                  availableSheets: Number(c.availableSheets || 0),
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
      <aside className="shipment-actions-pane">
        {selectedShipments.length > 0 && (
          <div className="shipment-toolbar shipment-toolbar--side">
            <div className="shipment-toolbar__summary">
              <>Выбрано ячеек: <b>{selectedShipments.length}</b> | Готово к отправке: <b>{sendableSelectedCount}</b></>
              {strapItems.length > 0 && (
                <> | Обвязка: <b>{strapItems.reduce((sum, x) => sum + Number(x.qty || 0), 0)} шт.</b></>
              )}
              {selectedShipments.length === 1 && (() => {
                const sel = selectedShipments[0];
                const strapCaption = resolveStrapTargetCaption(sel, strapDisplayDeps);
                return (
                <>
                  {" "} | <b>{sel.item}</b>
                  {strapCaption ? (
                    <> · <b>{strapCaption}</b></>
                  ) : null}
                  {" "}| Неделя <b>{sel.week || "-"}</b> | Кол-во <b>{sel.qty}</b>
                </>
                );
              })()}
            </div>
            <div className="actions shipment-toolbar__actions">
              <button
                className="mini"
                disabled={actionLoading === "preview:batch" || selectedShipments.length === 0}
                onClick={() => {
                  try {
                    if (import.meta?.env?.DEV) {
                      const first = selectedShipments?.[0] || {};
                      console.info("[CRM PREVIEW] click", {
                        count: Number(selectedShipments?.length || 0),
                        actionLoading,
                        first: {
                          row: String(first?.row ?? ""),
                          col: String(first?.col ?? ""),
                          week: String(first?.week ?? ""),
                          item: String(first?.item ?? ""),
                        },
                      });
                    }
                  } catch (_) {
                    // ignore
                  }
                  previewSelectedShipmentPlan?.();
                }}
              >
                Предпросмотр плана
                {selectedShipments.length > 1 ? ` (${selectedShipments.length})` : ""}
              </button>
              <button
                className="mini"
                disabled={actionLoading === "shipment:bulk" || sendableSelectedCount === 0 || !canOperateProduction}
                onClick={sendSelectedShipmentToWork}
              >
                Отправить в работу ({sendableSelectedCount})
              </button>
              <button
                className="mini warn"
                disabled={
                  actionLoading === "shipment:delete" ||
                  selectedShipments.filter((s) => !!s.canSendToWork).length === 0 ||
                  !canManageOrders
                }
                onClick={deleteSelectedShipmentPlan}
              >
                Удалить из плана
              </button>
              {selectedShipments.length === 1 && !!selectedShipments[0]?.canSendToWork && (
                <button
                  className="mini"
                  disabled={!!actionLoading || !canOperateProduction}
                  onClick={() => void openEditPlanDialog(selectedShipments[0])}
                >
                  Редактировать
                </button>
              )}
              {selectedShipments.length === 1 && !!selectedShipments[0]?.canSendToWork && (
                <button
                  className="mini accent"
                  disabled={actionLoading === "shipment:split" || !canManageOrders}
                  onClick={() => setSplitDialogOpen(true)}
                >
                  Разделить
                </button>
              )}
              {storageSelectedCount > 0 && (
                <button
                  className="mini accent"
                  onClick={addToCutting}
                >
                  ✂ Раскрой ({storageSelectedCount})
                </button>
              )}
              <button className="mini" onClick={() => setSelectedShipments([])}>
                Сбросить выбор
              </button>
            </div>
          </div>
        )}
      </aside>

      <ShipmentSplitDialog
        open={splitDialogOpen}
        selection={selectedShipments.length === 1 ? selectedShipments[0] : null}
        weeks={weeks}
        loading={actionLoading === "shipment:split"}
        onClose={() => {
          if (actionLoading === "shipment:split") return;
          setSplitDialogOpen(false);
        }}
        onConfirm={async (payload) => {
          const ok = await splitSelectedShipmentPlan(selectedShipments[0], payload);
          if (ok) setSplitDialogOpen(false);
        }}
      />
    </div>
  );
});
