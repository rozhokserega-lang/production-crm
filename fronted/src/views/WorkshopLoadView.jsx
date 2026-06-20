import { memo, useMemo, useState } from "react";
import { WORKSHOP_STAGE_LABELS } from "../app/workshopLoadCalculator";

const STAGE_LABELS = {
  pilka: "Пила",
  kromka: "Кромка",
  pras: "Присадка",
  workshop_complete: "Сборка",
  assembled: "Сборка",
};

const STATUS = {
  green: {
    dot: "🟢",
    label: "Норма",
    verdictTitle: "Цех успевает",
    verdictHint: "Очередь на всех участках укладывается примерно в один рабочий день или быстрее.",
  },
  yellow: {
    dot: "🟡",
    label: "Внимание",
    verdictTitle: "Есть риск перегрузки",
    verdictHint: "На одном из участков очередь растянется на 1–2 рабочих дня — новые заказы лучше планировать осторожно.",
  },
  red: {
    dot: "🔴",
    label: "Перегрузка",
    verdictTitle: "Участок перегружен",
    verdictHint: "Очередь больше двух рабочих дней — новые заказы на этот участок брать не рекомендуется.",
  },
};

function formatHhMm(totalMin) {
  const safe = Math.max(0, Number(totalMin || 0));
  if (safe <= 0) return "—";
  const hours = Math.floor(safe / 60);
  const minutes = Math.round(safe % 60);
  if (hours <= 0) return `${minutes} мин`;
  return `${hours} ч ${String(minutes).padStart(2, "0")} мин`;
}

function formatDays(days) {
  const d = Number(days || 0);
  if (d <= 0) return "сегодня";
  if (d < 1) return "менее дня";
  const rounded = Math.round(d * 10) / 10;
  const mod10 = rounded % 10;
  const mod100 = rounded % 100;
  let word = "дней";
  if (mod100 >= 11 && mod100 <= 14) word = "дней";
  else if (mod10 === 1) word = "день";
  else if (mod10 >= 2 && mod10 <= 4) word = "дня";
  return `≈ ${rounded} ${word}`;
}

function pipelineStageLabel(stage) {
  return STAGE_LABELS[String(stage || "").trim()] || String(stage || "—");
}

function nextPendingStage(row) {
  if (!row?.pilkaDone) return WORKSHOP_STAGE_LABELS.pilka;
  if (!row?.kromkaDone) return WORKSHOP_STAGE_LABELS.kromka;
  if (!row?.prasDone) return WORKSHOP_STAGE_LABELS.pras;
  if (!row?.assemblyDone) return WORKSHOP_STAGE_LABELS.assembly;
  return "Завершён";
}

function StageQueueCell({ done, minutes }) {
  if (done) {
    return <span className="workshop-load__cell-done">Готово</span>;
  }
  return (
    <span className="workshop-load__cell-wait" title="Ещё ждёт этот участок">
      {formatHhMm(minutes)}
    </span>
  );
}

