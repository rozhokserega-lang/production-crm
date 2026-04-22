export function normalizeCatalogItemName(name) {
  return String(name || "")
    .replace(/^стол\s+(письменный|кухонный)\s+/i, "")
    .trim();
}

export function normalizeCatalogDedupKey(name) {
  return normalizeCatalogItemName(name)
    .toLowerCase()
    .replaceAll("х", "x")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractErrorMessage(e) {
  const raw = String(e?.message || e || "").trim();
  if (!raw) return "Неизвестная ошибка";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return (
        [
          parsed.message,
          parsed.error,
          parsed.details,
          parsed.hint,
          parsed.error_description,
        ]
          .map((x) => String(x || "").trim())
          .find(Boolean) || raw
      );
    }
  } catch (_) {
    // ignore parse errors for plain text backend responses
  }
  return raw;
}

export function toUserError(e) {
  const msg = extractErrorMessage(e);
  if (msg.includes("Система занята")) {
    return "Система занята, повторите через 1-2 секунды.";
  }
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    return "Нет связи с сервером. Проверьте интернет и повторите.";
  }
  return msg || "Неизвестная ошибка";
}
