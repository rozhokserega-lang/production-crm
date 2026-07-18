import { useEffect, useState } from "react";

/**
 * Кнопка «наверх» — появляется после прокрутки вниз.
 * Показывается только на <= 600px (через CSS). При тапе плавно прокручивает
 * страницу к началу.
 */
export function BackToTopFab() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="back-to-top-fab"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Наверх"
      title="Наверх"
    >
      ▲
    </button>
  );
}

export default BackToTopFab;