export const WorkshopLoadView = memo(function WorkshopLoadView({
  summary,
  loading,
  onRefresh,
}) {
  const [showOrders, setShowOrders] = useState(true);

  const stages = summary?.stages || [];
  const queueRows = summary?.queueRows || [];
  const totals = summary?.totals || { queueMinutes: 0, queueHours: 0, ordersCount: 0 };
  const uniqueOrdersCount = summary?.uniqueOrdersCount ?? queueRows.length;
  const missingNormCount = summary?.missingNormCount || 0;
  const maxLoad = summary?.maxLoad;
  const status = STATUS[maxLoad?.color || "green"] || STATUS.green;

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => Number(b.daysToClear || 0) - Number(a.daysToClear || 0)),
    [stages],
  );

  const capacityLabel = summary?.hoursPerDay
    ? `${summary.hoursPerDay} ч/смену · ${summary.workingDayCount} раб. дн./нед.`
    : null;

  const verdictStage = maxLoad?.label || "—";
  const verdictDays = formatDays(maxLoad?.daysToClear);

  return (
    <div className="workshop-load">
      <header className="workshop-load__intro">
        <div className="workshop-load__intro-text">
          <h2 className="workshop-load__title">Загрузка цеха</h2>
          <p className="workshop-load__subtitle">
            Прогноз по нормам трудоёмкости: сколько рабочих дней нужно, чтобы разгрузить очередь
            на пиле, кромке, присадке и сборке.
          </p>
        </div>
        <button
          type="button"
          className="mini workshop-load__refresh"
          disabled={loading}
          onClick={onRefresh}
        >
          {loading ? "Обновляю…" : "Обновить"}
        </button>
      </header>

      {loading && queueRows.length === 0 ? (
        <div className="workshop-load__loading">Считаем прогноз загрузки…</div>
      ) : null}

      {!loading || queueRows.length > 0 ? (
        <>
          <section className={`workshop-load__verdict workshop-load__verdict--${maxLoad?.color || "green"}`}>
            <div className="workshop-load__verdict-icon">{status.dot}</div>
            <div className="workshop-load__verdict-body">
              <div className="workshop-load__verdict-title">{status.verdictTitle}</div>
              {uniqueOrdersCount === 0 ? (
                <p className="workshop-load__verdict-main">Сейчас нет активных заказов в очереди цеха.</p>
              ) : (
                <p className="workshop-load__verdict-main">
                  Самое загруженное место — <b>{verdictStage}</b>: очередь на <b>{verdictDays}</b>.
                </p>
              )}
              <p className="workshop-load__verdict-hint">{status.verdictHint}</p>
            </div>
          </section>

          <div className="workshop-load__kpis">
            <div className="workshop-load__kpi">
              <span className="workshop-load__kpi-label">Заказов в очереди</span>
              <b className="workshop-load__kpi-value">{uniqueOrdersCount}</b>
            </div>
            <div className="workshop-load__kpi">
              <span className="workshop-load__kpi-label">Режим работы</span>
              <b className="workshop-load__kpi-value">{capacityLabel || "8 ч/смену"}</b>
            </div>
            <div className="workshop-load__kpi">
              <span className="workshop-load__kpi-label">Без нормы</span>
              <b className={`workshop-load__kpi-value${missingNormCount > 0 ? " workshop-load__kpi-value--warn" : ""}`}>
                {missingNormCount}
              </b>
            </div>
          </div>

          <section className="workshop-load__section">
            <div className="workshop-load__section-head">
              <h3 className="workshop-load__section-title">Участки цеха</h3>
              <p className="workshop-load__section-hint">
                Сверху — самый загруженный. Цвет: 🟢 до 1 дня · 🟡 1–2 дня · 🔴 больше 2 дней.
              </p>
            </div>

            <div className="workshop-load__cards">
              {sortedStages.map((s) => {
                const stageStatus = STATUS[s.color] || STATUS.green;
                const loadPct = s.availableMinutesPerDay > 0
                  ? Math.min(100, Math.round((s.queueMinutes / s.availableMinutesPerDay) * 100))
                  : 0;
                const capacityText = s.executors > 1
                  ? `${s.availableHoursPerDay} ч/день · ${s.executors} исполнителя`
                  : `${s.availableHoursPerDay} ч/день · 1 исполнитель`;

                return (
                  <article
                    key={s.stage}
                    className={`workshop-load__card workshop-load__card--${s.color}`}
                  >
                    <div className="workshop-load__card-top">
                      <span className="workshop-load__card-title">{s.label}</span>
                      <span className={`workshop-load__badge workshop-load__badge--${s.color}`}>
                        {stageStatus.dot} {stageStatus.label}
                      </span>
                    </div>

                    <div className="workshop-load__card-hero">{formatDays(s.daysToClear)}</div>
                    <div className="workshop-load__card-subtitle">чтобы разгрузить очередь</div>

                    <dl className="workshop-load__card-stats">
                      <div>
                        <dt>Работы в очереди</dt>
                        <dd>{formatHhMm(s.queueMinutes)}</dd>
                      </div>
                      <div>
                        <dt>Заказов ждут</dt>
                        <dd>{s.ordersCount}</dd>
                      </div>
                      <div>
                        <dt>Мощность</dt>
                        <dd>{capacityText}</dd>
                      </div>
                    </dl>

                    <div className="workshop-load__bar" aria-hidden="true">
                      <div
                        className={`workshop-load__bar-fill workshop-load__bar-fill--${s.color}`}
                        style={{ width: `${loadPct}%` }}
                      />
                    </div>
                    <div className="workshop-load__bar-caption">
                      Загрузка относительно одной смены: {loadPct}%
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {missingNormCount > 0 && (
            <div className="workshop-load__hint">
              <b>{missingNormCount}</b> заказ(ов) без нормы трудоёмкости — их время в прогноз не попало.
              Заполните нормы в разделе «Трудоёмкость».
            </div>
          )}

          <details className="workshop-load__help">
            <summary>Как читать этот экран?</summary>
            <ul>
              <li>Берутся только заказы, которые ещё идут по цеху (без склада и отгрузки).</li>
              <li>Для каждого заказа считаются минуты по нормам из «Трудоёмкость».</li>
              <li>Заказ на пиле уже учитывается в очереди кромки, присадки и сборки — так и должно быть для прогноза.</li>
              <li>«Готово» в таблице — этап уже пройден; цифры — сколько работы ещё ждёт участок.</li>
            </ul>
          </details>

          <section className="workshop-load__section">
            <div className="workshop-load__section-head workshop-load__section-head--row">
              <div>
                <h3 className="workshop-load__section-title">Заказы в расчёте</h3>
                <p className="workshop-load__section-hint">
                  {uniqueOrdersCount} заказ(ов) · колонки показывают, что ещё предстоит сделать на каждом участке
                </p>
              </div>
              <button
                type="button"
                className="mini"
                onClick={() => setShowOrders((v) => !v)}
              >
                {showOrders ? "Скрыть таблицу" : "Показать таблицу"}
              </button>
            </div>

            {showOrders ? (
              <div className="sheet-table-wrap workshop-load__table-wrap">
                <table className="sheet-table workshop-load__table">
                  <thead>
                    <tr>
                      <th>Заказ</th>
                      <th>Изделие</th>
                      <th>Сейчас</th>
                      <th>Следующий участок</th>
                      <th>Пила</th>
                      <th>Кромка</th>
                      <th>Присадка</th>
                      <th>Сборка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueRows.map((r) => (
                      <tr
                        key={`${r.orderId}-${r.item}`}
                        className={r.missing ? "workshop-load__row--missing" : ""}
                      >
                        <td className="workshop-load__col-id">{r.orderId || "—"}</td>
                        <td className="workshop-load__col-item">
                          {r.item}
                          {r.missing ? <span className="workshop-load__missing-tag">нет нормы</span> : null}
                        </td>
                        <td>{pipelineStageLabel(r.pipelineStage)}</td>
                        <td>{nextPendingStage(r)}</td>
                        <td><StageQueueCell done={r.pilkaDone} minutes={r.pilkaMin} /></td>
                        <td><StageQueueCell done={r.kromkaDone} minutes={r.kromkaMin} /></td>
                        <td><StageQueueCell done={r.prasDone} minutes={r.prasMin} /></td>
                        <td><StageQueueCell done={r.assemblyDone} minutes={r.assemblyMin} /></td>
                      </tr>
                    ))}
                    {queueRows.length === 0 && !loading ? (
                      <tr>
                        <td colSpan={8} className="empty">
                          Нет активных заказов — все участки свободны
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
});
