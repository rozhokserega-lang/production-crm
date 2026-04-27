import { memo, useMemo } from "react";
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

function normalizeWeekKey(rawWeek: string): string {
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

function getIsoWeek(date: Date): number {
  const dt = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function parseWeekSortKey(weekLabel: string): number {
  const m = String(weekLabel || "").match(/^W(\d+)\s+(\d{4})$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[2]) * 100 + Number(m[1]);
}

const STAGE_COLORS = ["#2563eb", "#0ea5e9", "#14b8a6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];
const BOTTLENECK_ALLOWED_STAGES = new Set(["Пила", "Кромка", "Присадка"]);

interface StatsViewProps {
  statsList: Record<string, unknown>[];
  loading: boolean;
  getStageLabel: (row: Record<string, unknown>) => string;
  getOverallStatusDisplay: (row: Record<string, unknown>) => string;
  actionLoading: string[];
  getStatsDeleteActionKey: (row: Record<string, unknown>) => string;
  canManageOrders: boolean;
  deleteStatsOrder: (row: Record<string, unknown>) => Promise<void>;
}

export const StatsView = memo(function StatsView({
  statsList,
  loading,
  getStageLabel,
  getOverallStatusDisplay,
  actionLoading,
  getStatsDeleteActionKey,
  canManageOrders,
  deleteStatsOrder,
}: StatsViewProps) {
  const throughputByWeek = useMemo(() => {
    const map: Record<string, { week: string; qty: number; orders: number }> = {};
    (statsList || []).forEach((o) => {
      const key = normalizeWeekKey(String(o.week || ""));
      if (!map[key]) map[key] = { week: key, qty: 0, orders: 0 };
      map[key].qty += Number(o.qty || 0);
      map[key].orders += 1;
    });
    return Object.values(map).sort((a, b) => parseWeekSortKey(a.week) - parseWeekSortKey(b.week));
  }, [statsList]);

  const bottleneckByStage = useMemo(() => {
    const map: Record<string, { stage: string; orders: number; qty: number }> = {};
    (statsList || []).forEach((o) => {
      const stage = getStageLabel(o) || "Не определено";
      if (!BOTTLENECK_ALLOWED_STAGES.has(stage)) return;
      if (!map[stage]) map[stage] = { stage, orders: 0, qty: 0 };
      map[stage].orders += 1;
      map[stage].qty += Number(o.qty || 0);
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [statsList, getStageLabel]);

  if (loading && statsList.length === 0) {
    return <div className="empty">Загрузка статистики...</div>;
  }

  return (
    <div style={{ display: "grid", gap: 24, padding: 16, maxWidth: 1000, margin: "0 auto" }}>
      {/* Throughput chart */}
      <div className="sheet-table-wrap">
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>Пропускная способность по неделям</div>
        {throughputByWeek.length === 0 ? (
          <div className="empty">Нет данных.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={throughputByWeek}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="qty" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bottleneck chart */}
      <div className="sheet-table-wrap">
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>Узкие места (всего деталей на этапе)</div>
        {bottleneckByStage.length === 0 ? (
          <div className="empty">Нет данных.</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={bottleneckByStage} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="stage" type="category" width={100} tick={{ fontSize: 13 }} />
              <Tooltip />
              <Bar dataKey="qty" radius={[0, 4, 4, 0]}>
                {bottleneckByStage.map((_, idx) => (
                  <Cell key={idx} fill={STAGE_COLORS[idx % STAGE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Stats table */}
      <div className="sheet-table-wrap">
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>Детальная статистика</div>
        {statsList.length === 0 ? (
          <div className="empty">Нет данных.</div>
        ) : (
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Заказ</th>
                <th>Изделие</th>
                <th>Кол-во</th>
                <th>Неделя</th>
                <th>Этап</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {statsList.map((o, idx) => {
                const actionKey = getStatsDeleteActionKey(o);
                const isDeleting = actionLoading.includes(actionKey);
                return (
                  <tr key={`stats-${idx}`}>
                    <td>{String(o.orderId || o.order_id || "-")}</td>
                    <td>{String(o.item || o.itemName || "-")}</td>
                    <td>{String(o.qty || 0)}</td>
                    <td>{String(o.week || "-")}</td>
                    <td>{getStageLabel(o)}</td>
                    <td>{getOverallStatusDisplay(o)}</td>
                    <td>
                      {canManageOrders && (
                        <button
                          type="button"
                          className="mini danger"
                          disabled={isDeleting}
                          onClick={() => deleteStatsOrder(o)}
                        >
                          {isDeleting ? "..." : "Удалить"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});
