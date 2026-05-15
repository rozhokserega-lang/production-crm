import { useEffect } from "react";

export function useAppShellEffects({
  view,
  warehouseSubView,
  setWarehouseSubView,
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const clsMetal = "domain-metal-process";
    const clsFurniture = "domain-furniture";
    html.classList.remove(clsMetal, clsFurniture);
    body.classList.remove(clsMetal, clsFurniture);
    const cls = view === "metalProcess" ? clsMetal : clsFurniture;
    html.classList.add(cls);
    body.classList.add(cls);
    return () => {
      html.classList.remove(clsMetal, clsFurniture);
      body.classList.remove(clsMetal, clsFurniture);
    };
  }, [view]);

  useEffect(() => {
    if (view !== "warehouse") return;
    if (!["sheets", "leftovers", "history"].includes(warehouseSubView)) {
      setWarehouseSubView("sheets");
    }
  }, [view, warehouseSubView, setWarehouseSubView]);
}
