import { useEffect, useRef, useState } from "react";

/**
 * Floating-кнопка поиска для мобильного вида.
 *
 * Показывается только на <= 600px (через CSS). При тапе открывает поле поиска
 * сверху экрана (sticky) и передаёт введённый текст в setQuery (тот же, что
 * использует ViewControls на десктопе). Решает проблему: мы спрятали .controls
 * на мобиле, а там жил поиск.
 *
 * Не рендерится, если у текущего экрана нет поиска (searchableViews).
 */
const SEARCHABLE_VIEWS = new Set([
  "shipment",
  "workshop",
  "overview",
  "warehouse",
  "metalProcess",
  "hardware",
  "strapStock",
  "stats",
]);

export function MobileSearchFab({ view, query, setQuery }) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(query || "");
  const inputRef = useRef(null);

  // Все хуки обязаны идти ДО любых ранних return — иначе React падает с
  // "Rendered fewer hooks than expected" (Rules of Hooks).
  useEffect(() => {
    setLocal(query || "");
  }, [query]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Не показываем FAB на экранах без поиска. Эти проверки — ПОСЛЕ всех хуков.
  if (!SEARCHABLE_VIEWS.has(view)) return null;
  // setQuery может быть не передан для некоторых экранов.
  if (typeof setQuery !== "function") return null;

  const submit = () => {
    setQuery(local);
    setOpen(false);
  };

  const clear = () => {
    setLocal("");
    setQuery("");
    setOpen(false);
  };

  return (
    <>
      {/* Поле поиска — sticky сверху при открытии. */}
      {open && (
        <div className="mobile-search-bar" role="search">
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder="Поиск заказа / артикула…"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setOpen(false);
            }}
          />
          {local ? (
            <button type="button" className="mobile-search-bar__btn" onClick={clear} aria-label="Очистить">
              ✕
            </button>
          ) : null}
          <button type="button" className="mobile-search-bar__btn mobile-search-bar__btn--primary" onClick={submit}>
            Найти
          </button>
        </div>
      )}

      {/* FAB — плавающая кнопка справа над нижним баром. */}
      {!open && (
        <button
          type="button"
          className="mobile-search-fab"
          onClick={() => setOpen(true)}
          aria-label="Поиск"
          title="Поиск"
        >
          🔍
        </button>
      )}
    </>
  );
}

export default MobileSearchFab;
