export function normalizeCatalogItemName(name: unknown): string {
  return String(name || "")
    .replace(/^стол\s+(письменный|кухонный)\s+/i, "")
    .trim();
}

export function normalizeCatalogDedupKey(name: unknown): string {
  return normalizeCatalogItemName(name)
    .toLowerCase()
    .replace(/х/g, "x")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractErrorMessage(e: unknown): string {
  const raw = String((e as Record<string, unknown>)?.message || e || "").trim();
  if (!raw) return "Неизвестная ошибка";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
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

export function toUserError(e: unknown): string {
  const msg = extractErrorMessage(e);
  if (msg.includes("Система занята")) {
    return "Система занята, повторите через 1-2 секунды.";
  }
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    return "Нет связи с сервером. Проверьте интернет и повторите.";
  }
  return msg || "Неизвестная ошибка";
}
