import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { planCatalogRowSelectKey, matchPlanCatalogRowSelectKey, resolvePlanCatalogSelection } from "../app/shipmentDialogHelpers";
import { resolvePlanMonthWeeks, normalizePlanWeek, sortPlanWeeks } from "../app/overviewPlansHelpers";

function articleOptionLabel(x) {
  const item = String(x?.itemName || "").trim();
  const mat = String(x?.material || "").trim();
  if (!mat || item.toLowerCase().includes(mat.toLowerCase())) return item || "—";
  return `${item} · ${mat}`;
}

function adjustQtyValue(current, delta) {
  const n = Number(String(current || "").replace(",", "."));
  const next = (Number.isFinite(n) ? n : 0) + delta;
  return next <= 0 ? "" : String(next);
}

export function PlanDialog({
  isOpen,
  mode = "create",
  planSection,
  sectionOptions,
  planArticle,
  sectionArticles,
  selectedItemVariants,
  planMaterial,
  planMonthId,
  planMonths = [],
  planMonthsLoading = false,
  planWeek,
  weeks,
  planQty,
  planSaving,
  planPreviewing,
  onSectionChange,
  onArticleChange,
  onMaterialChange,
  onPlanMonthChange,
  onPlanWeekChange,
  onAddPlanMonthWeek,
  onPlanQtyChange,
  onSave,
  onSaveAll,
  onPreview,
  onPreviewItems,
  onClose,
  refreshPlanCatalogs,
}) {
  const qtyRef = useRef(null);
  const addCheckRef = useRef(null);
  const [pendingItems, setPendingItems] = useState([]);
  const [customWeekInput, setCustomWeekInput] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    if (typeof refreshPlanCatalogs === "function") void refreshPlanCatalogs();
  }, [isOpen, refreshPlanCatalogs]);

  useEffect(() => {
    if (isOpen) {
      setPendingItems([]);
      setCustomWeekInput("");
      setTimeout(() => qtyRef.current?.focus(), 60);
    }
  }, [isOpen]);

  // --- Все вычисления и хуки ДО раннего return ---

  const variants = Array.isArray(selectedItemVariants) ? selectedItemVariants : [];
  const materialOptions = variants.map((v) => String(v.material || "").trim()).filter(Boolean);
  const canSelectMaterial = materialOptions.length > 1;

  const selectedRow = (sectionArticles || []).find((x) =>
    matchPlanCatalogRowSelectKey(x, String(planArticle || "").trim()),
  );
  const resolvedCatalogRow = useMemo(
    () =>
      selectedRow ||
      resolvePlanCatalogSelection({
        planSection,
        planArticle,
        planMaterial,
        sectionArticles,
      }),
    [selectedRow, planSection, planArticle, planMaterial, sectionArticles],
  );
  const effectiveMaterial = String(planMaterial || resolvedCatalogRow?.material || "").trim();
  const selectedFullName = resolvedCatalogRow ? articleOptionLabel(resolvedCatalogRow) : "";

  const monthOptions = Array.isArray(planMonths) ? planMonths : [];
  const usesMonthCatalog = monthOptions.length > 0;
  const effectivePlanMonthId = useMemo(() => {
    if (!usesMonthCatalog) return String(planMonthId || "");
    const current = String(planMonthId || "");
    if (monthOptions.some((m) => String(m.id) === current)) return current;
    return String(monthOptions[0]?.id || "");
  }, [usesMonthCatalog, monthOptions, planMonthId]);
  const monthWeeks = useMemo(
    () => (usesMonthCatalog ? resolvePlanMonthWeeks(monthOptions, effectivePlanMonthId) : []),
    [usesMonthCatalog, monthOptions, effectivePlanMonthId],
  );
  const displayWeeks = useMemo(() => {
    const base = [...monthWeeks];
    const current = normalizePlanWeek(planWeek);
    if (current && !base.includes(current)) base.push(current);
    return sortPlanWeeks(base);
  }, [monthWeeks, planWeek]);
  const selectedMonth = monthOptions.find((m) => String(m.id) === effectivePlanMonthId) || null;
  const weekOptions = usesMonthCatalog
    ? monthWeeks
    : (Array.isArray(weeks) ? weeks : []).map((w) => String(w || "").trim()).filter(Boolean);

  useEffect(() => {
    if (!isOpen || !usesMonthCatalog || !monthOptions.length) return;
    const hasMonth = monthOptions.some((m) => String(m.id) === String(planMonthId));
    if (!hasMonth) onPlanMonthChange?.(String(monthOptions[0].id));
  }, [isOpen, usesMonthCatalog, monthOptions, planMonthId, onPlanMonthChange]);

  useEffect(() => {
    if (!isOpen || !usesMonthCatalog || !selectedMonth) return;
    if (String(planWeek || "").trim()) return;
    if (monthWeeks.length > 0) onPlanWeekChange?.(String(monthWeeks[0]));
  }, [isOpen, usesMonthCatalog, selectedMonth, monthWeeks, planWeek, onPlanWeekChange]);

  const qtyNum = Number(String(planQty || "").replace(",", "."));
  const hasValidQty = Number.isFinite(qtyNum) && qtyNum > 0;
  const hasValidMonth = !usesMonthCatalog || Boolean(selectedMonth);
  const hasValidWeek = Boolean(String(planWeek || "").trim());
  const summaryReady = isOpen && planSection && selectedFullName && effectiveMaterial && hasValidMonth && hasValidWeek && hasValidQty;

  const canSave = !planSaving && (pendingItems.length > 0 || summaryReady);
  const canPreview = !planSaving && !planPreviewing && (pendingItems.length > 0 || summaryReady);

  const buildCurrentSnapshot = useCallback(() => ({
    resolvedItem: String(resolvedCatalogRow?.itemName || "").trim(),
    catalogArticle: String(resolvedCatalogRow?.article || "").trim(),
    articleLabel: selectedFullName || planArticle,
    week: planWeek,
    qty: qtyNum,
    section: planSection,
    material: effectiveMaterial,
    monthId: effectivePlanMonthId,
    monthName: selectedMonth?.name || "",
  }), [resolvedCatalogRow, selectedFullName, planArticle, planWeek, qtyNum, planSection, effectiveMaterial, effectivePlanMonthId, selectedMonth]);

  const handleAddToPending = useCallback(() => {
    if (!summaryReady) return;
    setPendingItems((prev) => [...prev, buildCurrentSnapshot()]);
    onArticleChange("");
    onPlanQtyChange("");
    if (addCheckRef.current) addCheckRef.current.checked = false;
    setTimeout(() => qtyRef.current?.focus(), 60);
  }, [summaryReady, buildCurrentSnapshot, onArticleChange, onPlanQtyChange]);

  const handleKeyDown = (e) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { onSave(); return; }
  };

  const submitCustomWeek = useCallback(async () => {
    const raw = String(customWeekInput || "").trim();
    if (!raw) return;
    if (typeof onAddPlanMonthWeek === "function") {
      const ok = await onAddPlanMonthWeek(raw);
      if (ok !== false) setCustomWeekInput("");
      return;
    }
    onPlanWeekChange?.(normalizePlanWeek(raw));
    setCustomWeekInput("");
  }, [customWeekInput, onAddPlanMonthWeek, onPlanWeekChange]);

  if (!isOpen) return null;

  const isEditMode = mode === "edit";

  return (
    <div className="dialog-backdrop" onKeyDown={handleKeyDown}>
      <div className="dialog-card plan-dialog-card">
        <div className="plan-dialog__header">
          <h3 className="plan-dialog__title">
            {isEditMode ? "Редактирование плана" : "Новый план отгрузки"}
          </h3>
          <button type="button" className="plan-dialog__close" onClick={onClose} disabled={planSaving} aria-label="Закрыть">✕</button>
        </div>

        <div className="plan-dialog__form">
          {/* Секция */}
          <div className="plan-dialog__field">
            <label className="plan-dialog__label">Секция</label>
            <select
              className="plan-dialog__select"
              value={planSection}
              onChange={(e) => onSectionChange(e.target.value)}
              disabled={planSaving}
            >
              {sectionOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Изделие + полное название */}
          <div className="plan-dialog__field plan-dialog__field--col">
            <label className="plan-dialog__label plan-dialog__label--top">Изделие</label>
            <div className="plan-dialog__field-body">
              <select
                className="plan-dialog__select"
                value={planArticle}
                onChange={(e) => onArticleChange(e.target.value)}
                disabled={planSaving}
              >
                {sectionArticles.length === 0 ? (
                  <option value="">Нет изделий для секции</option>
                ) : (
                  sectionArticles.map((x) => {
                    const v = planCatalogRowSelectKey(x);
                    return <option key={v} value={v}>{articleOptionLabel(x)}</option>;
                  })
                )}
              </select>
              {selectedFullName && (
                <div className="plan-dialog__article-full">{selectedFullName}</div>
              )}
            </div>
          </div>

          {/* Материал */}
          <div className="plan-dialog__field">
            <label className="plan-dialog__label">Материал</label>
            {canSelectMaterial ? (
              <select
                className="plan-dialog__select"
                value={planMaterial}
                onChange={(e) => onMaterialChange?.(e.target.value)}
                disabled={planSaving}
              >
                {materialOptions.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <div className="plan-dialog__material-badge">
                {effectiveMaterial || <span className="plan-dialog__material-empty">Определяется по изделию</span>}
              </div>
            )}
          </div>

          {/* Месяц и неделя плана */}
          {usesMonthCatalog ? (
            <>
              <div className="plan-dialog__field">
                <label className="plan-dialog__label">Месяц</label>
                <select
                  className="plan-dialog__select"
                  value={planMonthId}
                  onChange={(e) => onPlanMonthChange?.(e.target.value)}
                  disabled={planSaving || planMonthsLoading}
                >
                  {planMonthsLoading && !monthOptions.length ? (
                    <option value="">Загрузка месяцев…</option>
                  ) : (
                    monthOptions.map((month) => (
                      <option key={month.id} value={String(month.id)}>
                        {month.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="plan-dialog__field plan-dialog__field--col">
                <label className="plan-dialog__label plan-dialog__label--top">Неделя в месяце</label>
                <div className="plan-dialog__field-body">
                  {displayWeeks.length > 0 ? (
                    <div className="plan-dialog__week-chips" role="list" aria-label="Недели месяца">
                      {displayWeeks.map((week) => {
                        const active = String(planWeek) === String(week);
                        return (
                          <button
                            key={week}
                            type="button"
                            role="listitem"
                            className={active ? "plan-dialog__week-chip plan-dialog__week-chip--active" : "plan-dialog__week-chip"}
                            onClick={() => onPlanWeekChange?.(String(week))}
                            disabled={planSaving}
                          >
                            {week}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="plan-dialog__material-empty">В этом месяце пока нет недель — добавьте номер ниже</div>
                  )}
                  <div className="plan-dialog__week-add">
                    <input
                      className="plan-dialog__input plan-dialog__input--week-add"
                      inputMode="numeric"
                      value={customWeekInput}
                      onChange={(e) => setCustomWeekInput(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="Новая неделя, напр. 86"
                      disabled={planSaving}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void submitCustomWeek();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="plan-dialog__btn plan-dialog__btn--secondary plan-dialog__week-add-btn"
                      disabled={planSaving || !String(customWeekInput || "").trim()}
                      onClick={() => { void submitCustomWeek(); }}
                    >
                      Добавить
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="plan-dialog__field plan-dialog__field--col">
              <label className="plan-dialog__label plan-dialog__label--top">Неделя</label>
              <div className="plan-dialog__field-body">
                <input
                  className="plan-dialog__input"
                  value={planWeek}
                  onChange={(e) => onPlanWeekChange(e.target.value)}
                  placeholder="Номер недели, например: 70"
                  disabled={planSaving}
                />
                {weekOptions.length > 0 && (
                  <div className="plan-dialog__week-chips">
                    <span className="plan-dialog__week-chips-label">Быстрый выбор:</span>
                    {weekOptions.slice(0, 12).map((week) => (
                      <button
                        key={week}
                        type="button"
                        className={String(planWeek) === week ? "plan-dialog__week-chip plan-dialog__week-chip--active" : "plan-dialog__week-chip"}
                        onClick={() => onPlanWeekChange?.(week)}
                        disabled={planSaving}
                      >
                        {week}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Количество с кнопками */}
          <div className="plan-dialog__field">
            <label className="plan-dialog__label">Количество</label>
            <div className="plan-dialog__qty-wrap">
              <button
                type="button"
                className="plan-dialog__qty-btn"
                onClick={() => onPlanQtyChange(adjustQtyValue(planQty, -1))}
                disabled={planSaving || !hasValidQty || qtyNum <= 1}
                aria-label="Уменьшить"
              >−</button>
              <input
                ref={qtyRef}
                className="plan-dialog__input plan-dialog__input--qty"
                inputMode="decimal"
                value={planQty}
                onChange={(e) => onPlanQtyChange(e.target.value)}
                placeholder="36"
                disabled={planSaving}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onSave(); }
                }}
              />
              <button
                type="button"
                className="plan-dialog__qty-btn"
                onClick={() => onPlanQtyChange(adjustQtyValue(planQty, +1))}
                disabled={planSaving}
                aria-label="Увеличить"
              >+</button>
              <span className="plan-dialog__qty-unit">шт</span>
            </div>
          </div>
        </div>

        {/* Строка-превью с чекбоксом */}
        {!isEditMode && summaryReady && (
          <div className="plan-dialog__summary">
            <span className="plan-dialog__summary-label">Создаётся:</span>
            <span>{planSection}</span>
            <span className="plan-dialog__summary-sep">·</span>
            <span>{selectedFullName}</span>
            <span className="plan-dialog__summary-sep">·</span>
            {selectedMonth ? (
              <>
                <span>{selectedMonth.name}</span>
                <span className="plan-dialog__summary-sep">·</span>
              </>
            ) : null}
            <span>нед. {planWeek}</span>
            <span className="plan-dialog__summary-sep">·</span>
            <b>{qtyNum} шт</b>
            <input
              ref={addCheckRef}
              type="checkbox"
              className="plan-dialog__add-trigger"
              title="Добавить в список (продолжить)"
              disabled={planSaving}
              onChange={() => handleAddToPending()}
            />
          </div>
        )}

        {/* Накопленный список позиций */}
        {!isEditMode && pendingItems.length > 0 && (
          <div className="plan-dialog__added-list">
            <div className="plan-dialog__added-list-header">
              <span className="plan-dialog__added-list-title">В план</span>
              <span className="plan-dialog__added-list-count">{pendingItems.length} {pendingItems.length === 1 ? "позиция" : pendingItems.length < 5 ? "позиции" : "позиций"}</span>
            </div>
            <div className="plan-dialog__added-list-body">
              {pendingItems.map((it, i) => (
                <div key={i} className="plan-dialog__added-item">
                  <span className="plan-dialog__added-item-num">{i + 1}</span>
                  <span className="plan-dialog__added-item-name">{it.articleLabel}</span>
                  <span className="plan-dialog__added-item-meta">
                    {it.monthName ? `${it.monthName}, ` : ""}нед.&nbsp;{it.week}
                    <span className="plan-dialog__added-item-qty">{it.qty}&nbsp;шт</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="plan-dialog__actions">
          <button
            type="button"
            className="plan-dialog__btn plan-dialog__btn--primary"
            disabled={!canSave}
            onClick={() => {
              if (pendingItems.length > 0 && typeof onSaveAll === "function") {
                const allItems = [...pendingItems];
                if (summaryReady) allItems.push(buildCurrentSnapshot());
                onSaveAll(allItems);
              } else {
                onSave();
              }
            }}
            title="Ctrl+Enter"
          >
            {planSaving ? (
              <><span className="plan-dialog__spinner" />Сохраняю…</>
            ) : "Сохранить"}
          </button>
          <button
            type="button"
            className="plan-dialog__btn plan-dialog__btn--secondary"
            disabled={!canPreview || isEditMode}
            onClick={() => {
              if (pendingItems.length > 0 && typeof onPreviewItems === "function") {
                const allItems = [...pendingItems];
                if (summaryReady) allItems.push(buildCurrentSnapshot());
                onPreviewItems(allItems);
              } else {
                onPreview();
              }
            }}
          >
            {planPreviewing ? <><span className="plan-dialog__spinner" />Загружаю…</> : "Предпросмотр"}
          </button>
          <button
            type="button"
            className="plan-dialog__btn plan-dialog__btn--ghost"
            disabled={planSaving}
            onClick={onClose}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
