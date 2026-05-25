import { useCallback, useEffect, useRef, useState } from "react";
import {
  looksLikeWorkshopQrPayload,
  parseWorkshopQrScan,
  workshopQrScanLabel,
} from "../app/workshopQrSearchHelpers";

export function useWorkshopQrScan({
  view,
  tab,
  setQuery,
  setWorkshopQrScan,
  searchInputRef,
}) {
  const [active, setActive] = useState(false);
  const [scanHint, setScanHint] = useState("");
  const debounceRef = useRef(null);

  const show = view === "workshop" && (tab === "kromka" || tab === "pras");

  useEffect(() => {
    if (!show && active) {
      setActive(false);
      setWorkshopQrScan(null);
      setScanHint("");
    }
  }, [show, active, setWorkshopQrScan]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const applyScan = useCallback(
    (raw) => {
      const parsed = parseWorkshopQrScan(raw);
      if (!parsed?.orderId) {
        setWorkshopQrScan(null);
        setScanHint("В QR нет ID заказа — отправьте в производство и перепечатайте лист");
        return false;
      }
      setWorkshopQrScan(parsed);
      setQuery(workshopQrScanLabel(parsed));
      setScanHint("Найден заказ " + parsed.orderId);
      return true;
    },
    [setQuery, setWorkshopQrScan],
  );

  const toggle = useCallback(() => {
    setActive((prev) => {
      const next = !prev;
      setWorkshopQrScan(null);
      setScanHint("");
      setQuery("");
      if (next) {
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      return next;
    });
  }, [setQuery, setWorkshopQrScan, searchInputRef]);

  const handleSearchKeyDown = useCallback(
    (event) => {
      if (!active || event.key !== "Enter") return;
      event.preventDefault();
      const raw = String(event.currentTarget.value || "").trim();
      if (!raw) return;
      applyScan(raw);
    },
    [active, applyScan],
  );

  const handleSearchChange = useCallback(
    (value) => {
      setQuery(value);
      if (!active) {
        setWorkshopQrScan(null);
        setScanHint("");
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!looksLikeWorkshopQrPayload(value)) return;
      debounceRef.current = window.setTimeout(() => {
        applyScan(String(value || "").trim());
      }, 120);
    },
    [active, applyScan, setQuery, setWorkshopQrScan],
  );

  const searchPlaceholder = active
    ? "Сканируйте ID заказа (SP-…)"
    : "Поиск по названию или ID";

  return {
    show,
    active,
    toggle,
    scanHint,
    searchPlaceholder,
    searchClassName: active ? "qr-scan-active" : "",
    handleSearchKeyDown,
    handleSearchChange,
  };
}
