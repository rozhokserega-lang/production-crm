export function normalizeWeekFilter(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((x) => String(x || "").trim()).filter((x) => x && x !== "all")),
    );
  }
  const prepared = String(value || "").trim();
  if (!prepared || prepared === "all") return [];
  return [prepared];
}

export function isWeekFilterAll(value) {
  return normalizeWeekFilter(value).length === 0;
}

export function matchesWeekFilter(week, filter) {
  const selected = normalizeWeekFilter(filter);
  if (!selected.length) return true;
  return selected.includes(String(week || "").trim());
}

export function weekFilterStorageKey(value) {
  const selected = normalizeWeekFilter(value);
  return selected.length ? selected.join(",") : "all";
}

export function firstSelectedWeek(filter, weeks = []) {
  const selected = normalizeWeekFilter(filter);
  return selected[0] || String(weeks[0] || "").trim();
}
