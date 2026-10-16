const MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

/**
 * Месяц и год по Москве: бригада и книга склада живут в МСК, а сервер/браузер
 * могут быть в другом поясе, поэтому считаем явно.
 */
function moscowYearMonth(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value || 0);
  const month = Number(parts.find((p) => p.type === "month")?.value || 0);
  if (!year || !month) return null;
  return { year, month };
}

/**
 * Имя вкладки расхода за месяц — так вкладки и ведут в книге склада:
 * «Расход октябрь 2026», «Расход сентябрь 2026».
 */
export function consumeSheetNameForDate(date = new Date()) {
  const ym = moscowYearMonth(date);
  if (!ym) return "";
  const month = MONTHS[ym.month - 1];
  return month ? `Расход ${month} ${ym.year}` : "";
}

/**
 * Ключ «номер месяца — год» из имени вкладки. Нужен, чтобы понять, к какому
 * месяцу относится имя (год в старых вкладках мог не указываться).
 */
export function consumeSheetMonthKey(name) {
  const raw = String(name || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  const monthIndex = MONTHS.findIndex((month) => raw.includes(month));
  if (monthIndex < 0) return "";
  const year = raw.match(/(20\d{2})/)?.[1] || "";
  return `${monthIndex + 1}-${year}`;
}

/**
 * Имена вкладок для записи списания: сначала месяц текущей даты, затем имя из
 * настроек CRM (если админ держит нестандартное название). Пустое имя настройки
 * игнорируем.
 */
export function buildConsumeSheetNameCandidates(configuredName, date = new Date()) {
  const computed = consumeSheetNameForDate(date);
  const configured = String(configuredName || "").trim();
  return Array.from(new Set([computed, configured].filter(Boolean)));
}

/** Имя вкладки относится к другому месяцу, чем текущий (например, остался октябрь, а идёт ноябрь). */
export function isStaleConsumeSheetName(name, date = new Date()) {
  const key = consumeSheetMonthKey(name);
  if (!key) return false;
  return key !== consumeSheetMonthKey(consumeSheetNameForDate(date));
}

/**
 * Вкладки нет в книге / в ней нет колонки дня — только по таким ошибкам есть
 * смысл пробовать другое имя вкладки. Ошибки доступа к Google и «нет строки
 * материала» перебором имён не лечатся.
 */
export function isSheetNameMissingError(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  return (
    text.includes("sheet not found") ||
    text.includes("sheet is empty") ||
    /day column\s+\d+\s+not found/.test(text)
  );
}
