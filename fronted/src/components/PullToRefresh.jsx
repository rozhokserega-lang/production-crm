import { useEffect, useRef, useState } from "react";

/**
 * Pull-to-refresh для мобильного вида.
 *
 * Пользователь тянет страницу вниз (с самого верха, когда scrollY === 0).
 * При достижении порога (>70px) отпускает → window.location.reload()
 * (мягкая перезагрузка всего SPA — безопасно, не требует единой reload-функции).
 *
 * Работает только на <= 600px. Показывает индикатор-кружок сверху.
 *
 * Не активируется внутри скролл-контейнеров (таблиц/канбанов) — только когда
 * страница прокручена в самый верх.
 */
const THRESHOLD = 70;
const MAX_PULL = 110;

export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const tracking = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 600px)").matches) return;

    const onStart = (e) => {
      if (window.scrollY > 0 || refreshing) {
        tracking.current = false;
        return;
      }
      // Не активируем внутри скролл-контейнеров.
      const t = e.touches ? e.touches[0] : e;
      const target = t.target;
      if (target && target.closest && target.closest(".sheet-table-wrap, .overview-board, .metal-process-kanban, dialog, .mobile-bottom-bar")) {
        tracking.current = false;
        return;
      }
      tracking.current = true;
      startY.current = t.clientY;
    };

    const onMove = (e) => {
      if (!tracking.current || refreshing) return;
      const t = e.touches ? e.touches[0] : e;
      const dy = t.clientY - startY.current;
      if (dy > 0) {
        // Затухание: дальше тянуть всё тяжелее.
        const eased = Math.min(MAX_PULL, dy * 0.5);
        setPull(eased);
        // Предотвращаем нативный bounce, пока тянем индикатор.
        if (dy > 10 && window.scrollY === 0) e.preventDefault();
      }
    };

    const onEnd = () => {
      if (!tracking.current) return;
      tracking.current = false;
      if (pull >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        // Короткая пауза, чтобы пользователь увидел индикатор → потом reload.
        setTimeout(() => window.location.reload(), 350);
      } else {
        setPull(0);
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, [pull, refreshing]);

  if (pull <= 0 && !refreshing) return null;
  const ready = pull >= THRESHOLD || refreshing;

  return (
    <div
      className="pull-to-refresh-indicator"
      style={{ transform: `translateY(${pull}px)` }}
      aria-hidden="true"
    >
      <div className={`pull-to-refresh__spinner${ready ? " ready" : ""}${refreshing ? " spinning" : ""}`}>
        {ready ? "↻" : "↓"}
      </div>
      <span className="pull-to-refresh__text">
        {refreshing ? "Обновление…" : ready ? "Отпустите для обновления" : "Потяните вниз"}
      </span>
    </div>
  );
}

export default PullToRefresh;
