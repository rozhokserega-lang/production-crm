import { Fragment, useMemo, useState } from "react";
import {
  buildMonthsSummary,
  buildPlansSummary,
  collectAvailablePlanWeeks,
  collectAwaitingPlanOrders,
  laneLabel,
  normalizePlanWeek,
} from "../app/overviewPlansHelpers";

function ProgressBar({ percent }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="overview-plans__progress" aria-hidden>
      <div className="overview-plans__progress-fill" style={{ width: `${p}%` }} />
    </div>
  );
}

function StatusBadge({ closed }) {
  return (
    <span className={`overview-plans__badge${closed ? " overview-plans__badge--closed" : ""}`}>
      {closed ? "Закрыт" : "Открыт"}
    </span>
  );
}

function MonthEditor({ availableWeeks, initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [selected, setSelected] = useState(() => new Set(initial?.weeks || []));

  const toggleWeek = (week) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week);
      else next.add(week);
      return next;
    });
  };

  const submit = () => {
    onSave(name, [...selected]);
  };

  return (
    <div className="overview-plans__editor">
      <label className="overview-plans__field">
        <span>Название месяца</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например: Май"
        />
      </label>
      <div className="overview-plans__field">
        <span>Номера планов (недели)</span>
        <div className="overview-plans__week-grid">
          {availableWeeks.map((week) => {
            const key = normalizePlanWeek(week) || week;
            const on = selected.has(key);
            return (
              <button
                key={week}
                type="button"
                className={`overview-plans__week-chip${on ? " overview-plans__week-chip--on" : ""}`}
                onClick={() => toggleWeek(key)}
              >
                {week}
              </button>
            );
          })}
        </div>
      </div>
      <div className="overview-plans__editor-actions">
        <button type="button" className="mini accent" onClick={submit}>
          Сохранить
        </button>
        <button type="button" className="mini" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}

