import { GAS_WEBAPP_URL } from "./config";

export async function gasCall(action, payload = {}) {
  if (!GAS_WEBAPP_URL || GAS_WEBAPP_URL.includes("PASTE_YOUR_WEBAPP_URL_HERE")) {
    throw new Error("Заполните GAS_WEBAPP_URL в src/config.js");
  }

  const gasUrl = new URL(GAS_WEBAPP_URL);
  const gasPath = gasUrl.pathname;
  const targetBase = import.meta.env.DEV
    ? `/gas${gasPath}`
    : `${gasUrl.origin}${gasPath}`;
  const qs = new URLSearchParams({
    action,
    payload: JSON.stringify(payload || {}),
  }).toString();
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${targetBase}?${qs}`, { method: "GET" });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (_) {
        throw new Error(`API вернул не JSON (${res.status}): ${text.slice(0, 120)}`);
      }
      if (!json.ok) throw new Error(json.error || "Ошибка API");
      return json.data;
    } catch (e) {
      lastError = e;
      const msg = String(e?.message || e);
      // При занятости lock пробуем автоматически еще раз.
      if (msg.includes("Система занята")) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      break;
    }
  }
  throw lastError || new Error("Ошибка API");
}

export async function callBackend(action, payload = {}) {
  return gasCall(action, payload);
}
