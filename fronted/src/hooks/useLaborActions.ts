import { useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { extractErrorMessage } from "../app/errorCatalogHelpers";
import {
  buildLaborFactPayload,
  formatLaborImportError,
  formatLaborSaveRowError,
  getLaborImportNoValidRowsError,
  markLaborImportRowSaved,
  parseLaborImportRows,
} from "../app/laborImportHelpers";

interface UseLaborActionsParams {
  view: string;
  laborSubView: string;
  laborTableRows: Record<string, unknown>[];
  setError: (msg: string) => void;
  setActionLoading: (v: string) => void;
  canOperateProduction: boolean;
  denyActionByRole: (msg: string) => void;
  callBackend: (action: string, payload?: Record<string, unknown>) => Promise<unknown>;
  load: () => Promise<void>;
  setLaborImportedRows: (updater: (prev: unknown[]) => unknown[]) => void;
  setLaborSaveSelected: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  setLaborSavingByKey: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  setLaborSavedByKey: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
}

interface UseLaborActionsReturn {
  importLaborFileRef: React.MutableRefObject<HTMLInputElement | null>;
  exportLaborTotalToExcel: () => void;
  importLaborTotalFromExcelFile: (file: File) => Promise<void>;
  saveImportedLaborRowToDb: (row: Record<string, unknown>) => Promise<void>;
}

export function useLaborActions({
  view,
  laborSubView,
  laborTableRows,
  setError,
  setActionLoading,
  canOperateProduction,
  denyActionByRole,
  callBackend,
  load,
  setLaborImportedRows,
  setLaborSaveSelected,
  setLaborSavingByKey,
  setLaborSavedByKey,
}: UseLaborActionsParams): UseLaborActionsReturn {
  const importLaborFileRef = useRef<HTMLInputElement | null>(null);

  const exportLaborTotalToExcel = useCallback(() => {
    if (view !== "labor" || laborSubView !== "total") return;
    if (!laborTableRows.length) {
      setError("Нет данных для экспорта общей трудоемкости.");
      return;
    }

    const header = [
      "ID заказа",
      "Изделие",
      "План",
      "Кол-во",
      "Пилка (мин)",
      "Кромка (мин)",
      "Присадка (мин)",
      "Итого (мин)",
      "Дата завершения",
    ];
    const body = laborTableRows.map((r) => [
      String(r.orderId || ""),
      String(r.item || ""),
      String(r.week || ""),
      Number(r.qty || 0),
      Number(r.pilkaMin || 0),
      Number(r.kromkaMin || 0),
      Number(r.prasMin || 0),
      Number(r.totalMin || 0),
      String(r.dateFinished || ""),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Общая трудоемкость");
    XLSX.writeFile(wb, `Трудоемкость_общая_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setError("");
  }, [laborSubView, laborTableRows, setError, view]);

  const importLaborTotalFromExcelFile = useCallback(
    async (file: File) => {
      if (!file) return;
      setActionLoading("labor:import");
      setError("");
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const firstSheet = String((wb?.SheetNames?.[0]) || "");
        if (!firstSheet) throw new Error("В файле не найден лист.");
        const ws = wb.Sheets[firstSheet];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
        if (!rows.length) throw new Error("Файл пустой.");
        const nowKey = Date.now();
        const imported = parseLaborImportRows(rows, nowKey);

        if (!imported.length) {
          throw new Error(getLaborImportNoValidRowsError());
        }

        setLaborImportedRows((prev) => [...prev, ...imported]);
      } catch (e) {
        setError(formatLaborImportError(extractErrorMessage(e)));
      } finally {
        setActionLoading("");
        if (importLaborFileRef.current) importLaborFileRef.current.value = "";
      }
    },
    [setActionLoading, setError, setLaborImportedRows],
  );

  const saveImportedLaborRowToDb = useCallback(
    async (row: Record<string, unknown>) => {
      if (!canOperateProduction) {
        denyActionByRole("Недостаточно прав для сохранения трудоемкости в БД.");
        return;
      }
      const key = String(row?.importKey || "");
      if (!key) return;
      setLaborSavingByKey((prev) => ({ ...prev, [key]: true }));
      setError("");
      try {
        await callBackend("webUpsertLaborFact", buildLaborFactPayload(row) as unknown as Record<string, unknown>);
        setLaborSavedByKey((prev) => ({ ...prev, [key]: true }));
        setLaborSaveSelected((prev) => ({ ...prev, [key]: false }));
        setLaborImportedRows((prev) => markLaborImportRowSaved(prev as never, key));
        await load();
      } catch (e) {
        setError(formatLaborSaveRowError(extractErrorMessage(e)));
      } finally {
        setLaborSavingByKey((prev) => ({ ...prev, [key]: false }));
      }
    },
    [
      callBackend,
      canOperateProduction,
      denyActionByRole,
      load,
      setError,
      setLaborImportedRows,
      setLaborSaveSelected,
      setLaborSavedByKey,
      setLaborSavingByKey,
    ],
  );

  return {
    importLaborFileRef,
    exportLaborTotalToExcel,
    importLaborTotalFromExcelFile,
    saveImportedLaborRowToDb,
  };
}
