import { callBackend } from "../api";

/**
 * Репортёр ошибок фронтенда в существующий `crm_audit_log`.
 *
 * Отправляет через RPC `web_audit_log_event` (action "ui_error", entity "frontend").
 * Никаких новых таблиц/прав не требуется — RPC уже грантован anon/authenticated.
 *
 * Принципы:
 *  - Полная тишина при любых сбоях самого репортёра (try/catch-всё). Путь ошибок
 *    не должен сам становиться источником ошибок и ломать UX.
 *  - Fire-and-forget: не возвращаем promise в горячих путях, чтобы не блокировать UI.
 *  - Жёсткая защита от спама: дедупликация + хард-кап на сессию.
 */

const DEDUPE_WINDOW_MS = 30_000;
const MAX_RECENT_KEYS = 100;
const MAX_UNIQUE_PER_SESSION = 50;
const MAX_MESSAGE_LEN = 1000;
const MAX_STACK_LEN = 2000;

const recentKeys = new Map(); // key -> timestamp
const uniqueCount = { value: 0 };
const sessionStartedAt = new Date().toISOString();
let lastView = null;
let lastTab = null;

/** Дать репортёру знать текущий экран/вкладку для контекста ошибок. */
export function setUiContext({ view, tab } = {}) {
  try {
    if (view !== undefined) lastView = view;
    if (tab !== undefined) lastTab = tab;
  } catch (_) {
    /* ignore */
  }
}

function truncate(value, max) {
  const s = String(value ?? "");
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
}

function buildDedupeKey(type, message) {
  // Без стека: он меняется при минификации/сборке и плодит «уникальные» ошибки.
  return `${String(type || "unknown")}|${String(message || "").slice(0, 200)}`;
}

function shouldReport(dedupeKey) {
  const now = Date.now();
  const lastSeen = recentKeys.get(dedupeKey);
  if (lastSeen != null && now - lastSeen < DEDUPE_WINDOW_MS) {
    return false; // та же ошибка уже была в окне 30 сек
  }
  if (!lastSeen) {
    if (uniqueCount.value >= MAX_UNIQUE_PER_SESSION) return false;
    uniqueCount.value += 1;
  }
  recentKeys.set(dedupeKey, now);

  // Не даём Map расти бесконечно за сессию.
  if (recentKeys.size > MAX_RECENT_KEYS) {
    const oldest = [...recentKeys.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < oldest.length - MAX_RECENT_KEYS; i += 1) {
      recentKeys.delete(oldest[i][0]);
    }
  }
  return true;
}

function collectContext() {
  const ctx = { sessionStartedAt };
  try {
    if (typeof window !== "undefined") {
      // pathname без query — в URL не попадают токены из search/hash.
      ctx.href = String(window.location?.pathname || "").slice(0, 500) || null;
      ctx.userAgent = String(window.navigator?.userAgent || "").slice(0, 300) || null;
      if (lastView) ctx.view = lastView;
      if (lastTab) ctx.tab = lastTab;
    }
  } catch (_) {
    /* ignore */
  }
  const buildTime = String(import.meta.env?.VITE_APP_BUILD_TIME || "").trim();
  if (buildTime) ctx.buildTime = buildTime;
  return ctx;
}

/**
 * Отправить сообщение об ошибке UI в crm_audit_log.
 * Безопасно вызывать из любых мест: бросания наружу нет, throw глушится.
 *
 * @param {object} args
 * @param {string} args.type       — источник ошибки (react_boundary | window_error | unhandled_rejection).
 * @param {string} args.message    — текст ошибки.
 * @param {string} [args.stack]    — стек ошибки.
 * @param {string} [args.componentStack] — React componentStack (для ErrorBoundary).
 * @param {object} [args.context]  — доп. контекст.
 */
export function reportUiError({ type, message, stack, componentStack, context } = {}) {
  try {
    const msg = truncate(message || "Unknown error", MAX_MESSAGE_LEN);
    const dedupeKey = buildDedupeKey(type, msg);
    if (!shouldReport(dedupeKey)) return;

    const details = {
      type: String(type || "unknown"),
      message: msg,
      ...collectContext(),
    };
    if (stack) details.stack = truncate(stack, MAX_STACK_LEN);
    if (componentStack) details.componentStack = truncate(componentStack, MAX_STACK_LEN);
    if (context && typeof context === "object") {
      try {
        Object.assign(details, JSON.parse(JSON.stringify(context)));
      } catch (_) {
        /* ignore — контекст не должен ломать отправку */
      }
    }

    // Fire-and-forget. callBackend внутри сам ловит и бросает нормализованную
    // ошибку — здесь глушим, чтобы она не всплыла в глобальные обработчики и
    // не создала рекурсию.
    callBackend("webLogUiError", { details }).catch(() => {
      /* silent: репортёр об ошибке не должен порождать новые ошибки */
    });
  } catch (_) {
    /* silent: никогда не пробрасываем наружу */
  }
}

/** Только для тестов: сбросить внутреннее состояние дедупликации/капов. */
export function __resetErrorReporterState() {
  recentKeys.clear();
  uniqueCount.value = 0;
}
