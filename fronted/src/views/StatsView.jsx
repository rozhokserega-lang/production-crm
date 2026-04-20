import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function normalizeWeekKey(rawWeek) {
  const value = String(rawWeek || "").trim();
  if (!value) return "Без плана";
  const ruDateMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ruDateMatch) {
    const day = Number(ruDateMatch[1]);
    const month = Number(ruDateMatch[2]) - 1;
    const year = Number(ruDateMatch[3]);
    const dt = new Date(year, month, day);
    if (!Number.isNaN(dt.getTime())) {
      return `W${getIsoWeek(dt)} ${year}`;
    }
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return `W${getIsoWeek(parsed)} ${parsed.getFullYear()}`;
  }
  return value;
}

function getIsoWeek(date) {
  const dt = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
}

function parseWeekSortKey(weekLabel) {
  const m = String(weekLabel || "").match(/^W(\d+)\s+(\d{4})$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[2]) * 100 + Number(m[1]);
}

const STAGE_COLORS = ["#2563eb", "#0ea5e9", "#14b8a6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

export function StatsView({
  statsList,
  loading,
  getStageLabel,
  getOverallStatusDisplay,
  actionLoading,
  getStatsDeleteActionKey,
  canManageOrders,
  deleteStatsOrder,
}) {
  const throughputByWeek = useMemo(() => {
    const map = {};
    (statsList || []).forEach((o) => {
      const key = normalizeWeekKey(o.week);
      if (!map[key]) map[key] = { week: key, qty: 0, orders: 0 };
      map[key].qty += Number(o.qty || 0);
      map[key].orders += 1;
    });
    return Object.values(map).sort((a, b) => parseWeekSortKey(a.week) - parseWeekSortKey(b.week));
  }, [statsList]);

  const bottleneckByStage = useMemo(() => {
    const map = {};
    (statsList || []).forEach((o) => {
      const stage = getStageLabel(o) || "Не определено";
      if (!map[stage]) map[stage] = { stage, orders: 0, qty: 0 };
      map[stage].orders += 1;
      map[stage].qty += Number(o.qty || 0);
    });
    return Object.values(map).sort((a, b) => b.orders - a.orders);
  }, [statsList, getStageLabel]);

  return (
    <>
      {!statsList.length && !loading && <div className="empty">Нет данных для статистики</div>}
      {statsList.length > 0 && (
        <>
          <div className="stats-charts-grid">
            <section className="stats-chart-card">
              <h3>Throughput по неделям</h3>
              <div className="stats-chart-box">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={throughputByWeek} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} interval={0} angle={-18} textAnchor="end" height={50} />
                    <YAxis />
                    <Tooltip
                      formatter={(value, name) => [value, name === "qty" ? "Кол-во деталей" : "Заказов"]}
                      labelFormatter={(label) => `Неделя: ${label}`}
                    />
                    <Bar dataKey="qty" name="qty" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="stats-chart-card">
              <h3>Bottleneck по этапам</h3>
              <div className="stats-chart-box">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={bottleneckByStage} layout="vertical" margin={{ top: 8, right: 12, left: 20, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="stage" type="category" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value, name) => [value, name === "orders" ? "Заказов" : "Кол-во деталей"]}
                      labelFormatter={(label) => `Этап: ${label}`}
                    />
                    <Bar dataKey="orders" name="orders" radius={[0, 6, 6, 0]}>
                      {bottleneckByStage.map((entry, idx) => (
                        <Cell key={`stage-${entry.stage}`} fill={STAGE_COLORS[idx % STAGE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

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
                  <th>Удалить</th>
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
                    <td>{getOverallStatusDisplay(o)}</td>
                    <td>
                      <button
                        type="button"
                        className="mini warn stats-delete-btn"
                        title="Удалить заказ"
                        disabled={actionLoading === getStatsDeleteActionKey(o) || !canManageOrders}
                        onClick={() => deleteStatsOrder(o)}
                      >
                        X
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
      )}
    </>
  );
}
