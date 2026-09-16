import { decodeModelText } from "../viewer3d/detalqr-adapter.js";

/**
 * Пределы по «сырому» файлу модели. К серверу модель уходит сжатой (gzip+base64,
 * ~10 раз меньше), поэтому ограничение — только на разумность самого файла.
 */
export const MAX_RECOMMENDED_MODEL_BYTES = 20 * 1024 * 1024;
/** Если сжать не удалось, тело запроса ограничено шлюзом (обычно 1 МБ). */
export const UNCOMPRESSED_BODY_LIMIT = 900 * 1024;

function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// через чистые streams (без Blob/Response) — одинаково работает в браузере и в тестах
async function drainStream(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  chunks.forEach((c) => { out.set(c, off); off += c.length; });
  return out;
}

async function gzipToBase64(bytes) {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  const done = drainStream(cs.readable);
  await writer.write(bytes);
  await writer.close();
  return bytesToBase64(await done);
}

async function gunzipFromBase64(b64) {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  const done = drainStream(ds.readable);
  await writer.write(base64ToBytes(b64));
  await writer.close();
  return new TextDecoder().decode(await done);
}

/**
 * Модель -> параметры RPC загрузки. Сжимаем gzip+base64, чтобы не упираться
 * в лимит тела запроса (шлюз/облако); без поддержки CompressionStream — как есть.
 */
export async function buildUploadPayload(model) {
  const json = JSON.stringify(model);
  const bytes = new TextEncoder().encode(json);
  const panels = Array.isArray(model?.panels) ? model.panels.length : 0;
  if (typeof CompressionStream === "function") {
    try {
      const gz = await gzipToBase64(bytes);
      return {
        payload: { p_model_gz: gz, p_panels: panels },
        rawBytes: bytes.length,
        sentBytes: gz.length,
        compressed: true,
      };
    } catch (_) {
      /* ниже — несжатый вариант */
    }
  }
  return {
    payload: { p_model_json: model, p_panels: panels },
    rawBytes: bytes.length,
    sentBytes: bytes.length,
    compressed: false,
  };
}

/**
 * Размер части при загрузке (символы base64). Шлюз обычно режет тело на 1 МБ,
 * поэтому держим запас: 600 КБ на часть + служебные поля.
 */
export const UPLOAD_CHUNK_CHARS = 600 * 1024;

/** Режет строку base64 на части; склейка частей по порядку даёт исходную строку. */
export function splitBase64Parts(b64, chunkChars = UPLOAD_CHUNK_CHARS) {
  const str = String(b64 || "");
  const size = Math.max(1024, Number(chunkChars) || UPLOAD_CHUNK_CHARS);
  if (!str) return [];
  const parts = [];
  for (let i = 0; i < str.length; i += size) parts.push(str.slice(i, i + size));
  return parts;
}

/** Строка из web_get_section_model -> объект модели (с распаковкой, если сжата). */
export async function decodeStoredModel(row) {
  if (!row) return null;
  if (row.model_gz) {
    return JSON.parse(await gunzipFromBase64(row.model_gz));
  }
  return row.model_json ?? null;
}

export function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return "—";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

/**
 * Текст файла модели -> объект (с проверкой формата).
 * Кодировку приводит decodeModelText: классический Базис пишет ANSI (cp1251).
 */
export function parseModelText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`файл не является JSON (${String(e?.message || e)})`);
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.panels) || data.panels.length === 0) {
    throw new Error("в файле нет списка «panels» — это не JSON из «Экспорт модели в JSON-4.js»");
  }
  return data;
}

/** File -> объект модели (читает байты, конвертирует кодировку, проверяет формат). */
export async function readModelFile(file) {
  const buf = await file.arrayBuffer();
  return parseModelText(decodeModelText(buf));
}

/**
 * Ключ названия изделия для сопоставления: регистр, ё→е, метаданные в квадратных
 * скобках, лишние пробелы. У заказов не всегда заполнен артикул, поэтому
 * секцию ищем ещё и по названию («Журнальный стол Лофт. Юта»).
 */
export function normalizeItemKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Карта секций из строк web_list_model_section_map:
 * { byArticle: Map(АРТИКУЛ → секция), byItem: Map(название → секция) }.
 */
export function buildModelSectionLookup(rows) {
  const byArticle = new Map();
  const byItem = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const sec = String(r?.section_name || r?.sectionName || "").trim();
    if (!sec) return;
    const art = String(r?.article || "").trim().toUpperCase();
    if (art && !byArticle.has(art)) byArticle.set(art, sec);
    const item = normalizeItemKey(r?.item_name ?? r?.itemName);
    if (item && !byItem.has(item)) byItem.set(item, sec);
  });
  return { byArticle, byItem };
}

/**
 * Артикулы заказа по приоритету: сначала собственное поле заказа, потом артикул,
 * вытащенный из строки названия (в заказах бывает и то, и другое).
 */
export function articleCandidatesForOrder(order, itemArticle = "") {
  const raw = [
    order?.product_article,
    order?.productArticle,
    order?.mapped_article_code,
    order?.mappedArticleCode,
    order?.article_code,
    order?.articleCode,
    order?.article,
    itemArticle,
  ];
  const out = [];
  raw.forEach((v) => {
    const s = String(v || "").trim().toUpperCase();
    if (s && !out.includes(s)) out.push(s);
  });
  return out;
}

/**
 * Секция с моделью для заказа: сначала по артикулам (product_article, потом из
 * названия), затем по названию изделия — в заказах артикул бывает не заполнен.
 */
export function resolveModelSectionForOrder(order, itemArticle, lookup) {
  if (!lookup?.byArticle?.get) return null;
  for (const article of articleCandidatesForOrder(order, itemArticle)) {
    const sec = lookup.byArticle.get(article);
    if (sec) return sec;
  }
  const itemKeys = [normalizeItemKey(itemArticle), normalizeItemKey(order?.item)];
  for (const key of itemKeys) {
    const sec = key ? lookup.byItem?.get(key) : null;
    if (sec) return sec;
  }
  return null;
}

/** Секция с моделью для артикула заказа (или null). */
export function resolveModelSection(article, lookup) {
  const key = String(article || "").trim().toUpperCase();
  if (!key || !lookup?.byArticle?.get) return null;
  return lookup.byArticle.get(key) || null;
}

/** Группировка артикулов каталога по секциям — для сверки во вкладке «Мебель». */
export function groupArticlesBySection(rows) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const sec = String(r?.section_name || r?.sectionName || "").trim();
    const art = String(r?.article || "").trim();
    if (!sec || !art) return;
    if (!map.has(sec)) map.set(sec, []);
    map.get(sec).push(art);
  });
  map.forEach((list) => list.sort((a, b) => a.localeCompare(b, "ru")));
  return map;
}
