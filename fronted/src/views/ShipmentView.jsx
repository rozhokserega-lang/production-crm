export function ShipmentView({
  selectedShipments,
  strapItems,
  selectedShipmentSummary,
  selectedShipmentStockCheck,
  strapCalculation,
  shipmentPlanDeficits,
  articleLookupByItemKey,
  resolvePlanPreviewArticleByName,
  buildPlanPreviewQrPayload,
  buildQrCodeUrl,
  planPreviews,
  setPlanPreviews,
  filtered,
  loading,
  shipmentViewMode,
  shipmentTableGroupNames,
  hiddenShipmentGroups,
  setHiddenShipmentGroups,
  shipmentTableRowsWithStockStatus,
  getReadableTextColor,
  getMaterialLabel,
  toggleShipmentSelection,
  shipmentRenderSections,
  toggleSectionCollapsed,
  isSectionCollapsed,
  sortItemsForShipment,
  visibleCellsForItem,
  shipmentMaterialBalance,
  normalizeFurnitureKey,
  getShipmentStageKey,
  shipmentOrderMaps,
  stageBg,
  stageLabel,
  setHoverTip,
  sendableSelectedCount,
  actionLoading,
  previewSelectedShipmentPlan,
  canOperateProduction,
  sendSelectedShipmentToWork,
  canManageOrders,
  deleteSelectedShipmentPlan,
  setSelectedShipments,
}) {
  return (
    <div className="shipment-layout">
      <aside className="selection-summary-pane">
        {selectedShipments.length > 0 || strapItems.length > 0 ? (
          <div className="selection-summary">
            <div className="selection-summary-title">Расчет для выделенных ячеек:</div>
            {selectedShipmentSummary.items.map((x, idx) => (
              <div key={`${x.row}-${x.col}-${idx}`} className="selection-summary-item">
                <div>{x.item}</div>
                <div>
                  {x.qty} шт. {"->"} {x.sheetsNeeded} лист(ов) {x.material}
                  {!x.sheetsExact && x.outputPerSheet > 0 ? " (оценка)" : ""}
                  {!x.sheetsExact && x.outputPerSheet <= 0 ? " (нет данных по раскрою)" : ""}
                </div>
              </div>
            ))}
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
      </aside>
      <div className="shipment-main">
        {planPreviews.length > 0 && (
          <div className="print-area">
            {planPreviews.map((planPreview, idx) => (
              <div key={planPreview._key || idx} className="plan-preview print-plan-page">
                {planPreview.isStrapPlan ? (
                  <>
                    <div className="strap-print-title">ЗАДАНИЕ В РАБОТУ: ПЛАНКИ ОБВЯЗКИ</div>
                    <div className="strap-print-meta">Дата: {planPreview.generatedAt}</div>
                    {Array.isArray(planPreview.products) && planPreview.products.length > 0 && (
                      <div className="strap-print-meta">
                        Изделие: {planPreview.products.join(", ")}
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
                      <div className="plan-right-meta">
                        <div className="plan-number-box">
                          <div>ПЛАН</div>
                          <div className="num">{planPreview.planNumber || "-"}</div>
                        </div>
                        <div className="plan-qr-box">
                          {(() => {
                            const fallbackArticle = resolvePlanPreviewArticleByName(planPreview, articleLookupByItemKey);
                            return (
                              <img
                                className="plan-qr-image"
                                src={buildQrCodeUrl(buildPlanPreviewQrPayload(planPreview, fallbackArticle))}
                                alt="QR изделия/плана/количества"
                              />
                            );
                          })()}
                          <div className="plan-qr-caption">Артикул / план / количество</div>
                        </div>
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
                        {(planPreview.rows || []).map((r, i) => (
                          <tr key={`${r.part}-${i}`}>
                            <td>{i === 0 ? (planPreview.firstName || "") : ""}</td>
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
        {!filtered.length && !loading && <div className="empty">Нет позиций в отгрузке</div>}
        {shipmentViewMode === "table" && (
          <div>
            <div className="shipment-group-filters">
              <span className="shipment-group-filters__label">Группы:</span>
              {shipmentTableGroupNames.map((groupName) => {
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
              {shipmentTableGroupNames.length > 0 && (
                <button
                  type="button"
                  className="mini shipment-group-reset"
                  onClick={() =>
                    setHiddenShipmentGroups(
                      Object.fromEntries(shipmentTableGroupNames.map((name) => [name, true]))
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
                  {shipmentTableGroupNames.flatMap((groupName) => {
                    const hidden = !!hiddenShipmentGroups[groupName];
                    const groupRows = shipmentTableRowsWithStockStatus.filter(
                      (row) => String(row.section || "Прочее") === groupName
                    );
                    const rows = [
                      <tr key={`section-${groupName}`} className="shipment-plan-group-row">
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
                      const showDeficitHighlight = !!row.canSendToWork && !row.inWork && row.materialHasDeficit;
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
                            {!!row.canSendToWork && !row.inWork &&
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
        {shipmentViewMode !== "table" && shipmentRenderSections.map((section) => (
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
              {selectedShipments.length === 1 && (
                <>
                  {" "} | <b>{selectedShipments[0].item}</b> | Неделя <b>{selectedShipments[0].week || "-"}</b> | Кол-во <b>{selectedShipments[0].qty}</b>
                </>
              )}
            </div>
            <div className="actions shipment-toolbar__actions">
              <button
                className="mini"
                disabled={actionLoading === "preview:batch" || selectedShipments.length === 0}
                onClick={previewSelectedShipmentPlan}
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
              <button className="mini" onClick={() => setSelectedShipments([])}>
                Сбросить выбор
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
