/**
 * Порядок недель для списков разделения: сначала числовые по возрастанию,
 * затем нечисловые («X», «обвязка») — как они и идут в интерфейсе.
 *
 * sortPlanWeeks здесь не подходит: normalizePlanWeek превращает нечисловую
 * неделю в пустую строку, Number('') = 0, и «X» встаёт перед «План 66».
 */
export function sortSplitWeeks(weeks) {
  return [...weeks].sort((a, b) => {
    const da = String(a).replace(/\D/g, "");
    const db = String(b).replace(/\D/g, "");
    const na = da ? Number(da) : null;
    const nb = db ? Number(db) : null;
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return String(a).localeCompare(String(b), "ru", { numeric: true });
  });
}

/**
 * Годится ли неделя как ЦЕЛЬ переноса. «X» и «обвязка» — особые колонки, в них
 * нет цифр, и web_norm_week_key нормализует их в '0': ячейка уехала бы в
 * фиктивную неделю 0. Серверные функции разделения такие недели отклоняют.
 */
function isTransferableWeek(week) {
  return String(week).replace(/\D/g, "") !== "";
}

/**
 * Недели для диалога разделения (доска «Отгрузка») и разделения заказа в цеху.
 *
 * Одних недель с существующими позициями мало: они собираются только из ячеек
 * доски, поэтому перенести остаток в неделю, по которой плана ещё нет
 * (например 93 или 94), было нельзя. Добавляем недели видимых плановых
 * месяцев — тот же каталог, что использует диалог создания плана.
 */
export function buildSplitTargetWeeks({ weeks, months } = {}) {
  const set = new Set(
    (Array.isArray(weeks) ? weeks : [])
      .map((w) => String(w || "").trim())
      .filter((w) => w && isTransferableWeek(w)),
  );
  (Array.isArray(months) ? months : []).forEach((m) => {
    (m?.weeks || []).forEach((w) => {
      const value = String(w || "").trim();
      if (value && isTransferableWeek(value)) set.add(value);
    });
  });
  return sortSplitWeeks([...set]);
}