function BlockingOrdersList({ orders, onOpenOrder }) {
  if (!orders?.length) {
    return <div className="overview-plans__hint">Все заказы отгружены</div>;
  }
  return (
    <ul className="overview-plans__blockers">
      {orders.map((o) => (
        <li key={o.orderId || o._awaitingKey || `${o.item}-${o.week}`}>
          <button
            type="button"
            className="overview-plans__blocker-btn"
            onClick={() => o.orderId && onOpenOrder?.(o.orderId)}
            disabled={!o.orderId || !onOpenOrder}
          >
            <div className="overview-plans__blocker-head">
              <span className="overview-plans__blocker-id">
                {o.orderId ? `#${o.orderId}` : "Без ID"}
              </span>
              <span
                className="overview-plans__blocker-qty"
                title={o.qrQty > 0 && o.qrQty !== Number(o.qty) ? `Комплектов по QR: ${o.qrQty}` : undefined}
              >
                {o.qty} шт
                {o.qrQty > 0 && o.qrQty !== Number(o.qty) ? ` (${o.qrQty} компл.)` : ""}
              </span>
            </div>
            <div className="overview-plans__blocker-item">
              {o.item}
              {o.article ? (
                <span className="overview-plans__blocker-article">{o.article}</span>
              ) : null}
            </div>
            <span className="overview-plans__blocker-stage">{o.laneLabel || o.stageLabel}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function OverviewPlansPanel({
  filtered,
  rows,
  shipmentBoard,
  shipmentOrderMaps,
  weekFilter,
  months,
  monthsLoading = false,
  monthsSaving = false,
  monthsError = null,
  addMonth,
  updateMonth,
  deleteMonth,
  onOpenOrderDrawer,
  onGoToKanban,
}) {
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [editorMode, setEditorMode] = useState(null); // null | "add" | monthId

  const awaitingOrders = useMemo(
    () => collectAwaitingPlanOrders(shipmentBoard, shipmentOrderMaps, weekFilter),
    [shipmentBoard, shipmentOrderMaps, weekFilter]
  );

  const availableWeeks = useMemo(
    () => collectAvailablePlanWeeks(rows?.length ? rows : filtered, awaitingOrders),
    [rows, filtered, awaitingOrders]
  );

  const plans = useMemo(
    () => buildPlansSummary(filtered, awaitingOrders),
    [filtered, awaitingOrders]
  );
  const monthSummaries = useMemo(
    () => buildMonthsSummary(months, filtered, awaitingOrders),
    [months, filtered, awaitingOrders]
  );

  const usedWeeks = useMemo(() => {
    const set = new Set();
    for (const m of months || []) {
      for (const w of m.weeks || []) set.add(normalizePlanWeek(w) || w);
    }
    return set;
  }, [months]);

  return (
    <div className="overview-plans">
      {/* ── Месяцы ── */}
      <section className="overview-plans__section">
        <div className="overview-plans__section-head">
          <h3 className="overview-plans__section-title">Месяцы</h3>
          <button
            type="button"
            className="mini accent"
            onClick={() => setEditorMode(editorMode === "add" ? null : "add")}
          >
            {editorMode === "add" ? "✕ Отмена" : "+ Добавить месяц"}
          </button>
        </div>

        {monthsError && (
          <div className="overview-plans__warn">{monthsError}</div>
        )}

        {editorMode === "add" && (
          <MonthEditor
            availableWeeks={availableWeeks.filter((w) => !usedWeeks.has(normalizePlanWeek(w) || w))}
            onSave={async (name, weeks) => {
              if (await addMonth(name, weeks)) setEditorMode(null);
            }}
            onCancel={() => setEditorMode(null)}
          />
        )}

        {monthsLoading && !monthSummaries.length && (
          <div className="empty empty--hint">Загрузка месяцев…</div>
        )}

        {!monthsLoading && !monthSummaries.length && editorMode !== "add" && (
          <div className="empty empty--hint">
            Создайте месяц и выберите номера планов, которые в него входят
          </div>
        )}

        <div className="overview-plans__month-grid">
          {monthSummaries.map((m) => (
            <article key={m.id} className="overview-plans__month-card">
              <div className="overview-plans__month-head">
                <div>
                  <div className="overview-plans__month-name">{m.name}</div>
                  <div className="overview-plans__month-weeks">
                    Планы: {m.weeks.join(", ") || "—"}
                  </div>
                </div>
                <StatusBadge closed={m.isClosed} />
              </div>

              <div className="overview-plans__stats">
                <span>{m.completedCount ?? m.shippedCount} / {m.orderCount} выпущено</span>
                <span>{m.closedPlans} / {m.planCount} планов закрыто</span>
              </div>
              <div className="overview-plans__progress-row">
                <ProgressBar percent={m.percent} />
                <span className="overview-plans__percent">{m.percent}%</span>
              </div>

              {m.missingWeeks.length > 0 && (
                <div className="overview-plans__warn">
                  Нет заказов по планам: {m.missingWeeks.join(", ")}
                </div>
              )}

              {!m.isClosed && m.blockingPlans.length > 0 && (
                <div className="overview-plans__blockers-summary">
                  Не закрыто планов: {m.blockingPlans.map((p) => p.week).join(", ")}
                </div>
              )}

              <div className="overview-plans__card-actions">
                <button
                  type="button"
                  className="mini"
                  onClick={() => setExpandedMonth(expandedMonth === m.id ? null : m.id)}
                >
                  {expandedMonth === m.id ? "Скрыть" : "Что мешает закрыть"}
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setEditorMode(editorMode === m.id ? null : m.id)}
                >
                  Изменить
                </button>
                <button type="button" className="mini" disabled={monthsSaving} onClick={() => deleteMonth(m.id)}>
                  Удалить
                </button>
              </div>

              {editorMode === m.id && (
                <MonthEditor
                  initial={{ name: m.name, weeks: m.weeks }}
                  availableWeeks={[
                    ...new Set([
                      ...availableWeeks.map((w) => normalizePlanWeek(w) || w),
                      ...m.weeks,
                    ]),
                  ].sort((a, b) => Number(a) - Number(b))}
                  onSave={async (name, weeks) => {
                    if (await updateMonth(m.id, { name, weeks })) setEditorMode(null);
                  }}
                  onCancel={() => setEditorMode(null)}
                />
              )}

              {expandedMonth === m.id && (
                <div className="overview-plans__expand">
                  {m.blockingPlans.length === 0 ? (
                    <div className="overview-plans__hint">Месяц полностью закрыт</div>
                  ) : (
                    m.blockingPlans.map((bp) => (
                      <div key={bp.week} className="overview-plans__plan-block">
                        <div className="overview-plans__plan-block-title">
                          План {bp.week} — {bp.openCount} не выпущено
                        </div>
                        <BlockingOrdersList
                          orders={bp.blockingOrders}
                          onOpenOrder={onOpenOrderDrawer}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ── Планы по неделям ── */}
      <section className="overview-plans__section">
        <div className="overview-plans__section-head">
          <h3 className="overview-plans__section-title">Планы</h3>
        </div>

        {!plans.length && (
          <div className="empty">Нет заказов для анализа планов</div>
        )}

        {plans.length > 0 && (
          <>
            <div className="overview-plans__plan-cards">
              {plans.map((p) => (
                <article key={p.week} className="overview-plans__plan-card">
                  <div className="overview-plans__plan-card-head">
                    <div>
                      <div className="overview-plans__plan-card-title">План {p.week}</div>
                      <div className="overview-plans__plan-card-meta">
                        {p.completedCount ?? p.shippedCount} / {p.orderCount} выпущено
                        {!p.isClosed && ` · ${p.openCount} блокер(ов)`}
                      </div>
                    </div>
                    <StatusBadge closed={p.isClosed} />
                  </div>
                  <div className="overview-plans__progress-row">
                    <ProgressBar percent={p.percent} />
                    <span className="overview-plans__percent">{p.percent}%</span>
                  </div>
                  <div className="overview-plans__card-actions">
                    <button
                      type="button"
                      className="mini"
                      onClick={() => setExpandedPlan(expandedPlan === p.week ? null : p.week)}
                    >
                      {expandedPlan === p.week ? "Скрыть" : "Блокеры"}
                    </button>
                    {onGoToKanban && (
                      <button
                        type="button"
                        className="mini"
                        onClick={() => onGoToKanban(p.rawWeeks?.length ? p.rawWeeks : p.weekKey || p.week)}
                      >
                        Канбан
                      </button>
                    )}
                  </div>
                  {expandedPlan === p.week && (
                    <div className="overview-plans__expand">
                      <div className="overview-plans__stage-breakdown">
                        {Object.entries(p.stageBreakdown).map(([lane, count]) => (
                          <span key={lane} className="overview-plans__stage-chip">
                            {laneLabel(lane)}: {count}
                          </span>
                        ))}
                      </div>
                      <BlockingOrdersList
                        orders={p.blockingOrders}
                        onOpenOrder={onOpenOrderDrawer}
                      />
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className="overview-plans__table-wrap sheet-table-wrap">
              <table className="sheet-table overview-plans__table">
              <thead>
                <tr>
                  <th>План</th>
                  <th>Заказы</th>
                  <th>Выпущено</th>
                  <th>Прогресс</th>
                  <th>Статус</th>
                  <th>Блокеры</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <Fragment key={p.week}>
                    <tr>
                      <td><b>{p.week}</b></td>
                      <td>{p.orderCount}</td>
                      <td>{p.completedCount ?? p.shippedCount}</td>
                      <td className="overview-plans__progress-cell">
                        <ProgressBar percent={p.percent} />
                        <span>{p.percent}%</span>
                      </td>
                      <td><StatusBadge closed={p.isClosed} /></td>
                      <td>
                        {p.isClosed
                          ? "—"
                          : `${p.openCount} заказ(ов)`}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="mini"
                          onClick={() => setExpandedPlan(expandedPlan === p.week ? null : p.week)}
                        >
                          {expandedPlan === p.week ? "▲" : "▼"}
                        </button>
                        {onGoToKanban && (
                          <button
                            type="button"
                            className="mini"
                            onClick={() => onGoToKanban(p.rawWeeks?.length ? p.rawWeeks : p.weekKey || p.week)}
                            title="Открыть в канбане"
                          >
                            Канбан
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedPlan === p.week && (
                      <tr key={`${p.week}-detail`} className="overview-plans__detail-row">
                        <td colSpan={7}>
                          <div className="overview-plans__detail">
                            <div className="overview-plans__stage-breakdown">
                              {Object.entries(p.stageBreakdown).map(([lane, count]) => (
                                <span key={lane} className="overview-plans__stage-chip">
                                  {laneLabel(lane)}: {count}
                                </span>
                              ))}
                            </div>
                            <BlockingOrdersList
                              orders={p.blockingOrders}
                              onOpenOrder={onOpenOrderDrawer}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
