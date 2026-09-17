/**
 * Помощники вкладки «Отгружено» на /sklad: группировка отгруженных заказов по месяцам.
 * Дата отгрузки — updated_at заказа (те же соглашения, что в «Обзоре заказов» → «Отгружено»),
 * время приводится к Europe/Moscow, чтобы месяц не «переползал» через полночь у пользователей в других поясах.
 */

export const MOSCOW_TZ = "Europe/Moscow";

const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const monthKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: MOSCOW_TZ,
});

function textOf(value) {
  return String(value ?? "").trim();
}

/** Нормализованная строка истории отгрузки (RPC отдаёт snake_case, допускаем и camelCase). */
export function shippedOrderView(row) {
  const dateRaw =
    row?.shippingDoneAt || row?.shipping_done_at || row?.updatedAt || row?.updated_at || "";
  const dt = dateRaw ? new Date(dateRaw) : null;
  const dateTs = dt && !Number.isNaN(dt.getTime()) ? dt.getTime() : 0;
  return {
    orderId: textOf(row?.orderId || row?.order_id),
    item: textOf(row?.item),
    week: textOf(row?.week),
    qty: Number(row?.qty) || 0,
    material: textOf(row?.material || row?.colorName || row?.color_name),
    status: textOf(row?.overallStatus || row?.overall_status),
    dateTs,
  };
}

/** Месячный ключ "ГГГГ-ММ" по Москве; для строк без даты — пустая строка. */
export function monthKeyOfTs(ts) {
  if (!ts) return "";
  return monthKeyFmt.format(ts);
}

/** "2026-09" -> "Сентябрь 2026"; для прочих значений — "". */
export function monthLabelOfKey(key) {
  const [year, month] = String(key || "").split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return "";
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Группирует отгруженные заказы по месяцам: новые месяцы сверху,
 * внутри месяца — по дате отгрузки убыванию, затем по номеру заказа.
 */
export function groupShippedOrdersByMonth(rows) {
  const byMonth = new Map();
  (Array.isArray(rows) ? rows : []).forEach((raw) => {
    const view = shippedOrderView(raw);
    const key = monthKeyOfTs(view.dateTs) || "nodate";
    if (!byMonth.has(key)) {
      byMonth.set(key, {
        key,
        label: monthLabelOfKey(key),
        count: 0,
        totalQty: 0,
        rows: [],
      });
    }
    const group = byMonth.get(key);
    group.count += 1;
    group.totalQty += view.qty;
    group.rows.push(view);
  });
  const groups = Array.from(byMonth.values());
  groups.forEach((group) => {
    group.rows.sort(
      (a, b) => b.dateTs - a.dateTs || a.orderId.localeCompare(b.orderId, "ru"),
    );
  });
  groups.sort((a, b) => (b.rows[0]?.dateTs || 0) - (a.rows[0]?.dateTs || 0));
  return groups;
}
